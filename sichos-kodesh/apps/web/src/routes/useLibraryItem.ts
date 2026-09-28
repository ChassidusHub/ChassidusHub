import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import type { CatalogEntry, CatalogPdf, LibraryCollectionId, LibraryItemBase } from '@sichos-kodesh/catalog';
import { LIBRARY_COLLECTION_IDS } from '@sichos-kodesh/catalog';
import { findItem, itemAudio, itemPdfLabel, itemPdfs, itemSubtitle, playlistOccasionId } from '@sichos-kodesh/app-core';
import { useLibrary } from '../catalog/catalogStore';
import { useTranslation } from '../i18n/useLanguage';
import { libraryCollectionPath, libraryItemPath } from './links';
import type { ResolvedEntry } from './useResolvedEntry';

export interface LibraryItemRoute {
  collection: LibraryCollectionId;
  item: LibraryItemBase;
  /**
   * The item as the occasion screens take one: its recordings and documents
   * under an id no catalog occasion has (playlistOccasionId), so the web's
   * own chapter list and PDF viewer serve library items too, with their
   * progress kept like a farbrengen's.
   */
  resolved: ResolvedEntry;
}

/** The library item a `/l/:collection/:id` address names: undefined while the library loads, null when there is no such item. */
export function useLibraryItem(): LibraryItemRoute | null | undefined {
  const params = useParams<{ collection: string; id: string }>();
  const library = useLibrary();
  const { t, language } = useTranslation();
  return useMemo(() => {
    const collection = params.collection as LibraryCollectionId;
    if (!(LIBRARY_COLLECTION_IDS as readonly string[]).includes(collection) || !params.id) return null;
    if (!library) return undefined;
    const item = findItem(library, collection, params.id);
    if (!item) return null;
    const pdfs: CatalogPdf[] = itemPdfs(item).map((ref) => ({
      // The section only groups a farbrengen's documents; the viewer reads the label and file.
      section: 'mugah',
      label: itemPdfLabel(ref, t.pdfRoleNames, t.libraryDocuments, language),
      driveFileId: ref.sourceId,
      ...(ref.resourceKey ? { resourceKey: ref.resourceKey } : {}),
    }));
    const entry: CatalogEntry = {
      occasionId: playlistOccasionId(collection, item),
      hebrewYear: item.hebrewYear ?? 0,
      hebrewDate: item.hebrewDate ?? '',
      // Named in both languages where the catalog has both (see itemPlaylistEntry).
      occasionLabel: item.labelHe ?? item.label,
      ...(item.labelHe ? { occasionLabelEn: item.label } : item.labelEn ? { occasionLabelEn: item.labelEn } : {}),
      audio: itemAudio(item),
      pdfs,
    };
    return { collection, item, resolved: { entry, subtitle: itemSubtitle(collection, item, language), basePath: libraryItemPath(collection, item.id), backPath: libraryCollectionPath(collection) } };
  }, [library, params.collection, params.id, t, language]);
}
