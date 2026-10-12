import { SHAAR_SECTIONS } from '@chassidushub/model';
import { useId, useState } from 'react';
import { data, Link } from 'react-router';
import { useAccount } from '../lib/account';
import { act, said } from '../tools/common';
import { itemHead, orNothing } from '../tools/item.server';
import { ItemTop } from '../tools/ItemTop';
import { Button, Field, Say, SectionHead } from '../ui';
import type { Route } from './+types/shaar';
import { KEPT_PAGE } from '../lib/caching';

/** The header's fields, and what each holds (docs/shaar.md). */
const FIELDS: Array<[string, string]> = [
  ['shaar', 'גרסת הכללים: 1'],
  ['title / title-en', 'שם הספר, בעברית ובאנגלית'],
  ['subtitle / subtitle-en', 'השורה השנייה בשער'],
  ['by', 'המחבר, במזהה שלו (rh-…), שורה לכל אחד'],
  ['by-line / by-line-en', 'המחבר כפי שהשער קורא לו'],
  ['genre', 'סוג הספר: sichos, maamarim, chassidus…'],
];

/**
 * A sefer's shaar (docs/shaar.md): what a README is to a repository, one
 * file written the same way for every sefer, which the catalog knows how to
 * read. The file as it is written, and, signed in, the file to edit: every
 * line the catalog cannot read is named before it is sent, and it goes for
 * review as a Suggestion of its own. One the catalog made from its data is
 * labelled so until a person sends it.
 */
export async function loader({ params, context: { api } }: Route.LoaderArgs) {
  const [head, file] = await Promise.all([itemHead(api, params.id, ['work']), orNothing(api.getShaar({ id: params.id }))]);
  if (!file) throw data('not found', { status: 404 });
  return { head, text: file.text, machine: file.machine, sections: SHAAR_SECTIONS.map((s) => `## ${s.he} | ${s.en}`) };
}

export const headers = () => ({ 'Cache-Control': KEPT_PAGE });

export const handle = { section: 'library' };

export function meta({ data: shaar }: Route.MetaArgs) {
  return [{ title: shaar ? `שער: ${shaar.head.name} · ChassidusHub` : 'ChassidusHub' }];
}

export default function Shaar({ loaderData: { head, text: written, machine, sections } }: Route.ComponentProps) {
  const account = useAccount();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(written);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ said: string; problems?: { line: number; he: string }[] } | null>(null);
  const [sent, setSent] = useState<{ suggestion: number | null } | null>(null);
  const withheld = head.withheld;

  return (
    <>
      <ItemTop head={head} tool="shaar" />
      <main id="content" className="view it-text">
        <h1>השער</h1>
        <p className="faint sm">
          <Link to={head.to}>{head.name}</Link>
        </p>
        <p className="lede muted">השער של ספר הוא קובץ אחד, כתוב אותו דבר בכל ספר, שהקטלוג יודע לקרוא. למעלה, בין שתי שורות של ---, השדות הקבועים; אחריהם הפרקים, כל אחד תחת כותרת קבועה.</p>
        {machine && !sent && (
          <p className="mach">
            <span className="machine">השער הזה נעשה מנתוני הקטלוג. קראו, תקנו והשלימו ושלחו: מאז הוא נחשב שנקרא בידי אדם.</span>
          </p>
        )}
        {sent && (
          <Say tone="good">
            נשלח לבדיקה. {sent.suggestion ? <Link to={`/suggestions/${sent.suggestion}`}>לראות את ההצעה</Link> : null}
          </Say>
        )}

        {editing ? (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              const answer = await act('shaar', { item: head.id, text, before: written, note });
              setBusy(false);
              if (!answer.ok) return setError({ said: said(answer), problems: answer.problems });
              setSent({ suggestion: typeof answer.suggestion === 'number' ? answer.suggestion : null });
              setEditing(false);
            }}
          >
            <label htmlFor={id} className="sr-only">
              השער
            </label>
            <textarea id={id} className="it-area it-code" dir="auto" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} disabled={busy} rows={18} />
            {error && (
              <Say tone="bad">
                {error.said}
                {error.problems && (
                  <ul className="it-list">
                    {error.problems.map((problem, at) => (
                      <li key={at}>
                        שורה {problem.line}: {problem.he}
                      </li>
                    ))}
                  </ul>
                )}
              </Say>
            )}
            <Field label="מה שיניתם, בשורה אחת" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} disabled={busy} />
            <div className="btns">
              <Button type="submit" disabled={busy || (text === written && !machine)}>
                {busy ? 'שולח…' : 'שליחה לבדיקה'}
              </Button>
              <Button look="ghost" onClick={() => setEditing(false)} disabled={busy}>
                ביטול
              </Button>
            </div>
          </form>
        ) : (
          <>
            {/* Each line in its own direction: the header's fields left to right, the Hebrew sections right to left. */}
            <pre className="it-code">
              {(sent ? text : written).split('\n').map((line, at) => (
                <span key={at} dir="auto" className="it-code-line">
                  {line || ' '}
                </span>
              ))}
            </pre>
            <div className="btns">
              {account && !withheld && !sent && (
                <Button icon="pen" onClick={() => setEditing(true)}>
                  עריכה
                </Button>
              )}
              {account === null && (
                <span className="faint sm">
                  כדי לערוך צריך <Link to={`/signin?return=${encodeURIComponent(`/shaar/${head.id}`)}`}>להיכנס</Link>.
                </span>
              )}
            </div>
          </>
        )}

        <SectionHead title="השדות" />
        <dl className="it-facts">
          {FIELDS.map(([key, what]) => (
            <div key={key}>
              <dt>
                <code dir="ltr">{key}</code>
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
        <SectionHead title="הפרקים" />
        <ol className="it-list">
          {sections.map((section) => (
            <li key={section}>
              <code>{section}</code>
            </li>
          ))}
        </ol>
        <p className="note">
          <a href="https://github.com/ChassidusHub/ChassidusHub/blob/main/docs/shaar.md" target="_blank" rel="noopener">
            הכללים המלאים
          </a>
        </p>
      </main>
    </>
  );
}
