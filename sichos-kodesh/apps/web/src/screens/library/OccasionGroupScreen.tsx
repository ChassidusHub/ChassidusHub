import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { occasionGroupEntries, occasionGroupName, occasionTitle } from '@sichos-kodesh/app-core';
import { useCatalog, useLibrary } from '../../catalog/catalogStore';
import { OccasionRowIcon } from '../../components/OccasionRowIcon';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTranslation } from '../../i18n/useLanguage';
import { useProgressMap } from '../../player/useProgressMap';
import { hebrewDayMonthLabel, hebrewYearLabel } from '../../utils/formatHebrewDate';
import { LibraryLoading } from './LibraryLoading';

interface Props {
  axis: 'moadim' | 'parshiyos';
  slug: string;
}

/** Every farbrengen mafteiach lists for one moed or parsha, year by year. */
export function OccasionGroupScreen({ axis, slug }: Props) {
  const library = useLibrary();
  const catalog = useCatalog();
  const progressMap = useProgressMap();
  const { t, language } = useTranslation();
  const group = library ? (axis === 'moadim' ? library.moadim : library.parshiyos).find((g) => g.slug === slug) : undefined;
  const entries = useMemo(() => (group ? occasionGroupEntries(catalog, group) : []), [catalog, group]);

  const byYear: Array<{ year: number; entries: CatalogEntry[] }> = [];
  for (const entry of entries) {
    const last = byYear[byYear.length - 1];
    if (last && last.year === entry.hebrewYear) last.entries.push(entry);
    else byYear.push({ year: entry.hebrewYear, entries: [entry] });
  }

  return (
    <div className="screen">
      <ScreenHeader to={`/library/${axis}`} title={group ? occasionGroupName(group, language) : ''} />
      {!library && <LibraryLoading />}
      {group && <p className="subtitle">{t.occasionsIndexed(entries.length)}</p>}
      {byYear.map(({ year, entries: yearEntries }) => (
        <Fragment key={year}>
          <h2 className="category-header">{hebrewYearLabel(year, language)}</h2>
          <ul className="year-list library-list">
            {yearEntries.map((entry) => (
              <li key={entry.occasionId}>
                <Link className="year-row" to={`/browse/${entry.hebrewYear}/${entry.occasionId}`}>
                  <span className="year-row-year">{occasionTitle(entry, language)}</span>
                  <span className="year-row-trailing">
                    <OccasionRowIcon entry={entry} progressMap={progressMap} dateSlot={<span className="year-row-distance">{hebrewDayMonthLabel(entry.hebrewDate, language)}</span>} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
    </div>
  );
}
