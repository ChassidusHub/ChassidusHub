import { toHebrewNumeral } from '@chassidushub/hebrew';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { browserSnapshot } from '../../catalog/browser';
import { IconButton } from '../../ui';

/** A page reference tapped in an index: its page, its volume, the sicha the index names, its PDF, and where on the page it sits. */
export interface AskedRef {
  page: number;
  volume: number | null;
  sicha: string;
  pdf: string | null;
  /** The entry it is in: the answer is drawn at the entry's foot, as the printed line goes on above it. */
  entry: HTMLElement;
}

/**
 * The sicha page here that a reference opens: from the catalog snapshot the
 * browser already holds, read through the sefer the index is an addition to
 * (RFC 0004, `addition.to`). A sefer whose units are its printed pages
 * (Likkutei Sichos 30-39) opens that very page; one whose units are its
 * sichos, each named by the page it starts on ("עמ׳ 49"), opens the sicha the
 * page falls in. Null when the snapshot knows no such page: the reference
 * then offers the index's own PDF, never a broken link.
 */
export async function sichaAt(index: string | null, volume: number | null, page: number): Promise<string | null> {
  if (!index || !volume) return null;
  const snapshot = browserSnapshot();
  const core = await snapshot.core();
  const work = core?.byPath.get(index);
  const sefer = work && core!.isWork(work) ? work.addition?.to : undefined;
  if (!sefer) return null;
  const part = (await snapshot.units(sefer))?.parts.find((p) => p.value === String(volume));
  if (!part) return null;
  const exact = part.items.find((unit) => unit.path && unit.title?.he === String(page));
  if (exact) return exact.path;
  let found: { start: number; path: string } | null = null;
  for (const unit of part.items) {
    const start = Number(/(\d+)/.exec(unit.place ?? '')?.[1]);
    if (unit.path && Number.isInteger(start) && start <= page && (!found || start >= found.start)) found = { start, path: unit.path };
  }
  return found?.path ?? null;
}

/** Under a tapped reference: its page and the sicha it is in, then a way to open it there. */
export function RefPop({ asked, index, onClose }: { asked: AskedRef; index: string | null; onClose: () => void }) {
  const [to, setTo] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setTo(undefined);
    sichaAt(index, asked.volume, asked.page).then(
      (path) => live && setTo(path),
      () => live && setTo(null),
    );
    return () => {
      live = false;
    };
  }, [index, asked]);

  return createPortal(
    <div className="ix-pop" role="dialog" aria-label={`עמוד ${asked.page}`}>
      <span>
        <b>
          {asked.volume ? `חלק ${toHebrewNumeral(asked.volume)}, ` : ''}עמ׳ {asked.page}
        </b>
        {asked.sicha && ` · ${asked.sicha}`}
      </span>
      {to ? (
        <Link to={to} className="ix-open">
          לשיחה, בעמוד הזה
        </Link>
      ) : to === null ? (
        asked.pdf ? (
          <a href={asked.pdf} rel="noopener" target="_blank" className="ix-open">
            הסריקה של השיחה
          </a>
        ) : (
          <span className="faint">השיחה עוד לא באתר</span>
        )
      ) : (
        <span className="faint" aria-busy="true">
          …
        </span>
      )}
      <IconButton icon="close" label="סגירה" small onClick={onClose} />
    </div>,
    asked.entry,
  );
}
