import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Contrast } from 'lucide-react-native';
import Pdf from 'react-native-pdf';
import { useCatalog } from '../catalog/catalogStore';
import { downloadPdf, localPdfPathIfExists, pdfUrl } from '../download/download';
import { useTranslation } from '../i18n/useTranslation';
import type { PdfViewerScreenProps } from '../navigation/types';
import { getOnlineSnapshot, looksLikeNetworkError, reportFetchFailure, reportFetchSuccess } from '../network/connectivity';
import { getOccasionProgress, getPdfPage, readProgressMap, recordPdfProgress } from '../player/progressStore';
import { useInvertPdfInDarkMode, useInvertPdfInLightMode } from '../settings/invertPdfInDarkMode';
import { Button } from '../ui/Button';
import { OfflineNote } from '../ui/OfflineNote';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Spinner } from '../ui/Spinner';
import { AppText } from '../ui/Text';
import { GapMessage } from '../ui/Typography';
import { darkColors, lightColors, useTheme } from '../ui/theme';
import { row } from '../ui/rtl';

type LoadState = { status: 'loading'; percent: number | null; path: string | null } | { status: 'ready'; path: string } | { status: 'error'; message: string; offline: boolean };

/**
 * Renders a PDF in-app (react-native-pdf: native pinch-zoom and panning).
 * The file is fetched to the app's own documents directory first - the
 * same path the download system uses, so reading a PDF once also keeps it
 * available offline, the way the web's cache-first service worker does.
 * The page reached is recorded into the progress store (see
 * recordPdfProgress) so the home page's Continue row reopens it there.
 */
