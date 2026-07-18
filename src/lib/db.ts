import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  CachedInsights,
  DayFlags,
  DaySummary,
  Habit,
  HabitCheck,
  Meal,
  Routine,
  Tombstone,
  TombstoneStore,
  WeightEntry,
  Workout,
} from '../types';

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
  tombstones: {
    key: string; // `${store}:${id}`
    value: Tombstone;
  };
  workouts: {
    key: string;
    value: Workout;
    indexes: { 'by-date': string };
  };
  routines: {
    key: string;
    value: Routine;
  };
  weights: {
    key: string; // dateKey — one weigh-in per day
    value: WeightEntry;
  };
  habits: {
    key: string;
    value: Habit;
  };
  habitChecks: {
    key: string; // `${habitId}:${dateKey}`
    value: HabitCheck;
    indexes: { 'by-habit': string };
  };
}

let dbPromise: Promise<IDBPDatabase<FuelTrackDB>> | null = null;

function db(): Promise<IDBPDatabase<FuelTrackDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FuelTrackDB>('fueltrack', 4, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const meals = database.createObjectStore('meals', { keyPath: 'id' });
          meals.createIndex('by-date', 'dateKey');
          database.createObjectStore('days', { keyPath: 'dateKey' });
          database.createObjectStore('photos', { keyPath: 'id' });
          database.createObjectStore('insights', { keyPath: 'id' });
          database.createObjectStore('meta', { keyPath: 'key' });
        }
        if (oldVersion < 2) {
          // Deletion tombstones, so removing a meal on one device removes it
          // everywhere instead of it re-syncing back from a stale peer.
          database.createObjectStore('tombstones', { keyPath: 'key' });
        }
        if (oldVersion < 3) {
          // Train tab: completed workouts, reusable routines, body-weight log.
          const workouts = database.createObjectStore('workouts', { keyPath: 'id' });
          workouts.createIndex('by-date', 'dateKey');
          database.createObjectStore('routines', { keyPath: 'id' });
          database.createObjectStore('weights', { keyPath: 'dateKey' });
        }
        if (oldVersion < 4) {
          // Habits tab: tracked habits/addictions + per-day completion marks.
          database.createObjectStore('habits', { keyPath: 'id' });
          const checks = database.createObjectStore('habitChecks', { keyPath: 'key' });
          checks.createIndex('by-habit', 'habitId');
        }
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
  const database = await db();
  const stamped: Meal = { ...meal, updatedAt: meal.updatedAt ?? Date.now() };
  const tx = database.transaction(['meals', 'tombstones'], 'readwrite');
  void tx.objectStore('meals').put(stamped);
  // A re-created/edited meal must not stay tombstoned from a prior delete.
  void tx.objectStore('tombstones').delete(tombstoneKey('meals', meal.id));
  await tx.done;
}

export async function deleteMeal(id: string): Promise<void> {
  const database = await db();
  const meal = await database.get('meals', id);
  const tx = database.transaction(['meals', 'photos', 'tombstones'], 'readwrite');
  void tx.objectStore('meals').delete(id);
  if (meal?.photoId) void tx.objectStore('photos').delete(meal.photoId);
  void tx.objectStore('tombstones').put(makeTombstone('meals', id));
  await tx.done;
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
  await (await db()).put('days', { dateKey, lightDay, updatedAt: Date.now() });
}

// ---- tombstones (deletion records for sync) ----

function tombstoneKey(store: TombstoneStore, id: string): string {
  return `${store}:${id}`;
}

function makeTombstone(store: TombstoneStore, id: string): Tombstone {
  return { key: tombstoneKey(store, id), store, id, deletedAt: Date.now() };
}

// ---- workouts / routines / weights (Train tab) ----

