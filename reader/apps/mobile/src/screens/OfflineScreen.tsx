import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronUp, FileDown, FolderInput, FolderOpen, Inbox, RefreshCw, Share2 } from 'lucide-react-native';
import { mafteiachMonthName, mafteiachMonthNameHebrew, mafteiachMonthToken } from '@chassidushub-reader/catalog';
import { useDownload } from '../download/useDownload';
import type { DownloadedOccasionSummary } from '../download/downloadStorage';
import { useTranslation } from '../i18n/useTranslation';
import type { Language } from '../i18n/translations';
import type { OfflineScreenProps } from '../navigation/types';
import {
  chooseOfflineFolder,
  displayNameOfUri,
  exportToFolder,
  forgetOfflineFolder,
  getOfflineFolder,
  importPickedFiles,
  importPickedFolder,
  scanImportFolder,
  useOfflineStatus,
  writeStateNow,
} from '../offline/offlineJobs';
import { getPacksNative } from '../offline/packsNative';
import { offlineActivityLine, offlineActivityPercent, offlineReportLine } from '../offline/reportText';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Spinner } from '../ui/Spinner';
import { AppText } from '../ui/Text';
import { TabHelp } from '../ui/Typography';
import { SettingRow, SettingsGroup } from '../ui/settings/SettingsControls';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';
import { hebrewYearLabel } from '../utils/formatHebrewDate';

export interface DownloadedYear {
  hebrewYear: number;
  occasions: number;
  /** mafteiach month token -> occasions with something on the phone. */
  months: Array<{ token: string; occasions: number }>;
}

/** What "Share a month or a year" offers: only periods with something on the phone, oldest first. */
export function groupDownloadedByYear(summaries: DownloadedOccasionSummary[]): DownloadedYear[] {
  const years = new Map<number, Map<string, number>>();
  for (const { entry } of summaries) {
    const months = years.get(entry.hebrewYear) ?? new Map<string, number>();
    const token = mafteiachMonthToken(entry.hebrewDate);
    months.set(token, (months.get(token) ?? 0) + 1);
    years.set(entry.hebrewYear, months);
  }
  return [...years.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hebrewYear, months]) => ({
      hebrewYear,
      occasions: [...months.values()].reduce((sum, n) => sum + n, 0),
      months: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([token, occasions]) => ({ token, occasions })),
    }));
}

function monthLabel(hebrewYear: number, token: string, language: Language): string {
  const probe = `${hebrewYear}-${token}-01`;
  return `${language === 'he' ? mafteiachMonthNameHebrew(probe) : mafteiachMonthName(probe)} ${hebrewYearLabel(hebrewYear, language)}`;
}

/**
 * Settings > Offline packs (docs/offline-plan.md WP4): the shared folder,
 * importing packs, shared ZIPs and folders, and sharing a month or a year
 * as one ZIP. Every job runs in the background, one at a time; the line at
 * the top says what runs now, and "Recent" what the last jobs did.
 */
