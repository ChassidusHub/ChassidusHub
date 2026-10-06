import type { AudioProfile } from './manifest.js';
import { AUDIO_PROFILES, isSha256 } from './manifest.js';

/**
 * What a phone writes for the station after every import
 * (`SichosKodesh/state/have.json`, `device.json`). The station reads both
 * over USB, computes the delta with `computeDelta`, and copies only what
 * is missing. No server ever sees these.
 */

export const HAVE_SCHEMA_VERSION = 1 as const;

export interface HaveFile {
  schema: typeof HAVE_SCHEMA_VERSION;
  appVersion: string;
  catalogVersion: string;
  profiles: AudioProfile[];
  writtenAt: string;
  objects: string[];
}

export interface DeviceFile {
  schema: typeof HAVE_SCHEMA_VERSION;
  model: string;
  androidVersion: string;
  appVersion: string;
  freeBytes: number;
  lastImportAt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseHaveFile(value: unknown): HaveFile | null {
  if (!isRecord(value) || value.schema !== HAVE_SCHEMA_VERSION) return null;
  const { appVersion, catalogVersion, profiles, writtenAt, objects } = value;
  if (typeof appVersion !== 'string' || typeof catalogVersion !== 'string' || typeof writtenAt !== 'string') return null;
  if (!Array.isArray(profiles) || !profiles.every((p) => typeof p === 'string' && (AUDIO_PROFILES as readonly string[]).includes(p))) return null;
  if (!Array.isArray(objects) || !objects.every(isSha256)) return null;
  return { schema: HAVE_SCHEMA_VERSION, appVersion, catalogVersion, profiles: profiles as AudioProfile[], writtenAt, objects: objects as string[] };
}

export function parseDeviceFile(value: unknown): DeviceFile | null {
  if (!isRecord(value) || value.schema !== HAVE_SCHEMA_VERSION) return null;
  const { model, androidVersion, appVersion, freeBytes, lastImportAt } = value;
  if (typeof model !== 'string' || typeof androidVersion !== 'string' || typeof appVersion !== 'string') return null;
  if (typeof freeBytes !== 'number' || !Number.isFinite(freeBytes) || freeBytes < 0) return null;
  if (lastImportAt !== undefined && typeof lastImportAt !== 'string') return null;
  const device: DeviceFile = { schema: HAVE_SCHEMA_VERSION, model, androidVersion, appVersion, freeBytes };
  if (lastImportAt !== undefined) device.lastImportAt = lastImportAt;
  return device;
}