export async function getRoutines(): Promise<Routine[]> {
  const rows = await (await db()).getAll('routines');
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function putRoutine(routine: Routine): Promise<void> {
  const database = await db();
  const stamped: Routine = { ...routine, updatedAt: routine.updatedAt ?? Date.now() };
  const tx = database.transaction(['routines', 'tombstones'], 'readwrite');
  void tx.objectStore('routines').put(stamped);
  void tx.objectStore('tombstones').delete(tombstoneKey('routines', routine.id));
  await tx.done;
}

export async function deleteRoutine(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(['routines', 'tombstones'], 'readwrite');
  void tx.objectStore('routines').delete(id);
  void tx.objectStore('tombstones').put(makeTombstone('routines', id));
  await tx.done;
}

export async function getWorkoutsInRange(dateKeys: string[]): Promise<Map<string, Workout[]>> {
  const database = await db();
  const result = new Map<string, Workout[]>();
  await Promise.all(
    dateKeys.map(async (key) => {
      const rows = await database.getAllFromIndex('workouts', 'by-date', key);
      result.set(key, rows.sort((a, b) => a.loggedAt - b.loggedAt));
    }),
  );
  return result;
}

export async function putWorkout(workout: Workout): Promise<void> {
  const database = await db();
  const stamped: Workout = { ...workout, updatedAt: workout.updatedAt ?? Date.now() };
  const tx = database.transaction(['workouts', 'tombstones'], 'readwrite');
  void tx.objectStore('workouts').put(stamped);
  void tx.objectStore('tombstones').delete(tombstoneKey('workouts', workout.id));
  await tx.done;
}

export async function deleteWorkout(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(['workouts', 'tombstones'], 'readwrite');
  void tx.objectStore('workouts').delete(id);
  void tx.objectStore('tombstones').put(makeTombstone('workouts', id));
  await tx.done;
}

export async function getWeights(): Promise<WeightEntry[]> {
  const rows = await (await db()).getAll('weights');
  return rows.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export async function putWeight(entry: WeightEntry): Promise<void> {
  const database = await db();
  const stamped: WeightEntry = { ...entry, updatedAt: entry.updatedAt ?? Date.now() };
  const tx = database.transaction(['weights', 'tombstones'], 'readwrite');
  void tx.objectStore('weights').put(stamped);
  void tx.objectStore('tombstones').delete(tombstoneKey('weights', entry.dateKey));
  await tx.done;
}

export async function deleteWeight(dateKey: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(['weights', 'tombstones'], 'readwrite');
  void tx.objectStore('weights').delete(dateKey);
  void tx.objectStore('tombstones').put(makeTombstone('weights', dateKey));
  await tx.done;
}

// ---- habits / habit checks (Habits tab) ----

export async function getHabits(): Promise<Habit[]> {
  const rows = await (await db()).getAll('habits');
  // Oldest-first so the chip order (and default selection) is stable.
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function putHabit(habit: Habit): Promise<void> {
  const database = await db();
  const stamped: Habit = { ...habit, updatedAt: habit.updatedAt ?? Date.now() };
  const tx = database.transaction(['habits', 'tombstones'], 'readwrite');
  void tx.objectStore('habits').put(stamped);
  void tx.objectStore('tombstones').delete(tombstoneKey('habits', habit.id));
  await tx.done;
}

/** Delete a habit and every check under it, tombstoning all of them for sync. */
export async function deleteHabit(id: string): Promise<void> {
  const database = await db();
  const checkKeys = await database.getAllKeysFromIndex('habitChecks', 'by-habit', id);
  const tx = database.transaction(['habits', 'habitChecks', 'tombstones'], 'readwrite');
  void tx.objectStore('habits').delete(id);
  void tx.objectStore('tombstones').put(makeTombstone('habits', id));
  const checkStore = tx.objectStore('habitChecks');
  const tombStore = tx.objectStore('tombstones');
  for (const k of checkKeys) {
    void checkStore.delete(k);
    void tombStore.put(makeTombstone('habitChecks', k));
  }
  await tx.done;
}

export async function getHabitChecks(): Promise<HabitCheck[]> {
  return (await db()).getAll('habitChecks');
}

/**
 * Toggle a habit's completion for one day, in a single transaction so rapid
 * taps can't race. Adds a check (and clears any prior deletion tombstone) or
 * removes it (writing a tombstone). Returns the day's new checked state.
 */
export async function toggleHabitCheck(habitId: string, dateKey: string): Promise<boolean> {
  const key = `${habitId}:${dateKey}`;
  const database = await db();
  const tx = database.transaction(['habitChecks', 'tombstones'], 'readwrite');
  const existing = await tx.objectStore('habitChecks').get(key);
  let checked: boolean;
  if (existing) {
    void tx.objectStore('habitChecks').delete(key);
    void tx.objectStore('tombstones').put(makeTombstone('habitChecks', key));
    checked = false;
  } else {
    void tx.objectStore('habitChecks').put({ key, habitId, dateKey, updatedAt: Date.now() });
    void tx.objectStore('tombstones').delete(tombstoneKey('habitChecks', key));
    checked = true;
  }
  await tx.done;
  return checked;
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

// ---- sync: bulk read + apply ----

/** Raw local records the sync engine needs to build a snapshot. */
export async function getSyncableData(): Promise<{
  meals: Meal[];
  days: DayFlags[];
  insights: (CachedInsights & { id: string }) | null;
  tombstones: Tombstone[];
  workouts: Workout[];
  routines: Routine[];
  weights: WeightEntry[];
  habits: Habit[];
  habitChecks: HabitCheck[];
}> {
  const database = await db();
  const [meals, days, insightsRows, tombstones, workouts, routines, weights, habits, habitChecks] =
    await Promise.all([
      database.getAll('meals'),
      database.getAll('days'),
      database.getAll('insights'),
      database.getAll('tombstones'),
      database.getAll('workouts'),
      database.getAll('routines'),
      database.getAll('weights'),
      database.getAll('habits'),
      database.getAll('habitChecks'),
    ]);
  return {
    meals,
    days,
    insights: insightsRows[0] ?? null,
    tombstones,
    workouts,
    routines,
    weights,
    habits,
    habitChecks,
  };
}

/**
 * Replace local meals/days/insights/tombstones with an already-merged set.
 * Meals present locally but absent from the merged set (i.e. tombstoned) are
 * removed along with their photos. Runs in one transaction so a mid-apply
 * failure can't leave the store half-updated.
 */
export async function applyMergedData(merged: {
  meals: Meal[];
  days: DayFlags[];
  insights: (CachedInsights & { id: string }) | null;
  tombstones: Tombstone[];
  workouts: Workout[];
  routines: Routine[];
  weights: WeightEntry[];
  habits: Habit[];
  habitChecks: HabitCheck[];
}): Promise<void> {
  const database = await db();
  const tx = database.transaction(
    [
      'meals',
      'days',
      'insights',
      'photos',
      'tombstones',
      'workouts',
      'routines',
      'weights',
      'habits',
      'habitChecks',
    ],
    'readwrite',
  );
  const mealStore = tx.objectStore('meals');
  const keepMealIds = new Set(merged.meals.map((m) => m.id));
  const existingMeals = await mealStore.getAll();
  for (const m of existingMeals) {
    if (!keepMealIds.has(m.id)) {
      void mealStore.delete(m.id);
      if (m.photoId) void tx.objectStore('photos').delete(m.photoId);
    }
  }
  for (const m of merged.meals) void mealStore.put(m);

  const dayStore = tx.objectStore('days');
  for (const d of merged.days) void dayStore.put(d);

  if (merged.insights) void tx.objectStore('insights').put(merged.insights);

  // Same replace pattern for the Train stores: anything not in the merged
  // set was deleted (tombstoned) on some device — drop it here too.
  const replaceStore = async <
    N extends 'workouts' | 'routines' | 'weights' | 'habits' | 'habitChecks',
  >(
    name: N,
    rows: FuelTrackDB[N]['value'][],
    keyOf: (r: FuelTrackDB[N]['value']) => string,
  ) => {
    const store = tx.objectStore(name);
    const keep = new Set(rows.map(keyOf));
    const existing = await store.getAllKeys();
    for (const k of existing) if (!keep.has(k)) void store.delete(k);
    for (const r of rows) void store.put(r as never);
  };
  await replaceStore('workouts', merged.workouts, (r) => r.id);
  await replaceStore('routines', merged.routines, (r) => r.id);
  await replaceStore('weights', merged.weights, (r) => r.dateKey);
  await replaceStore('habits', merged.habits, (r) => r.id);
  await replaceStore('habitChecks', merged.habitChecks, (r) => r.key);

  const tombStore = tx.objectStore('tombstones');
  for (const t of merged.tombstones) void tombStore.put(t);

  await tx.done;
}

/** Export everything (except photos, which would bloat the file) as a JSON blob. */
export async function exportAllData(): Promise<string> {
  const database = await db();
  const [meals, days, insights, workouts, routines, weights, habits, habitChecks] =
    await Promise.all([
      database.getAll('meals'),
      database.getAll('days'),
      database.getAll('insights'),
      database.getAll('workouts'),
      database.getAll('routines'),
      database.getAll('weights'),
      database.getAll('habits'),
      database.getAll('habitChecks'),
    ]);
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: 'FuelTrack',
      meals: meals.sort((a, b) => a.loggedAt - b.loggedAt),
      days,
      insights,
      workouts,
      routines,
      weights,
      habits,
      habitChecks,
    },
    null,
    2,
  );
}

/**
 * Import a previously exported JSON file: additive merge by id/key (existing
 * records with the same id are overwritten, nothing else is deleted). Every
 * imported record is stamped updatedAt=now so it wins the next sync merge and
 * beats any old deletion tombstones — importing is an explicit "restore".
 * Returns how many records were imported.
 */
export async function importAllData(raw: string): Promise<number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const data = parsed as {
    meals?: Meal[];
    days?: DayFlags[];
    insights?: (CachedInsights & { id: string })[];
    workouts?: Workout[];
    routines?: Routine[];
    weights?: WeightEntry[];
    habits?: Habit[];
    habitChecks?: HabitCheck[];
  };
  if (!Array.isArray(data.meals) && !Array.isArray(data.days)) {
    throw new Error('That does not look like a FuelTrack export.');
  }

  const now = Date.now();
  const database = await db();
  const tx = database.transaction(
    [
      'meals',
      'days',
      'insights',
      'workouts',
      'routines',
      'weights',
      'habits',
      'habitChecks',
      'tombstones',
    ],
    'readwrite',
  );
  let count = 0;

  for (const m of data.meals ?? []) {
    if (!m || typeof m.id !== 'string' || typeof m.dateKey !== 'string') continue;
    void tx.objectStore('meals').put({ ...m, updatedAt: now });
    void tx.objectStore('tombstones').delete(`meals:${m.id}`);
    count++;
  }
  for (const d of data.days ?? []) {
    if (!d || typeof d.dateKey !== 'string') continue;
    void tx.objectStore('days').put({ ...d, updatedAt: now });
    count++;
  }
  for (const r of data.routines ?? []) {
    if (!r || typeof r.id !== 'string') continue;
    void tx.objectStore('routines').put({ ...r, updatedAt: now });
    void tx.objectStore('tombstones').delete(`routines:${r.id}`);
    count++;
  }
  for (const w of data.workouts ?? []) {
    if (!w || typeof w.id !== 'string' || typeof w.dateKey !== 'string') continue;
    void tx.objectStore('workouts').put({ ...w, updatedAt: now });
    void tx.objectStore('tombstones').delete(`workouts:${w.id}`);
    count++;
  }
  for (const w of data.weights ?? []) {
    if (!w || typeof w.dateKey !== 'string' || typeof w.weightKg !== 'number') continue;
    void tx.objectStore('weights').put({ ...w, updatedAt: now });
    void tx.objectStore('tombstones').delete(`weights:${w.dateKey}`);
    count++;
  }
  for (const h of data.habits ?? []) {
    if (!h || typeof h.id !== 'string' || typeof h.name !== 'string') continue;
    void tx.objectStore('habits').put({ ...h, updatedAt: now });
    void tx.objectStore('tombstones').delete(`habits:${h.id}`);
    count++;
  }
  for (const c of data.habitChecks ?? []) {
    if (!c || typeof c.key !== 'string' || typeof c.habitId !== 'string' || typeof c.dateKey !== 'string')
      continue;
    void tx.objectStore('habitChecks').put({ ...c, updatedAt: now });
    void tx.objectStore('tombstones').delete(`habitChecks:${c.key}`);
    count++;
  }
  const insightsRow = (data.insights ?? [])[0];
  if (insightsRow && insightsRow.insights) {
    void tx.objectStore('insights').put({ ...insightsRow, id: 'weekly' });
    count++;
  }

  await tx.done;
  return count;
}
