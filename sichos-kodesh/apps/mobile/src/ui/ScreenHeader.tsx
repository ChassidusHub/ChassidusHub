import React from 'react';
import type { ReactNode } from 'react';
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
  /** One small control on the trailing side (the PDF reader's colours button) - drawn over the spacer, so the title stays centred exactly as without it (web: `.screen-header-action`). */
  action?: ReactNode;
}

/**
 * The back button + page title every screen shows, in a bar at the top of
 * the screen that slides away while scrolling down and comes back on a
 * small scroll up (Screen). The back button and the title are centred on
 * the bar's middle line. The title is centered in the full bar, not just
 * in the space left over after the back button - the trailing spacer is an
 * invisible copy of the real BackLink so the title's flex box sits between
 * two equal edges. An `action` is positioned over that spacer rather than
 * beside it.
 */
/** Past this many characters a title is set a size smaller, and wraps onto a second line before it is cut short (web: the same). */
const LONG_TITLE = 26;

export function ScreenHeader({ back, title, inset = false, action }: Props) {
  const colors = useColors();
  const { isRtl } = useTranslation();

  return (
    <View style={[styles.header, { backgroundColor: colors.bg, flexDirection: row(isRtl) }, inset && styles.inset]}>
      <BackLink fallback={back} />
      <AppText numberOfLines={2} style={[styles.title, title.length > LONG_TITLE && styles.titleLong]}>
        {title}
      </AppText>
      <View style={styles.side}>
        <BackLink fallback={back} spacer />
        {action && <View style={[styles.action, isRtl ? styles.actionRtl : styles.actionLtr]}>{action}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Web: `.screen-header` - gap 12, padding-block 12, padding-inline 20. */
  header: {
    alignItems: 'center',
    gap: 12,
    minHeight: 47,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  inset: { marginBottom: 16 },
  /** Web: `.screen-header-title` - flex 1, centered, 18px/700, up to two lines. */
  title: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 18, lineHeight: 23, fontWeight: '700' },
  /** Web: `.screen-header-title-long` - a long title a size smaller. */
  titleLong: { fontSize: 16, lineHeight: 21 },
  /** Web: `.screen-header-side` - the spacer's box, with the action absolutely positioned at its outer edge. */
  side: { position: 'relative', flexShrink: 0, justifyContent: 'center' },
  action: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
  actionLtr: { right: 0 },
  actionRtl: { left: 0 },
});
