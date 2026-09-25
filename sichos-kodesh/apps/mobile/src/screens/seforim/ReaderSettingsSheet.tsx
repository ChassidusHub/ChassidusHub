import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AArrowDown, AArrowUp } from 'lucide-react-native';
import { DEFAULT_READER_SETTINGS, FONT_SCALE_MAX, FONT_SCALE_MIN, READER_FONTS, READER_MARGINS, READER_SPACINGS, READER_THEME_IDS, clampScale, type ReaderSettings } from '@sichos-kodesh/app-core';
import { useTranslation } from '../../i18n/useTranslation';
import { readerPalette } from '../../seforim/readerPalette';
import { setReaderSettings } from '../../seforim/readingState';
import { Segmented, SettingRow, Toggle } from '../../ui/settings/SettingsControls';
import { BottomSheet } from '../../ui/BottomSheet';
import { AppText } from '../../ui/Text';
import { useColors, lightColors } from '../../ui/theme';
import { row } from '../../ui/rtl';

/** How each font shows itself in the picker: a word with its vowels, so the pointing can be judged too. */
const SAMPLE = 'בְּרֵאשִׁית';

interface Props {
  visible: boolean;
  settings: ReaderSettings;
  onClose: () => void;
}

/**
 * The reader's settings, over the lower part of the page so each change
 * shows at once on the text above: size, font, paper, spacing, margins,
 * where the notes go, and the switches (vowels, justified, markers, going
 * on into the next chapter, keeping the screen on).
 */
