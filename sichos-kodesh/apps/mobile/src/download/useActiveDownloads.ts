import { useMemo } from 'react';
import catalog from '../catalog/data';
import { useDownload } from './useDownload';
import type { DownloadStatus } from './downloadStorage';

export interface ActiveDownloadRow {
  key: string;
  label: string;
  hebrewYear: number;
  occasionId: number;
  percent: number;
  status: DownloadStatus;
}

function labelFor(hebrewYear: number, occasionId: number): string {
  const entry = catalog[hebrewYear]?.find((item) => item.occasionId === occasionId);
  return entry?.occasionLabel ?? `${hebrewYear}:${occasionId}`;
}

export function useActiveDownloads(): ActiveDownloadRow[] {
  const { targetStates } = useDownload();

  return useMemo(() => {
    const groups = new Map<string, ActiveDownloadRow>();
    for (const state of Object.values(targetStates)) {
      if (state.status !== 'queued' && state.status !== 'downloading') continue;
      const groupKey = `${state.target.hebrewYear}:${state.target.occasionId}`;
      const current = groups.get(groupKey);
      const nextPercent = state.status === 'queued' ? 0 : Math.round(state.progress * 100);
      if (!current) {
        groups.set(groupKey, {
          key: groupKey,
          hebrewYear: state.target.hebrewYear,
          occasionId: state.target.occasionId,
          label: labelFor(state.target.hebrewYear, state.target.occasionId),
          percent: nextPercent,
          status: state.status,
        });
        continue;
      }
      current.percent = Math.max(current.percent, nextPercent);
      if (state.status === 'downloading') current.status = 'downloading';
    }
    return [...groups.values()].sort((a, b) => a.hebrewYear - b.hebrewYear || a.occasionId - b.occasionId);
  }, [targetStates]);
}
