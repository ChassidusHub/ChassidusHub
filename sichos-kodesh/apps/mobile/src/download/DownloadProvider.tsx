import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { ALL_CONTENT_TYPES, listDownloadTargets } from '@sichos-kodesh/app-core';
import type { DownloadTarget } from '@sichos-kodesh/app-core';
import { getCatalog, getLibrary } from '../catalog/catalogStore';
import { libraryFileNames } from '../library/libraryDownloads';
import { downloadedDeepLink } from '../background/backgroundNative';
import { useTranslation } from '../i18n/useTranslation';
import { looksLikeNetworkError, reportFetchFailure, reportFetchSuccess } from '../network/connectivity';
import { useNotificationSettings } from '../settings/notificationSettings';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { DownloadContext } from './downloadContext';
import type { EnqueueMode } from './downloadContext';
import { clearAutoDownloadLedger, forgetAutoDownload, hydrateAutoDownloadLedger, recordAutoDownload } from './downloadLedger';
import { DEFAULT_DOWNLOAD_SETTINGS, useDownloadSettings } from './downloadSettings';
import {
  clearAllDownloadedFiles,
  clearPendingDownloads,
  deleteEntryDownloads,
  fileNameForTarget,
  isTargetDownloaded,
  listDownloadedOccasions,
  listPendingDownloads,
  localPathForTarget,
  reconcileStoredDownloads,
  type DownloadStatus,
  type StoredDownloadRecord,
  type TargetDownloadState,
  upsertStoredDownload,
  writePendingDownloads,
} from './downloadStorage';
import { executeDownload, subscribeToNativeDownloadEvents } from './downloadExecutor';
import { listActiveNativeDownloads, nativeCancelDownload } from './nativeDownload';


function toState(target: DownloadTarget, status: DownloadStatus, extras: Partial<TargetDownloadState> = {}): TargetDownloadState {
  return {
    target,
    status,
    progress: status === 'downloaded' ? 1 : 0,
    ...extras,
  };
}

function recordToTarget(record: StoredDownloadRecord): DownloadTarget {
  return record.kind === 'audio'
    ? {
        key: record.key,
        hebrewYear: record.hebrewYear,
        occasionId: record.occasionId,
        label: record.label,
        kind: 'audio',
        chapterIndex: record.chapterIndex,
        workerFilename: record.workerFilename,
      }
    : {
        key: record.key,
        hebrewYear: record.hebrewYear,
        occasionId: record.occasionId,
        label: record.label,
        kind: 'pdf',
        driveFileId: record.driveFileId,
        resourceKey: record.resourceKey ?? null,
        section: record.section,
      };
}

/**
 * The download queue: files are fetched one at a time through the native
 * WorkManager downloader where available (surviving the app being closed)
 * or in the foreground otherwise, and every row in the app reads its live
 * state from `targetStates`. The context's surface mirrors the web
 * DownloadProvider's - see downloadContext.ts.
 */
