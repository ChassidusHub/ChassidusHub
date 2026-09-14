import { HDate, getSedra } from '@hebcal/core';

export interface CurrentParsha {
  /** This week's parsha (two entries for a doubled reading), or null when a holiday displaces the weekly reading. */
  parsha: string[] | null;
  /** The Shabbos this parsha is read on - not necessarily today. */
  gregorianDate: string;
}

/**
 * The parsha for the upcoming (or, on a Shabbos, today's) Shabbos - what
 * the home screen shows next to today's date. `Sedra.lookup` already
 * handles a weekday correctly (returns the coming Shabbos's reading) and
 * a year-end date correctly (transparently rolls into next year's
 * schedule), so this is a thin wrapper, not a reimplementation.
 */
export function currentParsha(il: boolean, today: Date = new Date()): CurrentParsha {
  const hdate = new HDate(today);
  const result = getSedra(hdate.getFullYear(), il).lookup(hdate);
  return {
    parsha: result.chag ? null : result.parsha,
    gregorianDate: result.hdate.greg().toISOString().slice(0, 10),
  };
}
