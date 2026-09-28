import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ChevronLeft, ChevronRight, Mails, MessageSquareText, UserRound } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { LibraryCollectionId } from '@sichos-kodesh/catalog';
import type { LibraryShelfEntry } from '@sichos-kodesh/app-core';
import { authorShelf, libraryShelf, libraryShelfKey, names, scanCount } from '@sichos-kodesh/app-core';
import { useOnlineMode } from '../../appMode/appMode';
import { useLibrary, useShelf, useWorks } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { LibraryScreenProps } from '../../navigation/types';
import { COLLECTION_ICONS } from '../../ui/collectionIcons';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { AppText } from '../../ui/Text';
import { CategoryHeader } from '../../ui/Typography';
import { FONT_FAMILY, useColors } from '../../ui/theme';
import { row, textAlign, typedIsRtl } from '../../ui/rtl';

/** What was written and recorded around the Rebbe's Torah: on the shelf after it, under a heading of its own. */
const AROUND: ReadonlySet<LibraryCollectionId> = new Set(['yomanim', 'jemEvents']);

/** The Rebbe's own seforim with a place of their own on the shelf. */
const WORK_ICONS: Readonly<Record<string, LucideIcon>> = { 'igros-kodesh-rebbe': Mails, maanos: MessageSquareText };
const WORK_BLURBS: Readonly<Record<string, 'igros' | 'maanos'>> = { 'igros-kodesh-rebbe': 'igros', maanos: 'maanos' };

interface ShelfRowProps {
  icon: LucideIcon;
  name: string;
  blurb?: string;
  count?: number;
  first: boolean;
  onPress: () => void;
}

/** One place on the shelf (web: `.shelf-row`): its icon, its name and what it holds in a few words, and how many. */
function ShelfRow({ icon: Icon, name, blurb, count, first, onPress }: ShelfRowProps) {
  const { isRtl } = useTranslation();
  const colors = useColors();
  const Chevron = isRtl ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[name, blurb, count !== undefined ? String(count) : null].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.row, { flexDirection: row(isRtl) }, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.cardHover }]}
    >
      <View style={[styles.well, { backgroundColor: colors.accentSoft }]}>
        <Icon size={20} color={colors.accent} />
      </View>
      <View style={styles.text}>
        <AppText numberOfLines={2} style={[styles.name, { color: colors.fg, textAlign: textAlign(isRtl) }]}>
          {name}
        </AppText>
        {blurb ? (
          <AppText numberOfLines={2} style={[styles.blurb, { color: colors.muted, textAlign: textAlign(isRtl) }]}>
            {blurb}
          </AppText>
        ) : null}
      </View>
      {count !== undefined && <AppText style={[styles.count, { color: colors.muted }]}>{count}</AppText>}
      <Chevron size={18} color={colors.muted} />
    </Pressable>
  );
}