export function PdfViewerScreen({ navigation, route }: PdfViewerScreenProps) {
  const catalog = useCatalog();
  const { driveFileId, resourceKey, label, hebrewYear, occasionId } = route.params;
  const { t, isRtl } = useTranslation();
  const { colors, scheme } = useTheme();
  const [invertInDarkMode, setInvertInDarkMode] = useInvertPdfInDarkMode();
  const [invertInLightMode, setInvertInLightMode] = useInvertPdfInLightMode();
  const [state, setState] = useState<LoadState>({ status: 'loading', percent: null, path: null });
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPageRef = useRef<{ page: number; total: number | null } | null>(null);

  const entry = useMemo(() => catalog[hebrewYear]?.find((item) => item.occasionId === occasionId) ?? null, [catalog, hebrewYear, occasionId]);
  const pdf = useMemo(() => entry?.pdfs.find((item) => item.driveFileId === driveFileId) ?? null, [driveFileId, entry]);
  const savedPage = useMemo(() => (entry ? getPdfPage(getOccasionProgress(readProgressMap(), entry.hebrewYear, entry.occasionId), driveFileId) : undefined), [driveFileId, entry]);
  // The web's `.pdf-inverted .pdf-page canvas { filter: invert(1) hue-rotate(180deg) }`,
  // applied to the native viewer through React Native's own `filter` style.
  // The colours button in the header flips it for the theme on screen right
  // now, remembered per theme (see settings/invertPdfInDarkMode.ts) - so
  // night reading stays inverted while a daytime flip doesn't change the
  // night default.
  const inverted = scheme === 'dark' ? invertInDarkMode : invertInLightMode;
  const setInverted = scheme === 'dark' ? setInvertInDarkMode : setInvertInLightMode;
  const backTarget = { name: 'Farbrengen', params: { kind: 'browse', hebrewYear, occasionId } } as const;
  const colourToggle = (
    <Pressable onPress={() => setInverted(!inverted)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.pdfInvertToggle} accessibilityState={{ selected: inverted }} style={({ pressed }) => [styles.headerAction, pressed && { backgroundColor: colors.cardBg }]}>
      <Contrast size={20} color={inverted ? colors.accent : colors.muted} />
    </Pressable>
  );

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    setState({ status: 'loading', percent: null, path: null });
    (async () => {
      try {
        const local = await localPdfPathIfExists(driveFileId);
        if (local) {
          if (!cancelled) setState({ status: 'loading', percent: null, path: local });
          return;
        }
        const path = await downloadPdf(driveFileId, resourceKey ?? undefined, ({ received, total }) => {
          if (!cancelled) setState({ status: 'loading', percent: total > 0 ? Math.min(100, Math.max(0, Math.round((received / total) * 100))) : null, path: null });
        });
        reportFetchSuccess();
        if (!cancelled) setState({ status: 'loading', percent: null, path });
      } catch (error) {
        if (looksLikeNetworkError(error)) reportFetchFailure();
        if (!cancelled) setState({ status: 'error', message: String(error), offline: !getOnlineSnapshot() });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [driveFileId, pdf, resourceKey]);

  function record(page: number, total: number | null): void {
    if (!entry) return;
    recordPdfProgress(entry.hebrewYear, entry.occasionId, entry.occasionLabel, driveFileId, page, total);
  }

  function schedulePersist(page: number, total: number | null): void {
    lastPageRef.current = { page, total };
    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(() => {
      persistTimeoutRef.current = null;
      record(page, total);
    }, 750);
  }

  // Flush the latest page on the way out, same as the web's `pagehide` flush.
  useEffect(
    () => () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
      const last = lastPageRef.current;
      if (last) record(last.page, last.total);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only flush
    [],
  );

  if (!pdf || !entry) {
    return (
      <Screen scroll={false} header={<ScreenHeader back={backTarget} title={label} inset />}>
        <View style={styles.status}>
          <GapMessage>{t.pdfNotFound}</GapMessage>
        </View>
      </Screen>
    );
  }

  const path = state.status === 'error' ? null : state.path;

  return (
    <Screen scroll={false} header={<ScreenHeader back={backTarget} title={pdf.label} inset action={colourToggle} />}>
      <View style={styles.status}>
        {state.status === 'loading' && !path && (
          <View style={[styles.loading, { flexDirection: row(isRtl) }]}>
            <Spinner size={16} color={colors.muted} />
            <AppText style={[styles.loadingText, { color: colors.muted }]}>{state.percent != null ? t.openingPdfPercent(state.percent) : t.openingPdf}</AppText>
          </View>
        )}
        {state.status === 'error' && state.offline && (
          <>
            <OfflineNote text={t.pdfOfflineNotDownloaded} />
            <Button label={t.viewDownloadedLabel} onPress={() => navigation.navigate('Downloaded')} />
          </>
        )}
        {state.status === 'error' && !state.offline && (
          <>
            <GapMessage>{t.pdfLoadError(state.message)}</GapMessage>
            {/* The file is still fetchable directly even when the in-app viewer can't render it, so link out to it as a fallback. */}
            <Button
              label={t.openPdfExternally}
              onPress={() => {
                Linking.openURL(pdfUrl(driveFileId, resourceKey ?? undefined)).catch(() => undefined);
              }}
            />
          </>
        )}
      </View>

      {path && (
        <View style={[styles.pdfWrap, inverted && styles.pdfInverted]}>
          {/* Inverted along with the pages, so the gap between pages matches them: in dark mode the light theme's card colour flips to the dark theme's; in light mode the dark theme's flips to the light one's. */}
          <Pdf
            key={driveFileId}
            source={{ uri: `file://${path}` }}
            page={savedPage ?? 1}
            style={[styles.pdf, { backgroundColor: inverted ? (scheme === 'dark' ? lightColors.cardBg : darkColors.cardBg) : colors.cardBg }]}
            enableDoubleTapZoom
            spacing={4}
            renderActivityIndicator={() => (
              <View style={styles.pdfLoading}>
                <Spinner size={16} color={colors.muted} />
              </View>
            )}
            onLoadComplete={(pages) => {
              setState({ status: 'ready', path });
              lastPageRef.current = { page: savedPage ?? 1, total: pages };
            }}
            onPageChanged={(page, pages) => schedulePersist(page, pages)}
            onError={(error) => setState({ status: 'error', message: String(error), offline: false })}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** Web: `.pdf-viewer-status` - padding 0 20px. */
  status: { paddingHorizontal: 20 },
  /** Web: `.pdf-loading` - row, gap 8, subtitle styling. */
  loading: { alignItems: 'center', gap: 8, marginBottom: 20 },
  loadingText: { fontSize: 15, fontVariant: ['tabular-nums'] },
  pdfWrap: { flex: 1 },
  pdf: { flex: 1, width: '100%' },
  pdfLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /** Web: `.pdf-inverted .pdf-page canvas` - invert(1) hue-rotate(180deg). */
  pdfInverted: { filter: [{ invert: 1 }, { hueRotate: '180deg' }] },
  /** Web: `.icon-button` - a bare icon in a 36px circle. */
  headerAction: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