export function ReaderSettingsSheet({ visible, settings, onClose }: Props) {
  const colors = useColors();
  const { t, language, isRtl } = useTranslation();
  const set = (change: Partial<ReaderSettings>) => setReaderSettings(change);
  const percent = `${Math.round(settings.scale * 100)}%`;
  const smaller = clampScale(settings.scale - 0.1);
  const larger = clampScale(settings.scale + 0.1);
  const flip = { flexDirection: row(isRtl) } as const;
  const align = { textAlign: isRtl ? 'right' : 'left' } as const;

  return (
    <BottomSheet visible={visible} title={t.readerSettings} onClose={onClose}>
      <View style={[styles.sizeRow, flip, { backgroundColor: colors.cardBg }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.readerTextSmaller} disabled={settings.scale <= FONT_SCALE_MIN} onPress={() => set({ scale: smaller })} style={styles.sizeButton}>
          <AArrowDown size={24} color={settings.scale <= FONT_SCALE_MIN ? colors.border : colors.fg} />
        </Pressable>
        <View style={styles.sizeValue}>
          <AppText style={[styles.sizeLabel, { color: colors.muted }]}>{t.readerSize}</AppText>
          <AppText style={styles.sizePercent}>{percent}</AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t.readerTextLarger} disabled={settings.scale >= FONT_SCALE_MAX} onPress={() => set({ scale: larger })} style={styles.sizeButton}>
          <AArrowUp size={24} color={settings.scale >= FONT_SCALE_MAX ? colors.border : colors.fg} />
        </Pressable>
      </View>

      <AppText style={[styles.eyebrow, align, { color: colors.muted }]}>{t.readerFont}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.fonts, flip]}>
        {READER_FONTS.map((font) => {
          const on = font.id === settings.font;
          return (
            <Pressable
              key={font.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={font.name[language]}
              onPress={() => set({ font: font.id, fontChosen: true })}
              style={[styles.fontCard, { backgroundColor: colors.cardBg, borderColor: on ? colors.accent : 'transparent' }]}
            >
              <Text numberOfLines={1} style={[styles.fontSample, { color: colors.fg, fontFamily: font.family ?? undefined }]}>
                {SAMPLE}
              </Text>
              <AppText numberOfLines={1} style={[styles.fontName, { color: on ? colors.accent : colors.muted }]}>
                {font.name[language]}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <AppText style={[styles.eyebrow, align, { color: colors.muted }]}>{t.readerTheme}</AppText>
      <View style={[styles.themes, flip]}>
        {READER_THEME_IDS.map((theme) => {
          const on = theme === settings.theme;
          // "Like the app" shows the app's light page: the swatch is a picture, not the current scheme.
          const swatch = theme === 'app' ? readerPalette('app', lightColors) : readerPalette(theme, colors);
          return (
            <Pressable key={theme} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={t.readerThemes[theme]} onPress={() => set({ theme })} style={styles.theme}>
              <View style={[styles.swatch, { backgroundColor: swatch.background, borderColor: on ? colors.accent : colors.border, borderWidth: on ? 2 : 1 }]}>
                {theme === 'app' && <View style={[styles.swatchHalf, { backgroundColor: '#0a0a0a' }, isRtl ? styles.swatchHalfLeft : styles.swatchHalfRight]} />}
                <Text style={[styles.swatchLetter, { color: theme === 'app' ? lightColors.accent : swatch.text, fontFamily: 'FrankRuehlCLM' }]}>א</Text>
              </View>
              <AppText numberOfLines={1} style={[styles.themeName, { color: on ? colors.fg : colors.muted }]}>
                {t.readerThemes[theme]}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.card, { backgroundColor: colors.cardBg }]}>
        <SettingRow label={t.readerSpacing} stack first>
          <Segmented label={t.readerSpacing} value={settings.spacing} onChange={(spacing) => set({ spacing })} options={READER_SPACINGS.map((value) => ({ value, label: t.readerSpacings[value] }))} />
        </SettingRow>
        <SettingRow label={t.readerMargins} stack>
          <Segmented label={t.readerMargins} value={settings.margins} onChange={(margins) => set({ margins })} options={READER_MARGINS.map((value) => ({ value, label: t.readerMarginSizes[value] }))} />
        </SettingRow>
        <SettingRow label={t.readerNotesPlace} stack>
          <Segmented label={t.readerNotesPlace} value={settings.notes} onChange={(notes) => set({ notes })} options={(['end', 'inline'] as const).map((value) => ({ value, label: t.readerNotesPlaces[value] }))} />
        </SettingRow>
      </View>

      <View style={[styles.card, { backgroundColor: colors.cardBg }]}>
        <SettingRow label={t.readerNiqqud} onPress={() => set({ niqqud: !settings.niqqud })} first>
          <Toggle checked={settings.niqqud} label={t.readerNiqqud} decorative />
        </SettingRow>
        <SettingRow label={t.readerJustify} onPress={() => set({ justify: !settings.justify })}>
          <Toggle checked={settings.justify} label={t.readerJustify} decorative />
        </SettingRow>
        <SettingRow label={t.readerMarks} onPress={() => set({ marks: !settings.marks })}>
          <Toggle checked={settings.marks} label={t.readerMarks} decorative />
        </SettingRow>
        <SettingRow label={t.readerContinuous} onPress={() => set({ continuous: !settings.continuous })}>
          <Toggle checked={settings.continuous} label={t.readerContinuous} decorative />
        </SettingRow>
        <SettingRow label={t.readerKeepAwake} onPress={() => set({ keepAwake: !settings.keepAwake })}>
          <Toggle checked={settings.keepAwake} label={t.readerKeepAwake} decorative />
        </SettingRow>
      </View>

      <AppText style={[styles.hint, align, { color: colors.muted }]}>{t.readerShareHint}</AppText>
      <Pressable accessibilityRole="button" onPress={() => setReaderSettings(DEFAULT_READER_SETTINGS)} style={styles.reset}>
        <AppText style={[styles.resetText, { color: colors.accent }]}>{t.readerReset}</AppText>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sizeRow: { alignItems: 'center', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 6 },
  sizeButton: { padding: 12 },
  sizeValue: { flex: 1, alignItems: 'center' },
  sizeLabel: { fontSize: 12, fontWeight: '600' },
  sizePercent: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginTop: 4, marginHorizontal: 4 },
  fonts: { gap: 10, paddingHorizontal: 2, alignItems: 'flex-start' },
  /** At least 108 wide, and as wide as its sample: a wide font, or a large system font size, never breaks the word (the ת used to fall to a second line). */
  fontCard: { minWidth: 108, borderRadius: 14, borderWidth: 2, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', gap: 6 },
  fontSample: { fontSize: 26, lineHeight: 40 },
  fontName: { fontSize: 12, fontWeight: '600' },
  themes: { justifyContent: 'space-between', paddingHorizontal: 4 },
  theme: { alignItems: 'center', gap: 6, flex: 1 },
  swatch: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  swatchHalf: { position: 'absolute', top: 0, bottom: 0, width: '50%' },
  swatchHalfRight: { right: 0 },
  swatchHalfLeft: { left: 0 },
  swatchLetter: { fontSize: 22 },
  themeName: { fontSize: 12, fontWeight: '600' },
  card: { borderRadius: 12, paddingHorizontal: 14 },
  hint: { fontSize: 13, lineHeight: 18, marginHorizontal: 4, marginTop: 4 },
  reset: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  resetText: { fontSize: 15, fontWeight: '600' },
});
