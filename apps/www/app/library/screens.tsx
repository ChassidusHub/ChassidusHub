import { Fragment, Suspense, useState } from 'react';
import { Await, Link, useNavigate, useSearchParams } from 'react-router';
import { EditBar, EditFields, Linked, Names } from '../edit/Edit';
import { libraryLevel, pathLevels } from '../lib/catalog';
import { Icon, IconButton, Row, Rows, SearchField, SectionHead, Sheet, TopBar, useToast, type PathLevel } from '../ui';
import type { Line, SetData, VolumeData, WorkData } from './load';
import { aboutOf, usePrintings, type Printing } from './printings';

/**
 * The library's screens, as the approved prototype draws them: the library
 * (the Rebbeim), a Rebbe or a shelf (his sefarim), a sefer (a grid of its
 * volumes and a search inside it), a volume (its sichos), and a printing's
 * scan where there are no words to read yet. Every one opens with the path bar.
 */

function Lines({ lines }: { lines: Line[] }) {
  return (
    <Rows>
      {lines.map((line) => (
        <Row key={line.key} title={line.title} sub={line.sub} end={line.end} to={line.to} chevron />
      ))}
    </Rows>
  );
}

/** The library: the Rebbeim, then a row to the other shelves (`?more`). */
export function LibraryScreen({ rebbeim }: { rebbeim: Line[] }) {
  return (
    <>
      <TopBar path={[libraryLevel()]} />
      <main id="content" className="view">
        <LibrarySearch />
        <h1 className="sr-only">ספרייה</h1>
        <h2>רבותינו נשיאינו</h2>
        <Rows>
          {rebbeim.map((line) => (
            <Row key={line.key} title={line.title} sub={line.sub} to={line.to} chevron />
          ))}
          <Row title={<span className="quiet-title">ספרים נוספים</span>} to="/library?more" />
        </Rows>
      </main>
    </>
  );
}

function LibrarySearch() {
  return (
    <form action="/search" role="search">
      <SearchField name="q" label="חיפוש בספרייה" />
    </form>
  );
}

/** The other top shelves, beside the Rebbeim: they come in as they are read, below the page that is already there. */
export function OtherShelvesScreen({ others }: { others: Promise<Line[]> }) {
  const path: PathLevel[] = [
    libraryLevel(),
    { key: 'more', label: 'ספרים נוספים', title: 'ספרייה', items: [{ key: 'rebbeim', label: 'רבותינו נשיאינו', to: '/library' }, { key: 'more', label: 'ספרים נוספים', to: '/library?more', current: true }] },
  ];
  return (
    <>
      <TopBar path={path} />
      <main id="content" className="view">
        <LibrarySearch />
        <h1>ספרים נוספים</h1>
        <Suspense fallback={<p className="faint sm">טוען…</p>}>
          <Await resolve={others} errorElement={<p className="faint">לא הצלחנו לקרוא את המדפים. נסו שוב.</p>}>{(lines) => <Lines lines={lines} />}</Await>
        </Suspense>
      </main>
    </>
  );
}

/** A Rebbe or a shelf: its sefarim and shelves, then the books on it that are additions. */
export function SetScreen({ data }: { data: SetData }) {
  const edit = useEdit(data.path ?? '');
  return (
    <>
      <TopBar path={pathLevels(data.levels)} end={<Corner title={data.title} printings={[]} onEdit={edit.start} />} />
      {edit.editing && <EditBar done={edit.done} />}
      <main id="content" className="view">
        <h1>{data.title}</h1>
        {edit.editing && (
          <EditFields>
            <Names item={data.id} rev={data.rev} names={data.names} />
            {data.inside && <InsideLink inside={data.inside} kind="מדף" />}
            <Linked action="בדף של כל אחד">הספרים והמדפים שבו</Linked>
          </EditFields>
        )}
        {data.lines.length > 0 && (
          <>
            <h2>ספרים</h2>
            <Lines lines={data.lines} />
          </>
        )}
        {data.additions.length > 0 && (
          <>
            <h2>ספרים נוספים</h2>
            <Lines lines={data.additions} />
          </>
        )}
        {!data.lines.length && !data.additions.length && <p className="faint">אין כאן ספרים עדיין.</p>}
      </main>
    </>
  );
}

/** Share the page: the phone's own share sheet where there is one, else the link copied. */
function useShare() {
  const toast = useToast();
  return async (title: string) => {
    const url = location.href;
    try {
      if (navigator.share) return await navigator.share({ title, url });
      await navigator.clipboard.writeText(url);
      toast('הקישור הועתק');
    } catch {
      // The reader closed the share sheet.
    }
  };
}

/**
 * Edit is the same page, with ?edit: only its own fields. `start` opens it
 * from the corner menu; `done` is the page without it.
 */
