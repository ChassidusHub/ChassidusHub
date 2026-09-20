import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { currentHebrewYear, resolveThisWeek } from '@sichos-kodesh/catalog';
import type { CatalogAudio, CatalogEntry, CatalogPdf } from '@sichos-kodesh/catalog';
import { ALL_CONTENT_TYPES, listDownloadTargets } from '@sichos-kodesh/app-core';
import type { DownloadTarget } from '@sichos-kodesh/app-core';
import catalog from '../catalog/data';
import { DownloadContext } from './downloadContext';
import { DEFAULT_DOWNLOAD_SETTINGS, useDownloadSettings } from './downloadSettings';
import {
  clearAllDownloadedFiles,
  clearPendingDownloads,
  deleteEntryDownloads,
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

const ALL_ENTRIES = Object.values(catalog).flat();

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

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings, settingsHydrated] = useDownloadSettings();
  const [hydrated, setHydrated] = useState(false);
  const [downloadedRecords, setDownloadedRecords] = useState<Awaited<ReturnType<typeof reconcileStoredDownloads>>>([]);
  const [targetStates, setTargetStates] = useState<Record<string, TargetDownloadState>>({});
  const queueRef = useRef<DownloadTarget[]>([]);
  const processingRef = useRef(false);
  const targetStatesRef = useRef<Record<string, TargetDownloadState>>({});
  const autoQueuedRef = useRef(false);
  const wifiOnlyRef = useRef(settings.wifiOnly);
  // Tracks targets handed off to WorkManager so native events can resolve them.
  const nativePendingRef = useRef<Map<string, DownloadTarget>>(new Map());
  const [, bumpQueue] = useState(0);

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

    setTargetStates((prev) => {
      const next = { ...prev };
      for (const [targetKey, target] of Array.from(nativePendingRef.current.entries())) {
        if (activeNativeKeys.has(targetKey)) continue;
        nativePendingRef.current.delete(targetKey);
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
      const result = await executeDownload(next, (progress) => {
        setTargetStates((prev) => ({
          ...prev,
          [next.key]: toState(next, 'downloading', { progress }),
        }));
      }, { wifiOnly: wifiOnlyRef.current });

      if (result.mode === 'native') {
        // Download enqueued in WorkManager — remove from blocking queue and track
        // in nativePendingRef so the event subscription can finalize it.
        nativePendingRef.current.set(next.key, next);
        queueRef.current = queueRef.current.filter((target) => target.key !== next.key);
        await writePendingDownloads(queueRef.current);
        processingRef.current = false;
        bumpQueue((v) => v + 1);
        if (queueRef.current.length > 0) processQueue().catch(() => undefined);
        return;
      }

      // Foreground path — result.localPath is available
      const path = result.localPath!;
      const records = await upsertStoredDownload(next, path);
      setDownloadedRecords(records);
      setTargetStates((prev) => ({
        ...prev,
        [next.key]: toState(next, 'downloaded', { progress: 1, localPath: path }),
      }));
    } catch (error) {
      setTargetStates((prev) => ({
        ...prev,
        [next.key]: toState(next, 'error', { error: String(error) }),
      }));
    } finally {
      // Only remove from queue here for foreground path (native already removed above).
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
        upsertStoredDownload(pending, localPath).then((records) => {
          setDownloadedRecords(records);
          setTargetStates((prev) => ({
            ...prev,
            [targetKey]: toState(pending, 'downloaded', { progress: 1, localPath }),
          }));
        }).catch(() => undefined);
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
        setTargetStates((prev) => ({
          ...prev,
          [targetKey]: toState(pending, 'error', { error }),
        }));
      },
    });
    return unsubscribe;
  }, []);

  const enqueueTargets = useCallback(
    async (targets: DownloadTarget[]) => {
      const queuedKeys = new Set(queueRef.current.map((target) => target.key));
      const nextTargets: DownloadTarget[] = [];

      for (const target of targets) {
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
      await enqueueTargets(getOccasionTargets(entry, 'manual'));
    },
    [enqueueTargets, getOccasionTargets],
  );

  const downloadAudio = useCallback(
    async (entry: CatalogEntry, audio: CatalogAudio, chapterIndex: number) => {
      const target = listDownloadTargets([entry], ALL_CONTENT_TYPES).find(
        (item) => item.kind === 'audio' && item.workerFilename === audio.workerFilename && item.chapterIndex === chapterIndex,
      );
      if (target) await enqueueTargets([target]);
    },
    [enqueueTargets],
  );

  const downloadPdf = useCallback(
    async (entry: CatalogEntry, pdf: CatalogPdf) => {
      const target = listDownloadTargets([entry], ALL_CONTENT_TYPES).find(
        (item) => item.kind === 'pdf' && item.driveFileId === pdf.driveFileId,
      );
      if (target) await enqueueTargets([target]);
    },
    [enqueueTargets],
  );

  const cancelDownload = useCallback(async (targetKey: string) => {
    // Cancel in WorkManager if native path was used.
    await nativeCancelDownload(targetKey);
    // Remove from local queue if it hasn't been handed off yet.
    queueRef.current = queueRef.current.filter((t) => t.key !== targetKey);
    nativePendingRef.current.delete(targetKey);
    await writePendingDownloads(queueRef.current);
    setTargetStates((prev) => {
      const current = prev[targetKey];
      if (!current || (current.status !== 'queued' && current.status !== 'downloading')) return prev;
      return { ...prev, [targetKey]: toState(current.target, 'canceled') };
    });
  }, []);

  const deleteOccasionDownloads = useCallback(async (entry: CatalogEntry) => {
    await deleteEntryDownloads(entry);
    await refreshDownloads();
    const occasionKeys = new Set(getOccasionTargets(entry, 'all').map((target) => target.key));
    setTargetStates((prev) => {
      const next = { ...prev };
      for (const key of occasionKeys) {
        delete next[key];
      }
      return next;
    });
  }, [getOccasionTargets, refreshDownloads]);

  const clearDownloads = useCallback(async () => {
    await clearAllDownloadedFiles(ALL_ENTRIES);
    await clearPendingDownloads();
    queueRef.current = [];
    nativePendingRef.current.clear();
    setDownloadedRecords([]);
    setTargetStates((prev) => {
      const next: Record<string, TargetDownloadState> = {};
      for (const [key, state] of Object.entries(prev)) {
        if (state.status === 'queued' || state.status === 'downloading') next[key] = toState(state.target, 'error');
      }
      return next;
    });
  }, []);

  const listDownloadedSummaries = useCallback(async () => listDownloadedOccasions(ALL_ENTRIES), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      reconcileNativeState(),
      listPendingDownloads().then(async (targets) => {
        if (!cancelled && targets.length > 0) await enqueueTargets(targets);
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

  useEffect(() => {
    if (!settingsHydrated || !settings.autoDownloadEnabled || autoQueuedRef.current) return;
    autoQueuedRef.current = true;
    const entries = resolveThisWeek(currentHebrewYear(), catalog).map((item) => item.entry);
    enqueueTargets(listDownloadTargets(entries, settings.contentTypes)).catch(() => undefined);
  }, [enqueueTargets, settings.autoDownloadEnabled, settings.contentTypes, settingsHydrated]);

  const value = useMemo(
    () => ({
      settings: settingsHydrated ? settings : DEFAULT_DOWNLOAD_SETTINGS,
      setSettings,
      hydrated: hydrated && settingsHydrated,
      targetStates,
      downloadedRecords,
      downloadOccasion,
      downloadAudio,
      downloadPdf,
      enqueueTargets,
      cancelDownload,
      refreshDownloads,
      deleteOccasionDownloads,
      clearDownloads,
      getOccasionTargets,
      listDownloadedSummaries,
    }),
    [cancelDownload, clearDownloads, deleteOccasionDownloads, downloadedRecords, downloadAudio, downloadOccasion, downloadPdf, enqueueTargets, getOccasionTargets, hydrated, listDownloadedSummaries, refreshDownloads, setSettings, settings, settingsHydrated, targetStates],
  );

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}