export function OfflineScreen(_props: OfflineScreenProps) {
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const status = useOfflineStatus();
  const { listDownloadedSummaries, downloadedRecords } = useDownload();
  const [years, setYears] = useState<DownloadedYear[]>([]);
  const [openYear, setOpenYear] = useState<number | null>(null);
  const available = getPacksNative() !== null;
  const busy = status.activity !== null;
  const folder = status.folder;

  useEffect(() => {
    getOfflineFolder().catch(() => undefined);
  }, []);

  useEffect(() => {
    listDownloadedSummaries()
      .then((summaries) => setYears(groupDownloadedByYear(summaries)))
      .catch(() => setYears([]));
  }, [listDownloadedSummaries, downloadedRecords, status.filesVersion]);

  const percent = status.activity ? offlineActivityPercent(status.activity) : null;
  const activityLine = status.activity ? offlineActivityLine(t, status.activity) : null;
  const icon = useMemo(() => ({ size: 18, color: colors.muted }), [colors.muted]);

  /** A tap while a job runs would only queue behind it; the rows wait instead. */
  const whenIdle = (action: () => unknown) =>
    busy
      ? undefined
      : () => {
          Promise.resolve(action()).catch(() => undefined);
        };

  return (
    <Screen header={<ScreenHeader back={{ name: 'Settings', params: undefined }} title={t.offlinePacksTitle} />}>
      <TabHelp>{t.offlineIntro}</TabHelp>

      {!available ? (
        <TabHelp>{t.offlineErrorUnavailable}</TabHelp>
      ) : (
        <>
          {activityLine && (
            <View style={[styles.activity, { backgroundColor: colors.cardBg, flexDirection: row(isRtl) }]} accessibilityLiveRegion="polite">
              {percent !== null && <View style={[styles.fill, { backgroundColor: colors.accent, width: `${percent}%` }, isRtl ? styles.fillRtl : styles.fillLtr]} />}
              <Spinner size={16} color={colors.accent} />
              <AppText style={[styles.activityText, { color: colors.fg }]}>{activityLine}</AppText>
            </View>
          )}

          <SettingsGroup title={t.offlineFolderSection} help={t.offlineFolderHelp} first>
            <SettingRow label={t.offlineFolderLabel} value={folder ? displayNameOfUri(folder) : t.offlineFolderNone} onPress={whenIdle(chooseOfflineFolder)} first>
              <FolderOpen {...icon} />
            </SettingRow>
            {folder && (
              <SettingRow label={t.offlineStateLabel} help={t.offlineStateHelp} onPress={whenIdle(writeStateNow)}>
                <RefreshCw {...icon} />
              </SettingRow>
            )}
            {folder && <SettingRow label={t.offlineFolderForget} danger onPress={whenIdle(forgetOfflineFolder)} />}
          </SettingsGroup>

          <SettingsGroup title={t.offlineImportSection}>
            <SettingRow label={t.offlineImportFiles} help={t.offlineImportFilesHelp} onPress={whenIdle(importPickedFiles)} first>
              <FileDown {...icon} />
            </SettingRow>
            <SettingRow label={t.offlineImportFolder} help={t.offlineImportFolderHelp} onPress={whenIdle(importPickedFolder)}>
              <FolderInput {...icon} />
            </SettingRow>
            {folder && (
              <SettingRow label={t.offlineScanNow} help={t.offlineScanHelp} onPress={whenIdle(() => scanImportFolder({ force: true }))}>
                <Inbox {...icon} />
              </SettingRow>
            )}
          </SettingsGroup>

          <SettingsGroup title={t.offlineShareSection} help={t.offlineShareHelp}>
            {!folder ? (
              <SettingRow label={t.offlineShareNeedsFolder} onPress={whenIdle(chooseOfflineFolder)} first>
                <FolderOpen {...icon} />
              </SettingRow>
            ) : years.length === 0 ? (
              <SettingRow label={t.offlineShareNothing} first />
            ) : (
              years.map((year, index) => {
                const open = openYear === year.hebrewYear;
                const yearName = hebrewYearLabel(year.hebrewYear, language);
                return (
                  <React.Fragment key={year.hebrewYear}>
                    <SettingRow label={yearName} value={t.offlineOccasionsCount(year.occasions)} onPress={() => setOpenYear(open ? null : year.hebrewYear)} first={index === 0}>
                      {open ? <ChevronUp {...icon} /> : <ChevronDown {...icon} />}
                    </SettingRow>
                    {open && (
                      <>
                        <SettingRow label={`${t.offlineShareYear} · ${yearName}`} value={t.offlineOccasionsCount(year.occasions)} onPress={whenIdle(() => exportToFolder({ hebrewYear: year.hebrewYear }, yearName))}>
                          <Share2 {...icon} />
                        </SettingRow>
                        {year.months.map((month) => {
                          const name = monthLabel(year.hebrewYear, month.token, language);
                          return (
                            <SettingRow key={month.token} label={name} value={t.offlineOccasionsCount(month.occasions)} onPress={whenIdle(() => exportToFolder({ hebrewYear: year.hebrewYear, month: month.token }, name))}>
                              <Share2 {...icon} />
                            </SettingRow>
                          );
                        })}
                      </>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </SettingsGroup>

          {status.reports.length > 0 && (
            <SettingsGroup title={t.offlineRecentSection}>
              {status.reports.map((report, index) => (
                <SettingRow
                  key={`${report.at}-${index}`}
                  label={offlineReportLine(t, language, report)}
                  help={report.kind === 'shared' && report.untrusted ? t.offlineReportUntrusted : undefined}
                  danger={report.kind === 'error'}
                  first={index === 0}
                />
              ))}
            </SettingsGroup>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  activity: { alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, marginBottom: 12, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, opacity: 0.18 },
  fillLtr: { left: 0 },
  fillRtl: { right: 0 },
  activityText: { flex: 1, fontSize: 14, fontWeight: '600' },
});