function useEdit(path: string) {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const without = new URLSearchParams(search);
  without.delete('edit');
  const start = () => {
    const next = new URLSearchParams(search);
    next.set('edit', '');
    navigate(`?${next}`, { replace: true, preventScrollReset: true });
  };
  return { editing: search.has('edit'), done: `${path}${without.size ? `?${without}` : ''}`, start };
}

/** The shelf (or sefer) a page is in, edited on its own page. */
function InsideLink({ inside, kind }: { inside: { path: string; label: string }; kind: string }) {
  return (
    <Linked to={`${inside.path}?edit`} action="לערוך שם">
      נמצא ב{kind}: {inside.label}
    </Linked>
  );
}

/** The corner menu of a shelf, a sefer or a volume: share, the printings and their scans, and Edit. */
function Corner({ title, printings, onEdit }: { title: string; printings: Printing[]; onEdit: () => void }) {
  const [open, setOpen] = useState<'menu' | 'printings' | null>(null);
  const share = useShare();
  return (
    <>
      <IconButton icon="more" label="עוד" onClick={() => setOpen('menu')} />
      <Sheet open={open === 'menu'} title={title} onClose={() => setOpen(null)}>
        <button type="button" className="opt" onClick={() => (setOpen(null), void share(title))}>
          <Icon name="share" />
          <span className="t">שיתוף</span>
        </button>
        {printings.length > 0 && (
          <button type="button" className="opt" onClick={() => setOpen('printings')}>
            <Icon name="scan" />
            <span className="t">דפוסים וסריקות</span>
            <span className="r">{printings.length}</span>
          </button>
        )}
        <button type="button" className="opt quiet" onClick={() => (setOpen(null), onEdit())}>
          <Icon name="pen" />
          <span className="t">עריכה</span>
        </button>
      </Sheet>
      <Sheet open={open === 'printings'} title="דפוסים וסריקות" onClose={() => setOpen(null)}>
        <Printings printings={printings} />
      </Sheet>
    </>
  );
}

/**
 * Printings and where to read their scans: a scan the site can show opens on
 * the page itself (`?scan=`), any other in its own place, in a new tab.
 */
function Printings({ printings }: { printings: Printing[] }) {
  return (
    <Rows>
      {printings.flatMap((printing) =>
        printing.scans.map((scan, at) =>
          scan.embed ? (
            <Row key={`${printing.key}-${at}`} title={printing.title} sub={scan.label} start={<Icon name="scan" />} to={`?scan=${printing.key}-${at}`} />
          ) : (
            <a key={`${printing.key}-${at}`} className="row" href={scan.url} target="_blank" rel="noopener noreferrer">
              <Icon name="scan" />
              <span className="t">
                <b>{printing.title}</b>
                <span>{scan.label} · נפתח באתר אחר</span>
              </span>
              <Icon name="share" className="chev" />
            </a>
          ),
        ),
      )}
    </Rows>
  );
}

/** The scan a page was asked to show (`?scan=<printing>-<n>`), when it is one the site can show. */
function useScan(printings: Printing[]) {
  const [params] = useSearchParams();
  const asked = params.get('scan');
  if (!asked) return null;
  for (const printing of printings) {
    const at = printing.scans.findIndex((_, n) => `${printing.key}-${n}` === asked);
    const scan = printing.scans[at];
    if (scan?.embed) return { printing, scan };
  }
  return null;
}

/**
 * A printing's scan, read on the page: for a volume or a sefer with no words
 * yet, the printed pages are what there is to read. The scan stays where it
 * is kept (Google Drive) and is shown from there.
 */
function ScanView({ printing, scan, back }: { printing: Printing; scan: Printing['scans'][number]; back: string }) {
  return (
    <>
      <div className="scan-head">
        <div>
          <b>{printing.title}</b>
          <span className="faint sm"> · {scan.label}</span>
        </div>
        <a className="faint sm" href={scan.url} target="_blank" rel="noopener noreferrer">
          לפתוח בחלון חדש
        </a>
      </div>
      <iframe className="scan-frame" src={scan.embed} title={`סריקה: ${printing.title}`} allow="fullscreen" loading="lazy" referrerPolicy="no-referrer" />
      <p className="sm">
        <Link to={back} className="faint">
          חזרה לרשימה
        </Link>
      </p>
    </>
  );
}

/** A search inside one sefer: Search's page, narrowed to it. */
function SeferSearch({ id, title }: { id: string; title: string }) {
  return (
    <form action="/search" role="search" className="in-sefer">
      <input type="hidden" name="in" value={id} />
      <SearchField name="q" label={`חיפוש ב${title}: פרשה, ד״ה`} />
    </form>
  );
}