export function DownloadProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings, settingsHydrated] = useDownloadSettings();
  const [hydrated, setHydrated] = useState(false);
  const [downloadedRecords, setDownloadedRecords] = useState<StoredDownloadRecord[]>([]);
  const [targetStates, setTargetStates] = useState<Record<string, TargetDownloadState>>({});
  const queueRef = useRef<DownloadTarget[]>([]);
  const processingRef = useRef(false);
  const targetStatesRef = useRef<Record<string, TargetDownloadState>>({});
  const wifiOnlyRef = useRef(settings.wifiOnly);
  // Tracks targets handed off to WorkManager so native events can resolve them.
  const nativePendingRef = useRef<Map<string, DownloadTarget>>(new Map());
  // Which queued keys the automatic sync asked for (vs. a manual tap), and
  // how many files its latest batch queued - both feed the phone's
  // download notifications (see downloadExecutor's NativeDownloadOptions).
  const autoKeysRef = useRef<Set<string>>(new Set());
  const autoBatchSizeRef = useRef(0);
  const [, bumpQueue] = useState(0);
  const { t: translation, language } = useTranslation();
  const [notifications] = useNotificationSettings();
  const notificationTextRef = useRef({ translation, language, notifications });

  useEffect(() => {
    notificationTextRef.current = { translation, language, notifications };
  }, [language, notifications, translation]);

  useEffect(() => {
    targetStatesRef.current = targetStates;
  }, [targetStates]);

  useEffect(() => {
    wifiOnlyRef.current = settings.wifiOnly;
  }, [settings.wifiOnly]);

  const getOccasionTargets = useCallback(
    (entry: CatalogEntry, mode: 'manual' | 'settings' | 'all' = 'manual') => {
      if (mode === 'all') return listDownloadTargets([entry], ALL_CONTENT_TYPES);
      const contentTypes = mode === 'manual' && settings.manualDownloadAllContent ? ALL_CONTENT_TYPES : settings.contentTypes;
      return listDownloadTargets([entry], contentTypes);
    },
    [settings.contentTypes, settings.manualDownloadAllContent],
  );

  const refreshDownloadsInternal = useCallback(async (activeNativeKeys?: ReadonlySet<string>) => {
    const records = await reconcileStoredDownloads();
    setDownloadedRecords(records);
    setTargetStates((prev) => {
      const next = { ...prev };
      for (const record of records) {
        const isActiveNative = activeNativeKeys?.has(record.key) ?? nativePendingRef.current.has(record.key);
        if (isActiveNative && (next[record.key]?.status === 'queued' || next[record.key]?.status === 'downloading')) continue;
        const target = recordToTarget(record);
        next[record.key] = toState(target, 'downloaded', { localPath: record.localPath, progress: 1 });
      }
      return next;
    });
    return records;
  }, []);

  const refreshDownloads = useCallback(async () => {
    await refreshDownloadsInternal();
  }, [refreshDownloadsInternal]);

  const reconcileNativeState = useCallback(async () => {
    const activeNativeKeys = new Set((await listActiveNativeDownloads()).map((download) => download.targetKey));
    const records = await refreshDownloadsInternal(activeNativeKeys);
    const downloadedKeys = new Set(records.map((record) => record.key));
    const staleNativePending = Array.from(nativePendingRef.current.entries()).filter(([targetKey]) => !activeNativeKeys.has(targetKey));

    for (const [targetKey] of staleNativePending) {
      nativePendingRef.current.delete(targetKey);
    }

    setTargetStates((prev) => {
      const next = { ...prev };
      for (const [targetKey, target] of staleNativePending) {
        if (downloadedKeys.has(targetKey)) continue;
        next[targetKey] = toState(target, 'canceled');
      }
      return next;
    });
  }, [refreshDownloadsInternal]);

  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return;
    processingRef.current = true;
    const next = queueRef.current[0]!;

    setTargetStates((prev) => ({
      ...prev,
      [next.key]: toState(next, 'downloading', { progress: prev[next.key]?.progress ?? 0 }),
    }));

    try {
      const isAuto = autoKeysRef.current.has(next.key);
      const { translation: strings, language: lang, notifications: notify } = notificationTextRef.current;
      const result = await executeDownload(
        next,
        (progress) => {
          setTargetStates((prev) => ({
            ...prev,
            [next.key]: toState(next, 'downloading', { progress }),
          }));
        },
        {
          wifiOnly: wifiOnlyRef.current,
          auto: isAuto,
          label: next.label,
          progressTitle: strings.downloadingTitle,
          notifyWhenDone:
            isAuto && notify.downloadsReady
              ? {
                  title: strings.downloadsReadyTitle,
                  body: strings.downloadsReadyBody(autoBatchSizeRef.current, hebrewYearLabel(next.hebrewYear, lang)),
                  deepLink: downloadedDeepLink(),
                }
              : undefined,
        },
      );

      if (result.mode === 'native') {
        // Download enqueued in WorkManager - remove from the blocking queue and
        // track in nativePendingRef so the event subscription can finalize it.
        nativePendingRef.current.set(next.key, next);
        queueRef.current = queueRef.current.filter((target) => target.key !== next.key);
        await writePendingDownloads(queueRef.current);
        processingRef.current = false;
        bumpQueue((v) => v + 1);
        if (queueRef.current.length > 0) processQueue().catch(() => undefined);
        return;
      }

      // Foreground path - result.localPath is available, and a real network round-trip just succeeded.
      reportFetchSuccess();
      const path = result.localPath!;
      const records = await upsertStoredDownload(next, path);
      setDownloadedRecords(records);
      setTargetStates((prev) => ({
        ...prev,
        [next.key]: toState(next, 'downloaded', { progress: 1, localPath: path }),
      }));
    } catch (error) {
      if (looksLikeNetworkError(error)) reportFetchFailure();
      setTargetStates((prev) => ({
        ...prev,
        [next.key]: toState(next, 'error', { error: String(error) }),
      }));
    } finally {
      // Only remove from queue here for the foreground path (native already removed above).
      if (!nativePendingRef.current.has(next.key)) {
        queueRef.current = queueRef.current.filter((target) => target.key !== next.key);
        await writePendingDownloads(queueRef.current);
        processingRef.current = false;
        bumpQueue((value) => value + 1);
        if (queueRef.current.length > 0) processQueue().catch(() => undefined);
      }
    }
  }, []);

  // Subscribe to WorkManager events for native-routed downloads.
  useEffect(() => {
    const unsubscribe = subscribeToNativeDownloadEvents({
      onProgress: ({ targetKey, bytesReceived, bytesTotal }) => {
        const pending = nativePendingRef.current.get(targetKey);
        if (!pending) return;
        setTargetStates((prev) => ({
          ...prev,
          [targetKey]: toState(pending, 'downloading', {
            progress: bytesTotal > 0 ? bytesReceived / bytesTotal : 0,
          }),
        }));
      },
      onComplete: ({ targetKey, localPath }) => {
        const pending = nativePendingRef.current.get(targetKey);
        if (!pending) return;
        nativePendingRef.current.delete(targetKey);
        reportFetchSuccess();
        upsertStoredDownload(pending, localPath)
          .then((records) => {
            setDownloadedRecords(records);
            setTargetStates((prev) => ({
              ...prev,
              [targetKey]: toState(pending, 'downloaded', { progress: 1, localPath }),
            }));
          })
          .catch(() => undefined);
      },
      onCanceled: ({ targetKey }) => {
        const pending = nativePendingRef.current.get(targetKey);
        if (!pending) return;
        nativePendingRef.current.delete(targetKey);
        setTargetStates((prev) => ({
          ...prev,
          [targetKey]: toState(pending, 'canceled'),
        }));
      },
      onError: ({ targetKey, error }) => {
        const pending = nativePendingRef.current.get(targetKey);
        if (!pending) return;
        nativePendingRef.current.delete(targetKey);
        if (looksLikeNetworkError(error)) reportFetchFailure();
        setTargetStates((prev) => ({
          ...prev,
          [targetKey]: toState(pending, 'error', { error }),
        }));
      },
    });
    return unsubscribe;
  }, []);

  const enqueueTargets = useCallback(
    async (targets: DownloadTarget[], mode: EnqueueMode = 'manual') => {
      const queuedKeys = new Set(queueRef.current.map((target) => target.key));
      const nextTargets: DownloadTarget[] = [];

      for (const target of targets) {
        // The ledger decides what auto-cleanup may later reclaim: an auto sync
        // (re-)claims the file, while any manual download of the same file
        // takes it out of the auto-managed set for good.
        if (mode === 'auto') {
          recordAutoDownload(target.key, target.hebrewYear, target.occasionId);
          autoKeysRef.current.add(target.key);
        } else {
          forgetAutoDownload(target.key);
          autoKeysRef.current.delete(target.key);
        }

        const currentStatus = targetStatesRef.current[target.key]?.status;
        if (queuedKeys.has(target.key) || currentStatus === 'queued' || currentStatus === 'downloading') continue;
        if (await isTargetDownloaded(target)) {
          const localPath = localPathForTarget(target);
          const records = await upsertStoredDownload(target, localPath);
          setDownloadedRecords(records);
          setTargetStates((prev) => ({
            ...prev,
            [target.key]: toState(target, 'downloaded', { progress: 1, localPath }),
          }));
          continue;
        }
        queuedKeys.add(target.key);
        nextTargets.push(target);
      }

      if (nextTargets.length === 0) return;
      if (mode === 'auto') autoBatchSizeRef.current = nextTargets.length;

      queueRef.current = [...queueRef.current, ...nextTargets];
      await writePendingDownloads(queueRef.current);
      setTargetStates((prev) => {
        const next = { ...prev };
        for (const target of nextTargets) {
          next[target.key] = toState(target, 'queued');
        }
        return next;
      });
      bumpQueue((value) => value + 1);
      processQueue().catch(() => undefined);
    },
    [processQueue],
  );

  const downloadOccasion = useCallback(
    async (entry: CatalogEntry) => {
      await enqueueTargets(getOccasionTargets(entry, 'manual'), 'manual');
    },
    [enqueueTargets, getOccasionTargets],
  );

  const enqueueBulk = useCallback(
    async (entries: CatalogEntry[], mode: EnqueueMode = 'manual') => {
      const contentTypes = mode === 'manual' && settings.manualDownloadAllContent ? ALL_CONTENT_TYPES : settings.contentTypes;
      await enqueueTargets(listDownloadTargets(entries, contentTypes), mode);
    },
    [enqueueTargets, settings.contentTypes, settings.manualDownloadAllContent],
  );

  const downloadChapter = useCallback(
    async (entry: CatalogEntry, chapterIndex: number) => {
      const target = listDownloadTargets([entry], ALL_CONTENT_TYPES).find((item) => item.kind === 'audio' && item.chapterIndex === chapterIndex);
      if (target) await enqueueTargets([target], 'manual');
    },
    [enqueueTargets],
  );

  const downloadAllChapters = useCallback(
    async (entry: CatalogEntry) => {
      await enqueueTargets(
        listDownloadTargets([entry], ALL_CONTENT_TYPES).filter((item) => item.kind === 'audio'),
        'manual',
      );
    },
    [enqueueTargets],
  );

  const cancelDownload = useCallback(async (targetKey: string) => {
    const current = targetStatesRef.current[targetKey];
    // Cancel in WorkManager if the native path was used.
    await nativeCancelDownload(targetKey, current ? fileNameForTarget(current.target) : undefined);
    // Remove from the local queue if it hasn't been handed off yet.
    queueRef.current = queueRef.current.filter((t) => t.key !== targetKey);
    nativePendingRef.current.delete(targetKey);
    await writePendingDownloads(queueRef.current);
    setTargetStates((prev) => {
      const nextCurrent = prev[targetKey];
      if (!nextCurrent || (nextCurrent.status !== 'queued' && nextCurrent.status !== 'downloading')) return prev;
      return { ...prev, [targetKey]: toState(nextCurrent.target, 'canceled') };
    });
  }, []);

  const deleteOccasionDownloads = useCallback(
    async (entry: CatalogEntry) => {
      await deleteEntryDownloads(entry);
      await refreshDownloads();
      const occasionKeys = new Set(getOccasionTargets(entry, 'all').map((target) => target.key));
      for (const key of occasionKeys) forgetAutoDownload(key);
      setTargetStates((prev) => {
        const next = { ...prev };
        for (const key of occasionKeys) {
          delete next[key];
        }
        return next;
      });
    },
    [getOccasionTargets, refreshDownloads],
  );

  const clearDownloads = useCallback(async () => {
    await clearAllDownloadedFiles(Object.values(getCatalog()).flat(), libraryFileNames(getLibrary()));
    await clearPendingDownloads();
    clearAutoDownloadLedger();
    queueRef.current = [];
    nativePendingRef.current.clear();
    setDownloadedRecords([]);
    setTargetStates({});
  }, []);

  const listDownloadedSummaries = useCallback(async () => listDownloadedOccasions(Object.values(getCatalog()).flat()), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      hydrateAutoDownloadLedger(),
      reconcileNativeState(),
      listPendingDownloads().then(async (targets) => {
        if (!cancelled && targets.length > 0) await enqueueTargets(targets, 'manual');
      }),
    ]).then(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enqueueTargets, reconcileNativeState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        reconcileNativeState().catch(() => undefined);
      }
    });
    return () => {
      subscription.remove();
    };
  }, [reconcileNativeState]);

  const value = useMemo(
    () => ({
      settings: settingsHydrated ? settings : DEFAULT_DOWNLOAD_SETTINGS,
      setSettings,
      hydrated: hydrated && settingsHydrated,
      targetStates,
      downloadedRecords,
      downloadOccasion,
      enqueueBulk,
      downloadChapter,
      downloadAllChapters,
      enqueueTargets,
      cancelDownload,
      refreshDownloads,
      deleteOccasionDownloads,
      clearDownloads,
      getOccasionTargets,
      listDownloadedSummaries,
    }),
    [
      cancelDownload,
      clearDownloads,
      deleteOccasionDownloads,
      downloadAllChapters,
      downloadChapter,
      downloadOccasion,
      downloadedRecords,
      enqueueBulk,
      enqueueTargets,
      getOccasionTargets,
      hydrated,
      listDownloadedSummaries,
      refreshDownloads,
      setSettings,
      settings,
      settingsHydrated,
      targetStates,
    ],
  );

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}
