import { PoliteFetcher } from './httpClient.js';
import type { CcdbEvent, CcdbEventListEntry } from './types.js';

/**
 * JEM's private "ccdb" API behind ashreinu.app, unauthenticated. Covers
 * the three endpoints needed to build a full independent index:
 *
 * - `years?has=audio` - every Hebrew year with at least one audio recording
 * - `events?year=Y&has=audio` - every top-level event in that year with audio
 * - `event/{id}` (singular!) - one event's full tree, including
 *   `sub_events` and `audio_recordings` at every level
 *
 * The plural `events/{id}` returns API Gateway's generic "Missing
 * Authentication Token" error, which despite the name just means no route
 * matches that path, not that authentication is required.
 */
const CCDB_BASE = 'https://5qlaecnhel.execute-api.us-east-1.amazonaws.com/prod/ashreinu/api/v1';

export class CcdbClient {
  constructor(private readonly fetcher: PoliteFetcher) {}

  async getYearsWithAudio(): Promise<number[]> {
    const { data } = await this.fetcher.fetchJson<{ data: number[] }>(`${CCDB_BASE}/years?has=audio`);
    return data;
  }

  async getEventsForYear(hebrewYear: number): Promise<CcdbEventListEntry[]> {
    const { data } = await this.fetcher.fetchJson<{ data: CcdbEventListEntry[] }>(
      `${CCDB_BASE}/events?year=${hebrewYear}&has=audio`,
    );
    return data;
  }

  async getEventTree(eventId: number): Promise<CcdbEvent> {
    const { data } = await this.fetcher.fetchJson<{ data: CcdbEvent }>(`${CCDB_BASE}/event/${eventId}`);
    return data;
  }
}
