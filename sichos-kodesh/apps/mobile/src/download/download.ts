import RNBlobUtil from 'react-native-blob-util';
import { MEDIA_PROXY_BASE_URL } from '../config';

export interface DownloadProgress {
  received: number;
  total: number;
}

async function downloadTo(url: string, localFilename: string, onProgress?: (p: DownloadProgress) => void): Promise<string> {
  const path = `${RNBlobUtil.fs.dirs.DocumentDir}/${localFilename}`;
  const res = await RNBlobUtil.config({ path, overwrite: true })
    .fetch('GET', url)
    .progress({ interval: 250 }, (received, total) => onProgress?.({ received, total }));
  return res.path();
}

/** Downloads one occasion's audio via services/media-proxy's /jem-audio/:filename route - never a direct CloudFront URL. */
export function downloadAudio(workerFilename: string, onProgress?: (p: DownloadProgress) => void): Promise<string> {
  return downloadTo(`${MEDIA_PROXY_BASE_URL}/jem-audio/${workerFilename}`, workerFilename, onProgress);
}

/** Downloads one PDF via services/media-proxy's /drive/:fileId route - never a direct drive.google.com URL. `resourceKey` is required for links shared before Google's 2021 resource-key change (see CatalogPdf.resourceKey) - omitted, the file 404s/redirects to a Google sign-in page even though it's genuinely public. */
export function downloadPdf(driveFileId: string, resourceKey?: string, onProgress?: (p: DownloadProgress) => void): Promise<string> {
  const filename = `${driveFileId}.pdf`;
  const params = new URLSearchParams({ filename });
  if (resourceKey) params.set('resourcekey', resourceKey);
  const url = `${MEDIA_PROXY_BASE_URL}/drive/${driveFileId}?${params.toString()}`;
  return downloadTo(url, filename, onProgress);
}
