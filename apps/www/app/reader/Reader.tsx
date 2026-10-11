import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { EditBar, EditFields, Linked, Names } from '../edit/Edit';
import { Fixing } from '../fix/Fixing';
import { pathLevels } from '../lib/catalog';
import { Button, Icon, IconButton, Sheet, TopBar, useTheme, useToast, type IconName } from '../ui';
import { readSize, setSize, SIZE_MAX, SIZE_MIN } from './size';
import type { ReaderData } from './types';
import { ServerHtml } from './Words';

type Open = null | 'look' | 'more' | 'versions' | 'recordings' | { note: string };

/**
 * The reading page: only the words and their footnotes. A footnote's mark
 * opens it in a sheet; text size and light or dark are under the text button;
 * everything else (versions, the scan, the recording, copying with the
 * source, sharing, Edit, reporting) is in the corner menu. The sicha before
 * and after are at the foot. Selecting words opens a small bar to fix,
 * copy or share them (app/fix).
 */
export function Reader({ data }: { data: ReaderData }) {
  const [open, setOpen] = useState<Open>(null);
  const close = useCallback(() => setOpen(null), []);
  const toast = useToast();
  const torah = useRef<HTMLDivElement>(null);

  const text = data.text;
  const words = text.kind === 'words' ? text : null;
  // Edit is the same page, with ?edit: only its own fields, and words fixed by selecting them.
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const editing = search.has('edit');
  const without = new URLSearchParams(search);
  without.delete('edit');
  const reading = `${data.path}${without.size ? `?${without}` : ''}`;

  // A footnote's mark opens the note; without script it is a link to the note at the end of the page.
  const onWords = (event: MouseEvent) => {
    const mark = (event.target as HTMLElement).closest<HTMLAnchorElement>('a.nm');
    if (!mark?.dataset.n) return;
    event.preventDefault();
    setOpen({ note: mark.dataset.n });
  };
  // Home's "continue learning" draws the last page opened from this cookie, without waiting for script.
  useEffect(() => {
    const value = encodeURIComponent(JSON.stringify({ to: data.path, title: data.title.slice(0, 40), sub: data.sub.slice(0, 40) }));
    if (value.length <= 300) document.cookie = `ch_read=${value}; path=/; max-age=31536000; SameSite=Lax`;
  }, [data.path, data.title, data.sub]);

  const note = open && typeof open === 'object' ? open.note : null;
  useEffect(() => {
    const marks = torah.current?.querySelectorAll<HTMLElement>('a.nm') ?? [];
    for (const mark of marks) mark.classList.toggle('on', mark.dataset.n === note);
  }, [note]);

  const copy = async () => {
    close();
    const body = torah.current?.querySelector<HTMLElement>('.torah')?.innerText.trim() ?? '';
    try {
      await navigator.clipboard.writeText(`${body}\n\n(${data.citation})\n${data.url}`);
      toast('הועתק עם המקור');
    } catch {
      toast('ההעתקה לא הצליחה בדפדפן הזה');
    }
  };
  const share = async () => {
    close();
    try {
      if (navigator.share) return await navigator.share({ title: data.title, text: data.citation, url: data.url });
      await navigator.clipboard.writeText(data.url);
      toast('הקישור הועתק');
    } catch {
      // Closing the share sheet is not a failure.
    }
  };

  return (
    <>
      <TopBar
        path={pathLevels(data.pathBar)}
        hideOnScroll
        end={
          <>
            <IconButton icon="text" label="גודל ומראה" onClick={() => setOpen('look')} />
            <IconButton icon="more" label="עוד" onClick={() => setOpen('more')} />
          </>
        }
      />
      {editing && <EditBar done={reading} />}
      <main id="content" className="view wide">
        <article className="reader">
          <h1 className="stitle">{data.title}</h1>
          {data.sub && <p className="ssub">{data.sub}</p>}
          {editing && (
            <EditFields>
              <Names item={data.id} rev={data.rev} names={data.names} />
              {data.work && (
                <Linked to={`${data.work.path}?edit`} action="לערוך שם">
                  נמצא בספר: {data.sub || data.work.label}
                </Linked>
              )}
              <Linked action="בקרוב">הקלטה: לא מקושרת</Linked>
            </EditFields>
          )}
          {words && words.machine !== 'none' && (
            <p className="mach">
              <span className="machine">{words.machine === 'all' ? 'נקרא במכונה, עוד לא נבדק בידי אדם' : 'חלק מהמילים נקראו במכונה ועוד לא נבדקו'}</span>
            </p>
          )}

          {words && (
            <div ref={torah} onClick={onWords} data-fix-item={data.id} data-fix-version={words.version || undefined}>
              <ServerHtml id={`body:${data.path}`} html={words.body} className={words.machine === 'all' ? 'torah unchecked' : 'torah'} />
              {words.hasNotes && (
                <section className="notes" aria-labelledby="notes-h">
                  <h2 id="notes-h">הערות</h2>
                  <ServerHtml id={`notes:${data.path}`} html={words.notes} as="ol" />
                </section>
              )}
            </div>
          )}
          {text.kind === 'pages' && (text.images.length || !data.pdfs.length) && <Scan text={text} />}
          {(text.kind === 'none' || (text.kind === 'pages' && !text.images.length)) && data.pdfs.length > 0 && <Pdf pdfs={data.pdfs} />}
          {text.kind === 'withheld' && (
            <Missing>
              המילים של הדף הזה לא מוצגות כאן{text.reason ? ` (${text.reason})` : ''}.
              {text.source && (
                <>
                  {' '}
                  <a href={text.source} rel="noopener" target="_blank">
                    לקריאה במקור
                  </a>
                </>
              )}
            </Missing>
          )}
          {text.kind === 'none' && !data.pdfs.length && <Missing>אין עדיין טקסט או סריקה לדף הזה.</Missing>}

          {(data.previous || data.next) && (
            <nav className="endnav" aria-label="הקודם והבא">
              {data.previous ? (
                <Link to={data.previous.path} rel="prev">
                  <Icon name="chevron-right" />
                  {data.previous.label}
                </Link>
              ) : (
                <span />
              )}
              {data.next && (
                <Link to={data.next.path} rel="next">
                  {data.next.label}
                  <Icon name="chevron-left" />
                </Link>
              )}
            </nav>
          )}
        </article>
      </main>

      {words && <Fixing root={torah} path={data.path} citation={data.citation} url={data.url} title={data.title} />}
      <NoteSheet note={note} onNote={(id) => setOpen({ note: id })} onClose={close} />
      <Look open={open === 'look'} onClose={close} />

      <Sheet open={open === 'more'} title="עוד" onClose={close}>
        <Option
          icon="versions"
          label="נוסח"
          end={words?.versions.length ? (words.versions.find((v) => v.version === words.version)?.label ?? '') + (words.versions.length > 1 ? ` · ועוד ${words.versions.length - 1}` : '') : 'אין נוסח אחר'}
          onSelect={words && words.versions.length > 1 ? () => setOpen('versions') : undefined}
        />
        <Option
          icon="scan"
          label="הסריקה"
          end={text.kind === 'pages' || (text.kind === 'none' && data.pdfs.length) ? 'מוצגת' : data.scan || data.pdfs.length ? 'PDF' : 'אין סריקה מקושרת'}
          onSelect={words && (data.scan || data.pdfs[0]) ? () => (close(), window.open(data.scan ?? data.pdfs[0]!.url, '_blank', 'noopener')) : undefined}
        />
        <Option
          icon="listen"
          label="לשמוע את הרבי"
          end={data.recordings.length === 1 ? data.recordings[0]!.duration : data.recordings.length > 1 ? `${data.recordings.length} הקלטות` : 'אין הקלטה מקושרת'}
          onSelect={data.recordings.length === 1 ? () => (close(), navigate(data.recordings[0]!.path)) : data.recordings.length > 1 ? () => setOpen('recordings') : undefined}
        />
        <Option icon="copy" label="העתקה עם מקור" onSelect={words ? copy : undefined} />
        <Option icon="share" label="שיתוף" onSelect={share} />
        <Option icon="history" label="היסטוריה" quiet onSelect={() => (close(), navigate(`/history/${data.id}`))} />
        <Option icon="talk" label="שיחה על הדף" quiet onSelect={() => (close(), navigate(`/talk/${data.id}`))} />
        <Option
          icon="pen"
          label="עריכה"
          quiet
          onSelect={() => {
            close();
            const next = new URLSearchParams(search);
            next.set('edit', '');
            navigate(`?${next}`, { replace: true, preventScrollReset: true });
          }}
        />
        {/* Reporting waits until a report can carry who sends it (sign-in, or the captcha the API asks for when signed out). */}
        <Option icon="flag" label="משהו לא בסדר כאן" end="בקרוב" quiet />
      </Sheet>

      {data.recordings.length > 1 && (
        <Sheet open={open === 'recordings'} title="לשמוע את הרבי" onClose={close}>
          {data.recordings.map((r) => (
            <Link key={r.path} className="opt" to={r.path} onClick={close}>
              <Icon name="listen" />
              <span className="t">{r.label}</span>
              {r.duration && <span className="r">{r.duration}</span>}
            </Link>
          ))}
        </Sheet>
      )}

      {words && (
        <Sheet open={open === 'versions'} title="נוסח" onClose={close}>
          {words.versions.map((v) => (
            <Link key={v.version} className="opt" to={`?language=${encodeURIComponent(v.version)}`} replace onClick={close} aria-current={v.version === words.version || undefined}>
              <span className="t">{v.label}</span>
              {v.version === words.version && <Icon name="check" />}
            </Link>
          ))}
          {words.credit && <p className="faint sm">{words.credit}</p>}
        </Sheet>
      )}

    </>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return <p className="faint missing">{children}</p>;
}

/** No words yet: the pages of the scan the item is printed on. */
function Scan({ text }: { text: Extract<ReaderData['text'], { kind: 'pages' }> }) {
  return (
    <div className="scan">
      <p className="faint sm">אין עדיין טקסט לדף הזה; אלה עמודי הסריקה.</p>
      {text.images.map((image) => (
        <img key={image.page} src={image.src} width={image.width} height={image.height} loading="lazy" decoding="async" alt={`עמוד ${image.page} בסריקה`} />
      ))}
      {text.pdf && (
        <Button look="outline" icon="scan" onClick={() => window.open(text.pdf!, '_blank', 'noopener')}>
          {text.images.length ? 'פתיחת הסריקה כולה' : `פתיחת הסריקה (עמ׳ ${text.first}${text.last > text.first ? `–${text.last}` : ''})`}
        </Button>
      )}
    </div>
  );
}

/** No words yet: the page as it was printed, read on the page from where it is kept (Google Drive), as the Library shows a scan. */
function Pdf({ pdfs }: { pdfs: ReaderData['pdfs'] }) {
  const shown = pdfs.find((pdf) => pdf.embed);
  return (
    <>
      <div className="scan-head">
        <span className="faint sm">אין עדיין טקסט לדף הזה; זה הדף כפי שנדפס.</span>
        {pdfs.map((pdf) => (
          <a key={pdf.url} className="faint sm" href={pdf.url} target="_blank" rel="noopener noreferrer">
            {pdf === shown ? 'לפתוח בחלון חדש' : pdf.label}
          </a>
        ))}
      </div>
      {shown && <iframe className="scan-frame" src={shown.embed!} title={`הדף כפי שנדפס: ${shown.label}`} allow="fullscreen" loading="lazy" referrerPolicy="no-referrer" />}
    </>
  );
}

/** A line of the corner menu. Without `onSelect` it is greyed: there is nothing there yet. */
function Option({ icon, label, end, onSelect, quiet }: { icon: IconName; label: string; end?: string; onSelect?: () => void; quiet?: boolean }) {
  return (
    <button type="button" className={['opt', quiet && 'quiet', !onSelect && 'off'].filter(Boolean).join(' ')} aria-disabled={!onSelect || undefined} onClick={onSelect}>
      <Icon name={icon} />
      <span className="t">{label}</span>
      {end && <span className="r">{end}</span>}
    </button>
  );
}

/** A footnote in a sheet, with the notes before and after it. Its words are the ones drawn at the end of the page. */
function NoteSheet({ note, onNote, onClose }: { note: string | null; onNote: (id: string) => void; onClose: () => void }) {
  const [shown, setShown] = useState<{ id: string; label: string; html: string; previous?: string; next?: string } | null>(null);
  useEffect(() => {
    if (!note) return;
    const all = [...document.querySelectorAll<HTMLElement>('.notes li.fn')];
    const at = all.findIndex((li) => li.id === `n-${note}`);
    const li = all[at];
    if (!li) return;
    const id = (el: HTMLElement | undefined) => el?.id.slice(2);
    setShown({ id: note, label: li.querySelector('.fl')?.textContent ?? '', html: li.querySelector('.nt')?.innerHTML ?? '', previous: id(all[at - 1]), next: id(all[at + 1]) });
  }, [note]);
  const label = (id?: string) => (id ? document.getElementById(`n-${id}`)?.querySelector('.fl')?.textContent : '') ?? '';
  return (
    <Sheet open={!!note} title={shown ? `הערה ${shown.label}` : 'הערה'} onClose={onClose}>
      {shown && (
        <>
          <div className="notetext" dangerouslySetInnerHTML={{ __html: shown.html }} />
          <div className="endnav">
            <button type="button" disabled={!shown.previous} onClick={() => shown.previous && onNote(shown.previous)}>
              <Icon name="chevron-right" />
              {shown.previous ? `הערה ${label(shown.previous)}` : ''}
            </button>
            <button type="button" disabled={!shown.next} onClick={() => shown.next && onNote(shown.next)}>
              {shown.next ? `הערה ${label(shown.next)}` : ''}
              <Icon name="chevron-left" />
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Text size and light or dark: the text button's sheet. */
function Look({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [theme, toggleTheme] = useTheme();
  const [size, change] = useState(0);
  useEffect(() => change(readSize()), [open]);
  const step = (by: number) => change(setSize(size + by));
  return (
    <Sheet open={open} title="גודל ומראה" onClose={onClose}>
      <div className="opt">
        <span className="t">גודל הטקסט</span>
        <span className="seg" role="group" aria-label="גודל הטקסט">
          <button type="button" aria-label="קטן יותר" disabled={size <= SIZE_MIN} onClick={() => step(-1)}>
            א−
          </button>
          <button type="button" aria-label="גדול יותר" disabled={size >= SIZE_MAX} onClick={() => step(1)}>
            א+
          </button>
        </span>
      </div>
      <button type="button" className="opt" onClick={toggleTheme}>
        <span className="t">מראה</span>
        <span className="r">{theme === 'dark' ? 'כהה' : 'בהיר'}</span>
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      </button>
    </Sheet>
  );
}
