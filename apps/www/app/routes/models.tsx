import { MODEL_FAMILIES, MODELS_LICENCE, STATE_NAME, type ScoreTable } from '../community/models';
import { Icon, Row, Rows, SectionHead, TopBar } from '../ui';
import type { Route } from './+types/models';

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'המודלים ומדדי הביצוע · ChassidusHub' },
    { name: 'description', content: 'ChassidusHub קורא סריקות ושומע הקלטות במודלים משלו. מה כל אחד עושה, איזה מהם בשימוש, ואיך הוא הצליח במבחן שלא למד ממנו.' },
  ];
}

/** The scores are fixed text (community/models.ts), sent with the page rather than in its script. */
export function loader() {
  return { families: MODEL_FAMILIES, licence: MODELS_LICENCE, states: STATE_NAME };
}

export function headers() {
  return { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' };
}

/** A model's own name is in Latin letters and reads left to right; a description is Hebrew. */
const latin = (name: string) => /^[\x20-\x7e]+$/.test(name);

/**
 * ChassidusHub's own models (thread 6, rebuilt from the old site): the
 * Likkutei Sichos reader, the Miram (bold) detector and the Whisper that
 * hears the Rebbe, and how each did on a test it never learned from. Only
 * the descriptions and the scores are published; the models and how they
 * are made are not, and nothing here leads to them.
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  const { families, licence, states } = loaderData;
  return (
    <>
      <TopBar title="המודלים" />
      <main id="content" className="view wide">
        <h1>המודלים ומדדי הביצוע</h1>
        <p className="lede">ChassidusHub קורא סריקות ושומע הקלטות במודלים משלו. כאן כתוב מה כל אחד עושה, איזה מהם בשימוש, ואיך הוא הצליח במבחן שלא למד ממנו.</p>
        <p className="muted">
          המודלים הם של ChassidusHub ואינם משוחררים; רק התיאורים והציונים מתפרסמים. כל מה שמודל כותב מסומן באתר <span className="machine">מכונה</span> עד שאדם בודק אותו, יהיה הציון טוב ככל שיהיה.
        </p>
        <nav aria-label="בדף הזה" className="chips">
          {families.map((family) => (
            <a key={family.id} href={`#${family.id}`} className="chip">
              {family.title}
            </a>
          ))}
        </nav>

        {families.map((family) => (
          <section key={family.id} id={family.id} aria-labelledby={`${family.id}-h`}>
            <h2 id={`${family.id}-h`} className="family">
              {family.title}
            </h2>
            <p className="muted">{family.intro}</p>
            <Rows>
              {family.models.map((model) => (
                <Row key={model.name} start={<Icon name={family.id === 'whisper' ? 'listen' : 'scan'} className="faint" />} title={<bdi dir="ltr">{model.name}</bdi>} sub={model.does} end={states[model.state]} />
              ))}
            </Rows>
            {family.tables.map((table) => (
              <Scores key={table.id} table={table} states={states} />
            ))}
            <h3>נקודות חולשה</h3>
            <ul className="howto">
              {family.weak.map((weak) => (
                <li key={weak}>{weak}</li>
              ))}
            </ul>
            {family.next && <p>{family.next}</p>}
          </section>
        ))}

        <p className="note">{licence}</p>
      </main>
    </>
  );
}

/** One benchmark as a plain printed table: the test above it, a note under it; the model in use in bold. */
function Scores({ table, states }: { table: ScoreTable; states: Record<string, string> }) {
  return (
    <section aria-labelledby={`${table.id}-h`}>
      <h3 id={`${table.id}-h`}>{table.title}</h3>
      <p className="faint sm">{table.test}</p>
      <div className="table-wrap" tabIndex={0}>
        <table className="table">
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, at) => (
              <tr key={at} className={row.state === 'inUse' ? 'cur' : undefined}>
                <th scope="row">
                  {latin(row.name) ? <bdi dir="ltr">{row.name}</bdi> : row.name}
                  {row.state && <span className="faint sm"> {states[row.state]}</span>}
                </th>
                {row.cells.map((cell, n) => (
                  <td key={n} className="num">
                    {latin(cell) ? <bdi dir="ltr">{cell}</bdi> : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.note && <p className="faint sm">{table.note}</p>}
    </section>
  );
}
