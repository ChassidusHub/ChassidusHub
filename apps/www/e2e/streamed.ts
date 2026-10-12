import { expect, type Page } from '@playwright/test';

/**
 * Waits until every part of the page that streamed in after its frame is
 * shown. React holds a part that has come in a hidden copy at the end of the
 * page, and shows it a moment later; until then a locator finds it twice.
 */
export async function shown(page: Page) {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}
