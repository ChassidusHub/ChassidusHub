import { Link } from 'react-router';
import { Row, Rows, Say } from '../ui';
import { dayOf, personName, stageWords, suggestionPath, type People, type Stage } from './view';

export type { Stage };

/** One suggestion waiting for review, as the back room lists it. */
export interface WaitingRow {
  id: number;
  number: number | null;
  title: string;
  author: string;
  at: string | null;
  items: number;
}

/**
 * What waits for a keeper's review (the old site's /review), oldest sent
 * first: each line opens the suggestion's own page, where its changes are read
 * and it is approved or sent back. Sent back ones wait on their author, not
 * here; what is live already is under "עלו לאתר".
 */
export function Waiting({ waiting }: { waiting: { rows: WaitingRow[]; people: People; stages: Record<string, Stage> } | null }) {
  if (!waiting) return <Say tone="bad">הרשימה לא נטענה. נסו שוב בעוד רגע.</Say>;
  if (waiting.rows.length === 0) return <Say>אין עכשיו הצעות שמחכות לבדיקה.</Say>;
  return (
    <>
      <p className="faint sm">
        הצעות שנשלחו ומחכות לשומרי הספר, הישנות קודם. פותחים אחת, קוראים את השינוי מול המקור, ומאשרים או מחזירים עם הערה. <Link to="/suggestions">כל ההצעות</Link>
      </p>
      <Rows>
        {waiting.rows.map((row) => {
          const stage = stageWords(waiting.stages[String(row.id)]);
          return (
            <Row
              key={row.id}
              to={suggestionPath(row)}
              title={<bdi>{row.title}</bdi>}
              sub={[row.number ? `#${row.number}` : 'יובאה', personName(row.author, waiting.people), dayOf(row.at), row.items > 1 ? `${row.items} פריטים` : null, stage].filter(Boolean).join(' · ')}
            />
          );
        })}
      </Rows>
    </>
  );
}
