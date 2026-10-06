import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { AppText } from '../ui/Text';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';
import { Scrubber } from './Scrubber';

interface Props {
  /** The page on screen, 1-based. */
  page: number;
  count: number;
  /** Whether the chrome has stepped aside (a tap on the page). */
  hidden: boolean;
  /** Go straight to this page, 1-based. */
  onGo: (page: number) => void;
}

/**
 * The PDF's page slider (docs: the UI/UX redo plan, "Reader and PDF"; web:
 * PdfPageSlider): which page of how many is on screen, and a slider to go
 * straight to any other - the page it would open shows while the finger
 * is down, and it opens on release. In Hebrew it runs right to left, like
 * the pages of the sefer (Scrubber mirrors).
 */
export function PdfPageSlider({ page, count, hidden, onGo }: Props) {
  const { t, isRtl } = useTranslation();
  const colors = useColors();
  const [target, setTarget] = useState<number | null>(null);
  if (count < 2 || hidden) return null;

  const toPage = (percent: number) => Math.round((percent / 100) * (count - 1)) + 1;
  const shown = target ?? page;
  const percent = ((shown - 1) / (count - 1)) * 100;
  return (
    <View style={[styles.pill, { flexDirection: row(isRtl), backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
      <AppText style={[styles.label, { color: colors.muted }]}>{t.pdfPageOf(shown, count)}</AppText>
      <View style={styles.track}>
        <Scrubber
          percent={percent}
          onDrag={(p) => setTarget(p == null ? null : toPage(p))}
          onSeek={(p) => onGo(toPage(p))}
          accessibilityLabel={t.pdfGoToPage}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Web: `.pdf-slider` - a pill floating above the bottom of the page. */
  pill: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
  },
  label: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], flexShrink: 0 },
  track: { flex: 1, minWidth: 0 },
});
