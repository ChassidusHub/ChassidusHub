import AsyncStorage from '@react-native-async-storage/async-storage';
import { HDate } from '@hebcal/core';
import { currentParsha } from '@sichos-kodesh/catalog';
import { downloadTargetTitle, listDownloadTargets } from '@sichos-kodesh/app-core';
import type { DownloadTarget } from '@sichos-kodesh/app-core';
import { getLibrary } from '../catalog/catalogStore';
import { checkForCatalogUpdateIfDue, loadStoredCatalog } from '../catalog/catalogUpdater';
import { IL } from '../config';
import { hydrateAutoDownloadLedger, recordAutoDownload } from '../download/downloadLedger';
import { readStoredDownloadSettings } from '../download/downloadSettings';
import { enqueueNativeDownload } from '../download/downloadExecutor';
import { isTargetDownloaded } from '../download/downloadStorage';
import { autoSourceYears, resolveAutoDownloadEntries } from '../download/useAutoDownloadSync';
import { resolveLibraryAutoTargets } from '../library/libraryAutoDownload';
import { readStoredLanguage } from '../i18n/languageStorage';
import { STRINGS } from '../i18n/translations';
import { readStoredNotificationSettings } from '../settings/notificationSettings';
import { hebrewYearLabel, parshaLabel } from '../utils/formatHebrewDate';
import { areNotificationsEnabled, downloadedDeepLink, postNotification, thisWeekDeepLink } from './backgroundNative';

const LAST_WEEK_NOTIFIED_KEY = 'sichos-kodesh:last-week-notified';

export interface BackgroundSyncData {
  /** "periodic" from the scheduled worker, "manual" from "Download this week now". */
  reason?: string;
}

/** A stable name for the current Hebrew week: the date of its Shabbos. */
export function currentWeekKey(today: Date): string {
  const shabbos = new HDate(today).onOrAfter(6);
  return `${shabbos.getFullYear()}-${shabbos.getMonth()}-${shabbos.getDate()}`;
}

/**
 * The headless task behind the phone's background sync (registered in
 * index.js, started by android/.../background/BackgroundSyncWorker.kt with
 * no UI running). Two jobs, each gated by its own setting:
 *
 *  1. Once per Hebrew week, say which year lines up with the new week and
 *     how many farbrengens it has - a notification that opens This Week.
 *  2. Queue whatever this week's content (per the download settings) is
 *     still missing, through the same native downloader the in-app sync
 *     uses, so it is on the phone before the app is next opened. The last
 *     file to land posts the "ready offline" notice.
 *
 * "Download this week now" runs the same task with reason "manual", which
 * downloads regardless of whether the automatic sync is switched on.
 */
export async function runBackgroundSync(data?: BackgroundSyncData): Promise<void> {
  const today = new Date();
  // No UI has run in this process: the release a previous launch stored has
  // to be swapped in here too, or the week would resolve against the
  // bundled data. Then the same once-a-day catalog check the app runs on
  // launch - a phone that is rarely opened still gets a newer catalog.
  await loadStoredCatalog();
  await checkForCatalogUpdateIfDue();
  const [settings, notifications, language] = await Promise.all([readStoredDownloadSettings(), readStoredNotificationSettings(), readStoredLanguage()]);
  const t = STRINGS[language];
  const canNotify = await areNotificationsEnabled();

  if (notifications.newWeek && canNotify) {
    const weekKey = currentWeekKey(today);
    const lastNotified = await AsyncStorage.getItem(LAST_WEEK_NOTIFIED_KEY).catch(() => null);
    if (lastNotified !== weekKey) {
      // Same year/occasion resolution the download sync uses, always for the week.
      const entries = resolveAutoDownloadEntries({ ...settings, scope: 'week' }, today);
      const sourceYear = entries[0]?.hebrewYear;
      if (sourceYear != null && entries.length > 0) {
        // No parsha on a Yom Tov week - the body simply leaves it out.
        const parshaNames = currentParsha(IL, today).parsha;
        const parsha = parshaNames ? parshaLabel(parshaNames, language) : '';
        postNotification('newWeek', t.newWeekNotificationTitle, t.newWeekNotificationBody(hebrewYearLabel(sourceYear, language), entries.length, parsha), thisWeekDeepLink(sourceYear));
      }
      await AsyncStorage.setItem(LAST_WEEK_NOTIFIED_KEY, weekKey).catch(() => undefined);
    }
  }

  const shouldDownload = data?.reason === 'manual' || settings.autoDownloadEnabled;
  if (!shouldDownload) return;

  await hydrateAutoDownloadLedger();
  const entries = resolveAutoDownloadEntries(settings, today);
  // Phone only: the library collections the user asked to keep ready ride along, after the farbrengens.
  const targets = [...listDownloadTargets(entries, settings.contentTypes), ...resolveLibraryAutoTargets(getLibrary(), settings.libraryAutoDownload, autoSourceYears(settings), today)];
  const missing: DownloadTarget[] = [];
  for (const target of targets) {
    // The ledger is what auto-cleanup later consults - re-claim every file this run wants, downloaded already or not.
    recordAutoDownload(target.key, target.hebrewYear, target.occasionId);
    if (!(await isTargetDownloaded(target))) missing.push(target);
  }
  if (missing.length === 0) return;

  // Library files can have no year of their own (a Likkutei Sichos sicha); the notification names the year the sync follows.
  const sourceYear = entries[0]?.hebrewYear ?? autoSourceYears(settings)[0] ?? missing[0]!.hebrewYear;
  const notifyWhenDone =
    notifications.downloadsReady && canNotify
      ? { title: t.downloadsReadyTitle, body: t.downloadsReadyBody(missing.length, hebrewYearLabel(sourceYear, language)), deepLink: downloadedDeepLink() }
      : undefined;
  for (const target of missing) {
    const entry = entries.find((item) => item.hebrewYear === target.hebrewYear && item.occasionId === target.occasionId);
    const label = downloadTargetTitle(target, entry, language);
    await enqueueNativeDownload(target, { wifiOnly: settings.wifiOnly, auto: true, label, progressTitle: t.downloadingTitle, notifyWhenDone });
  }
}
