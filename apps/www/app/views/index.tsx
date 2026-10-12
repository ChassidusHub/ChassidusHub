import { lazy, Suspense, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import type { ReaderView, ReaderWords } from '../reader/view';
import type { ReaderData } from '../reader/types';
import { SearchField, ServerHtml } from '../ui';
import type { AskedRef } from './index/RefPop';

/** What a tapped reference shows, read only when one is tapped. */
const RefPop = lazy(() => import('./index/RefPop').then((file) => ({ default: file.RefPop })));

/**
 * Words as find compares them: no points or quotes, final letters as ordinary
 * ones (@chassidushub/hebrew's normalizeSearchText and unfinal, kept here so
 * the reader's own script stays one file).
 */
const keyOf = (text: string) =>
  text
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[׳״"'`‘’“”]/g, '')
    .replace(/[^0-9א-ת]+/g, ' ')
    .replace(/[ךםןףץ]/g, (c) => 'כמנפצ'['ךםןףץ'.indexOf(c)]!)
    .trim();

/** The volume a reference is in, as the page names it: its line's lead in the merged index ("חלק טו"), else the page's own title ("חלק ל"). */
function volumeLabel(ref: HTMLElement, title: string): string {
  const lead = ref.closest('p')?.querySelector('b')?.textContent?.trim() ?? '';
  return lead.startsWith('חלק') ? lead : title.startsWith('חלק') ? title : '';
}

/**
 * A subject index (mafteach) read as it was printed: each entry's heading in
 * bold, then its pages with the short note beside each, and ע״ע to the other
 * entries, which jump there (index.layout.ts draws them on the server). The
 * letters on top jump to their entries; the box under them finds entries of
 * this index only, among the words the page already holds. A tapped page
 * names its sicha and opens it at that page (index/RefPop.tsx). The same view
 * reads one volume's index and the merged one, whose pages are named with
 * their volume.
 */
function IndexWords({ data, words }: { data: ReaderData; words: ReaderWords }) {
  const box = useRef<HTMLDivElement>(null);
  const [asked, setAsked] = useState<AskedRef | null>(null);
  const [none, setNone] = useState(false);

  const onClick = (event: MouseEvent) => {
    const ref = (event.target as HTMLElement).closest<HTMLElement>('.ref[data-p]');
    if (!ref) return;
    event.preventDefault();
    const volume = ref.dataset.v ? Number(ref.dataset.v) : null;
    setAsked({
      page: Number(ref.dataset.p),
      volume,
      volumeLabel: volume ? volumeLabel(ref, data.title) : '',
      sicha: ref.dataset.s ?? '',
      pdf: ref.getAttribute('href'),
      entry: ref.closest<HTMLElement>('.ix-e') ?? ref.parentElement!,
    });
  };

  // Entries hidden by what was typed: their own words only, so the page holds nothing more for it.
  const onFind = (event: FormEvent<HTMLInputElement>) => {
    const q = keyOf(event.currentTarget.value);
    let shown = 0;
    for (const entry of box.current?.querySelectorAll<HTMLElement>('.ix-e') ?? []) {
      const words = [...entry.querySelectorAll(':scope > p')].map((p) => p.textContent).join(' ');
      entry.hidden = !!q && !keyOf(words).includes(q);
      if (!entry.hidden) shown++;
    }
    setNone(!!q && shown === 0);
    setAsked(null);
  };

  return (
    <div className="ix" ref={box} onClick={onClick}>
      <div className="ix-find" role="search">
        <SearchField size="small" label="חיפוש במפתח הזה" onInput={onFind} />
      </div>
      {none && <p className="faint sm">אין ערך כזה במפתח הזה.</p>}
      <ServerHtml id={`body:${data.path}`} html={words.body} className={words.machine === 'all' ? 'torah unchecked' : 'torah'} />
      {asked && (
        <Suspense>
          <RefPop asked={asked} index={data.work?.path ?? null} shelf={data.pathBar[0]?.chosen.id ?? null} onClose={() => setAsked(null)} />
        </Suspense>
      )}
    </div>
  );
}

export const view: ReaderView = {
  kind: 'index',
  Words: IndexWords,
};
