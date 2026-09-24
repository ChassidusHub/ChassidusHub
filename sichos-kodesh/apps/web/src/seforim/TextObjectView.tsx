import { useMemo, useState, type ReactNode } from 'react';
import { markLabel, stripNiqqud, type Footnote, type Inline, type ReaderSettings, type TextObject } from '@sichos-kodesh/app-core';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  text: TextObject;
  settings: ReaderSettings;
}

interface RunContext {
  settings: ReaderSettings;
  notes: Map<number, Footnote>;
  onNote: (note: Footnote) => void;
  /** Inside a note shown in the text: its own references stay numbers. */
  nested?: boolean;
}

function words(text: string, settings: ReaderSettings): string {
  return settings.niqqud ? text : stripNiqqud(text);
}

function Run({ inline, context }: { inline: Inline; context: RunContext }): ReactNode {
  const { settings, notes, onNote, nested } = context;
  if (inline.kind === 'break') return <br />;
  if (inline.kind === 'mark') return settings.marks ? <span className="reader-mark">{markLabel(inline.text)}</span> : null;
  if (inline.kind === 'note') {
    const note = notes.get(inline.note!);
    if (settings.notes === 'inline' && note && !nested) {
      return (
        <span className="reader-note-inline">
          {' ('}
          <Runs inlines={note.inlines} context={{ ...context, nested: true }} />
          {') '}
        </span>
      );
    }
    return (
      <button type="button" className="reader-note-ref" onClick={() => note && onNote(note)} aria-haspopup="dialog">
        {inline.text}
      </button>
    );
  }
  let node: ReactNode = words(inline.text, settings);
  if (inline.sup) node = <sup>{node}</sup>;
  if (inline.small) node = <small>{node}</small>;
  if (inline.italic) node = <i>{node}</i>;
  if (inline.bold) node = <b>{node}</b>;
  return node;
}

function Runs({ inlines, context }: { inlines: Inline[]; context: RunContext }) {
  return (
    <>
      {inlines.map((inline, i) => (
        <Run key={i} inline={inline} context={context} />
      ))}
    </>
  );
}

/**
 * A text object drawn as the reader's settings ask - the same rules as the
 * phone's TextObjectView: vowels and markers on or off, the notes at the
 * end (numbers that open them) or in the text. Size, font, spacing,
 * margins, paper and justification come from the reader's CSS variables.
 */
export function TextObjectView({ text, settings }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Footnote | null>(null);
  const notes = useMemo(() => new Map(text.notes.map((note) => [note.n, note])), [text.notes]);
  const context: RunContext = { settings, notes, onNote: setOpen };

  return (
    <div className="reader-text" dir={text.dir} lang={text.lang}>
      {text.blocks.map((block, i) =>
        block.kind === 'heading' ? (
          <h3 key={i} className={block.level === 2 ? 'reader-subheading reader-subheading-major' : 'reader-subheading'}>
            <Runs inlines={block.inlines} context={context} />
          </h3>
        ) : (
          <p key={i} className="reader-paragraph">
            <Runs inlines={block.inlines} context={context} />
          </p>
        ),
      )}

      {settings.notes === 'end' && text.notes.length > 0 && (
        <aside className="reader-notes">
          <h4 className="reader-notes-title">{t.readerNotes}</h4>
          {text.notes.map((note) => (
            <p key={note.n} className="reader-note" id={`note-${note.n}`}>
              <span className="reader-note-marker">{note.marker || note.n}</span> <Runs inlines={note.inlines} context={{ ...context, nested: true }} />
            </p>
          ))}
        </aside>
      )}

      {text.source && <p className="reader-source">{text.source}</p>}

      {open && (
        <div className="reader-note-backdrop" onClick={() => setOpen(null)} role="presentation">
          <div className="reader-note-sheet" role="dialog" aria-modal="true" aria-label={t.readerNotes} dir={text.dir} lang={text.lang} onClick={(event) => event.stopPropagation()}>
            <p>
              <span className="reader-note-marker">{open.marker || open.n}</span> <Runs inlines={open.inlines} context={{ ...context, nested: true }} />
            </p>
            <button type="button" className="button button-secondary" onClick={() => setOpen(null)}>
              {t.readerClose}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
