import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Download } from 'lucide-react-native';
import type { CatalogWork, CatalogWorkContents } from '@sichos-kodesh/catalog';
import { useTranslation } from '../../i18n/useTranslation';
import { useOnlineStatus } from '../../network/useOnlineStatus';
import { getPacksNative } from '../../offline/packsNative';
import { useSavedSeforim } from '../../seforim/savedStore';
import { cancelSave, removeSavedSefer, saveBytes, saveParts, saveSefer, useSaveJobs } from '../../seforim/saveSefer';
import { heldSearchIndexes } from '../../seforim/seforimSearch';
import { Button } from '../../ui/Button';
import { AppText } from '../../ui/Text';
import { TabHelp } from '../../ui/Typography';
import { useColors } from '../../ui/theme';
import { alignStart, row } from '../../ui/rtl';
import { formatBytes } from '../../utils/formatBytes';

function TextAction({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) {
  const colors = useColors();
  const { isRtl } = useTranslation();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.action, { alignSelf: alignStart(isRtl) }]}>
      <AppText style={[styles.actionText, { color: danger ? colors.danger : colors.accent }]}>{label}</AppText>
    </Pressable>
  );
}

/** "Remove from this phone", asked once more before anything is deleted - as Settings asks before clearing downloads. */
function RemoveAction({ workId }: { workId: string }) {
  const { t, isRtl } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <TextAction label={t.workRemoveSaved} onPress={() => setConfirming(true)} />;
  return (
    <View>
      <TabHelp>{t.workRemoveSavedConfirm}</TabHelp>
      <View style={[styles.confirm, { flexDirection: row(isRtl) }]}>
        <TextAction
          label={t.confirmDeleteLabel}
          danger
          onPress={() => {
            setConfirming(false);
            removeSavedSefer(workId).catch(() => undefined);
          }}
        />
        <TextAction label={t.cancelLabel} onPress={() => setConfirming(false)} />
      </View>
    </View>
  );
}

/**
 * Whether a sefer is on the phone, and the way to put it there: saving it
 * from Sefaria (saveSefer.ts), with its progress, a stop, a continue after
 * a stop, and a removal. A sefer whose text pack was imported just says so.
 */
export function SaveSeferPanel({ work, contents }: { work: CatalogWork; contents: CatalogWorkContents }) {
  const { t } = useTranslation();
  const colors = useColors();
  const online = useOnlineStatus();
  const saved = useSavedSeforim().seforim[work.id];
  const job = useSaveJobs()[work.id];
  const [fromPack, setFromPack] = useState<boolean | null>(null);
  const native = getPacksNative();

  useEffect(() => {
    let alive = true;
    heldSearchIndexes()
      .then((indexes) => alive && setFromPack(indexes.has(work.id) && !indexes.get(work.id)!.startsWith('indexes/saved_')))
      .catch(() => alive && setFromPack(false));
    return () => {
      alive = false;
    };
  }, [work.id, saved?.index]);

  if (fromPack === null) return null;
  if (fromPack) return <TabHelp>{t.workOnPhone}</TabHelp>;

  const start = () => {
    if (native) saveSefer(native, work, contents).catch(() => undefined);
  };

  if (job?.state === 'saving') {
    return (
      <View style={styles.block}>
        <TabHelp>{t.workSaving(job.done, job.total)}</TabHelp>
        <TextAction label={t.workSaveStop} onPress={() => cancelSave(work.id)} />
      </View>
    );
  }
  if (job?.state === 'indexing') return <TabHelp>{t.workIndexing}</TabHelp>;

  if (saved?.complete) {
    return (
      <View style={styles.block}>
        <TabHelp>{t.workSaved(formatBytes(saved.bytes))}</TabHelp>
        <RemoveAction workId={work.id} />
      </View>
    );
  }

  const stopped = job?.state === 'stopped' ? job : null;
  const reason = stopped?.problem === 'offline' ? t.workSaveOffline : stopped?.problem === 'unavailable' ? t.workSaveUnavailable : '';
  const partly = stopped ? `${t.workSaveStopped(stopped.done, stopped.total)} ${reason}`.trim() : saved ? t.workSaveStopped(saved.units, saveParts(work, contents).length) : null;
  const canSave = !!native && online;

  return (
    <View style={styles.block}>
      <TabHelp>{t.workReadOnline}</TabHelp>
      {partly ? <TabHelp>{partly}</TabHelp> : <TabHelp>{t.workSaveHelp(formatBytes(saveBytes(work, contents)))}</TabHelp>}
      {canSave ? <Button label={saved || stopped ? t.workSaveContinue : t.workSave} icon={<Download size={16} color={colors.accentFg} />} onPress={start} /> : native ? <TabHelp>{t.workSaveNeedsConnection}</TabHelp> : null}
      {(saved || stopped) && <RemoveAction workId={work.id} />}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 8 },
  action: { paddingVertical: 10 },
  actionText: { fontSize: 15, fontWeight: '700' },
  confirm: { gap: 24 },
});
