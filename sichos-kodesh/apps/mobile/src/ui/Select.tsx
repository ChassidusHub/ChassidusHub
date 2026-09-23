import React, { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { useTranslation } from '../i18n/useTranslation';
import { AppText } from './Text';
import { useColors } from './theme';
import { row } from './rtl';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

interface Props<T extends string | number> {
  /** Web: `.search-filter-label` - the uppercase eyebrow above the control. */
  label: string;
  value: T | null;
  /** The "Any" option's label - selecting it clears the value. */
  anyLabel: string;
  options: Array<SelectOption<T>>;
  onChange: (next: T | null) => void;
}

/**
 * A native-feeling stand-in for the web's `<select>` inside
 * `.search-filter`: the same bordered, card-colored control, opening a
 * full-screen option sheet instead of the browser's own dropdown.
 */
export function Select<T extends string | number>({ label, value, anyLabel, options, onChange }: Props<T>) {
  const colors = useColors();
  const { isRtl } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  function choose(next: T | null): void {
    onChange(next);
    setOpen(false);
  }

  return (
    <View style={styles.filter}>
      <AppText style={[styles.label, { color: colors.muted }]}>{label}</AppText>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.control, { borderColor: colors.border, backgroundColor: colors.cardBg, flexDirection: row(isRtl) }]}
      >
        <AppText numberOfLines={1} style={[styles.value, { color: colors.fg }]}>
          {selected?.label ?? anyLabel}
        </AppText>
        <ChevronDown size={16} color={colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.bgElevated }]} onPress={() => undefined}>
            <AppText style={[styles.sheetTitle, { color: colors.muted }]}>{label}</AppText>
            <FlatList
              data={[{ value: null as T | null, label: anyLabel }, ...options]}
              keyExtractor={(option) => String(option.value)}
              style={styles.list}
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <Pressable
                    onPress={() => choose(item.value)}
                    style={({ pressed }) => [styles.option, { flexDirection: row(isRtl) }, pressed && { backgroundColor: colors.cardHover }]}
                  >
                    <AppText style={[styles.optionLabel, { color: isSelected ? colors.accent : colors.fg }]}>{item.label}</AppText>
                    {isSelected && <Check size={18} color={colors.accent} />}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Web: `.search-filter` - flex 1 1 120px, gap 4. */
  filter: { flexGrow: 1, flexBasis: 120, gap: 4, minWidth: 120 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.72 },
  /** Web: `.search-filter select` - padding 9px 10px, 1px border, radius 8, 15px. */
  control: { alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingVertical: 9, paddingHorizontal: 10, borderWidth: 1, borderRadius: 8 },
  value: { flex: 1, fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '70%', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 12, paddingBottom: 24 },
  sheetTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.72, paddingHorizontal: 20, paddingBottom: 8 },
  list: { flexGrow: 0 },
  option: { alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 20 },
  optionLabel: { fontSize: 16, flexShrink: 1 },
});
