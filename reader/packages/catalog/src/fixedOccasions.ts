import { HDate, months } from '@hebcal/core';
import type { FixedOccasionDef } from '@chassidushub-reader/kvius-engine';

/**
 * A small starter set of the best-known fixed-date farbrengen occasions -
 * deliberately not exhaustive (the full list, e.g. every Yom Tov and Rosh
 * Chodesh, is future work) so Screen 2 isn't limited to Shabbos-only
 * occasions for the thin MVP: several of the most iconic farbrengens
 * (Yud-Tes Kislev, Yud Shevat, Purim...) fall on weekdays as often as not.
 */
export const STARTER_FIXED_OCCASIONS: FixedOccasionDef[] = [
  { key: 'yud-tes-kislev', label: "Yud-Tes Kislev", day: 19, month: months.KISLEV },
  { key: 'yud-shevat', label: 'Yud Shevat', day: 10, month: months.SHVAT },
  {
    key: 'purim',
    label: 'Purim',
    day: 14,
    month: (year) => (HDate.isLeapYear(year) ? months.ADAR_II : months.ADAR_I),
  },
  { key: 'lag-baomer', label: "Lag BaOmer", day: 18, month: months.IYYAR },
  { key: 'yud-beis-tammuz', label: "Yud-Beis Tammuz", day: 12, month: months.TAMUZ },
  { key: 'chai-elul', label: 'Chai Elul', day: 18, month: months.ELUL },
  // Diaspora date (23 Tishrei) - the app is Diaspora-only for this pass.
  { key: 'simchas-torah', label: 'Simchas Torah', day: 23, month: months.TISHREI },
];
