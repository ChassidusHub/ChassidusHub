import { BookOpen, Feather, GraduationCap, Headphones, Mail, NotebookPen, ScrollText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { LibraryCollectionId } from '@sichos-kodesh/catalog';

/** Each library collection's icon, on the home page's tiles and the seforim browser's (the phone's `ui/collectionIcons.ts`). */
export const COLLECTION_ICONS: Record<LibraryCollectionId, LucideIcon> = {
  likkuteiSichos: BookOpen,
  maamorim: ScrollText,
  michtavimKlolim: Mail,
  reshimos: NotebookPen,
  hadranim: GraduationCap,
  yomanim: Feather,
  jemEvents: Headphones,
};
