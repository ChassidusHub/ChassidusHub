import { useState } from 'react';
import { Link } from 'react-router';
import { Segmented } from '../ui';
import { gapWords, MARK_WORDS, tally, type BatchTree, type TreeGroup, type TreeLine } from './batch';

type Side = 'before' | 'after';

/**
 * A catalog batch's tree before and after: each shelf, sefer or farbrengen
 * it changes, with its items now and once approved, side by side on a wide
 * screen and one side at a time on a phone (After first: where things go).
 * Every mark is said in words beside the item, never by colour alone.
 */
export function Tree({ tree, more }: { tree: BatchTree; more: string }) {
  const [side, setSide] = useState<Side>('after');
  if (tree.groups.length === 0)
    return (
      <p className="faint">
        ההצעה הזאת לא מזיזה שום דבר בעץ. <Link to={more}>השינויים עצמם</Link>
      </p>
    );
  return (
    <div className={`bt bt-show-${side}`}>
      <div className="bt-sides">
        <Segmented
          label="איזה צד של העץ"
          value={side}
          onChange={setSide}
          options={[
            { value: 'before', label: 'לפני' },
            { value: 'after', label: 'אחרי' },
          ]}
        />
      </div>
      {tree.groups.map((group) => (
        <Group key={group.parent.id} group={group} />
      ))}
      {tree.more > 0 && (
        <p className="faint sm">
          {`ועוד ${tree.more.toLocaleString('he')} מקומות שההצעה משנה. `}
          <Link to={more}>כל השינויים</Link>
        </p>
      )}
      {tree.elsewhere > 0 && (
        <p className="faint sm">
          {tree.elsewhere === 1 ? 'שינוי אחד לא מזיז דבר בעץ (תאריך, הערה וכדומה). ' : `${tree.elsewhere.toLocaleString('he')} שינויים לא מזיזים דבר בעץ (תאריך, הערה וכדומה). `}
          <Link to={more}>לראות אותם</Link>
        </p>
      )}
    </div>
  );
}

/** One parent: its name, what happens in it, and its items on each side. */
function Group({ group }: { group: TreeGroup }) {
  const { parent, counts } = group;
  const name = parent.path && !parent.isNew ? <Link to={parent.path}>{parent.name}</Link> : parent.name;
  return (
    <section className="bt-group" aria-label={parent.name}>
      <h3>
        <bdi>{name}</bdi>
        {parent.isNew && <span className="bt-mark">חדש</span>}
        {parent.gone && <span className="bt-mark">נמחק</span>}
      </h3>
      <p className="faint sm">
        {[tally(group), `${counts.before.toLocaleString('he')} פריטים לפני, ${counts.after.toLocaleString('he')} אחרי`].filter(Boolean).join(' · ')}
      </p>
      <div className="bt-cols">
        <Column side="before" lines={group.before} />
        <Column side="after" lines={group.after} />
      </div>
    </section>
  );
}

function Column({ side, lines }: { side: Side; lines: TreeLine[] }) {
  return (
    <div className={`bt-col bt-${side}`}>
      <h4>{side === 'before' ? 'לפני' : 'אחרי'}</h4>
      {lines.length === 0 ? (
        <p className="faint sm">{side === 'before' ? 'ריק עד עכשיו' : 'יהיה ריק'}</p>
      ) : (
        <ol>
          {lines.map((line, at) =>
            'gap' in line ? (
              <li key={`gap-${at}`} className={`bt-gap${line.mark && line.mark !== 'same' ? ` bt-${line.mark}` : ''}`}>
                {gapWords(line)}
              </li>
            ) : (
              <li key={line.id} className={`bt-row bt-${line.mark}`}>
                <span className="bt-name">
                  <bdi>{line.path && line.mark !== 'new' && line.mark !== 'gone' ? <Link to={line.path}>{line.name}</Link> : line.name}</bdi>
                  {line.addition && <span className="faint sm"> · תוספת</span>}
                  {line.was && <span className="bt-was faint sm">{`היה: ${line.was}`}</span>}
                </span>
                {line.mark !== 'same' && <span className="bt-mark">{MARK_WORDS[line.mark]}</span>}
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}
