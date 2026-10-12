import type { ReaderView, ReaderWords } from '../reader/view';
import type { ReaderData } from '../reader/types';
import { ServerHtml } from '../ui';

/**
 * A sicha or a maamar: the words, then their footnotes under "הערות". A
 * footnote's mark opens the note in a sheet (the reader's). The default view:
 * every page whose sefer names no other is drawn with it, and a view that
 * draws only its own facts draws the words with `SichaWords`.
 */
export function SichaWords({ data, words }: { data: ReaderData; words: ReaderWords }) {
  return (
    <>
      <ServerHtml id={`body:${data.path}`} html={words.body} className={words.machine === 'all' ? 'torah unchecked' : 'torah'} />
      {words.hasNotes && (
        <section className="notes" aria-labelledby="notes-h">
          <h2 id="notes-h">הערות</h2>
          <ServerHtml id={`notes:${data.path}`} html={words.notes} as="ol" />
        </section>
      )}
    </>
  );
}

export const view: ReaderView = {
  kind: 'sichos',
  levels: ['sicha', 'maamar'],
  Words: SichaWords,
};
