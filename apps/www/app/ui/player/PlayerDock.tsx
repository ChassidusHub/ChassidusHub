import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router';
import { IconButton, PlayButton } from '../Button';
import { Icon } from '../Icon';
import { Row, Rows } from '../Row';
import { Sheet } from '../Sheet';
import { chapterAt, clock, player, total, useHeard, usePlayer, type Phrase, type Track } from './engine';

/**
 * The player's place in the shell: on a phone the mini player over the bottom
 * bar, which opens the full-screen player; on a desktop a bar along the foot
 * and the words in a side panel. Nothing shows until something plays.
 */
export function PlayerDock() {
  const track = usePlayer((s) => s.track);
  const [full, setFull] = useState(false);
  const [panel, setPanel] = useState(false);
  const [chapters, setChapters] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('panel', panel && !!track);
    return () => document.body.classList.remove('panel');
  }, [panel, track]);
  useEffect(() => {
    if (!track) setFull(false);
  }, [track]);

  if (!track) return null;
  return (
    <>
      <Mini track={track} onOpen={() => setFull(true)} panel={panel} onPanel={() => setPanel(!panel)} onChapters={() => setChapters(true)} />
      <FullPlayer track={track} open={full} onClose={() => setFull(false)} onChapters={() => setChapters(true)} />
      <aside className="side" hidden={!panel} aria-label="המילים">
        <div className="ph">
          <div className="mid" style={{ textAlign: 'start', paddingInline: 8 }}>
            <Now track={track} />
          </div>
          <IconButton icon="close" label="סגירת המילים" onClick={() => setPanel(false)} />
        </div>
        {panel && <Words track={track} />}
      </aside>
      <Chapters track={track} open={chapters} onClose={() => setChapters(false)} />
    </>
  );
}

/** The part being heard, and which of how many, as the player's heading. */
function Now({ track }: { track: Track }) {
  const at = usePlayer((s) => chapterAt(track, s.position));
  return (
    <>
      <b>{track.chapters[at]?.title ?? track.title}</b>
      <small>
        חלק {at + 1} מתוך {track.chapters.length} · {track.title}
      </small>
    </>
  );
}

function Mini({ track, onOpen, panel, onPanel, onChapters }: { track: Track; onOpen: () => void; panel: boolean; onPanel: () => void; onChapters: () => void }) {
  const playing = usePlayer((s) => s.playing);
  const position = usePlayer((s) => Math.floor(s.position / 1000) * 1000);
  const at = chapterAt(track, position);
  const chapter = track.chapters[at];
  const length = total(track) || 1;
  return (
    <div className="mini">
      <div className="bar" aria-hidden="true">
        <i style={{ width: `${(position / length) * 100}%` }} />
      </div>
      <PlayButton className="solo" size="small" playing={playing} onClick={() => player.toggle()} />
      <div className="t">
        <button type="button" onClick={onOpen} aria-label={`פתיחת הנגן: ${chapter?.title ?? track.title}`}>
          <b>{chapter?.title ?? track.title}</b>
          <span>
            {track.title} ·{' '}
            <bdi dir="ltr">
              {clock(position - (chapter?.start ?? 0))} / {clock(chapter?.duration ?? length)}
            </bdi>
          </span>
        </button>
      </div>
      <div className="dctl">
        <Controls playing={playing} small />
        <div className="dprog">
          <Times track={track} />
        </div>
      </div>
      <div className="dacts">
        <Speed />
        <IconButton icon="list" label="חלקים" onClick={onChapters} />
        <IconButton icon="words" label="המילים" on={panel} aria-pressed={panel} onClick={onPanel} />
        {track.to && (
          <Link to={track.to} className="ib" aria-label="לדף ההקלטה" title="לדף ההקלטה">
            <Icon name="chevron-left" />
          </Link>
        )}
      </div>
      <IconButton icon="close" label="סגירת הנגן" onClick={() => player.close()} />
    </div>
  );
}

/** Previous part, back 15 seconds, play, forward 30, next part: left to right, as on every player. */
function Controls({ playing, small }: { playing: boolean; small?: boolean }) {
  return (
    <div className="ctl">
      <IconButton icon="previous" label="החלק הקודם" small={small} onClick={() => player.previous()} />
      <IconButton icon="back-15" label="15 שניות אחורה" small={small} onClick={() => player.skip(-15_000)} />
      <PlayButton playing={playing} size={small ? undefined : 'large'} onClick={() => player.toggle()} />
      <IconButton icon="forward-30" label="30 שניות קדימה" small={small} onClick={() => player.skip(30_000)} />
      <IconButton icon="next" label="החלק הבא" small={small} onClick={() => player.next()} />
    </div>
  );
}

function Speed() {
  const speed = usePlayer((s) => s.speed);
  return (
    <button type="button" className="chip" onClick={() => player.nextSpeed()} aria-label={`מהירות ${speed}, החלפה`}>
      מהירות&nbsp;<bdi dir="ltr">{speed}×</bdi>
    </button>
  );
}

