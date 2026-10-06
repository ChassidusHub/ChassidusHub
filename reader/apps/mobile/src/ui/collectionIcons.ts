import { BookOpen, Feather, GraduationCap, Headphones, Mail, NotebookPen, ScrollText } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { LibraryCollectionId } from '@chassidushub-reader/catalog';

/** Each library collection's icon, on the home screen's tiles and the seforim browser's (web: `components/collectionIcons.ts`). */
export const COLLECTION_ICONS: Record<LibraryCollectionId, LucideIcon> = {
  likkuteiSichos: BookOpen,
  maamorim: ScrollText,
  michtavimKlolim: Mail,
  reshimos: NotebookPen,
  hadranim: GraduationCap,
  yomanim: Feather,
  jemEvents: Headphones,
};
