import type { CcdbEvent, JemAudioRecordingRow, JemEventNode } from './types.js';

/**
 * Flattens one event tree into every node (the top-level event and all
 * descendants) plus every genuinely distinct audio recording.
 *
 * A parent node's own `audio_recordings` field is a rolled-up aggregate
 * of everything nested under it - confirmed against real data (see
 * packages/mafteiach-index/src/jemAudio.ts): the same recording ids
 * appear again at the parent level as at each leaf. Recordings are
 * deduplicated by ccdb id regardless of which node they're attached to;
 * `eventId` on the result is the most specific (deepest) node a given
 * recording was found on, found via depth-first traversal.
 */
export function flattenEventTree(root: CcdbEvent): { nodes: JemEventNode[]; recordings: JemAudioRecordingRow[] } {
  const nodes: JemEventNode[] = [];
  const recordings: JemAudioRecordingRow[] = [];
  const seenRecordingIds = new Set<number>();

  const visit = (event: CcdbEvent): void => {
    for (const sub of event.sub_events ?? []) visit(sub);

    let hasOwnAudio = false;
    for (const recording of event.audio_recordings ?? []) {
      if (seenRecordingIds.has(recording.id)) continue;
      seenRecordingIds.add(recording.id);
      hasOwnAudio = true;
      for (const asset of recording.assets) {
        recordings.push({
          eventId: event.id,
          ccdbRecordingId: recording.id,
          name: recording.name,
          durationMs: recording.duration,
          url: asset.uri,
          fileFormat: asset.file_format,
        });
      }
    }

    nodes.push({
      id: event.id,
      parentId: event.parent_id,
      name: event.name,
      type: event.type,
      hasLongDescription: event.has_long_description,
      hasTranscript: event.has_transcript ?? false,
      dates: event.dates,
      hasOwnAudio,
    });
  };

  visit(root);
  return { nodes, recordings };
}
