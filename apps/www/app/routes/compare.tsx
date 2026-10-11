import { Link } from 'react-router';
import { nameOf } from '../reader/load.server';
import { Pieces } from '../tools/Changes';
import type { Piece } from '../tools/common';
import { itemHead, orNothing } from '../tools/item.server';
import { ItemTop } from '../tools/ItemTop';
import { Row, Rows, SectionHead } from '../ui';
import type { Route } from './+types/compare';

/** A printing of a unit whose text the catalog has (GET /v1/units/{id}/printings). */
interface Printing {
  key: string;
  label: unknown;
  kind: 'text' | 'scan';
  checked: boolean;
}

/** Two printings compared word by word (GET /v1/compare). */
interface Comparison {
  a: { key: string; checked: boolean };
  b: { key: string; checked: boolean };
  runs: Array<{ op: 'same' | 'removed' | 'added'; text: string }>;
  same: number;
  removed: number;
  added: number;
}

const KIND = { same: 'same', removed: 'del', added: 'ins' } as const;

/**
 * The runs as passages to read: a new one after a sentence ends once it has
 * some length, so the numbers beside them say where in the text a
 * difference is.
 */
function passages(runs: Comparison['runs']): Piece[][] {
  const out: Piece[][] = [];
  let current: Piece[] = [];
  let words = 0;
  for (const run of runs) {
    const kind = KIND[run.op];
    const text = run.text.replace(/\s+/g, ' ').trim();
    const parts = kind === 'same' ? text.split(/(?<=[.:;])\s+/) : [text];
    parts.forEach((part, at) => {
      if (!part) return;
      current.push({ kind, text: `${part} ` });
      words += part.split(/\s+/).length;
      const ended = kind === 'same' && (at < parts.length - 1 || /[.:;]$/.test(part));
      if (ended && words >= 24) {
        out.push(current);
        current = [];
        words = 0;
      }
    });
  }
  if (current.length) out.push(current);
  return out;
}

/**
 * Printings compared (the plan, section 9): two printings of one sicha or
 * letter, a text or the words read from a scan, word by word on one page.
 * What only the first has is struck through, what only the second has is
 * marked; niqqud, geresh and final letters are no difference. The two are
 * picked from the list by links, so the page works without script. Words a
 * machine read are labelled, since a misreading looks like a difference.
 */
export async function loader({ request, params, context: { api } }: Route.LoaderArgs) {
  const [head, listed] = await Promise.all([itemHead(api, params.unit, ['unit']), api.unitPrintings({ id: params.unit }).catch(() => ({ printings: [] }))]);
  const printings = (listed.printings as unknown as Printing[]).map((p) => ({ key: p.key, label: nameOf(p.label) || p.key, kind: p.kind, checked: !!p.checked }));
  const search = new URL(request.url).searchParams;
  const a = search.get('a') ?? printings[0]?.key ?? null;
  const b = search.get('b') ?? printings.find((p) => p.key !== a)?.key ?? null;
  const comparison = a && b && a !== b ? ((await orNothing(api.comparePrintings({ a, b }))) as Comparison | null) : null;
  return {
    head,
    printings,
    a,
    b,
    comparison: comparison && { same: comparison.same, removed: comparison.removed, added: comparison.added, unchecked: !comparison.a.checked || !comparison.b.checked, passages: passages(comparison.runs) },
  };
}

export const headers = () => ({ 'Cache-Control': 'public, max-age=300, s-maxage=3600' });

export const handle = { section: 'library' };

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data ? `השוואת דפוסים: ${data.head.name} · ChassidusHub` : 'ChassidusHub' }];
}

export default function Compare({ loaderData: { head, printings, a, b, comparison } }: Route.ComponentProps) {
  const label = (key: string | null) => printings.find((p) => p.key === key)?.label ?? key ?? '';
  // A link making `key` the first (or the second) printing, swapping them when it already is the other.
  const pick = (key: string, side: 'a' | 'b') => {
    const next = side === 'a' ? { a: key, b: key === b ? a : b } : { a: key === a ? b : a, b: key };
    const query = new URLSearchParams();
    if (next.a) query.set('a', next.a);
    if (next.b) query.set('b', next.b);
    return `/compare/${head.id}?${query}`;
  };
  return (
    <>
      <ItemTop head={head} tool="compare" />
      <main id="content" className="view it-text">
        <h1>השוואת דפוסים</h1>
        <p className="faint sm">
          <Link to={head.to}>{head.name}</Link>
        </p>
        <p className="lede muted">שני דפוסים של אותה שיחה, מילה מול מילה. מה שיש רק בראשון מחוק, ומה שיש רק בשני מסומן. ניקוד, גרשיים ואותיות סופיות אינם הבדל.</p>

        {printings.length < 2 ? (
          <p className="faint">לדף הזה אין עדיין שני דפוסים שאפשר להשוות.</p>
        ) : (
          <>
            <SectionHead title={`הדפוסים (${printings.length})`} />
            <Rows>
              {printings.map((p) => (
                <Row
                  key={p.key}
                  current={p.key === a || p.key === b}
                  title={p.label}
                  sub={
                    <>
                      {p.kind === 'scan' ? 'עמודי סריקה' : 'טקסט'} {p.checked ? '· נבדק' : <span className="machine">מכונה</span>}
                    </>
                  }
                  end={
                    <span className="it-ab" role="group" aria-label={p.label}>
                      <Link to={pick(p.key, 'a')} replace preventScrollReset className="chip" aria-current={p.key === a ? 'true' : undefined}>
                        ראשון
                      </Link>
                      <Link to={pick(p.key, 'b')} replace preventScrollReset className="chip" aria-current={p.key === b ? 'true' : undefined}>
                        שני
                      </Link>
                    </span>
                  }
                />
              ))}
            </Rows>
          </>
        )}

        {printings.length >= 2 && a && b && a === b && <p className="faint">בחרו שני דפוסים שונים.</p>}

        {comparison && (
          <section aria-labelledby="compared-h">
            <h2 id="compared-h">
              {label(a)} מול {label(b)}
            </h2>
            {comparison.unchecked && (
              <p className="mach">
                <span className="machine">חלק מהמילים נקראו במכונה ועוד לא נבדקו: טעות קריאה נראית כמו הבדל.</span>
              </p>
            )}
            <p className="faint sm">
              {comparison.same} מילים זהות · <del>רק בראשון</del> {comparison.removed} · <ins>רק בשני</ins> {comparison.added}
            </p>
            {comparison.removed === 0 && comparison.added === 0 && <p>שני הדפוסים זהים מילה במילה.</p>}
            <ol className="it-passages">
              {comparison.passages.map((passage, at) => (
                <li key={at} className={passage.some((p) => p.kind !== 'same') ? 'changed' : undefined}>
                  <span className="n">{at + 1}</span>
                  <p className="torah-face">
                    <Pieces pieces={passage} />
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
    </>
  );
}
