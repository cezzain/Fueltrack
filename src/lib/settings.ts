import { DEFAULT_SETTINGS, type Settings } from '../types';

const KEY = 'fueltrack.settings.v1';
const UPDATED_KEY = 'fueltrack.settings.updatedAt.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Epoch ms the settings last changed — drives last-write-wins across devices. */
export function loadSettingsUpdatedAt(): number {
  const raw = localStorage.getItem(UPDATED_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Persist settings and their change time. Pass `updatedAt` when applying a
 * synced-in copy (so the remote's timestamp is preserved); omit it for a local
 * edit to stamp "now".
 */
export function saveSettings(settings: Settings, updatedAt: number = Date.now()): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
  localStorage.setItem(UPDATED_KEY, String(updatedAt));
}
