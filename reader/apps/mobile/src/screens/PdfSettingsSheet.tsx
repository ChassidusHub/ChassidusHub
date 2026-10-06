import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DEFAULT_PDF_LOOK, PDF_COLORS, PDF_PAGINGS } from '@chassidushub-reader/app-core';
import type { PdfColors, PdfLook } from '@chassidushub-reader/app-core';
import { useTranslation } from '../i18n/useTranslation';
import { setPdfLook } from '../settings/pdfLook';
import { BottomSheet } from '../ui/BottomSheet';
import { Segmented, SettingRow, Toggle } from '../ui/settings/SettingsControls';
import { AppText } from '../ui/Text';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';

/** Each colour choice drawn as a small page: its paper and its ink. */
const SWATCHES: Record<PdfColors, { paper: string; ink: string }> = {
  original: { paper: '#ffffff', ink: '#121212' },
  sepia: { paper: '#f3e6cc', ink: '#4a3a26' },
  gray: { paper: '#e6e6e6', ink: '#1f1f1f' },
  dark: { paper: '#121212', ink: '#ededed' },
};

interface Props {
  visible: boolean;
  look: PdfLook;
  /** The colours on screen now: dark, or the tint. */
  colors: PdfColors;
  /** Dark is the per-theme switch the header button always was; any other choice turns it off. */
  onColors: (colors: PdfColors) => void;
  onClose: () => void;
}

/**
 * The PDF reader's settings - the text reader's sheet, without the text's
 * own options: the colours of the pages, a stronger contrast, a page at a
 * time or one long scroll, and keeping the screen on. Each change shows
 * at once on the page above.
 */
export function PdfSettingsSheet({ visible, look, colors: current, onColors, onClose }: Props) {
  const colors = useColors();
  const { t, isRtl } = useTranslation();
  const align = { textAlign: isRtl ? 'right' : 'left' } as const;

  return (
    <BottomSheet visible={visible} title={t.pdfSettings} onClose={onClose}>
      <AppText style={[styles.eyebrow, align, { color: colors.muted }]}>{t.pdfColors}</AppText>
      <View style={[styles.swatches, { flexDirection: row(isRtl) }]}>
        {PDF_COLORS.map((choice) => {
          const on = choice === current;
          const swatch = SWATCHES[choice];
          return (
            <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={t.pdfColorNames[choice]} onPress={() => onColors(choice)} style={styles.swatchItem}>
              <View style={[styles.swatch, { backgroundColor: swatch.paper, borderColor: on ? colors.accent : colors.border, borderWidth: on ? 2 : 1 }]}>
                <Text style={[styles.swatchLetter, { color: swatch.ink, fontFamily: 'FrankRuehlCLM' }]}>א</Text>
              </View>
              <AppText numberOfLines={1} style={[styles.swatchName, { color: on ? colors.fg : colors.muted }]}>
                {t.pdfColorNames[choice]}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <AppText style={[styles.hint, align, { color: colors.muted }]}>{t.pdfDarkNote}</AppText>

      <View style={[styles.card, { backgroundColor: colors.cardBg }]}>
        <SettingRow label={t.pdfContrast} help={t.pdfContrastHelp} onPress={() => setPdfLook({ contrast: !look.contrast })} first>
          <Toggle checked={look.contrast} label={t.pdfContrast} decorative />
        </SettingRow>
      </View>

      <AppText style={[styles.eyebrow, align, { color: colors.muted }]}>{t.pdfDisplay}</AppText>
      <View style={[styles.card, { backgroundColor: colors.cardBg }]}>
        <SettingRow label={t.pdfPaging} stack first>
          <Segmented label={t.pdfPaging} value={look.paging} onChange={(paging) => setPdfLook({ paging })} options={PDF_PAGINGS.map((value) => ({ value, label: t.pdfPagings[value] }))} />
        </SettingRow>
        <SettingRow label={t.readerKeepAwake} onPress={() => setPdfLook({ keepAwake: !look.keepAwake })}>
          <Toggle checked={look.keepAwake} label={t.readerKeepAwake} decorative />
        </SettingRow>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setPdfLook(DEFAULT_PDF_LOOK);
          if (current !== 'dark') onColors('original');
        }}
        style={styles.reset}
      >
        <AppText style={[styles.resetText, { color: colors.accent }]}>{t.readerReset}</AppText>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginTop: 4, marginHorizontal: 4 },
  swatches: { justifyContent: 'space-between', paddingHorizontal: 4 },
  swatchItem: { alignItems: 'center', gap: 6, flex: 1 },
  /** A small page, taller than wide. */
  swatch: { width: 46, height: 58, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  swatchLetter: { fontSize: 22 },
  swatchName: { fontSize: 12, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 18, marginHorizontal: 4 },
  card: { borderRadius: 12, paddingHorizontal: 14 },
  reset: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  resetText: { fontSize: 15, fontWeight: '600' },
});