function ShelfList({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return <View style={[styles.list, { backgroundColor: colors.cardBg }]}>{children}</View>;
}

/**
 * The library (web: LibraryScreen; docs: the UI/UX redo plan, "הספרייה")
 * as one shelf, in the order pack.sk uses (app-core's `libraryShelf`): the
 * Rebbe's Torah first - Likkutei Sichos, the maamorim, Igros Kodesh, the
 * michtavim, reshimos and hadranim - then the yomanim and JEM's recordings
 * around it, then the seforim of the Rebbeim, one row per Rebbe. Offline
 * mode leaves out what only opens on another site. The box above it
 * searches all of them at once.
 */
export function LibraryScreen({ navigation }: LibraryScreenProps) {
  const library = useLibrary();
  const works = useWorks();
  const scans = useShelf();
  const onlineMode = useOnlineMode();
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const [query, setQuery] = useState('');
  const shelf = libraryShelf(library, works, { offline: !onlineMode });
  const torah = shelf.filter((entry) => entry.kind === 'work' || (entry.kind === 'collection' && !AROUND.has(entry.collection)));
  const around = shelf.filter((entry) => entry.kind === 'collection' && AROUND.has(entry.collection));
  const seforim = shelf.find((entry): entry is Extract<LibraryShelfEntry, { kind: 'seforim' }> => entry.kind === 'seforim');
  // Every Rebbe with seforim here, or - online - with books on HebrewBooks alone, in the registry's order; then the seforim of many hands.
  const rebbeim = [...works.authors.map((author) => author.id), null]
    .map((authorId) => ({ authorId, author: works.authors.find((a) => a.id === authorId) ?? null, count: seforim?.sections.find((s) => (s.author?.id ?? null) === authorId)?.works.length ?? 0 }))
    .filter(({ authorId, count }) => count > 0 || (onlineMode && scanCount(authorShelf(scans, authorId)) > 0));

  const shelfRow = (entry: LibraryShelfEntry, index: number) => {
    if (entry.kind === 'collection') {
      const { collection } = entry;
      return (
        <ShelfRow
          key={libraryShelfKey(entry)}
          first={index === 0}
          icon={COLLECTION_ICONS[collection]}
          name={t.collectionNames[collection]}
          blurb={t.homeBlurbs[collection]}
          count={entry.count}
          onPress={() => navigation.navigate('LibraryCollection', { collection })}
        />
      );
    }
    if (entry.kind === 'work') {
      const { work } = entry;
      const blurb = WORK_BLURBS[work.id];
      return (
        <ShelfRow
          key={libraryShelfKey(entry)}
          first={index === 0}
          icon={WORK_ICONS[work.id] ?? Mails}
          name={names(work.title, language)}
          blurb={blurb ? t.homeBlurbs[blurb] : undefined}
          onPress={() => navigation.navigate('Work', { workId: work.id })}
        />
      );
    }
    return null;
  };

  return (
    <Screen header={<ScreenHeader title={t.tabNames.library} />}>
      {/* The library's own search: every part of it, and none of the farbrengens (SearchScreen's `library` scope). */}
      <TextInput
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => {
          navigation.navigate('Search', { scope: 'library', query: query.trim() });
          setQuery('');
        }}
        placeholder={t.searchLibraryEverythingPlaceholder}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t.searchLibraryEverythingPlaceholder}
        returnKeyType="search"
        style={[styles.search, { borderColor: colors.border, backgroundColor: colors.cardBg, color: colors.fg, textAlign: textAlign(typedIsRtl(query, isRtl)) }]}
      />
      {torah.length > 0 && (
        <>
          <CategoryHeader first>{t.libraryShelfTorah}</CategoryHeader>
          <ShelfList>{torah.map(shelfRow)}</ShelfList>
        </>
      )}
      {around.length > 0 && (
        <>
          <CategoryHeader>{t.libraryShelfAround}</CategoryHeader>
          <ShelfList>{around.map(shelfRow)}</ShelfList>
        </>
      )}
      {rebbeim.length > 0 && (
        <>
          <CategoryHeader>{t.seforimRow}</CategoryHeader>
          <ShelfList>
            {rebbeim.map(({ authorId, author, count }, index) => (
              <ShelfRow
                key={authorId ?? 'others'}
                first={index === 0}
                icon={UserRound}
                name={author ? names(author.name, language) : t.seforimOtherAuthors}
                count={count > 0 ? count : undefined}
                onPress={() => navigation.navigate('Rebbe', { authorId })}
              />
            ))}
          </ShelfList>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** Web: `.shelf-search` - the search box above the shelf. */
  search: { paddingVertical: 12, paddingHorizontal: 14, marginBottom: 4, borderWidth: 1, borderRadius: 10, fontSize: 16, fontFamily: FONT_FAMILY },
  /** Web: `.shelf-list` - one card, rows divided by hairlines. */
  list: { borderRadius: 14, overflow: 'hidden' },
  /** Web: `.shelf-row`. */
  row: { alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 12, paddingHorizontal: 14 },
  well: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  blurb: { fontSize: 13, lineHeight: 18 },
  count: { fontSize: 13, fontVariant: ['tabular-nums'], flexShrink: 0 },
});