/** A sefer: its volumes as a grid of numbers (or a list of named parts), a search in it, its printings and additions. */
export function WorkScreen({ data }: { data: WorkData }) {
  const printings = usePrintings(data.api, data.id, data.printings);
  const scan = useScan(printings);
  const subtitle = [data.author, data.parts.length > 1 ? `${data.parts.length} חלקים` : ''].filter(Boolean).join(' · ');
  const edit = useEdit(data.path ?? '');
  return (
    <>
      <TopBar path={pathLevels(data.levels)} end={<Corner title={data.title} printings={printings} onEdit={edit.start} />} />
      {edit.editing && <EditBar done={edit.done} />}
      <main id="content" className="view">
        <h1>{data.title}</h1>
        {subtitle && <p className="faint sm lede">{subtitle}</p>}
        {edit.editing && (
          <EditFields>
            <Names item={data.id} rev={data.rev} names={data.names} />
            {data.inside && <InsideLink inside={data.inside} kind="מדף" />}
            <Linked action="בדף של כל אחת">השיחות שבו</Linked>
          </EditFields>
        )}
        {scan ? (
          <ScanView printing={scan.printing} scan={scan.scan} back={data.path ?? '.'} />
        ) : (
          <>
            {data.parts.length > 0 && <SeferSearch id={data.id} title={data.title} />}
            {data.grid ? (
              <nav className="numgrid" aria-label="חלקים">
                {data.parts.map((part) => (
                  <Link key={part.value} to={`${data.path}/${part.value}`} className={part.units ? 'has' : undefined} aria-label={part.label}>
                    {part.value}
                  </Link>
                ))}
              </nav>
            ) : (
              data.parts.length > 0 && (
                <Rows>
                  {data.parts.map((part) => (
                    <Row key={part.value} title={part.label} end={part.units ? String(part.units) : undefined} to={`${data.path}/${part.value}`} />
                  ))}
                </Rows>
              )
            )}
            {!data.parts.length && (printings.length ? <h2>סריקות</h2> : <p className="faint">אין כאן תוכן עדיין.</p>)}
            {!data.parts.length && <Printings printings={printings} />}
            {data.parts.length > 0 && printings.length > 0 && <PrintingsLink printings={printings} />}
            {data.additions.length > 0 && (
              <>
                <SectionHead title="הוספות" />
                <Lines lines={data.additions} />
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}

/** The quiet line at the foot of a sefer, to its printings and their scans. */
function PrintingsLink({ printings }: { printings: Printing[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="opt quiet" onClick={() => setOpen(true)}>
        <span className="t">דפוסים וסריקות</span>
        <span className="r">{printings.length}</span>
        <Icon name="chevron-left" className="chev" />
      </button>
      <Sheet open={open} title="דפוסים וסריקות" onClose={() => setOpen(false)}>
        <Printings printings={printings} />
      </Sheet>
    </>
  );
}

/** A volume: its sichos (under the volume's own headings where it has them), then its printings' scans. */
export function VolumeScreen({ data }: { data: VolumeData }) {
  const printings = usePrintings(data.api, data.id, data.printings, data);
  const scan = useScan(printings);
  const about = printings.map((p) => aboutOf(p.title)).find(Boolean);
  let group: string | undefined;
  const edit = useEdit(data.path);
  return (
    <>
      <TopBar path={pathLevels(data.levels)} end={<Corner title={`${data.title} · ${data.label}`} printings={printings} onEdit={edit.start} />} />
      {edit.editing && <EditBar done={edit.done} />}
      <main id="content" className="view">
        <h1>
          {data.title} · {data.label}
        </h1>
        {edit.editing && (
          <EditFields>
            {/* A volume is no item of its own: what it is called is part of its sefer. */}
            {data.workPath && <InsideLink inside={{ path: data.workPath, label: data.title }} kind="ספר" />}
            <Linked action="בדף של כל אחת">השיחות שבו</Linked>
          </EditFields>
        )}
        {/* The line is kept while the printings that name it are read, so nothing below it moves. */}
        <p className="faint sm lede">{about ?? '\u00a0'}</p>
        {scan ? (
          <ScanView printing={scan.printing} scan={scan.scan} back={data.path} />
        ) : (
          <>
            <Rows>
              {data.units.map((unit) => {
                const heading = unit.group !== group ? unit.group : undefined;
                group = unit.group;
                return (
                  <Fragment key={unit.key}>
                    {heading && <h2>{heading}</h2>}
                    <Row title={unit.title} sub={unit.sub} to={unit.to} />
                  </Fragment>
                );
              })}
            </Rows>
            {printings.length > 0 && (
              <>
                <h2>{data.units.length ? 'הסריקה' : 'סריקות'}</h2>
                <Printings printings={printings} />
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
