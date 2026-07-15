/**
 * Cross-device sync engine.
 *
 * Model: each device keeps its own IndexedDB. A shared cloud store (keyed by a
 * secret "sync code") holds one JSON snapshot. Merging is last-write-wins per
 * record — a meal edited on device A and a different meal added on device B
 * both survive — with deletion tombstones so a delete propagates instead of
 * the record resurfacing. Photos are intentionally not synced (they'd bloat
 * the payload); a meal's numbers, name, and notes all travel, just not its
 * image. This mirrors the existing JSON export.
 */
import type {
  CachedInsights,
  DayFlags,
  Meal,
  Settings,
  SyncSnapshot,
  Tombstone,
} from '../types';
import { DEVICE_LOCAL_SETTINGS } from '../types';
import { applyMergedData, getSyncableData } from './db';

/** Records with no recorded timestamp (e.g. pre-sync/seed data) sort oldest. */
const ts = (n: number | undefined): number => n ?? 0;

/** Tombstones older than this are pruned so the snapshot can't grow forever. */
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// ---- pure merge helpers (no I/O — unit-testable) ----

/** Newest tombstone deletedAt per record key across both snapshots. */
function mergeTombstones(a: Tombstone[], b: Tombstone[]): Map<string, Tombstone> {
  const map = new Map<string, Tombstone>();
  for (const t of [...a, ...b]) {
    const prev = map.get(t.key);
    if (!prev || t.deletedAt > prev.deletedAt) map.set(t.key, t);
  }
  return map;
}

function mergeMeals(a: Meal[], b: Meal[], tombstones: Map<string, Tombstone>): Meal[] {
  const byId = new Map<string, Meal>();
  for (const m of [...a, ...b]) {
    const prev = byId.get(m.id);
    if (!prev || ts(m.updatedAt) >= ts(prev.updatedAt)) byId.set(m.id, m);
  }
  const out: Meal[] = [];
  for (const m of byId.values()) {
    const tomb = tombstones.get(`meals:${m.id}`);
    // A delete only wins if it happened at/after the record's last edit —
    // re-adding a meal after deleting it keeps the re-add.
    if (tomb && tomb.deletedAt >= ts(m.updatedAt)) continue;
    out.push(m);
  }
  return out.sort((x, y) => x.loggedAt - y.loggedAt);
}

function mergeDays(a: DayFlags[], b: DayFlags[]): DayFlags[] {
  const byKey = new Map<string, DayFlags>();
  for (const d of [...a, ...b]) {
    const prev = byKey.get(d.dateKey);
    if (!prev || ts(d.updatedAt) >= ts(prev.updatedAt)) byKey.set(d.dateKey, d);
  }
  return [...byKey.values()];
}

function mergeInsights(
  a: (CachedInsights & { id: string }) | null,
  b: (CachedInsights & { id: string }) | null,
): (CachedInsights & { id: string }) | null {
  if (!a) return b;
  if (!b) return a;
  return a.generatedAt >= b.generatedAt ? a : b;
}

/**
 * Merge two snapshots into one authoritative snapshot. `pushedAt` and the
 * settings timestamp take the max of both sides. Deterministic and pure.
 */
export function mergeSnapshots(local: SyncSnapshot, remote: SyncSnapshot): SyncSnapshot {
  const now = Math.max(local.pushedAt, remote.pushedAt);
  const tombMap = mergeTombstones(local.tombstones, remote.tombstones);
  const tombstones = [...tombMap.values()].filter((t) => now - t.deletedAt < TOMBSTONE_TTL_MS);

  const settingsUpdatedAt = Math.max(local.settingsUpdatedAt, remote.settingsUpdatedAt);
  const settings =
    local.settingsUpdatedAt >= remote.settingsUpdatedAt ? local.settings : remote.settings;

  return {
    v: 1,
    meals: mergeMeals(local.meals, remote.meals, tombMap),
    days: mergeDays(local.days, remote.days),
    insights: mergeInsights(local.insights, remote.insights),
    tombstones,
    settings,
    settingsUpdatedAt,
    pushedAt: now,
  };
}

