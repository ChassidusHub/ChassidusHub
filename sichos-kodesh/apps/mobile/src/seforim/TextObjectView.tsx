import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TextStyle } from 'react-native';
import { markLabel, noteLabel, notesAfterText, readerFont, readerLineHeight, readerTextSize, referencedNotes, stripNiqqud, type Footnote, type Inline, type ReaderPalette, type ReaderSettings, type TextObject } from '@sichos-kodesh/app-core';
import { useTranslation } from '../i18n/useTranslation';
import { AppText } from '../ui/Text';

interface Props {
  text: TextObject;
  settings: ReaderSettings;
  palette: ReaderPalette;
  /** A long press on a paragraph: its words, to share with their source. */
  onShare?: (paragraph: string) => void;
}

interface RunContext {
  size: number;
  settings: ReaderSettings;
  palette: ReaderPalette;
  notes: Map<number, Footnote>;
  onNote: (n: number) => void;
  /** Inside a note shown in the text: its own references stay numbers. */
  nested?: boolean;
}

/** RIGHT-TO-LEFT MARK: opens a Hebrew paragraph so its first letters cannot turn it left to right. */
const RLM = '\u200F';

function words(text: string, settings: ReaderSettings): string {
  return settings.niqqud ? text : stripNiqqud(text);
}

/** The paragraph's own words, for sharing: no markers, notes or numbers. */
function plainText(inlines: Inline[], settings: ReaderSettings): string {
  return words(
    inlines
      .filter((i) => i.kind === 'text' || i.kind === 'break')
      .map((i) => i.text)
      .join('')
      .replace(/[ \t]+/g, ' ')
      .trim(),
    settings,
  );
}

function InlineRun({ inline, context }: { inline: Inline; context: RunContext }) {
  const { size, settings, palette, notes, onNote, nested } = context;
  const small = Math.round(size * 0.68);
  if (inline.kind === 'break') return <Text>{'\n'}</Text>;
  if (inline.kind === 'mark') {
    if (!settings.marks) return null;
    return <Text style={{ color: palette.muted, fontSize: small }}>{`\u2009${markLabel(inline.text)}\u2009`}</Text>;
  }
  if (inline.kind === 'note') {
    const note = notes.get(inline.note!);
    if (settings.notes === 'inline' && note && !nested) {
      // The note where it is marked: smaller and quieter than the text around it.
      return (
        <Text style={{ color: palette.muted, fontSize: Math.round(size * 0.8) }}>
          {' ('}
          <Runs inlines={note.inlines} context={{ ...context, size: Math.round(size * 0.8), nested: true }} />
          {') '}
        </Text>
      );
    }
    return (
      <Text onPress={() => onNote(inline.note!)} accessibilityRole="button" suppressHighlighting style={[styles.strong, { color: palette.accent, fontSize: small }]}>
        {`\u2009${inline.text}\u2009`}
      </Text>
    );
  }
  const style: TextStyle = {
    ...(inline.bold ? { fontWeight: '700' as const } : {}),
    ...(inline.italic ? { fontStyle: 'italic' as const } : {}),
    ...(inline.small ? { fontSize: Math.round(size * 0.85) } : {}),
    ...(inline.sup ? { fontSize: small } : {}),
  };
  return <Text style={style}>{words(inline.text, settings)}</Text>;
}

function Runs({ inlines, context }: { inlines: Inline[]; context: RunContext }) {
  return (
    <>
      {inlines.map((inline, i) => (
        <InlineRun key={i} inline={inline} context={context} />
      ))}
    </>
  );
}

/**
 * A text object drawn with React Native's own <Text>, set the way the
 * reader's settings ask: its font, size, spacing and paper; justified or
 * not; with or without vowels and markers; its notes at the end (numbers
 * that open them) or in the text. Headings are centred, as a sefer sets
 * them, and a line marked for the end side (a letter's date and signature)
 * sits there. Notes nothing in the text points to (the Igros' notes on a
 * letter) follow the text unnumbered, wherever the notes go. The credit
 * line closes the unit.
 */
