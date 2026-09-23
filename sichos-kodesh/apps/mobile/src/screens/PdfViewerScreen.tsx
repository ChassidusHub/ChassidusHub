import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import Pdf from 'react-native-pdf';
import catalog from '../catalog/data';
import { downloadPdf, localPdfPathIfExists, pdfUrl } from '../download/download';
import { useTranslation } from '../i18n/useTranslation';
import type { PdfViewerScreenProps } from '../navigation/types';
import { getOnlineSnapshot, looksLikeNetworkError, reportFetchFailure, reportFetchSuccess } from '../network/connectivity';
import { getOccasionProgress, getPdfPage, readProgressMap, recordPdfProgress } from '../player/progressStore';
import { useInvertPdfInDarkMode } from '../settings/invertPdfInDarkMode';
import { Button } from '../ui/Button';
import { OfflineNote } from '../ui/OfflineNote';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Spinner } from '../ui/Spinner';
import { AppText } from '../ui/Text';
import { GapMessage } from '../ui/Typography';
import { lightColors, useTheme } from '../ui/theme';
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
  const { driveFileId, resourceKey, label, hebrewYear, occasionId } = route.params;
  const { t, isRtl } = useTranslation();
  const { colors, scheme } = useTheme();
  const [invertInDarkMode] = useInvertPdfInDarkMode();
  const [state, setState] = useState<LoadState>({ status: 'loading', percent: null, path: null });
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPageRef = useRef<{ page: number; total: number | null } | null>(null);

  const entry = useMemo(() => catalog[hebrewYear]?.find((item) => item.occasionId === occasionId) ?? null, [hebrewYear, occasionId]);
  const pdf = useMemo(() => entry?.pdfs.find((item) => item.driveFileId === driveFileId) ?? null, [driveFileId, entry]);
  const savedPage = useMemo(() => (entry ? getPdfPage(getOccasionProgress(readProgressMap(), entry.hebrewYear, entry.occasionId), driveFileId) : undefined), [driveFileId, entry]);
  // The web's `.pdf-page-canvas { filter: invert(1) hue-rotate(180deg) }`,
  // applied to the native viewer through React Native's own `filter` style.
  const invertForDarkMode = invertInDarkMode && scheme === 'dark';
  const backTarget = { name: 'Farbrengen', params: { kind: 'browse', hebrewYear, occasionId } } as const;

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
    <Screen scroll={false} header={<ScreenHeader back={backTarget} title={pdf.label} inset />}>
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
        <View style={[styles.pdfWrap, invertForDarkMode && styles.pdfInverted]}>
          {/* Inverted along with the pages, so the gap between pages ends up dark: the light theme's card colour flips to the dark theme's. */}
          <Pdf
            key={driveFileId}
            source={{ uri: `file://${path}` }}
            page={savedPage ?? 1}
            style={[styles.pdf, { backgroundColor: invertForDarkMode ? lightColors.cardBg : colors.cardBg }]}
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
  /** Web: `.pdf-page-canvas` in dark mode - invert(1) hue-rotate(180deg). */
  pdfInverted: { filter: [{ invert: 1 }, { hueRotate: '180deg' }] },
});
