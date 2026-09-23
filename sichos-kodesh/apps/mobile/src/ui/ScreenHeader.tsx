import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { BackLink } from './BackLink';
import type { BackTarget } from './BackLink';
import { AppText } from './Text';
import { useColors } from './theme';
import { row } from './rtl';

interface Props {
  back: BackTarget;
  title: string;
  /** For a screen whose own container has no horizontal padding (the PDF viewer) - see the web's `.screen-header-inset`. */
  inset?: boolean;
}

/**
 * The back button + page title every screen shows, pinned below the
 * status bar once scrolled past (Screen renders it as a sticky header).
 * The title is centered in the full bar, not just in the space left over
 * after the back button - the trailing spacer is an invisible copy of the
 * real BackLink so the title's flex box sits between two equal edges.
 */
export function ScreenHeader({ back, title, inset = false }: Props) {
  const colors = useColors();
  const { isRtl } = useTranslation();

  return (
    <View style={[styles.header, { backgroundColor: colors.bg, flexDirection: row(isRtl) }, inset && styles.inset]}>
      <BackLink fallback={back} />
      <AppText numberOfLines={1} style={styles.title}>
        {title}
      </AppText>
      <BackLink fallback={back} spacer />
    </View>
  );
}

const styles = StyleSheet.create({
  /** Web: `.screen-header` - gap 12, padding-block 12, padding-inline 20, margin 0 -20px 4px. */
  header: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginHorizontal: -20,
    marginBottom: 4,
  },
  inset: { marginHorizontal: 0, marginBottom: 16 },
  /** Web: `.screen-header-title` - flex 1, centered, 18px/700, ellipsis. */
  title: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 18, fontWeight: '700' },
});
