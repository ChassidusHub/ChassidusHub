import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Pdf from 'react-native-pdf';
import type { PdfRef } from 'react-native-pdf';
import catalog from '../catalog/data';
import { downloadPdf } from '../download/download';
import { useTranslation } from '../i18n/useTranslation';
import type { PdfViewerScreenProps } from '../navigation/types';
import { pdfIdentityFromRoute, resolveInitialPdfPage } from '../pdf/pdfIdentity';
import { loadSavedPdfProgress, savePdfProgress } from '../pdf/pdfProgress';
import { findCatalogEntry } from '../routes/catalogRoutes';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { colors, spacing } from '../ui/theme';

type LoadState =
  | { status: 'loading'; percent: number | null; path: string | null }
  | { status: 'ready'; path: string }
  | { status: 'error'; message: string };

/**
 * Renders a PDF's pages directly in the app (via react-native-pdf).
 * Audio playback is handled by the global PlayerProvider/GlobalPlayerBar
 * that persists at the app root - no need for a screen-local BottomAudioPlayer.
 * The audio queue is loaded when the user presses Play in OccasionDetail before
 * navigating here; if they navigate here directly, GlobalPlayerBar shows
 * whatever is currently queued in the global player.
 */
export function PdfViewerScreen({ navigation, route }: PdfViewerScreenProps) {
  const { t } = useTranslation();
  const { driveFileId, resourceKey, label, hebrewYear, occasionId } = route.params;
  const pdfRef = useRef<PdfRef>(null);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPageRef = useRef(1);
  const totalPagesRef = useRef<number | null>(null);
  const [state, setState] = useState<LoadState>({
    status: 'loading',
    percent: 0,
    path: null,
  });
  const [restoredPage, setRestoredPage] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [initialPageApplied, setInitialPageApplied] = useState(false);
  const [progressReady, setProgressReady] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const identity = useMemo(() => pdfIdentityFromRoute(route.params), [route.params]);
  const entry = useMemo(
    () => findCatalogEntry(catalog, hebrewYear, occasionId),
    [hebrewYear, occasionId],
  );
  const routePdf = useMemo(
    () => entry?.pdfs.find((pdf) => pdf.driveFileId === driveFileId) ?? null,
    [driveFileId, entry],
  );
  const title = label.trim() || routePdf?.label || t.read;
  const occasionLabel = route.params.occasionLabel ?? entry?.occasionLabel ?? null;
  const sectionLabel =
    route.params.sectionLabel ??
    (routePdf ? t.sectionLabels[routePdf.section] : null);

  // Resolve audio tracks directly via the year key — avoids flattening the whole catalog.
  // If the catalog lookup yields nothing the player is simply not shown (no silent mismatch).
  const audioTracks = useMemo(
    () => catalog[hebrewYear]?.find((e) => e.occasionId === occasionId)?.audio ?? [],
    [hebrewYear, occasionId],
  );

  useEffect(() => {
    let cancelled = false;
    setProgressReady(false);
    setInitialPageApplied(false);
    setRestoredPage(1);
    setCurrentPage(1);
    currentPageRef.current = 1;
    setTotalPages(null);
    totalPagesRef.current = null;
    loadSavedPdfProgress(identity)
      .then((saved) => {
        if (cancelled) return;
        const nextPage = resolveInitialPdfPage(saved?.page, saved?.totalPages);
        setRestoredPage(nextPage);
        setCurrentPage(nextPage);
        currentPageRef.current = nextPage;
        setProgressReady(true);
      })
      .catch(() => {
        if (!cancelled) setProgressReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', percent: 0, path: null });
    downloadPdf(driveFileId, resourceKey ?? undefined, ({ received, total }) => {
      if (!cancelled) {
        setState({
          status: 'loading',
          percent: total > 0 ? Math.round((received / total) * 100) : null,
          path: null,
        });
      }
    })
      .then((path) => {
        if (!cancelled) setState({ status: 'loading', percent: null, path });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [driveFileId, resourceKey, retryToken]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    totalPagesRef.current = totalPages;
  }, [totalPages]);

  useEffect(() => {
    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
      savePdfProgress(identity, currentPageRef.current, totalPagesRef.current).catch(
        () => undefined,
      );
    };
  }, [identity]);

  function schedulePersist(page: number, pageCount: number | null): void {
    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(() => {
      savePdfProgress(identity, page, pageCount).catch(() => undefined);
      persistTimeoutRef.current = null;
    }, 750);
  }

  function jumpToPage(nextPage: number): void {
    const safePage = resolveInitialPdfPage(nextPage, totalPages);
    pdfRef.current?.setPage(safePage);
    setCurrentPage(safePage);
    schedulePersist(safePage, totalPages);
  }

  const hasValidRoute = !!identity;
  const showLoadingCard =
    hasValidRoute &&
    state.status === 'loading' &&
    (!progressReady || state.path == null || !initialPageApplied);
  const pdfPath = state.status === 'error' ? null : state.path;

  if (!hasValidRoute) {
    return (
      <Screen>
        <ScreenHeader title={title} onBack={() => navigation.goBack()} backLabel={t.back} />
        <EmptyState title={t.pdfNotFound} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={title}
        onBack={() => navigation.goBack()}
        backLabel={t.back}
      />
      <View style={styles.container}>
        {occasionLabel || sectionLabel ? (
          <View style={styles.contextBlock}>
            {occasionLabel ? (
              <AppText variant="bodySmall" color="secondary">
                {occasionLabel}
              </AppText>
            ) : null}
            {sectionLabel ? (
              <AppText variant="caption" color="muted">
                {sectionLabel}
              </AppText>
            ) : null}
          </View>
        ) : null}

        {showLoadingCard ? (
          <Card style={styles.statusCard}>
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
              <AppText color="secondary">
                {state.percent != null ? t.openingPdfPercent(state.percent) : t.openingPdf}
              </AppText>
            </View>
          </Card>
        ) : null}

        {state.status === 'error' ? (
          <View style={styles.stateWrap}>
            <EmptyState title={t.pdfLoadError(state.message)} />
            <View style={styles.retryRow}>
              <AppButton
                label={t.retryDownloadLabel}
                onPress={() => {
                  setProgressReady(false);
                  setRetryToken((current) => current + 1);
                }}
              />
            </View>
          </View>
        ) : null}

        {state.status !== 'error' && pdfPath ? (
          <>
            <Pdf
              key={`${driveFileId}:${retryToken}`}
              ref={pdfRef}
              source={{ uri: `file://${pdfPath}` }}
              page={initialPageApplied ? undefined : restoredPage}
              style={styles.pdf}
              renderActivityIndicator={() => (
                <View style={styles.pdfLoading}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              )}
              onLoadProgress={(percent) =>
                setState((current) =>
                  current.status === 'loading'
                    ? { ...current, percent: Math.round(percent * 100) }
                    : current,
                )
              }
              onLoadComplete={(pages) => {
                const nextPage = resolveInitialPdfPage(restoredPage, pages);
                setTotalPages(pages);
                totalPagesRef.current = pages;
                setCurrentPage(nextPage);
                currentPageRef.current = nextPage;
                setInitialPageApplied(true);
                setState({ status: 'ready', path: pdfPath });
              }}
              onPageChanged={(page, pages) => {
                const nextPage = resolveInitialPdfPage(page, pages);
                setCurrentPage(nextPage);
                currentPageRef.current = nextPage;
                setTotalPages(pages);
                totalPagesRef.current = pages;
                schedulePersist(nextPage, pages);
              }}
              onError={(error) => setState({ status: 'error', message: String(error) })}
            />

            <View
              style={[
                styles.footer,
                audioTracks.length > 0 && styles.footerWithPlayer,
              ]}
            >
              <AppText variant="bodySmall" color="secondary">
                {totalPages ? t.pdfPageStatus(currentPage, totalPages) : t.openingPdf}
              </AppText>
              <View style={styles.controlsRow}>
                <AppButton
                  label={t.previousPage}
                  variant="secondary"
                  disabled={currentPage <= 1 || !totalPages}
                  style={[
                    styles.controlButton,
                    (currentPage <= 1 || !totalPages) && styles.controlButtonDisabled,
                  ]}
                  onPress={() => jumpToPage(currentPage - 1)}
                />
                <AppButton
                  label={t.nextPage}
                  variant="secondary"
                  disabled={!totalPages || currentPage >= totalPages}
                  style={[
                    styles.controlButton,
                    (!totalPages || currentPage >= totalPages) &&
                      styles.controlButtonDisabled,
                  ]}
                  onPress={() => jumpToPage(currentPage + 1)}
                />
              </View>
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contextBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  statusCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stateWrap: { flex: 1, justifyContent: 'center' },
  retryRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  pdf: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.backgroundDefault,
  },
  pdfLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.backgroundDefault,
  },
  footerWithPlayer: { paddingBottom: 76 + spacing.md },
  controlsRow: { flexDirection: 'row', gap: spacing.sm },
  controlButton: { flex: 1 },
  controlButtonDisabled: { opacity: 0.45 },
});
