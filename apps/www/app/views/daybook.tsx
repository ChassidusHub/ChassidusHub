import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { nameOf } from '../lib/catalog';
import type { ReaderView } from '../reader/view';
import type { ReaderData } from '../reader/types';
import { SichaWords } from './sichos';

/**
 * The month's days, a strip under the title: each day by its number, this
 * one by its name, as the path bar's last level lists them (no other read).
 * The strip scrolls sideways, this day in view. A book, not a calendar: no
 * "today", nothing to tick.
 */
function Days({ data }: { data: ReaderData }) {
  const strip = useRef<HTMLElement>(null);
  const days = data.pathBar.at(-1)?.choices ?? [];
  useEffect(() => {
    const on = strip.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (on && strip.current) strip.current.scrollLeft += on.getBoundingClientRect().left - strip.current.getBoundingClientRect().left - (strip.current.clientWidth - on.offsetWidth) / 2;
  }, [data.path]);
  if (days.length < 2) return null;
  return (
    <nav ref={strip} className="chips daystrip" aria-label="ימי החודש">
      {days.map((day) => {
        const name = nameOf(day.name);
        const here = day.path === data.path;
        return day.path ? (
          <Link key={day.path} className={here ? 'chip on' : 'chip'} to={day.path} aria-current={here ? 'page' : undefined} aria-label={name}>
            {here ? name : name.split(/\s+/)[0]}
          </Link>
        ) : null;
      })}
    </nav>
  );
}

/** The sefer and the month small over the day, then the month's days. */
function DayTitle({ data }: { data: ReaderData }) {
  return (
    <>
      {data.sub && <p className="eyebrow">{data.sub}</p>}
      <h1 className="stitle">{data.title}</h1>
      <Days data={data} />
    </>
  );
}

/**
 * Hayom Yom, read as the printed book, a day to a page, as the old site set
 * it (PR #104, #105): the weekday, the day and the year in one row, the day's
 * notices, its shiurim (Chumash, Tehillim, Tanya) as printed, each a link to
 * its words, then the sayings. The server sets all of it (daybook.layout.ts),
 * so the day is whole before any script arrives; this view names the title
 * and the strip of the month's days. The day before and after are at the foot.
 */
export const view: ReaderView = {
  kind: 'daybook',
  Title: DayTitle,
  Words: ({ data, words }) => (
    <div className="daybook">
      <SichaWords data={data} words={words} />
    </div>
  ),
};
