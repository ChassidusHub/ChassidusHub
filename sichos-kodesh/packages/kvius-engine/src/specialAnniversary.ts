/**
 * Round numbers of years worth calling out as a "special anniversary" -
 * independent of kvius matching entirely (a full or partial kvius match
 * is about the *calendar* lining up; this is just year arithmetic, and
 * the two only coincide by coincidence). Not every round decade - 75 is
 * real, everyday usage ("75 years") the way 45/55/65/85/95 aren't, so this
 * is a curated list, not `n % 10 === 0`.
 */
export const SPECIAL_ANNIVERSARY_YEARS: readonly number[] = [40, 50, 60, 70, 75, 80, 90, 100];

/**
 * Whether `candidateYear` is a special-anniversary number of years before
 * `targetYear` - returns that number (e.g. 50) or null. `candidateYear`
 * itself isn't otherwise validated (a caller scanning real catalog years
 * only ever passes ones that exist; this is pure arithmetic either way).
 */
export function specialAnniversaryNumber(targetYear: number, candidateYear: number): number | null {
  const diff = targetYear - candidateYear;
  return SPECIAL_ANNIVERSARY_YEARS.includes(diff) ? diff : null;
}
