import React from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTranslation } from '../../i18n/useTranslation';
import { AppText } from '../Text';
import { CategoryHeader, TabHelp } from '../Typography';
import { useColors } from '../theme';
import { row } from '../rtl';

/**
 * The settings pages' building blocks - one-to-one with the web's
 * components/settings/SettingsControls.tsx: a page is a stack of groups; a
 * group is an eyebrow title over one card of rows; a row is a label (with
 * optional help under it) and, on its trailing side, the control that
 * changes it - a real switch for on/off, a segmented choice for pick-one,
 * a value plus chevron when the row opens another screen. A tap anywhere
 * on a switch row flips it.
 */

export function SettingsGroup({ title, help, first = false, children }: { title?: string; help?: string; first?: boolean; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.group}>
      {title && <CategoryHeader first={first}>{title}</CategoryHeader>}
      <View style={[styles.card, { backgroundColor: colors.cardBg }]}>{children}</View>
      {help && <TabHelp style={styles.groupHelp}>{help}</TabHelp>}
    </View>
  );
}

interface SettingRowProps {
  /** Omitted when the group's title already says what the control is (a lone segmented choice in its own card). */
  label?: string;
  help?: string;
  /** The control on the trailing side (a Toggle, a value…). */
  children?: ReactNode;
  /** Renders the control under the label instead of beside it - a segmented choice needs the full width. */
  stack?: boolean;
  /** Makes the whole row a tap target (its own switch, or opening another screen). */
  onPress?: () => void;
  /** Web: a link row - the current value and a chevron on the trailing side. */
  chevron?: boolean;
  value?: string;
  danger?: boolean;
  /** The first row of a card has no divider above it. */
  first?: boolean;
}

export function SettingRow({ label, help, children, stack = false, onPress, chevron = false, value, danger = false, first = false }: SettingRowProps) {
  const colors = useColors();
  const { isRtl } = useTranslation();
  const Chevron = isRtl ? ChevronLeft : ChevronRight;
  // Web: INLINE_VALUE_MAX_CHARS - a long value goes under the label instead of beside it, so neither wraps into a column.
  const valueBelow = value != null && value.length > 18;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, stack ? styles.rowStack : { flexDirection: row(isRtl) }]}
    >
      {label && (
        <View style={styles.text}>
          <AppText style={[styles.label, { color: danger ? colors.danger : colors.fg }]}>{label}</AppText>
          {help && <AppText style={[styles.help, { color: colors.muted }]}>{help}</AppText>}
          {valueBelow && <AppText style={[styles.help, { color: colors.muted }]}>{value}</AppText>}
        </View>
      )}
      {(children || (value && !valueBelow) || chevron) && (
        <View style={[styles.control, stack ? styles.controlStack : { flexDirection: row(isRtl) }]}>
          {value && !valueBelow && <AppText style={[styles.value, { color: colors.muted }]}>{value}</AppText>}
          {children}
          {chevron && <Chevron size={18} color={colors.muted} />}
        </View>
      )}
    </Pressable>
  );
}

/** Web: `.toggle`. Inside a SettingRow with `onPress` the row is the tap target, so the switch is only the picture of the state. */
export function Toggle({ checked, onChange, label, decorative = false }: { checked: boolean; onChange?: (next: boolean) => void; label: string; decorative?: boolean }) {
  const colors = useColors();
  return (
    <Switch
      value={checked}
      onValueChange={decorative ? undefined : onChange}
      accessibilityLabel={label}
      pointerEvents={decorative ? 'none' : 'auto'}
      trackColor={{ false: colors.border, true: colors.accent }}
      thumbColor={colors.bgElevated}
      ios_backgroundColor={colors.border}
    />
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** Web: `.segmented` - a pick-one control, every option visible, the chosen one filled with the accent. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: SegmentedOption<T>[]; value: T; onChange: (next: T) => void; label: string }) {
  const colors = useColors();
  const { isRtl } = useTranslation();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segmented, { backgroundColor: colors.bg, borderColor: colors.border, flexDirection: row(isRtl) }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segmentedOption, selected && { backgroundColor: colors.accent }]}
          >
            <AppText numberOfLines={1} style={[styles.segmentedLabel, { color: selected ? colors.accentFg : colors.muted }]}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Web: `.chips` - a pick-many control as a wrapping row of chips (the year picker). */
export function Chips<T extends string | number>({ options, selected, onToggle, label }: { options: Array<{ value: T; label: string }>; selected: T[]; onToggle: (value: T) => void; label: string }) {
  const colors = useColors();
  const { isRtl } = useTranslation();
  return (
    <View accessibilityLabel={label} style={[styles.chips, { flexDirection: row(isRtl) }]}>
      {options.map((option) => {
        const on = selected.includes(option.value);
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onToggle(option.value)}
            style={[styles.chip, { backgroundColor: on ? colors.accent : colors.bg, borderColor: on ? colors.accent : colors.border }]}
          >
            <AppText style={[styles.chipLabel, { color: on ? colors.accentFg : colors.fg }]}>{option.label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: 4 },
  /** Web: `.settings-card` - radius 12, horizontal padding 14. */
  card: { borderRadius: 12, paddingHorizontal: 14 },
  /** Web: `.settings-group-help` - 8px above, 2px inset. */
  groupHelp: { marginTop: 8, marginBottom: 0, marginHorizontal: 2 },
  /** Web: `.setting-row` - min-height 54, vertical padding 12, gap 12. */
  row: { alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 54, paddingVertical: 12 },
  rowStack: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  text: { flexShrink: 1, flexGrow: 1, minWidth: 0, gap: 3 },
  label: { fontSize: 16, lineHeight: 21, fontWeight: '600' },
  help: { fontSize: 13, lineHeight: 18 },
  control: { alignItems: 'center', gap: 8, flexShrink: 0 },
  controlStack: { width: '100%' },
  value: { fontSize: 15, fontWeight: '500', flexShrink: 1 },
  /** Web: `.segmented` - pill track, 3px padding, 2px gap. */
  segmented: { width: '100%', borderRadius: 999, borderWidth: 1, padding: 3, gap: 2 },
  segmentedOption: { flex: 1, minWidth: 0, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 10, alignItems: 'center' },
  segmentedLabel: { fontSize: 14, fontWeight: '600' },
  chips: { flexWrap: 'wrap', gap: 8, paddingTop: 2, paddingBottom: 12 },
  chip: { borderRadius: 999, borderWidth: 1, paddingVertical: 7, paddingHorizontal: 12 },
  chipLabel: { fontSize: 14, fontWeight: '600' },
});
