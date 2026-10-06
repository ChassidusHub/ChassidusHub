import React, { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { CalendarRange, CircleUserRound, House, Library, Search } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from '../i18n/useTranslation';
import { resetTo, useStackNames } from '../navigation/navigationRef';
import type { TabId } from '../navigation/tabs';
import { TAB_IDS, TAB_ROOTS, showsTabs, tabForStack, tabStack } from '../navigation/tabs';
import { AppText } from '../ui/Text';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';

const ICONS: Record<TabId, LucideIcon> = {
  week: House,
  farbrengens: CalendarRange,
  library: Library,
  search: Search,
  mine: CircleUserRound,
};

/** Whether the on-screen keyboard is up - the tabs step aside for it rather than ride above it. */
function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

/**
 * The five tabs along the bottom (web: components/AppNav.tsx), the last of
 * the bottom bars so the player and the download strip stand above them.
 * A tab opens its first screen over This week's, so Back from anywhere
 * ends on This week; the tab already open goes back to its first screen.
 * A PDF and the reader take the whole screen, without the tabs.
 */
export function AppNav() {
  const { t, isRtl } = useTranslation();
  const colors = useColors();
  const names = useStackNames();
  const keyboard = useKeyboardShown();
  const top = names[names.length - 1];
  if (names.length === 0 || !showsTabs(top) || keyboard) return null;
  const current = tabForStack(names);

  function open(tab: TabId): void {
    if (tab === current && top === TAB_ROOTS[tab]) return;
    resetTo(tabStack(tab));
  }

  return (
    <View accessibilityRole="tablist" style={[styles.bar, { backgroundColor: colors.bgElevated, borderTopColor: colors.border, flexDirection: row(isRtl) }]}>
      {TAB_IDS.map((tab) => {
        const Icon = ICONS[tab];
        const active = tab === current;
        return (
          <Pressable key={tab} onPress={() => open(tab)} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={t.tabNames[tab]} style={styles.tab}>
            <View style={[styles.icon, active && { backgroundColor: colors.accentSoft }]}>
              <Icon size={22} strokeWidth={active ? 2.25 : 1.9} color={active ? colors.accent : colors.muted} />
            </View>
            <AppText numberOfLines={1} style={[styles.label, { color: active ? colors.fg : colors.muted }]}>
              {t.tabNames[tab]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Web: `.app-nav` - 64 high, the elevated surface, a hairline on top. */
  bar: { height: 64, borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 4 },
  /** Web: `.app-nav-icon` - a 56x30 pill, tinted when its tab is showing. */
  icon: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
});
