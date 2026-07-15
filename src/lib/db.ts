import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CachedInsights, DayFlags, DaySummary, Meal } from '../types';

interface FuelTrackDB extends DBSchema {
  meals: {
    key: string;
    value: Meal;
    indexes: { 'by-date': string };
  };
  days: {
    key: string;
    value: DayFlags;
  };
  photos: {
    key: string;
    value: { id: string; dataUrl: string };
  };
  insights: {
    key: string; // fixed key 'weekly'
    value: CachedInsights & { id: string };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

let dbPromise: Promise<IDBPDatabase<FuelTrackDB>> | null = null;

function db(): Promise<IDBPDatabase<FuelTrackDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FuelTrackDB>('fueltrack', 1, {
      upgrade(database) {
        const meals = database.createObjectStore('meals', { keyPath: 'id' });
        meals.createIndex('by-date', 'dateKey');
        database.createObjectStore('days', { keyPath: 'dateKey' });
        database.createObjectStore('photos', { keyPath: 'id' });
        database.createObjectStore('insights', { keyPath: 'id' });
        database.createObjectStore('meta', { keyPath: 'key' });
      },
    });
    // Don't memoize a rejection: iOS WebKit can transiently drop the IDB
    // connection (backgrounding, storage pressure) — let the next call retry.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

// ---- meals ----

export async function getMealsForDate(dateKey: string): Promise<Meal[]> {
  const meals = await (await db()).getAllFromIndex('meals', 'by-date', dateKey);
  return meals.sort((a, b) => a.loggedAt - b.loggedAt);
}

export async function getMealsInRange(dateKeys: string[]): Promise<Map<string, Meal[]>> {
  const database = await db();
  const result = new Map<string, Meal[]>();
  await Promise.all(
    dateKeys.map(async (key) => {
      const meals = await database.getAllFromIndex('meals', 'by-date', key);
      result.set(key, meals.sort((a, b) => a.loggedAt - b.loggedAt));
    }),
  );
  return result;
}

export async function putMeal(meal: Meal): Promise<void> {
  await (await db()).put('meals', meal);
}

export async function deleteMeal(id: string): Promise<void> {
  const database = await db();
  const meal = await database.get('meals', id);
  await database.delete('meals', id);
  if (meal?.photoId) await database.delete('photos', meal.photoId);
}

// ---- day flags ----

export async function getDayFlags(dateKey: string): Promise<DayFlags> {
  const flags = await (await db()).get('days', dateKey);
  return flags ?? { dateKey, lightDay: false };
}

/** Batch light-day lookup — used to compute weekly compensation. */
export async function getLightDayFlags(dateKeys: string[]): Promise<Map<string, boolean>> {
  const database = await db();
  const rows = await Promise.all(dateKeys.map((k) => database.get('days', k)));
  const map = new Map<string, boolean>();
  dateKeys.forEach((k, i) => map.set(k, rows[i]?.lightDay ?? false));
  return map;
}

export async function setLightDay(dateKey: string, lightDay: boolean): Promise<void> {
  await (await db()).put('days', { dateKey, lightDay });
}

// ---- photos ----

export async function savePhoto(id: string, dataUrl: string): Promise<void> {
  await (await db()).put('photos', { id, dataUrl });
}

export async function deletePhoto(id: string): Promise<void> {
  await (await db()).delete('photos', id);
}

export async function getPhoto(id: string): Promise<string | undefined> {
  return (await (await db()).get('photos', id))?.dataUrl;
}

// ---- insights cache ----

export async function getCachedInsights(): Promise<CachedInsights | undefined> {
  return (await db()).get('insights', 'weekly');
}

export async function saveCachedInsights(cached: CachedInsights): Promise<void> {
  await (await db()).put('insights', { ...cached, id: 'weekly' });
}

// ---- meta ----

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await (await db()).get('meta', key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', { key, value });
}

/**
 * Atomically seed first-run data: the guard check, meal writes, day flags,
 * and the guard write all happen in ONE readwrite transaction, so concurrent
 * invocations (StrictMode double-mount, two tabs) can't double-seed and a
 * killed tab can't leave a half-seeded store behind.
 * Returns false if the guard was already set.
 */
export async function seedOnce(
  guardKey: string,
  meals: Meal[],
  dayFlags: DayFlags[],
): Promise<boolean> {
  const database = await db();
  const tx = database.transaction(['meals', 'days', 'meta'], 'readwrite');
  const existing = await tx.objectStore('meta').get(guardKey);
  if (existing) {
    await tx.done;
    return false;
  }
  const mealStore = tx.objectStore('meals');
  const dayStore = tx.objectStore('days');
  for (const meal of meals) void mealStore.put(meal);
  for (const flags of dayFlags) void dayStore.put(flags);
  void tx.objectStore('meta').put({ key: guardKey, value: true });
  await tx.done;
  return true;
}

// ---- summaries ----

export async function getDaySummary(dateKey: string): Promise<DaySummary> {
  const [meals, flags] = await Promise.all([getMealsForDate(dateKey), getDayFlags(dateKey)]);
  return summarize(dateKey, meals, flags.lightDay);
}

export async function getDaySummaries(dateKeys: string[]): Promise<DaySummary[]> {
  const database = await db();
  const byDate = await getMealsInRange(dateKeys);
  const flags = await Promise.all(dateKeys.map((k) => database.get('days', k)));
  return dateKeys.map((key, i) => summarize(key, byDate.get(key) ?? [], flags[i]?.lightDay ?? false));
}

function summarize(dateKey: string, meals: Meal[], lightDay: boolean): DaySummary {
  return {
    dateKey,
    meals,
    lightDay,
    mealCount: meals.length,
    protein_g: Math.round(meals.reduce((sum, m) => sum + m.protein_g, 0)),
    calories: Math.round(meals.reduce((sum, m) => sum + m.calories, 0)),
  };
}

/** Export everything (except photos, which would bloat the file) as a JSON blob. */
export async function exportAllData(): Promise<string> {
  const database = await db();
  const [meals, days, insights] = await Promise.all([
    database.getAll('meals'),
    database.getAll('days'),
    database.getAll('insights'),
  ]);
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: 'FuelTrack',
      meals: meals.sort((a, b) => a.loggedAt - b.loggedAt),
      days,
      insights,
    },
    null,
    2,
  );
}
