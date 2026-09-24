/**
 * Resolves an ashreinu.app player link (already crawled into this
 * package's `links` table, section 'audio') to the actual playable audio
 * file(s) it points to, via JEM's own "ccdb" API.
 *
 * `GET {CCDB_BASE}/event/{id}` returns the event's full metadata tree,
 * including any `audio_recordings[].assets[].uri` — direct, public
 * CloudFront URLs (`https://dtgj2yu3gmlic.cloudfront.net/<name>.mp3`), no
 * auth token required. The route needs the *singular* `event/{id}`
 * segment — the plural `events/{id}` returns API Gateway's generic
 * "Missing Authentication Token" response, which despite the name just
 * means no route matches this path, not that authentication is required.
 *
 * A farbrengen is usually several separate ccdb events under one parent
 * (one per sicha, plus a maamar), each with its own recording. The
 * ashreinu.app player link crawled into `links` always points at one
 * *specific* sub-event (e.g. the first sicha), not the parent, so
 * resolving from that leaf id alone only finds that one recording.
 * `extractAshreinuParentEventId` pulls the parent id the same URL always
 * also encodes, and `resolveJemAudio` walks its whole sub_events tree.
 */

const CCDB_BASE = 'https://5qlaecnhel.execute-api.us-east-1.amazonaws.com/prod/ashreinu/api/v1';

export interface JemAudioAsset {
  url: string;
  fileFormat: string;
}

export interface JemAudioRecording {
  /** The ccdb event id (sub-event, e.g. one sicha) this recording belongs to - may differ from the eventId originally looked up if that id had children. */
  eventId: number;
  /** ccdb's own name for this recording/sub-event, e.g. "Sicha 1", "Sicha 2", "Ma'amar". Null on the rare event with an audio_recording but no name. */
  chapterName: string | null;
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
  name?: string;
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

/**
 * Extracts the ccdb *leaf* event id from an ashreinu.app player URL, e.g.
 * ".../player/parentEvent~1_event~2" -> 2, or
 * "/player?parentEvent=75&event=76" -> 76 (both shapes occur in the
 * crawled dataset and must be handled). This is the *specific* (usually
 * leaf/sicha-level) event id the crawled link points to, not the parent
 * farbrengen - see `extractAshreinuParentEventId`, which is what
 * `bin/resolveJemAudio.ts` actually resolves from.
 */
export function extractAshreinuEventId(playerUrl: string): number | null {
  const match = /event[~=](\d+)/.exec(playerUrl);
  return match ? Number(match[1]) : null;
}

/**
 * Extracts the ccdb *parent* (farbrengen-level) event id from an
 * ashreinu.app player URL - present alongside the leaf id in every player
 * URL, e.g. "parentEvent~1_event~2" -> 1. Resolving audio from this id,
 * not the leaf, is what surfaces every sicha of a farbrengen, not just
 * the one the crawled link happens to point to. When there's no separate
 * parent (a single-sicha farbrengen), `parentEvent === event` and
 * resolving from either id gives the same one recording.
 */
export function extractAshreinuParentEventId(playerUrl: string): number | null {
  const match = /parentEvent[~=](\d+)/.exec(playerUrl);
  return match ? Number(match[1]) : null;
}

/**
 * A parent event's own `audio_recordings` field is a rolled-up aggregate
 * of everything nested under it, not content that belongs to the parent
 * itself. Walking the tree naively would double-count, so recordings are
 * deduplicated by their ccdb id regardless of which node they're attached
 * to, and `eventId` on the result is the id of the *first* (most
 * specific/deepest, since traversal is depth-first) node a given
 * recording is found on.
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
        chapterName: recording.name ?? null,
        durationMs: recording.duration,
        assets: recording.assets.map((a) => ({ url: a.uri, fileFormat: a.file_format })),
      });
    }
  };
  visit(event);
  return results;
}

/** ccdb answered with an error status; `status` 404 means the event id no longer exists. */
export class CcdbHttpError extends Error {
  constructor(
    readonly eventId: number,
    readonly status: number,
  ) {
    super(`ccdb event/${eventId} failed: HTTP ${status}`);
    this.name = 'CcdbHttpError';
  }
}

/**
 * Fetches `event/{eventId}` and returns every audio recording found at
 * that event or nested under it, in the order ccdb's own `sub_events`
 * array lists them (that order is already the intended chapter/playback
 * order). Call this with the *parent* (farbrengen) event id, not a
 * specific leaf/sicha id, or only that one sicha's recording comes back -
 * see `extractAshreinuParentEventId`.
 */
export async function resolveJemAudio(eventId: number, fetchImpl: typeof fetch = fetch): Promise<JemAudioRecording[]> {
  const response = await fetchImpl(`${CCDB_BASE}/event/${eventId}`);
  if (!response.ok) {
    throw new CcdbHttpError(eventId, response.status);
  }
  const body = (await response.json()) as CcdbEventResponse;
  return collectAudioRecordings(body.data);
}