/** The part's progress: a bar to tap or drag, and arrow keys move 5 seconds. */
function Progress({ track }: { track: Track }) {
  const position = usePlayer((s) => s.position);
  const at = chapterAt(track, position);
  const chapter = track.chapters[at] ?? { start: 0, duration: total(track) || 1, title: track.title };
  const done = Math.min(1, Math.max(0, (position - chapter.start) / chapter.duration));
  const to = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    player.seek(chapter.start + Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * chapter.duration);
  };
  const keys = (event: KeyboardEvent) => {
    const by = { ArrowRight: 5000, ArrowLeft: -5000, ArrowUp: 5000, ArrowDown: -5000 }[event.key];
    if (by) {
      event.preventDefault();
      player.skip(by);
    }
  };
  return (
    <div
      className="prog"
      role="slider"
      tabIndex={0}
      aria-label="מקום בחלק"
      aria-valuemin={0}
      aria-valuemax={Math.round(chapter.duration / 1000)}
      aria-valuenow={Math.round((position - chapter.start) / 1000)}
      aria-valuetext={`${clock(position - chapter.start)} מתוך ${clock(chapter.duration)}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        to(event);
      }}
      onPointerMove={(event) => event.buttons && to(event)}
      onKeyDown={keys}
    >
      <div className="tr" />
      <div className="fi" style={{ width: `${done * 100}%` }} />
    </div>
  );
}

/** The bar with the time heard and the time left in this part. */
function Times({ track, below }: { track: Track; below?: boolean }) {
  const position = usePlayer((s) => Math.floor(s.position / 1000) * 1000);
  const chapter = track.chapters[chapterAt(track, position)] ?? { start: 0, duration: total(track) };
  const heard = <span>{clock(position - chapter.start)}</span>;
  const left = <span>-{clock(chapter.start + chapter.duration - position)}</span>;
  if (below) {
    return (
      <>
        <Progress track={track} />
        <div className="times">
          {heard}
          {left}
        </div>
      </>
    );
  }
  return (
    <>
      {heard}
      <Progress track={track} />
      {left}
    </>
  );
}

function FullPlayer({ track, open, onClose, onChapters }: { track: Track; open: boolean; onClose: () => void; onChapters: () => void }) {
  const playing = usePlayer((s) => s.playing);
  return (
    <section className={open ? 'fs on' : 'fs'} role="dialog" aria-modal="true" aria-label="נגן" inert={!open}>
      <div className="ph">
        <IconButton icon="chevron-down" label="הקטנת הנגן" onClick={onClose} />
        <div className="mid">
          <Now track={track} />
        </div>
        <IconButton icon="list" label="חלקים" onClick={onChapters} />
      </div>
      {open && <Words track={track} />}
      <div className="pf">
        <Times track={track} below />
        <Controls playing={playing} />
        <div className="pchips">
          <Speed />
        </div>
      </div>
    </section>
  );
}

/**
 * The words of the part being heard, the phrase being heard lit and kept in
 * view, unless the reader scrolled in the last few seconds. Tapping a phrase
 * plays from it. A part without words says so.
 */
function Words({ track }: { track: Track }) {
  const at = usePlayer((s) => chapterAt(track, s.position));
  const [words, setWords] = useState<{ chapter: number; phrases: Phrase[]; checked: boolean } | null | 'none'>(null);
  const box = useRef<HTMLDivElement>(null);
  const touched = useRef(0);

  useEffect(() => {
    let current = true;
    setWords(null);
    if (!track.words) return setWords('none');
    track.words(at).then(
      (found) => current && setWords(found ? { chapter: at, ...found } : 'none'),
      () => current && setWords('none'),
    );
    return () => {
      current = false;
    };
  }, [track, at]);

  const phrases = words && words !== 'none' && words.chapter === at ? words.phrases : null;
  const heard = useHeard(track.id, at, phrases);
  useEffect(() => {
    if (heard < 0 || Date.now() - touched.current < 5000) return;
    const lit = box.current?.querySelector<HTMLElement>('.p.now');
    if (lit && box.current) box.current.scrollTo({ top: lit.offsetTop - box.current.clientHeight / 3, behavior: 'smooth' });
  }, [heard]);

  const start = track.chapters[at]?.start ?? 0;
  return (
    <>
      <div ref={box} className="pw" onWheel={() => (touched.current = Date.now())} onTouchMove={() => (touched.current = Date.now())}>
        {words === null && <p className="yi-none">טוען…</p>}
        {words === 'none' && <p className="yi-none">אין עדיין מילים לחלק הזה</p>}
        {phrases && (
          <div className="yi">
            {phrases.map((phrase, index) => (
              <span key={index}>
                <span
                  className={index === heard ? 'p now' : 'p'}
                  role="button"
                  tabIndex={0}
                  onClick={() => getSelection()?.isCollapsed !== false && player.seek(start + phrase.start)}
                  onKeyDown={(event) => event.key === 'Enter' && player.seek(start + phrase.start)}
                >
                  {phrase.text}
                </span>{' '}
              </span>
            ))}
          </div>
        )}
      </div>
      {phrases && !(words as { checked: boolean }).checked && <div className="pnote">המילים נשמעו במכונה ועוד לא נבדקו</div>}
    </>
  );
}

function Chapters({ track, open, onClose }: { track: Track; open: boolean; onClose: () => void }) {
  const at = usePlayer((s) => chapterAt(track, s.position));
  return (
    <Sheet open={open} title="חלקי ההקלטה" onClose={onClose}>
      <Rows quiet>
        {track.chapters.map((chapter, index) => (
          <Row
            key={index}
            title={chapter.title}
            current={index === at}
            end={clock(chapter.duration)}
            onClick={() => {
              player.chapter(index);
              onClose();
            }}
          />
        ))}
      </Rows>
    </Sheet>
  );
}
