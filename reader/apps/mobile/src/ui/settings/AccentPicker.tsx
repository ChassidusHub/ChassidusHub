import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { AccentPresetId } from '@chassidushub-reader/design';
import { ACCENT_PRESETS } from '@chassidushub-reader/design';
import { useTranslation } from '../../i18n/useTranslation';
import { useTheme } from '../theme';
import { row } from '../rtl';

/** The theme colors as a row of swatches, each drawn as it looks in the theme now showing (web: components/settings/AccentPicker.tsx). */
export function AccentPicker({ value, onChange, label }: { value: AccentPresetId; onChange: (next: AccentPresetId) => void; label: string }) {
  const { language, isRtl } = useTranslation();
  const { baseScheme, colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.row, { flexDirection: row(isRtl) }]}>
      {ACCENT_PRESETS.map((preset) => {
        const swatch = preset[baseScheme];
        const checked = preset.id === value;
        return (
          <Pressable
            key={preset.id}
            onPress={() => onChange(preset.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked }}
            accessibilityLabel={preset.name[language]}
            hitSlop={4}
            style={[styles.ring, checked && { borderColor: colors.fg }]}
          >
            <View style={[styles.swatch, { backgroundColor: swatch.accent }]}>{checked && <Check size={20} strokeWidth={3} color={swatch.accentFg} />}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Web: `.accent-picker` - a wrapping row, gap 10. */
  row: { flexWrap: 'wrap', gap: 6, paddingTop: 4, paddingBottom: 2 },
  /** The chosen swatch's ring in the text color, with a gap of the card between. */
  ring: { padding: 2, borderRadius: 26, borderWidth: 2, borderColor: 'transparent' },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
