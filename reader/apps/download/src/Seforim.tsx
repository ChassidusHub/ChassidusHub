import { useMemo, useState } from 'react';
import type { ShelfWork, WorksShelf } from './api';
import type { CartItem, Names } from './cart';
import { hasItem } from './cart';
import { useI18n } from './i18n';
import { BookIcon } from './icons';
import { formatMb, ltr } from './selection';
import { AddButton, Field, ToggleChip, toggled } from './ui';

/**
 * The seforim, inside the library: one sefer by itself (Igros Kodesh has
 * an entry of its own), or the seforim of the Rebbeim by Rebbe - add one
 * whole, or, for a sefer in volumes, just the volumes wanted. Everything
 * here comes from the pack API's shelf: a Rebbe whose seforim are
 * published appears without a change to the site.
 */

interface Shelf {
  id: string;
  name: Names;
  works: ShelfWork[];
}

/** The shelf by author, in the catalog's order, then the seforim of no listed author together. An older pack API (no authors) shelves by its bundles. */
export function shelvesByAuthor(shelf: WorksShelf, other: Names): Shelf[] {
  if (!shelf.authors) return shelf.bundles.map((b) => ({ id: b.id, name: b.label, works: shelf.works.filter((w) => w.bundle === b.id) }));
  const known = new Set(shelf.authors.map((a) => a.id));
  const shelves: Shelf[] = shelf.authors.map((a) => ({ id: a.id, name: a.name, works: shelf.works.filter((w) => w.author === a.id) })).filter((s) => s.works.length > 0);
  const rest = shelf.works.filter((w) => !w.author || !known.has(w.author));
  if (rest.length > 0) shelves.push({ id: '', name: other, works: rest });
  return shelves;
}

/** A sefer: add it whole, or open its volumes and add some. `defaultOpen` shows the volumes at once (a sefer that is a library entry of its own). */
export function Sefer({ work, cart, onAdd, onRemove, defaultOpen = false }: { work: ShelfWork; cart: CartItem[]; onAdd: (item: CartItem) => void; onRemove: (item: CartItem) => void; defaultOpen?: boolean }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const [picked, setPicked] = useState<string[]>([]);
  const whole: CartItem = { kind: 'works', tokens: [work.id], name: work.title };
  const parts = work.parts ?? [];
  const chosen = parts.filter((p) => picked.includes(p.id));
  const some: CartItem = { kind: 'works', tokens: chosen.map((p) => `${work.id}:${p.id}`), name: work.title, parts: chosen.map((p) => p.label) };
  const someBytes = chosen.reduce((sum, p) => sum + p.bytes, 0);

  return (
    <article className="bundle sefer">
      <span className="bundle-icon" aria-hidden="true">
        <BookIcon size={20} />
      </span>
      <div className="bundle-text">
        <h4 className="bundle-name">{work.title[lang]}</h4>
        <p className="bundle-size">
          {ltr(formatMb(work.bytes))}
          {parts.length > 1 && <> · {t.nParts(parts.length)}</>}
        </p>
        {parts.length > 1 && (
          <button type="button" className="text-button sefer-parts-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? t.closeParts : t.chooseParts(parts.length)}
          </button>
        )}
      </div>
      <AddButton inCart={hasItem(cart, whole)} onAdd={() => onAdd(whole)} onRemove={() => onRemove(whole)} label={t.wholeSefer} />
      {open && parts.length > 1 && (
        <div className="sefer-parts">
          <div className="chips chips-scroll" role="group" aria-label={work.title[lang]}>
            {parts.map((part) => (
              <ToggleChip key={part.id} id={`part-${work.id}-${part.id}`} on={picked.includes(part.id)} onChange={(on) => setPicked(toggled(picked, part.id, on))}>
                {part.label[lang]}
                <span className="chip-count">{ltr(formatMb(part.bytes))}</span>
              </ToggleChip>
            ))}
          </div>
          <p className="field-hint">{t.partsNote}</p>
          <div className="shelf-action">
            <AddButton
              inCart={chosen.length > 0 && hasItem(cart, some)}
              disabled={chosen.length === 0}
              onAdd={() => onAdd(some)}
              onRemove={() => onRemove(some)}
              label={chosen.length === 0 ? t.pickFirst : t.addParts(chosen.length)}
              detail={chosen.length > 0 ? ltr(formatMb(someBytes)) : undefined}
            />
          </div>
        </div>
      )}
    </article>
  );
}

export function SeforimShelf({ shelf, cart, onAdd, onRemove }: { shelf: WorksShelf; cart: CartItem[]; onAdd: (item: CartItem) => void; onRemove: (item: CartItem) => void }) {
  const { t, lang } = useI18n();
  const shelves = useMemo(() => shelvesByAuthor(shelf, { he: 'עוד ספרים', en: 'More seforim' }), [shelf]);
  const [picked, setPicked] = useState(shelves[0]?.id ?? '');
  const current = shelves.find((s) => s.id === picked) ?? shelves[0];
  if (!current) return null;
  const all: CartItem = {
    kind: 'works',
    tokens: current.works.map((w) => w.id),
    name: current.id ? { he: `ספרי ${current.name.he}`, en: `${current.name.en}'s seforim` } : current.name,
  };
  const bytes = current.works.reduce((sum, w) => sum + w.bytes, 0);

  return (
    <>
      <p className="field-hint">{t.seforimLead}</p>
      <Field title={t.rebbeLabel}>
        <div className="chips" role="radiogroup" aria-label={t.rebbeLabel}>
          {shelves.map((s) => (
            <label key={s.id || 'other'} className={s.id === current.id ? 'chip chip-on' : 'chip'}>
              <input type="radio" className="visually-hidden" name="rebbe" id={`rebbe-${s.id || 'other'}`} checked={s.id === current.id} onChange={() => setPicked(s.id)} />
              {s.name[lang]}
            </label>
          ))}
        </div>
      </Field>
      <div className="bundles">
        {current.works.map((work) => (
          <Sefer key={work.id} work={work} cart={cart} onAdd={onAdd} onRemove={onRemove} />
        ))}
      </div>
      {current.works.length > 1 && (
        <div className="shelf-action">
          <AddButton inCart={hasItem(cart, all)} onAdd={() => onAdd(all)} onRemove={() => onRemove(all)} label={current.id ? t.allOf(current.name[lang]) : t.allOfOther} detail={ltr(formatMb(bytes))} />
        </div>
      )}
    </>
  );
}
