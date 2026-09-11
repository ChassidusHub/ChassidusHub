/**
 * Resolves an ashreinu.app player link (already crawled into this
 * package's `links` table, section 'audio') to the actual playable audio
 * file(s) it points to, via JEM's own "ccdb" API.
 *
 * Confirmed live and unauthenticated (private-project feasibility check,
 * not a published API): `GET {CCDB_BASE}/event/{id}` returns the event's
 * full metadata tree, including any `audio_recordings[].assets[].uri` —
 * direct, public CloudFront URLs (`https://dtgj2yu3gmlic.cloudfront.net/
 * <name>.mp3`), no auth token required. The route needs the *singular*
 * `event/{id}` segment — the plural `events/{id}` (consistent with the
 * collection-query form `events?year=...&has=audio`) returns API
 * Gateway's generic "Missing Authentication Token" response, which is
 * actually just its way of saying "no route matches this path," not an
 * auth requirement — a real trap for assuming auth is needed when it
 * isn't.
 *
 * This is JEM's private, undocumented backend, not a published
 * third-party API — see docs/PLANNING.md and services/media-proxy's
 * README for the reasoning on why this is being used for private,
 * pre-launch development now, with a real conversation with JEM planned
 * before this ships to anyone else.
 */

const CCDB_BASE = 'https://5qlaecnhel.execute-api.us-east-1.amazonaws.com/prod/ashreinu/api/v1';

export interface JemAudioAsset {
  url: string;
  fileFormat: string;
}

export interface JemAudioRecording {
  /** The ccdb event id (sub-event, e.g. one sicha) this recording belongs to - may differ from the eventId originally looked up if that id had children. */
  eventId: number;
  durationMs: number;
  assets: JemAudioAsset[];
}

interface CcdbAsset {
  id: number;
  uri: string;
  file_format: string;
}

interface CcdbAudioRecording {
  id: number;
  duration: number;
  assets: CcdbAsset[];
}

interface CcdbEvent {
  id: number;
  audio_recordings?: CcdbAudioRecording[];
  sub_events?: CcdbEvent[];
}

interface CcdbEventResponse {
  data: CcdbEvent;
}

/** Extracts the ccdb event id from an ashreinu.app player URL, e.g. ".../player/parentEvent~1_event~2" -> 2. This is the specific (usually leaf/sicha-level) event id, not the parent farbrengen. */
export function extractAshreinuEventId(playerUrl: string): number | null {
  const match = /event~(\d+)(?:$|[?&#])/.exec(playerUrl) ?? /event~(\d+)/.exec(playerUrl);
  return match ? Number(match[1]) : null;
}

/**
 * A parent event's own `audio_recordings` field is a rolled-up aggregate
 * of everything nested under it (confirmed against the real fixture: a
 * farbrengen with 4 sub-events, one recording each, lists the exact same
 * 4 recording ids again at the top level) - not content that belongs to
 * the parent itself. Walking the tree naively double-counts, so
 * recordings are deduplicated by their ccdb id regardless of which node
 * they're attached to, and `eventId` on the result is the id of the
 * *first* (most specific/deepest, since traversal is depth-first)
 * node a given recording is found on.
 */
function collectAudioRecordings(event: CcdbEvent): JemAudioRecording[] {
  const results: JemAudioRecording[] = [];
  const seenRecordingIds = new Set<number>();
  const visit = (e: CcdbEvent): void => {
    for (const sub of e.sub_events ?? []) visit(sub);
    for (const recording of e.audio_recordings ?? []) {
      if (seenRecordingIds.has(recording.id)) continue;
      seenRecordingIds.add(recording.id);
      results.push({
        eventId: e.id,
        durationMs: recording.duration,
        assets: recording.assets.map((a) => ({ url: a.uri, fileFormat: a.file_format })),
      });
    }
  };
  visit(event);
  return results;
}

/**
 * Fetches `event/{eventId}` and returns every audio recording found at
 * that event or nested under it (a farbrengen's audio usually lives on
 * its per-sicha sub-events, not the top-level event, but this resolves
 * either a leaf id or a parent id the same way).
 */
export async function resolveJemAudio(eventId: number, fetchImpl: typeof fetch = fetch): Promise<JemAudioRecording[]> {
  const response = await fetchImpl(`${CCDB_BASE}/event/${eventId}`);
  if (!response.ok) {
    throw new Error(`ccdb event/${eventId} failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as CcdbEventResponse;
  return collectAudioRecordings(body.data);
}
