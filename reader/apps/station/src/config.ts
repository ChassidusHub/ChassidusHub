import type { TrustedKeys } from '@chassidushub-reader/pack-format';
import { parseScope, parseSections } from '@chassidushub-reader/pack-format';

/**
 * What a station keeps ready (`<mirror>/station.json`). Scopes, sections
 * and profile read exactly as in `sk-pack build` and the pack API
 * (pack-format's parseScope and parseSections), because the station asks
 * the API for the same builds the download site offers.
 */

export const STATION_SCHEMA_VERSION = 1 as const;

export interface StationConfig {
  schema: typeof STATION_SCHEMA_VERSION;
  /** The pack API's base URL: services/pack-api, or `sk-pack serve`. */
  api: string;
  /** Each a pack-API scope: a Hebrew year (`5736`) or a year and mafteiach month (`5736-01`). */
  scopes: string[];
  /** `essentials`, `everything`, or a list (`audio,mugah`). */
  sections: string;
  profile: string;
  /** The largest pack file, in MB; a larger scope comes as several parts. */
  maxMb: number;
  /** Keys trusted besides the app's own `TRUSTED_PACK_KEYS` (keyId -> public key). */
  trust: TrustedKeys;
  /**
   * Keep packs whose signature does not verify (every hash is still checked).
   * Only for an API run with `--unsigned`: the phone then takes such a pack
   * as loose files, not as a signed pack.
   */
  acceptUnsigned: boolean;
  /** Space left free on a phone beyond what the copy and its import take. */
  phoneReserveMb: number;
}

export const DEFAULT_CONFIG: Omit<StationConfig, 'api'> = {
  schema: STATION_SCHEMA_VERSION,
  scopes: [],
  sections: 'essentials',
  profile: 'src',
  maxMb: 200,
  trust: {},
  acceptUnsigned: false,
  phoneReserveMb: 500,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Problems with a config, as sentences; empty when it is usable. */
export function configProblems(config: StationConfig): string[] {
  const problems: string[] = [];
  try {
    new URL(config.api);
  } catch {
    problems.push(`api "${config.api}" is not a URL`);
  }
  const check = (read: () => unknown) => {
    try {
      read();
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  };
  for (const scope of config.scopes) check(() => parseScope(scope));
  check(() => parseSections(config.sections));
  if (!Number.isFinite(config.maxMb) || config.maxMb < 1) problems.push('maxMb must be at least 1');
  if (!Number.isFinite(config.phoneReserveMb) || config.phoneReserveMb < 0) problems.push('phoneReserveMb must not be negative');
  return problems;
}

/** Reads station.json over the defaults; null when the file is not a station config. */
export function parseStationConfig(value: unknown): StationConfig | null {
  if (!isRecord(value) || value.schema !== STATION_SCHEMA_VERSION || typeof value.api !== 'string') return null;
  const config: StationConfig = { ...DEFAULT_CONFIG, api: value.api };
  if (Array.isArray(value.scopes) && value.scopes.every((s) => typeof s === 'string')) config.scopes = value.scopes as string[];
  if (typeof value.sections === 'string') config.sections = value.sections;
  if (typeof value.profile === 'string') config.profile = value.profile;
  if (typeof value.maxMb === 'number') config.maxMb = value.maxMb;
  if (isRecord(value.trust) && Object.values(value.trust).every((k) => typeof k === 'string')) config.trust = value.trust as TrustedKeys;
  if (typeof value.acceptUnsigned === 'boolean') config.acceptUnsigned = value.acceptUnsigned;
  if (typeof value.phoneReserveMb === 'number') config.phoneReserveMb = value.phoneReserveMb;
  return config;
}

/** The query every size and build request carries for one scope (the download site's `selectionQuery`). */
export function scopeQuery(config: StationConfig, scope: string): string {
  return new URLSearchParams({ scope, profile: config.profile, sections: config.sections, maxMb: String(config.maxMb) }).toString();
}

/** `--trust keyId=publicKey` pairs. Only the first '=' separates: a base64 key ends in '=' padding. */
export function parseTrustPairs(pairs: string[]): TrustedKeys {
  const trusted: TrustedKeys = {};
  for (const pair of pairs) {
    const at = pair.indexOf('=');
    const keyId = at > 0 ? pair.slice(0, at) : '';
    const publicKey = at > 0 ? pair.slice(at + 1) : '';
    if (!keyId || !publicKey) throw new Error(`--trust ${pair}: expected keyId=publicKey`);
    trusted[keyId] = publicKey;
  }
  return trusted;
}