export function TextObjectView({ text, settings, palette, onShare }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Footnote | null>(null);
  const [pressed, setPressed] = useState<number | null>(null);
  const size = readerTextSize(settings);
  const lineHeight = readerLineHeight(settings);
  const fontFamily = readerFont(settings.font).family ?? undefined;
  const rtl = text.dir === 'rtl';
  // The app lays itself out left to right (rtl.ts), so a Hebrew text is set right to left here, on
  // the text itself: Android takes a paragraph's direction from its layout direction, not from
  // writingDirection (iOS only). Set so, the start side (the default alignment) is the right, a
  // justified paragraph's last line ends there too, and 'right' is the end side - the left.
  const direction = rtl ? 'rtl' : 'ltr';
  const start = rtl ? 'auto' : 'left';
  const end = 'right';
  // A paragraph that opens with a Latin letter or a number would otherwise be ordered left to right.
  const mark = rtl ? RLM : '';
  const notes = useMemo(() => new Map(text.notes.map((note) => [note.n, note])), [text.notes]);
  const referenced = useMemo(() => referencedNotes(text), [text]);
  const after = notesAfterText(text, settings.notes);
  const label = (note: Footnote) => noteLabel(note, referenced);
  const context: RunContext = { size, settings, palette, notes, onNote: (n) => setOpen(notes.get(n) ?? null) };
  const body: TextStyle = { fontFamily, direction, writingDirection: direction, color: palette.text };
  const noteSize = Math.round(size * 0.82);

  const share = (index: number, inlines: Inline[]) => {
    if (!onShare) return;
    setPressed(index);
    onShare(plainText(inlines, settings));
    setTimeout(() => setPressed((current) => (current === index ? null : current)), 600);
  };

  return (
    <View>
      {text.blocks.map((block, i) =>
        block.kind === 'heading' ? (
          <Text key={i} style={[body, styles.heading, { fontSize: Math.round(size * (block.level === 2 ? 1.12 : 1.02)), lineHeight: Math.round(lineHeight * 1.05) }]}>
            {mark}
            <Runs inlines={block.inlines} context={context} />
          </Text>
        ) : (
          <Text
            key={i}
            onLongPress={onShare ? () => share(i, block.inlines) : undefined}
            suppressHighlighting
            style={[
              body,
              {
                fontSize: size,
                lineHeight,
                textAlign: block.align === 'end' ? end : settings.justify ? 'justify' : start,
                marginBottom: Math.round(size * 0.7),
              },
              pressed === i ? { backgroundColor: palette.rule } : null,
            ]}
          >
            {mark}
            <Runs inlines={block.inlines} context={context} />
          </Text>
        ),
      )}

      {after.length > 0 && (
        <View style={[styles.notes, { borderTopColor: palette.rule }]}>
          <AppText style={[styles.notesTitle, { color: palette.muted, textAlign: rtl ? 'right' : 'left' }]}>{t.readerNotes}</AppText>
          {after.map((note) => (
            <Text key={note.n} selectable style={[body, styles.note, { fontSize: noteSize, lineHeight: Math.round(noteSize * 1.5), textAlign: start }]}>
              {mark}
              {label(note) ? <Text style={[styles.strong, { color: palette.accent }]}>{`${label(note)} `}</Text> : null}
              <Runs inlines={note.inlines} context={{ ...context, size: noteSize, nested: true }} />
            </Text>
          ))}
        </View>
      )}

      {text.source && <AppText style={[styles.source, { color: palette.muted }]}>{text.source}</AppText>}

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(null)} accessibilityLabel={t.readerClose}>
          <View style={[styles.sheet, { backgroundColor: palette.background, borderColor: palette.rule }]}>
            {open && (
              <Text selectable style={[body, { fontSize: Math.round(size * 0.9), lineHeight: Math.round(size * 1.45), textAlign: start }]}>
                {mark}
                {label(open) ? <Text style={[styles.strong, { color: palette.accent }]}>{`${label(open)} `}</Text> : null}
                <Runs inlines={open.inlines} context={{ ...context, size: Math.round(size * 0.9), nested: true }} />
              </Text>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  strong: { fontWeight: '700' },
  heading: { fontWeight: '700', textAlign: 'center', marginTop: 18, marginBottom: 12 },
  notes: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 20, paddingTop: 14 },
  notesTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, marginBottom: 10 },
  note: { marginBottom: 10 },
  source: { fontSize: 12, marginTop: 22, marginBottom: 8, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', padding: 16 },
  sheet: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 20, marginBottom: 24, maxHeight: '70%' },
});
