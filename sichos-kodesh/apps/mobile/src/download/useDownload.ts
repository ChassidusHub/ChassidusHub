import { useContext } from 'react';
import { DownloadContext } from './downloadContext';
import type { DownloadContextValue } from './downloadContext';

export function useDownload(): DownloadContextValue {
  const ctx = useContext(DownloadContext);
  if (!ctx) throw new Error('useDownload must be used within a DownloadProvider');
  return ctx;
}
