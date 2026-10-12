import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { ReaderView, ReaderWords } from '../reader/view';
import type { ReaderData } from '../reader/types';
import { Icon } from '../ui';
import { SichaWords } from './sichos';

/** How the print calls words the Rebbe did not edit (RFC 0004 `muga`); edited words need no chip. */
const unedited = { 'bilti-mugah': 'בלתי מוגה', hanacha: 'הנחה בלתי מוגה' } as const;

/**
 * The occasion and the day, as the unit's name gives them, without the
 * print's ב"ס"ד and "שיחת" before them; a maamar by its ד"ה, its occasion
 * under it (Catalog names a maamar "<ד"ה> · <occasion>", #241). Under the
 * title: the Hebrew date, unless a machine guessed it, then the sefer and
 * the volume.
 */
function FarbrengenTitle({ data }: { data: ReaderData }) {
  const dot = data.title.indexOf(' · ');
  const title = dot > 0 ? `ד״ה ${data.title.slice(0, dot)}` : data.title.replace(/^בס["״]ד\.?\s*/, '').replace(/^שיחת\s+/, '');
  const date = data.facts?.find((fact) => fact.kind === 'date' && !fact.machine)?.value;
  const sub = [dot > 0 ? data.title.slice(dot + 3) : date, data.sub].filter(Boolean).join(' · ');
  return (
    <>
      <h1 className="stitle">{title}</h1>
      {sub && <p className="ssub">{sub}</p>}
    </>
  );
}

/** Under the title: בלתי מוגה as printed, the maamar said there (or a maamar's sichos), and the recording. */
function FarbrengenHead({ data }: { data: ReaderData }) {
  const muga = data.muga && data.muga !== 'mugah' ? unedited[data.muga] : '';
  const recording = data.recordings[0];
  if (!muga && !data.said?.length && !recording) return null;
  return (
    <div className="hv-head">
      {(muga || data.said?.length) && (
        <div className="chips">
          {muga && <span className="chip hv-flag">{muga}</span>}
          {data.said?.map((piece) => (
            <Link key={piece.path} className="chip" to={piece.path}>
              {piece.kind === 'maamar' ? `מאמר: ${piece.label}` : piece.label}
            </Link>
          ))}
        </div>
      )}
      {recording && (
        <Link className="hv-listen" to={recording.path}>
          <span className="hv-play">
            <Icon name="play" size="s" filled />
          </span>
          <span>לשמוע את ההתוועדות</span>
          {recording.duration && <span className="faint">{recording.duration}</span>}
        </Link>
      )}
    </div>
  );
}

/**
 * The section letters down the side: a tap jumps to the section; the one
 * being read is marked as the page scrolls. The sections are found by their
 * ids, so words that arrive after the page (a click) are found as well.
 */
function Rail({ sections }: { sections: NonNullable<ReaderData['sections']> }) {
  const [on, setOn] = useState(0);
  useEffect(() => {
    let frame = 0;
    const look = () => {
      frame = 0;
      const line = window.innerHeight * 0.3;
      let at = 0;
      sections.forEach((section, i) => {
        const top = document.getElementById(section.id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) at = i;
      });
      setOn(at);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(look);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    look();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [sections]);
  return (
    <nav className="hv-rail" aria-label="סעיפים">
      {sections.map((section, i) => (
        <a key={section.id} href={`#${section.id}`} aria-current={i === on ? 'location' : undefined}>
          {section.label}
        </a>
      ))}
    </nav>
  );
}

function FarbrengenWords({ data, words }: { data: ReaderData; words: ReaderWords }) {
  const sections = data.sections ?? [];
  return (
    <div className={sections.length > 1 ? 'hv with-rail' : 'hv'}>
      <div className="hv-words">
        <SichaWords data={data} words={words} />
      </div>
      {sections.length > 1 && <Rail sections={sections} />}
    </div>
  );
}

/**
 * A farbrengen as it was said (Toras Menachem Hisvaaduyos, Sichos Kodesh):
 * titled by its occasion and day; what happened between the words (a niggun,
 * washing for the meal) in a quiet grey line, so the talk reads on; its
 * sections' letters down the side (in the corner menu on a phone); a maamar
 * said there as a card that opens its own page; its recording a tap away; a
 * בלתי מוגה chip when it is unedited. The server sets the words
 * (hisvaaduyos.layout.ts), so they read whole before any script arrives. A
 * Sichos Kodesh farbrengen is read as one page, all its sichos together
 * (reader/farbrengen.server.ts).
 */
export const view: ReaderView = {
  kind: 'hisvaaduyos',
  levels: ['farbrengen'],
  Title: FarbrengenTitle,
  Head: FarbrengenHead,
  Words: FarbrengenWords,
};
