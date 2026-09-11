/**
 * JEM's "ccdb" API models everything as an `Event` tree: a top-level
 * Farbrengen (or other occasion type) has `sub_events` for its individual
 * sichos/maamarim, and audio recordings can attach at any level. This
 * package flattens that tree into one row per node (see `db.ts`) rather
 * than only keeping leaves, since the parent nodes carry the authoritative
 * date/name/type metadata even when they have no audio of their own.
 */

export interface CcdbDate {
  secular_year: number;
  secular_month: number;
  secular_day: number;
  hebrew_year: number;
  hebrew_month: number;
  hebrew_day: number;
  hebrew_month_name: string;
  after_nightfall: boolean;
}

export interface CcdbAsset {
  id: number;
  uri: string;
  file_format: string;
}

export interface CcdbAudioRecording {
  id: number;
  name: string;
  description: string;
  duration: number;
  restored: boolean;
  assets: CcdbAsset[];
}

export interface CcdbEvent {
  id: number;
  name: string;
  type: string;
  description: string;
  has_long_description: boolean;
  parent_id: number | null;
  dates: CcdbDate[];
  restored?: boolean;
  has_transcript?: boolean;
  audio_recordings?: CcdbAudioRecording[];
  audio_recordings_duration?: number;
  sub_events?: CcdbEvent[];
}

export interface CcdbEventListEntry {
  id: number;
  name: string;
  type: string;
  description: string;
  has_long_description: boolean;
  parent_id: number | null;
  dates: CcdbDate[];
  restored: boolean;
}

/** One flattened node from an event tree - a top-level event or any of its descendants. */
export interface JemEventNode {
  id: number;
  parentId: number | null;
  name: string;
  type: string;
  hasLongDescription: boolean;
  hasTranscript: boolean;
  dates: CcdbDate[];
  /** True only for nodes with their own (non-rolled-up) audio_recordings - see the dedup note in jemAudio.ts/crawl.ts. */
  hasOwnAudio: boolean;
}

export interface JemAudioRecordingRow {
  eventId: number;
  ccdbRecordingId: number;
  name: string;
  durationMs: number;
  url: string;
  fileFormat: string;
}
