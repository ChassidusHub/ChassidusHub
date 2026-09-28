import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { SlidersHorizontal } from 'lucide-react-native';
import Pdf from 'react-native-pdf';
import { occasionTitle, pdfFilters } from '@sichos-kodesh/app-core';
import type { PdfColors } from '@sichos-kodesh/app-core';
import { useCatalog } from '../catalog/catalogStore';
import { PdfPageSlider } from '../components/PdfPageSlider';
import { downloadPdf, localPdfPathIfExists, pdfUrl } from '../download/download';
import { useTranslation } from '../i18n/useTranslation';
import type { PdfViewerScreenProps } from '../navigation/types';
import { getOnlineSnapshot, looksLikeNetworkError, reportFetchFailure, reportFetchSuccess } from '../network/connectivity';
import { getOccasionProgress, getPdfPage, readProgressMap, recordPdfProgress } from '../player/progressStore';
import { useInvertPdfInDarkMode, useInvertPdfInLightMode } from '../settings/invertPdfInDarkMode';
import { setPdfLook, usePdfLook } from '../settings/pdfLook';
import type { BackTarget } from '../ui/BackLink';
import { Button } from '../ui/Button';
import { OfflineNote } from '../ui/OfflineNote';
import { ReadingBar } from '../ui/ReadingBar';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Spinner } from '../ui/Spinner';
import { AppText } from '../ui/Text';
import { GapMessage } from '../ui/Typography';
import { lightColors, useTheme } from '../ui/theme';
import { setKeepScreenOn } from '../ui/systemBars';
import { PdfSettingsSheet } from './PdfSettingsSheet';
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
  const { driveFileId, resourceKey, label, hebrewYear, occasionId, library } = route.params;
  const { t, isRtl, language } = useTranslation();
  const { colors, baseScheme, setSchemeOverride } = useTheme();
  const [invertInDarkMode, setInvertInDarkMode] = useInvertPdfInDarkMode();
  const [invertInLightMode, setInvertInLightMode] = useInvertPdfInLightMode();
  const [state, setState] = useState<LoadState>({ status: 'loading', percent: null, path: null });
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPageRef = useRef<{ page: number; total: number | null } | null>(null);
  const pdfRef = useRef<React.ComponentRef<typeof Pdf>>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  // A tap on a page hides the bar and the page slider, or brings them back.
  const [chromeHidden, setChromeHidden] = useState(false);

  const entry = useMemo(() => catalog[hebrewYear]?.find((item) => item.occasionId === occasionId) ?? null, [catalog, hebrewYear, occasionId]);
  // A library item's PDF has no farbrengen behind it: the route carries all the viewer needs, and there is no reading position to keep.
  const pdf = useMemo(
    () => (library ? { label, driveFileId, resourceKey: resourceKey ?? undefined } : (entry?.pdfs.find((item) => item.driveFileId === driveFileId) ?? null)),
    [driveFileId, entry, label, library, resourceKey],
  );
  const savedPage = useMemo(() => (entry ? getPdfPage(getOccasionProgress(readProgressMap(), entry.hebrewYear, entry.occasionId), driveFileId) : undefined), [driveFileId, entry]);
  // Dark pages: the web's `invert(1) hue-rotate(180deg)`, applied to the
  // native viewer through React Native's own `filter` style (see pdfFilters).
  // The settings sheet's "Dark" choice sets it for the user's own theme,
  // remembered per theme (see settings/invertPdfInDarkMode.ts) - so night
  // reading stays inverted while a daytime flip doesn't change the night
  // default. `baseScheme`, not `scheme`: while reading, the whole screen
  // follows the page (below), so `scheme` is whatever the page currently is.
  const inverted = baseScheme === 'dark' ? invertInDarkMode : invertInLightMode;
  const setInverted = baseScheme === 'dark' ? setInvertInDarkMode : setInvertInLightMode;
  // Flipped pages get the dark chrome, plain pages the light one - the
  // header, background and system bars follow the page rather than sitting
  // in the opposite palette next to it. Cleared on the way out, so the app
  // returns to the user's own theme the moment the reader closes.
  useEffect(() => {
    const wanted = inverted ? 'dark' : 'light';
    setSchemeOverride(wanted === baseScheme ? null : wanted);
    return () => setSchemeOverride(null);
  }, [baseScheme, inverted, setSchemeOverride]);
  const backTarget: BackTarget = library ? { name: 'LibraryItem', params: library } : { name: 'Farbrengen', params: { kind: 'browse', hebrewYear, occasionId } };
  // The rest of how the pages look (app-core's PdfLook): a tint when they aren't dark, contrast, paging, the screen kept on.
  const look = usePdfLook();
  const [sheetOpen, setSheetOpen] = useState(false);
  const pageColors: PdfColors = inverted ? 'dark' : look.tint;
  const chooseColors = (next: PdfColors) => {
    setInverted(next === 'dark');
    if (next !== 'dark') setPdfLook({ tint: next });
  };
  const filter = pdfFilters(pageColors, look.contrast);
  useEffect(() => {
    setKeepScreenOn(look.keepAwake);
    return () => setKeepScreenOn(false);
  }, [look.keepAwake]);
  const settingsButton = (
    <Pressable onPress={() => setSheetOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.pdfSettings} style={({ pressed }) => [styles.headerAction, pressed && { backgroundColor: colors.cardBg }]}>
      <SlidersHorizontal size={20} color={colors.muted} />
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

  if (!pdf || (!entry && !library)) {
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
    <Screen
      scroll={false}
      header={
        <ReadingBar
          back={backTarget}
          context={entry ? occasionTitle(entry, language) : undefined}
          title={pdf.label}
          hidden={chromeHidden && !sheetOpen}
          palette={{ background: colors.bg, rule: colors.border, text: colors.fg, muted: colors.muted }}
        >
          {settingsButton}
        </ReadingBar>
      }
    >
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
        <View style={[styles.pdfWrap, filter.length > 0 && { filter }]}>
          {/* Inverted along with the pages, so the gap between pages matches them: the light theme's card colour flips to the dark theme's (the chrome is dark whenever the pages are - see the override above). */}
          <Pdf
            ref={pdfRef}
            key={driveFileId}
            source={{ uri: `file://${path}` }}
            page={savedPage ?? 1}
            style={[styles.pdf, { backgroundColor: inverted ? lightColors.cardBg : colors.cardBg }]}
            enableDoubleTapZoom
            spacing={4}
            enablePaging={look.paging === 'pages'}
            renderActivityIndicator={() => (
              <View style={styles.pdfLoading}>
                <Spinner size={16} color={colors.muted} />
              </View>
            )}
            onLoadComplete={(pages) => {
              setState({ status: 'ready', path });
              setPageCount(pages);
              setCurrentPage(savedPage ?? 1);
              lastPageRef.current = { page: savedPage ?? 1, total: pages };
            }}
            onPageChanged={(at, pages) => {
              setCurrentPage(at);
              schedulePersist(at, pages);
            }}
            onPageSingleTap={() => setChromeHidden((was) => !was)}
            onError={(error) => setState({ status: 'error', message: String(error), offline: false })}
          />
        </View>
      )}
      {state.status === 'ready' && (
        <PdfPageSlider
          page={currentPage}
          count={pageCount}
          hidden={chromeHidden && !sheetOpen}
          onGo={(to) => {
            setCurrentPage(to);
            pdfRef.current?.setPage(to);
          }}
        />
      )}
      <PdfSettingsSheet visible={sheetOpen} look={look} colors={pageColors} onColors={chooseColors} onClose={() => setSheetOpen(false)} />
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
  /** Web: `.icon-button` - a bare icon in a 36px circle. */
  headerAction: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
