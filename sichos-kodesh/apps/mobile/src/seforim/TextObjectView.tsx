import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TextStyle } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { AppText } from '../ui/Text';
import { useColors } from '../ui/theme';
import type { Footnote, Inline, TextObject } from './textObject';

/** The reader's base text size, before the reader's own scale (a sefer reads larger than the app's lists). */
const BASE_SIZE = 19;

interface Props {
  text: TextObject;
  fontScale: number;
}

function InlineRun({ inline, size, onNote }: { inline: Inline; size: number; onNote: (n: number) => void }) {
  const colors = useColors();
  if (inline.kind === 'break') return <Text>{'\n'}</Text>;
  if (inline.kind === 'mark') {
    return <Text style={{ color: colors.muted, fontSize: Math.round(size * 0.68) }}>{` ${inline.text} `}</Text>;
  }
  if (inline.kind === 'note') {
    return (
      <Text onPress={() => onNote(inline.note!)} accessibilityRole="button" style={[styles.strong, { color: colors.accent, fontSize: Math.round(size * 0.68) }]}>
        {` ${inline.text} `}
      </Text>
    );
  }
  const style: TextStyle = {
    ...(inline.bold ? { fontWeight: '700' as const } : {}),
    ...(inline.italic ? { fontStyle: 'italic' as const } : {}),
    ...(inline.small ? { fontSize: Math.round(size * 0.85) } : {}),
    ...(inline.sup ? { fontSize: Math.round(size * 0.68) } : {}),
  };
  return <Text style={style}>{inline.text}</Text>;
}

function Runs({ inlines, size, onNote }: { inlines: Inline[]; size: number; onNote: (n: number) => void }) {
  return (
    <>
      {inlines.map((inline, i) => (
        <InlineRun key={i} inline={inline} size={size} onNote={onNote} />
      ))}
    </>
  );
}

/**
 * A text object drawn with React Native's own <Text>: headings and
 * paragraphs in the edition's direction, page and study markers muted,
 * footnote numbers that open their note, and the notes and the credit
 * line at the end.
 */
export function TextObjectView({ text, fontScale }: Props) {
  const colors = useColors();
  const { t } = useTranslation();
  const [open, setOpen] = useState<Footnote | null>(null);
  const size = Math.round(BASE_SIZE * fontScale);
  const rtl = text.dir === 'rtl';
  const direction: TextStyle = { writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' };
  const notes = useMemo(() => new Map(text.notes.map((note) => [note.n, note])), [text.notes]);
  const onNote = (n: number) => setOpen(notes.get(n) ?? null);

  return (
    <View>
      {text.blocks.map((block, i) =>
        block.kind === 'heading' ? (
          <Text key={i} style={[styles.heading, direction, { color: colors.fg, fontSize: Math.round(size * 1.1) }]}>
            <Runs inlines={block.inlines} size={size} onNote={onNote} />
          </Text>
        ) : (
          <Text key={i} selectable style={[styles.paragraph, direction, { color: colors.fg, fontSize: size, lineHeight: Math.round(size * 1.65) }]}>
            <Runs inlines={block.inlines} size={size} onNote={onNote} />
          </Text>
        ),
      )}

      {text.notes.length > 0 && (
        <View style={[styles.notes, { borderTopColor: colors.border }]}>
          <AppText style={[styles.notesTitle, { color: colors.muted }]}>{t.readerNotes}</AppText>
          {text.notes.map((note) => (
            <Text key={note.n} selectable style={[styles.note, direction, { color: colors.fg, fontSize: Math.round(size * 0.82), lineHeight: Math.round(size * 1.3) }]}>
              <Text style={[styles.strong, { color: colors.accent }]}>{`${note.marker || note.n} `}</Text>
              <Runs inlines={note.inlines} size={Math.round(size * 0.82)} onNote={onNote} />
            </Text>
          ))}
        </View>
      )}

      {text.source && <AppText style={[styles.source, { color: colors.muted }]}>{text.source}</AppText>}

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(null)} accessibilityLabel={t.readerClose}>
          <View style={[styles.sheet, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
            {open && (
              <Text selectable style={[direction, { color: colors.fg, fontSize: Math.round(size * 0.9), lineHeight: Math.round(size * 1.4) }]}>
                <Text style={[styles.strong, { color: colors.accent }]}>{`${open.marker || open.n} `}</Text>
                <Runs inlines={open.inlines} size={Math.round(size * 0.9)} onNote={onNote} />
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
  heading: { fontWeight: '700', marginTop: 14, marginBottom: 8 },
  paragraph: { marginBottom: 12 },
  notes: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 16, paddingTop: 12 },
  notesTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, marginBottom: 8 },
  note: { marginBottom: 8 },
  source: { fontSize: 12, marginTop: 18, marginBottom: 8, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', padding: 16 },
  sheet: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 18, marginBottom: 24, maxHeight: '70%' },
});
