import { HDate } from '@hebcal/core';

export function currentHebrewYear(): number {
  return new HDate().getFullYear();
}
