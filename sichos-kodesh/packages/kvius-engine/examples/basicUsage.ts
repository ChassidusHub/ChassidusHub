import { HDate } from '@hebcal/core';
import {
  MAX_HISTORICAL_YEAR,
  MIN_HISTORICAL_YEAR,
  buildMatchedSchedule,
  findMatchingYears,
  kviusCode,
  kviusSignature,
} from '../src/index.js';

const today = new HDate(new Date());
const targetYear = today.getFullYear();

console.log(`Today: ${today.render('en')} (Hebrew year ${targetYear})`);
console.log('Kvius signature:', kviusSignature(targetYear));
console.log('Kvius code:', kviusCode(targetYear));

// No range options: defaults to [MIN_HISTORICAL_YEAR, MAX_HISTORICAL_YEAR] -
// the real span of packages/mafteiach-index's crawled catalog - so this is
// exactly the candidate list the app's year picker actually shows.
const matches = findMatchingYears(targetYear);
console.log(`\n${matches.length} kvius-matched years in the real catalog (${MIN_HISTORICAL_YEAR}-${MAX_HISTORICAL_YEAR}):`);
console.log(matches.map((m) => m.hebrewYear).join(', '));

const sourceYear = matches[0]?.hebrewYear;
const fallbackYear = matches[1]?.hebrewYear;
if (sourceYear === undefined || fallbackYear === undefined) {
  console.log('\nFewer than two matching years found in range; skipping schedule demo.');
  process.exit(0);
}

// Toy in-memory "catalog": the chosen source year only has a recording for even
// weeks (simulating the Rebbe not farbrenging every Shabbos); the next-nearest
// kvius-matched year has full coverage, so odd weeks demonstrate the fallback path.
const hasRecording = (year: number, occasionKey: string) => {
  const weekIndex = Number(occasionKey.split(':')[1]);
  if (Number.isNaN(weekIndex)) return true; // fixed-date occasions: fully covered
  if (year === sourceYear) return weekIndex % 2 === 0;
  if (year === fallbackYear) return true;
  return false;
};

const schedule = buildMatchedSchedule(targetYear, sourceYear, {
  il: false,
  gapStrategy: 'nearestKviusYear',
  matchingYearsRange: { fromYear: MIN_HISTORICAL_YEAR, toYear: MAX_HISTORICAL_YEAR },
  hasRecording,
  fixedOccasions: [
    { key: 'yud-tes-kislev', label: 'Yud-Tes Kislev', day: 19, month: 9 },
    { key: 'yud-shevat', label: 'Yud Shevat', day: 10, month: 11 },
    { key: 'purim', label: 'Purim', day: 14, month: (y) => (HDate.isLeapYear(y) ? 13 : 12) },
    { key: 'gimmel-tammuz', label: 'Gimmel Tammuz', day: 3, month: 4 },
  ],
});

console.log(`\nFollowing along with ${sourceYear} for Hebrew year ${targetYear} (first 8 weeks):`);
for (const week of schedule.weekly.slice(0, 8)) {
  const what = week.parsha ? week.parsha.join('-') : week.holiday;
  console.log(
    `  week ${week.weekIndex} [${week.gregorianDate}] ${what} -> ${week.resolution.status} (${week.resolution.resolvedYear ?? 'GAP'})`,
  );
}

console.log('\nFixed-date occasions:');
for (const entry of schedule.fixedDate) {
  console.log(
    `  ${entry.label} [${entry.gregorianDate}] -> ${entry.resolution.status} (${entry.resolution.resolvedYear ?? 'GAP'})`,
  );
}
