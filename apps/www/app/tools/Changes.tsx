import { fieldOf, plainText, wordDiff, type Change, type Piece } from './common';

/** Words compared: what only the first has struck through, what only the second has marked, the rest as it is. */
export function Pieces({ pieces }: { pieces: Piece[] }) {
  return (
    <>
      {pieces.map((piece, at) =>
        piece.kind === 'same' ? (
          <span key={at}>{piece.text}</span>
        ) : (
          // The space after a word stays outside its mark, so a struck word never runs into the next one.
          <span key={at}>
            {piece.kind === 'del' ? <del>{piece.text.trimEnd()}</del> : <ins>{piece.text.trimEnd()}</ins>}
            {piece.text.slice(piece.text.trimEnd().length)}
          </span>
        ),
      )}
    </>
  );
}

/**
 * A version's changes, field by field: the field in a word, then its words
 * as they were and as they are, the words that changed marked. Side by side,
 * before and after; or in the text, the change marked inside it.
 */
export function Changes({ changes, side }: { changes: Change[]; side: boolean }) {
  if (!changes.length) return <p className="faint sm">אין מה להראות.</p>;
  return (
    <div className="it-changes">
      {changes.map((change) => {
        const pieces = wordDiff(plainText(change.before), plainText(change.after));
        return (
          <section key={change.path} className="it-change">
            <h3>{fieldOf(change.path)}</h3>
            {side ? (
              <div className="it-side">
                <div>
                  <span className="faint sm">לפני</span>
                  <p>{change.before === undefined ? <span className="faint">(לא היה)</span> : <Pieces pieces={pieces.filter((p) => p.kind !== 'ins')} />}</p>
                </div>
                <div>
                  <span className="faint sm">אחרי</span>
                  <p>{change.after === undefined ? <span className="faint">(נמחק)</span> : <Pieces pieces={pieces.filter((p) => p.kind !== 'del')} />}</p>
                </div>
              </div>
            ) : (
              <p>
                <Pieces pieces={pieces} />
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
