import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { currentHebrewYear, resolveThisWeek } from '@sichos-kodesh/catalog';
import type { CatalogAudio, CatalogEntry, CatalogPdf } from '@sichos-kodesh/catalog';
import { ALL_CONTENT_TYPES, listDownloadTargets } from '@sichos-kodesh/app-core';
import type { DownloadTarget } from '@sichos-kodesh/app-core';
import catalog from '../catalog/data';
import { downloadAudio as downloadAudioFile, downloadPdf as downloadPdfFile } from './download';
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
  type TargetDownloadState,
  upsertStoredDownload,
  writePendingDownloads,
} from './downloadStorage';

const ALL_ENTRIES = Object.values(catalog).flat();

function toState(target: DownloadTarget, status: DownloadStatus, extras: Partial<TargetDownloadState> = {}): TargetDownloadState {
  return {
    target,
    status,
    progress: status === 'downloaded' ? 1 : 0,
    ...extras,
  };
}

async function runTargetDownload(target: DownloadTarget, onProgress: (progress: number) => void): Promise<string> {
  if (target.kind === 'audio') {
    return downloadAudioFile(target.workerFilename ?? '', ({ received, total }) => {
      onProgress(total > 0 ? received / total : 0);
    });
  }
  return downloadPdfFile(target.driveFileId ?? '', target.resourceKey ?? undefined, ({ received, total }) => {
    onProgress(total > 0 ? received / total : 0);
  });
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
  const [, bumpQueue] = useState(0);

  useEffect(() => {
    targetStatesRef.current = targetStates;
  }, [targetStates]);

  const getOccasionTargets = useCallback(
    (entry: CatalogEntry, mode: 'manual' | 'settings' | 'all' = 'manual') => {
      if (mode === 'all') return listDownloadTargets([entry], ALL_CONTENT_TYPES);
      const contentTypes = mode === 'manual' && settings.manualDownloadAllContent ? ALL_CONTENT_TYPES : settings.contentTypes;
      return listDownloadTargets([entry], contentTypes);
    },
    [settings.contentTypes, settings.manualDownloadAllContent],
  );

  const refreshDownloads = useCallback(async () => {
    const records = await reconcileStoredDownloads();
    setDownloadedRecords(records);
    setTargetStates((prev) => {
      const next = { ...prev };
      for (const record of records) {
        if (next[record.key]?.status === 'queued' || next[record.key]?.status === 'downloading') continue;
        const target =
          record.kind === 'audio'
            ? {
                key: record.key,
                hebrewYear: record.hebrewYear,
                occasionId: record.occasionId,
                label: record.label,
                kind: 'audio' as const,
                chapterIndex: record.chapterIndex,
                workerFilename: record.workerFilename,
              }
            : {
                key: record.key,
                hebrewYear: record.hebrewYear,
                occasionId: record.occasionId,
                label: record.label,
                kind: 'pdf' as const,
                driveFileId: record.driveFileId,
                resourceKey: record.resourceKey ?? null,
                section: record.section,
              };
        next[record.key] = toState(target, 'downloaded', { localPath: record.localPath, progress: 1 });
      }
      return next;
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return;
    processingRef.current = true;
    const next = queueRef.current[0]!;

    setTargetStates((prev) => ({
      ...prev,
      [next.key]: toState(next, 'downloading', { progress: prev[next.key]?.progress ?? 0 }),
    }));

    try {
      const path = await runTargetDownload(next, (progress) => {
        setTargetStates((prev) => ({
          ...prev,
          [next.key]: toState(next, 'downloading', { progress }),
        }));
      });
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
      queueRef.current = queueRef.current.filter((target) => target.key !== next.key);
      await writePendingDownloads(queueRef.current);
      processingRef.current = false;
      bumpQueue((value) => value + 1);
      if (queueRef.current.length > 0) processQueue().catch(() => undefined);
    }
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
    refreshDownloads().then(() => {
      if (!cancelled) setHydrated(true);
    });
    listPendingDownloads().then(async (targets) => {
      if (cancelled) return;
      if (targets.length > 0) await enqueueTargets(targets);
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enqueueTargets, refreshDownloads]);

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
      refreshDownloads,
      deleteOccasionDownloads,
      clearDownloads,
      getOccasionTargets,
      listDownloadedSummaries,
    }),
    [clearDownloads, deleteOccasionDownloads, downloadedRecords, downloadAudio, downloadOccasion, downloadPdf, enqueueTargets, getOccasionTargets, hydrated, listDownloadedSummaries, refreshDownloads, setSettings, settings, settingsHydrated, targetStates],
  );

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}
