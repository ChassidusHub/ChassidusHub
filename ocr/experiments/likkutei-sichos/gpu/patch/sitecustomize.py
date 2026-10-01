"""Loaded by every Python process on the pod when this folder is on
PYTHONPATH (KRAKEN_WIDTH_GROUPS=1). Kraken's PP-OCRv6 trainer pads every
batch to --max-width (4,080 px), but our lines average about 1,900 px at the
model's height, so about half of each step was padding. Here the training
batches are made of lines of similar width (sorted, cut into batches, the
batch order shuffled each round), and each batch is padded only to its own
width rounded up to 512 px, so torch.compile sees a handful of shapes."""
import os

if os.environ.get('KRAKEN_WIDTH_GROUPS') == '1':
    import io, math, random
    from functools import partial
    import numpy as np
    import torch
    import torch.nn.functional as F
    from torch.utils.data import DataLoader, Sampler
    from PIL import Image
    import pyarrow.compute as pc
    import kraken.train.ppocr as ppocr
    from kraken.lib.dataset import collate_sequences

    STEP = 512
    try:  # one compiled graph per width bucket
        import torch._dynamo.config as dc
        for k in ('cache_size_limit', 'recompile_limit', 'accumulated_cache_size_limit', 'accumulated_recompile_limit'):
            if hasattr(dc, k):
                setattr(dc, k, max(getattr(dc, k), 64))
    except Exception:
        pass

    def collate_bucket(batch, max_width):
        out = collate_sequences(batch)
        width = out['image'].shape[-1]
        if width > max_width:
            raise ValueError(f'Batch of width {width} exceeds max_width ({max_width}).')
        target = min(max_width, math.ceil(width / STEP) * STEP)
        if width < target:
            out['image'] = F.pad(out['image'], (0, target - width))
        return out

    ppocr.collate_static_width = collate_bucket

    def widths(ds):
        """Each line's width at a common height, read from the stored image
        headers only (no decoding), in the dataset's own index order."""
        col = pc.struct_field(ds.arrow_table.column('lines'), 'im').take(ds._indices)
        out = np.empty(len(col), dtype=np.float32)
        for i, b in enumerate(col.to_pylist()):
            try:
                w, h = Image.open(io.BytesIO(b)).size
                out[i] = w / max(h, 1)
            except Exception:
                out[i] = 50.0
        return out

    class WidthBatches(Sampler):
        def __init__(self, ratio, batch_size, seed=0):
            self.ratio, self.bs, self.epoch, self.seed = ratio, batch_size, 0, seed

        def __iter__(self):
            rng = np.random.default_rng(self.seed + self.epoch)
            self.epoch += 1
            # a little noise so the same lines don't always share a batch
            order = np.argsort(self.ratio * rng.uniform(0.95, 1.05, len(self.ratio)))
            batches = [order[i:i + self.bs].tolist() for i in range(0, len(order), self.bs)]
            rng.shuffle(batches)
            return iter(batches)

        def __len__(self):
            return math.ceil(len(self.ratio) / self.bs)

    def train_dataloader(self):
        bs = self.trainer.lightning_module.hparams.config.batch_size
        ds = self.train_set
        base = getattr(ds, 'dataset', ds)
        ratio = widths(base) if hasattr(base, 'arrow_table') else None
        nw = self.hparams.data_config.num_workers
        if ratio is None or len(ratio) != len(ds):
            print('width groups: unavailable, using plain shuffled batches', flush=True)
            return DataLoader(ds, batch_size=bs, num_workers=nw, persistent_workers=nw > 0, pin_memory=True,
                              shuffle=True, collate_fn=self._collate_fn)
        print(f'width groups: {len(ratio)} lines, batches of {bs} by width', flush=True)
        return DataLoader(ds, batch_sampler=WidthBatches(ratio, bs), num_workers=nw, persistent_workers=nw > 0,
                          pin_memory=True, collate_fn=self._collate_fn)

    ppocr.PPOCRv6RecognitionDataModule.train_dataloader = train_dataloader
