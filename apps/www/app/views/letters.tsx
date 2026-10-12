import type { ReaderView } from '../reader/view';
import type { ReaderData } from '../reader/types';
import { SichaWords } from './sichos';

/**
 * A letter of the Igros, read as app.chassidushub.org reads it: in the David
 * face the app opens the Igros in, its head and foot set as printed (the date
 * line, the city, the addressee, the greeting, the signature). The server
 * gives each paragraph its place (letters.layout.ts), so the letter is set
 * before any script arrives; this view only names the face and sets the head:
 * its volume small, over the letter's number. The notes on the whole letter
 * follow it, unnumbered. Its date, place and addressee are in the corner menu.
 */
function LetterTitle({ data }: { data: ReaderData }) {
  return (
    <>
      {data.within && <p className="eyebrow">{data.within}</p>}
      <h1 className="stitle">{data.title}</h1>
    </>
  );
}

export const view: ReaderView = {
  kind: 'letters',
  levels: ['letter'],
  Title: LetterTitle,
  Words: ({ data, words }) => (
    <div className="igros">
      <SichaWords data={data} words={words} />
    </div>
  ),
};
