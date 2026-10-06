import { translateOccasionLabel } from './occasionLabelEn.js';

/**
 * English names for mafteiach's moadim and parshiyos (the library's
 * `OccasionGroup`s). Most read as occasion labels do ("ר"ח כסלו" -> Rosh
 * Chodesh Kislev), so translateOccasionLabel names them. These are the ones
 * it does not read: a group name is a heading, not a dated label ("חג
 * השבועות", "כינוס צ"ה - פורים"). Keyed by mafteiach's slug, with spellings
 * from occasionDictionary.ts.
 */
export const GROUP_NAMES_EN: Readonly<Record<string, string>> = {
  rosh_hashanah: 'Rosh Hashanah',
  shabbos_teshuva: 'Shabbos Shuvah',
  rally_days_of_teshuva: 'Tzivos Hashem rally - Aseres Yemei Teshuvah',
  yom_kippur: 'Yom Kippur',
  erev_sukkos: 'Erev Sukkos',
  rally_sukkos: 'Tzivos Hashem rally - Chol Hamoed Sukkos',
  '7_cheshvan': '7 Cheshvan',
  '20_cheshvan': '20 Cheshvan',
  kinus_hashluchim: 'Kinus Hashluchim',
  rally_chanukah: 'Tzivos Hashem rally - Chanukah',
  chanukah_gelt: 'Chanukah gelt for the students',
  rally_15_shevat: "Tzivos Hashem rally - Tu B'Shevat",
  parshas_shekalim: 'Parshas Shekalim',
  rally_purim: 'Tzivos Hashem rally - Purim',
  parshas_zachor: 'Parshas Zachor',
  parshas_parah: 'Parshas Parah',
  parshas_hachodesh: 'Parshas Hachodesh',
  pesach: 'Pesach',
  rally_pesach: 'Tzivos Hashem rally - Chol Hamoed Pesach',
  yomim_acharonim_shel_pesach: 'The last days of Pesach',
  rc_yemei_hagbala: 'Rosh Chodesh Sivan - Yemei Hagbalah',
  rally_shavuos: 'Tzivos Hashem rally - Shavuos',
  shavuos: 'Shavuos',
  yechidus_shavuos: 'General yechidus - Shavuos',
  madrichos: 'To the graduates and the counselors',
  bein_hametzarim: 'Bein Hametzarim',
  shabbos_chazon: 'Shabbos Chazon',
  shabbos_nachamu: 'Shabbos Nachamu',
  rally_elul: 'Tzivos Hashem rally - Elul',
  pinchas: 'Pinchas',
};

/** A moed's or parsha's English name, or null when neither the table nor the occasion rules have one. */
export function groupNameEn(group: { slug: string; name: string }): string | null {
  const named = GROUP_NAMES_EN[group.slug] ?? translateOccasionLabel(group.name);
  return named ? named.charAt(0).toUpperCase() + named.slice(1) : null;
}