/** Only the settings fields that should travel between devices. */
export function syncableSettings(settings: Settings): Settings {
  const clone = { ...settings };
  for (const k of DEVICE_LOCAL_SETTINGS) {
    // Blanked so a synced-in snapshot never overwrites device-local fields.
    (clone as Record<string, unknown>)[k] = k === 'syncEnabled' ? false : '';
  }
  return clone;
}

// ---- snapshot build / apply (I/O) ----

export async function buildSnapshot(
  settings: Settings,
  settingsUpdatedAt: number,
): Promise<SyncSnapshot> {
  const { meals, days, insights, tombstones } = await getSyncableData();
  return {
    v: 1,
    meals,
    days,
    insights,
    tombstones,
    settings: syncableSettings(settings),
    settingsUpdatedAt,
    pushedAt: Date.now(),
  };
}

/** Write a merged snapshot's meals/days/insights/tombstones back into IndexedDB. */
export async function applySnapshot(snapshot: SyncSnapshot): Promise<void> {
  await applyMergedData({
    meals: snapshot.meals,
    days: snapshot.days,
    insights: snapshot.insights,
    tombstones: snapshot.tombstones,
  });
}

// ---- transport ----

/** SHA-256 hex of the sync code — used as the (non-reversible) cloud store name. */
export async function namespaceFor(syncCode: string): Promise<string> {
  const bytes = new TextEncoder().encode(`fueltrack:${syncCode.trim()}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncError';
  }
}

const ENDPOINT = '/api/sync';

/** Fetch the remote snapshot, or null if the store is empty (first push). */
export async function pullSnapshot(syncCode: string): Promise<SyncSnapshot | null> {
  const ns = await namespaceFor(syncCode);
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?ns=${ns}`, { method: 'GET' });
  } catch {
    throw new SyncError('Could not reach the sync server — check your connection.');
  }
  if (res.status === 404) return null;
  if (res.status === 503) {
    throw new SyncError('Sync is not configured on the server yet (no storage connected).');
  }
  if (!res.ok) throw new SyncError(`Sync server error (${res.status}).`);
  const body = (await res.json()) as { snapshot?: SyncSnapshot | null };
  return body.snapshot ?? null;
}

export async function pushSnapshot(syncCode: string, snapshot: SyncSnapshot): Promise<void> {
  const ns = await namespaceFor(syncCode);
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?ns=${ns}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot }),
    });
  } catch {
    throw new SyncError('Could not reach the sync server — check your connection.');
  }
  if (res.status === 503) {
    throw new SyncError('Sync is not configured on the server yet (no storage connected).');
  }
  if (res.status === 413) {
    throw new SyncError('Too much data to sync in one request.');
  }
  if (!res.ok) throw new SyncError(`Sync server error (${res.status}).`);
}

export interface SyncResult {
  /** Settings the merge decided are authoritative (may differ from local). */
  settings: Settings | null;
  settingsUpdatedAt: number;
  pushedAt: number;
}

/**
 * Full round-trip: pull remote, merge with local, write the merge back to
 * IndexedDB, and push the merged snapshot so peers converge. Returns the
 * merged settings so the caller can update its in-memory settings if the
 * remote had a newer copy.
 */
export async function syncNow(
  settings: Settings,
  settingsUpdatedAt: number,
): Promise<SyncResult> {
  const code = settings.syncCode.trim();
  if (!code) throw new SyncError('Set a sync code first.');

  const local = await buildSnapshot(settings, settingsUpdatedAt);
  const remote = await pullSnapshot(code);
  const merged = remote ? mergeSnapshots(local, remote) : local;

  await applySnapshot(merged);
  await pushSnapshot(code, merged);

  return {
    settings: merged.settings,
    settingsUpdatedAt: merged.settingsUpdatedAt,
    pushedAt: merged.pushedAt,
  };
}
