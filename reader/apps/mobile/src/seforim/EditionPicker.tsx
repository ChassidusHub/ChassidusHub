import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Check, ChevronDown, ExternalLink } from 'lucide-react-native';
import type { ReaderPalette } from '@chassidushub-reader/app-core';
import { useTranslation } from '../i18n/useTranslation';
import { AppText } from '../ui/Text';
import { row } from '../ui/rtl';

export interface EditionChoice {
  source: number;
  label: string;
}

export interface EditionLink {
  source: number;
  label: string;
  url: string;
}

interface Props {
  editions: EditionChoice[];
  current: number;
  /** Editions read on Sefaria's own site, not here. */
  links: EditionLink[];
  palette: ReaderPalette;
  onChoose: (source: number) => void;
  onOpenLink: (url: string) => void;
}

/**
 * The chapter's edition, one quiet line under its heading: the edition
 * being read, which opens a sheet of the others (and of the ones read on
 * Sefaria). Set in the reader's own paper, not the app's colours.
 */
export function EditionPicker({ editions, current, links, palette, onChoose, onOpenLink }: Props) {
  const { t, isRtl } = useTranslation();
  const [open, setOpen] = useState(false);
  const shown = editions.find((e) => e.source === current);
  if (editions.length < 2 && links.length === 0) return null;

  const choose = (source: number) => {
    setOpen(false);
    if (source !== current) onChoose(source);
  };
  const follow = (url: string) => {
    setOpen(false);
    onOpenLink(url);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t.readerEdition}: ${shown?.label ?? ''}`}
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={({ pressed }) => [styles.control, { borderColor: palette.rule, flexDirection: row(isRtl) }, pressed && { backgroundColor: palette.rule }]}
      >
        <AppText numberOfLines={1} style={[styles.value, { color: palette.text }]}>
          {shown?.label ?? t.readerEdition}
        </AppText>
        <ChevronDown size={15} color={palette.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel={t.readerClose}>
          <Pressable style={[styles.sheet, { backgroundColor: palette.background, borderColor: palette.rule }]} onPress={() => undefined}>
            <ScrollView style={styles.list}>
              <AppText style={[styles.title, { color: palette.muted, textAlign: isRtl ? 'right' : 'left' }]}>{t.readerEdition}</AppText>
              {editions.map((e) => {
                const selected = e.source === current;
                return (
                  <Pressable
                    key={e.source}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => choose(e.source)}
                    style={({ pressed }) => [styles.option, { flexDirection: row(isRtl) }, pressed && { backgroundColor: palette.rule }]}
                  >
                    <AppText style={[styles.optionLabel, { color: selected ? palette.accent : palette.text, fontWeight: selected ? '700' : '400' }]}>{e.label}</AppText>
                    {selected && <Check size={18} color={palette.accent} />}
                  </Pressable>
                );
              })}
              {links.length > 0 && (
                <View style={[styles.links, { borderTopColor: palette.rule }]}>
                  <AppText style={[styles.title, { color: palette.muted, textAlign: isRtl ? 'right' : 'left' }]}>{t.readerEditionLinks}</AppText>
                  {links.map((e) => (
                    <Pressable
                      key={e.source}
                      accessibilityRole="link"
                      onPress={() => follow(e.url)}
                      style={({ pressed }) => [styles.option, { flexDirection: row(isRtl) }, pressed && { backgroundColor: palette.rule }]}
                    >
                      <AppText style={[styles.optionLabel, { color: palette.text }]}>{e.label}</AppText>
                      <ExternalLink size={16} color={palette.muted} />
                    </Pressable>
                  ))}
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  control: { alignSelf: 'center', alignItems: 'center', gap: 6, marginTop: 14, paddingVertical: 6, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, maxWidth: '100%' },
  value: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '70%', borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingTop: 12, paddingBottom: 24 },
  list: { flexGrow: 0 },
  title: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.72, paddingHorizontal: 20, paddingBottom: 6 },
  option: { alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 14, paddingHorizontal: 20 },
  optionLabel: { fontSize: 16, flexShrink: 1 },
  links: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6, paddingTop: 12 },
});
