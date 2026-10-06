import type { Language } from '../i18n/translations';
import type { useTranslation } from '../i18n/useTranslation';
import { formatBytes } from '../utils/formatBytes';
import type { OfflineActivity, OfflineReport } from './offlineJobs';

type Translation = ReturnType<typeof useTranslation>['t'];

/** The one line an import, an export or a failure leaves behind: "תשרי תשל״ו: 31 קבצים נוספו (82.4 MB), 2 כבר היו". */
export function offlineReportLine(t: Translation, language: Language, report: OfflineReport): string {
  switch (report.kind) {
    case 'pack': {
      const label = (language === 'he' ? report.scope.label.he : report.scope.label.en) + (report.part ? t.offlineReportPart(report.part.index + 1, report.part.count) : '');
      const extras = [
        report.present ? t.offlineReportPresent(report.present) : null,
        report.unsupported ? t.offlineReportUnsupported(report.unsupported) : null,
        report.failed ? t.offlineReportFailed(report.failed) : null,
        report.catalogApplied ? t.offlineReportCatalog(report.catalogApplied) : null,
      ].filter(Boolean);
      return [t.offlineReportPack(label, report.added, formatBytes(report.addedBytes)), ...extras].join(', ');
    }
    case 'shared': {
      const extras = [
        report.present ? t.offlineReportPresent(report.present) : null,
        report.unrecognized ? t.offlineReportUnrecognized(report.unrecognized) : null,
        report.mismatched ? t.offlineReportMismatched(report.mismatched) : null,
        report.unsupported ? t.offlineReportUnsupported(report.unsupported) : null,
        report.failed ? t.offlineReportFailed(report.failed) : null,
      ].filter(Boolean);
      return [t.offlineReportShared(report.name, report.added), ...extras].join(', ');
    }
    case 'export':
      return t.offlineReportExport(report.fileName, report.files, formatBytes(report.bytes));
    case 'error':
      switch (report.code) {
        case 'no-space':
          return t.offlineErrorNoSpace(formatBytes(report.needed ?? 0), formatBytes(report.free ?? 0));
        case 'unavailable':
          return t.offlineErrorUnavailable;
        case 'no-folder':
          return t.offlineErrorNoFolder;
        case 'nothing-to-export':
          return t.offlineErrorNothing;
        default:
          return t.offlineErrorFailed(report.name);
      }
  }
}

/** The running job, one line, with a percentage once the native side knows the total. */
export function offlineActivityLine(t: Translation, activity: OfflineActivity): string {
  if (activity.kind === 'state') return t.offlineWritingState;
  const percent = activity.total > 0 ? Math.min(100, Math.round((activity.bytes / activity.total) * 100)) : null;
  return activity.kind === 'import' ? t.offlineImporting(activity.name, percent) : t.offlineExporting(activity.name, percent);
}

/** A 0-100 fill for the progress strip, or null while the total is unknown. */
export function offlineActivityPercent(activity: OfflineActivity): number | null {
  if (activity.kind === 'state' || activity.total <= 0) return null;
  return Math.min(100, Math.round((activity.bytes / activity.total) * 100));
}
