import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { getWorkContents, useWorks } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { SeforimSearchScreenProps } from '../../navigation/types';
import { getPacksNative } from '../../offline/packsNative';
import { names } from '../../seforim/seforimModel';
import { heldSearchIndexes, searchNames, searchTexts, type TextHit } from '../../seforim/seforimSearch';
import { Row } from '../../ui/Row';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Spinner } from '../../ui/Spinner';
import { AppText } from '../../ui/Text';
import { CategoryHeader, TabHelp } from '../../ui/Typography';
import { FONT_FAMILY, useColors } from '../../ui/theme';
import { textAlign } from '../../ui/rtl';

/** Waits for the typing to settle before searching the text. */
const TEXT_SEARCH_DELAY_MS = 350;

/**
 * Search the seforim: names (works and chapters) in every sefer, and the
 * text in each sefer whose pack is on the phone - offline, through its
 * search index.
 */
export function SeforimSearchScreen({ navigation }: SeforimSearchScreenProps) {
  const works = useWorks();
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [packs, setPacks] = useState<number | null>(null);
  const [textHits, setTextHits] = useState<TextHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const nameHits = useMemo(() => (query.trim().length >= 2 ? searchNames(works, getWorkContents, query) : []), [works, query]);

  useEffect(() => {
    heldSearchIndexes()
      .then((indexes) => setPacks(indexes.size))
      .catch(() => setPacks(0));
  }, []);

  useEffect(() => {
    const native = getPacksNative();
    if (!native || !packs || query.trim().length < 2) {
      setTextHits(null);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      searchTexts(native, works, getWorkContents, query)
        .then((hits) => alive && setTextHits(hits))
        .catch(() => alive && setTextHits([]))
        .finally(() => alive && setSearching(false));
    }, TEXT_SEARCH_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, packs, works]);

  const label = (hit: { work: { title: { he: string; en: string } }; unit?: { label: string; labelEn?: string } }) =>
    hit.unit ? `${names(hit.work.title, language)} · ${language === 'en' ? (hit.unit.labelEn ?? hit.unit.label) : hit.unit.label}` : names(hit.work.title, language);
  const typed = query.trim().length >= 2;

  return (
    <Screen header={<ScreenHeader back={{ name: 'Seforim', params: undefined }} title={t.seforimSearchTitle} />}>
      <TabHelp>{packs === 0 ? t.seforimSearchNoPacks : t.seforimSearchHelp}</TabHelp>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t.seforimSearchPlaceholder}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t.seforimSearchPlaceholder}
        returnKeyType="search"
        autoFocus
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.cardBg, color: colors.fg, textAlign: textAlign(isRtl) }]}
      />

      {typed && (textHits !== null || searching) && (
        <>
          <CategoryHeader first>{t.seforimSearchText}</CategoryHeader>
          {searching && textHits === null && <Spinner size={18} color={colors.accent} />}
          {textHits?.map((hit) => (
            <Row key={`${hit.work.id}/${hit.unit.id}@${hit.source}`} label={label(hit)} onPress={() => navigation.navigate('Reader', { workId: hit.work.id, unitId: hit.unit.id, source: hit.source })}>
              {hit.snippet && (
                <AppText numberOfLines={3} style={[styles.snippet, { color: colors.muted }]}>
                  {hit.snippet}
                </AppText>
              )}
            </Row>
          ))}
          {textHits?.length === 0 && !searching && <AppText style={[styles.none, { color: colors.muted }]}>{t.seforimSearchNothing}</AppText>}
        </>
      )}

      {typed && (
        <>
          <CategoryHeader first={textHits === null && !searching}>{t.seforimSearchNames}</CategoryHeader>
          {nameHits.map((hit) => (
            <Row
              key={hit.unit ? `${hit.work.id}/${hit.unit.id}` : hit.work.id}
              label={label(hit)}
              onPress={() => (hit.unit ? navigation.navigate('Reader', { workId: hit.work.id, unitId: hit.unit.id }) : navigation.navigate('Work', { workId: hit.work.id }))}
            />
          ))}
          {nameHits.length === 0 && <AppText style={[styles.none, { color: colors.muted }]}>{t.seforimSearchNothing}</AppText>}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { paddingVertical: 12, paddingHorizontal: 14, marginBottom: 16, borderWidth: 1, borderRadius: 10, fontSize: 16, fontFamily: FONT_FAMILY },
  snippet: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  none: { fontSize: 15, marginVertical: 8 },
});
