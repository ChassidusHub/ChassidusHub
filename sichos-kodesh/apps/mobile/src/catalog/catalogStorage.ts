import RNBlobUtil from 'react-native-blob-util';
import { parseCatalogRelease } from '@sichos-kodesh/catalog';
import type { CatalogRelease } from '@sichos-kodesh/catalog';

/**
 * Where a fetched catalog release lives between launches: one JSON file in
 * the app's own documents directory, beside the downloaded recordings and
 * PDFs (the web keeps its copy in Cache Storage - see the web's
 * catalogStorage.ts). Written to a `.part` path first and moved into place
 * only once complete, so an interrupted write can never leave a truncated
 * file that the next launch would try to parse. One file only: the newest
 * release replaces the previous one.
 */
const CATALOG_FILENAME = 'catalog-release.json';

function catalogPath(): string {
  return `${RNBlobUtil.fs.dirs.DocumentDir}/${CATALOG_FILENAME}`;
}

export async function readStoredCatalog(): Promise<CatalogRelease | null> {
  try {
    const path = catalogPath();
    if (!(await RNBlobUtil.fs.exists(path))) return null;
    const raw = await RNBlobUtil.fs.readFile(path, 'utf8');
    return parseCatalogRelease(JSON.parse(String(raw)));
  } catch {
    return null;
  }
}

export async function writeStoredCatalog(release: CatalogRelease): Promise<void> {
  try {
    const path = catalogPath();
    const tempPath = `${path}.part`;
    await RNBlobUtil.fs.writeFile(tempPath, JSON.stringify(release), 'utf8');
    if (await RNBlobUtil.fs.exists(path)) await RNBlobUtil.fs.unlink(path);
    await RNBlobUtil.fs.mv(tempPath, path);
  } catch {
    // Best-effort persistence only - the release still applies for this session.
  }
}
