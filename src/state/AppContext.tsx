/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AnalysisResult,
  DaySummary,
  Meal,
  MealSource,
  MealType,
  Routine,
  Settings,
  Tab,
  WeightEntry,
  Workout,
} from '../types';
import { newId } from '../types';
import * as db from '../lib/db';
import { todayKey as computeTodayKey, weekDateKeys } from '../lib/dates';
import { computeEffectiveTargets, type EffectiveTargets } from '../lib/targets';
import { loadSettings, loadSettingsUpdatedAt, saveSettings } from '../lib/settings';
import { syncNow as runSync, SyncError } from '../lib/sync';
import { seedIfNeeded } from '../lib/seed';

export type SyncState = 'off' | 'idle' | 'syncing' | 'ok' | 'error';

interface AppContextValue {
  ready: boolean;
  /** Current Dubai-time date key; updates automatically at Dubai midnight. */
  todayKey: string;
  /** Bumped after every write — hooks depend on it to re-query. */
  version: number;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  tab: Tab;
  setTab: (tab: Tab) => void;
  /**
   * Save a confirmed AI analysis (or manual entry) as a meal. Defaults to
   * today at the current time; pass dateKey/loggedAt to backfill a past day.
   */
  logMeal: (input: {
    name: string;
    analysis: AnalysisResult;
    source: MealSource;
    edited: boolean;
    mealType?: MealType;
    photoDataUrl?: string;
    dateKey?: string;
    loggedAt?: number;
  }) => Promise<Meal>;
  /** One-tap re-log: copy a previous meal onto today, timestamped now. */
  repeatMeal: (meal: Meal) => Promise<Meal>;
  updateMeal: (meal: Meal) => Promise<void>;
  removeMeal: (id: string) => Promise<void>;
  /** Remove one food item from a meal, recomputing its totals — deletes the whole meal if it was the last item. */
  removeMealItem: (meal: Meal, itemId: string) => Promise<void>;
  setLightDay: (dateKey: string, lightDay: boolean) => Promise<void>;
  /** Create a reusable workout routine ("Leg day"). */
  addRoutine: (name: string) => Promise<void>;
  removeRoutine: (id: string) => Promise<void>;
  /** Record "I did <routine>" on a day (defaults to today). */
  logWorkout: (routine: Routine, dateKey?: string) => Promise<void>;
  removeWorkout: (id: string) => Promise<void>;
  /** Record a body-weight measurement for a day (defaults to today). */
  logWeight: (weightKg: number, dateKey?: string) => Promise<void>;
  removeWeight: (dateKey: string) => Promise<void>;
  /** Current cross-device sync state (off when disabled). */
  syncState: SyncState;
  /** Last sync error message, if the most recent attempt failed. */
  syncError: string | null;
  /** Epoch ms of the last successful sync, or null. */
  lastSyncedAt: number | null;
  /** Run a full sync round-trip now (pull → merge → push). */
  syncNow: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [todayKey, setTodayKey] = useState(computeTodayKey);
  const [version, setVersion] = useState(0);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [tab, setTab] = useState<Tab>('today');

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // ---- cross-device sync ----
  const [syncState, setSyncState] = useState<SyncState>(
    settings.authToken ? 'idle' : 'off',
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const settingsUpdatedAtRef = useRef(loadSettingsUpdatedAt());
  const syncingRef = useRef(false);
  const syncTimerRef = useRef<number | undefined>(undefined);
  const readyRef = useRef(false);

  const doSync = useCallback(async () => {
    const s = settingsRef.current;
    if (!s.authToken.trim() || !readyRef.current) return;
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncState('syncing');
    setSyncError(null);
    try {
      const result = await runSync(s, settingsUpdatedAtRef.current);
      // Adopt remote settings only if they're strictly newer than ours, and
      // always keep this device's own session token.
      if (result.settings && result.settingsUpdatedAt > settingsUpdatedAtRef.current) {
        const applied: Settings = {
          ...result.settings,
          authToken: s.authToken,
          authEmail: s.authEmail,
        };
        settingsUpdatedAtRef.current = result.settingsUpdatedAt;
        saveSettings(applied, result.settingsUpdatedAt);
        setSettings(applied);
      }
      setLastSyncedAt(Date.now());
      setSyncState('ok');
      bump(); // surface merged-in meals/days to the hooks
    } catch (err) {
      if (err instanceof SyncError && err.authExpired) {
        // Token was revoked/expired server-side — drop it so the UI shows
        // signed-out instead of erroring forever.
        setSettings((prev) => {
          const next = { ...prev, authToken: '', authEmail: '' };
          saveSettings(next, settingsUpdatedAtRef.current);
          return next;
        });
      }
      setSyncError(err instanceof SyncError ? err.message : 'Sync failed — try again.');
      setSyncState('error');
    } finally {
      syncingRef.current = false;
    }
  }, [bump]);

  /** Debounced push after local edits, so rapid changes coalesce into one sync. */
  const scheduleSync = useCallback(() => {
    if (!settingsRef.current.authToken.trim()) return;
    window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => void doSync(), 3000);
  }, [doSync]);

  /** Bump the version AND schedule a sync — used by every data mutation. */
  const commit = useCallback(() => {
    bump();
    scheduleSync();
  }, [bump, scheduleSync]);

  useEffect(() => {
    let cancelled = false;
    seedIfNeeded()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          readyRef.current = true;
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync lifecycle: run once on sign-in / app ready, then on a timer and
  // whenever the app regains focus (covers the common "logged on my phone,
  // now opening the iPad" case). Re-subscribes if the account changes.
  useEffect(() => {
    if (!ready) return;
    if (!settings.authToken.trim()) {
      setSyncState('off');
      return;
    }
    setSyncState((s) => (s === 'off' ? 'idle' : s));
    void doSync();
    const interval = setInterval(() => void doSync(), 60_000);
    const onFocus = () => void doSync();
    const onVisible = () => {
      if (!document.hidden) void doSync();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, settings.authToken, doSync]);

  // Day rollover at Dubai midnight: re-check on an interval and when the app
  // returns to the foreground (iOS suspends timers while backgrounded).
  useEffect(() => {
    const check = () => setTodayKey((prev) => (prev === computeTodayKey() ? prev : computeTodayKey()));
    const interval = setInterval(check, 30_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      const now = Date.now();
      settingsUpdatedAtRef.current = now;
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        saveSettings(next, now);
        return next;
      });
      scheduleSync();
    },
    [scheduleSync],
  );

  const logMeal = useCallback(
    async (input: {
      name: string;
      analysis: AnalysisResult;
      source: MealSource;
      edited: boolean;
      mealType?: MealType;
      photoDataUrl?: string;
      dateKey?: string;
      loggedAt?: number;
    }): Promise<Meal> => {
      let photoId: string | undefined;
      if (input.photoDataUrl) {
        photoId = newId();
        await db.savePhoto(photoId, input.photoDataUrl);
      }
      const meal: Meal = {
        id: newId(),
        dateKey: input.dateKey ?? computeTodayKey(),
        name: input.name,
        loggedAt: input.loggedAt ?? Date.now(),
        mealType: input.mealType,
        items: input.analysis.items.map((it) => ({
          id: newId(),
          name: it.name,
          portion: it.portion_estimate,
          protein_g: it.protein_g,
          calories: it.calories,
          confidence: it.confidence,
        })),
        protein_g: input.analysis.total_protein_g,
        calories: input.analysis.total_calories,
        source: input.source,
        edited: input.edited,
        aiNotes: input.analysis.notes || undefined,
      };
      if (photoId) meal.photoId = photoId;
      try {
        await db.putMeal(meal);
      } catch (err) {
        // Don't leave an unreachable photo behind if the meal write failed —
        // a retry saves a fresh photo under a new id.
        if (photoId) await db.deletePhoto(photoId).catch(() => {});
        throw err;
      }
      commit();
      return meal;
    },
    [commit],
  );

  const repeatMeal = useCallback(
    async (source: Meal): Promise<Meal> => {
      const copy: Meal = {
        ...source,
        id: newId(),
        dateKey: computeTodayKey(),
        loggedAt: Date.now(),
        items: source.items.map((it) => ({ ...it, id: newId() })),
        // The copy references the same stored photo; keep photoId only if the
        // original still owns it — safest is to not carry photos across copies.
        photoId: undefined,
      };
      await db.putMeal(copy);
      commit();
      return copy;
    },
    [commit],
  );

  const updateMeal = useCallback(
    async (meal: Meal) => {
      await db.putMeal(meal);
      commit();
    },
    [commit],
  );

  const removeMeal = useCallback(
    async (id: string) => {
      await db.deleteMeal(id);
      commit();
    },
    [commit],
  );

  const removeMealItem = useCallback(
    async (meal: Meal, itemId: string) => {
      const items = meal.items.filter((it) => it.id !== itemId);
      if (items.length === 0) {
        // No items left — remove the whole meal (and its photo).
        await db.deleteMeal(meal.id);
      } else {
        const updated: Meal = {
          ...meal,
          items,
          protein_g: Math.round(items.reduce((sum, it) => sum + it.protein_g, 0)),
          calories: Math.round(items.reduce((sum, it) => sum + it.calories, 0)),
        };
        await db.putMeal(updated);
      }
      commit();
    },
    [commit],
  );

  const setLightDay = useCallback(
    async (dateKey: string, lightDay: boolean) => {
      await db.setLightDay(dateKey, lightDay);
      commit();
    },
    [commit],
  );

  const addRoutine = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await db.putRoutine({ id: newId(), name: trimmed });
      commit();
    },
    [commit],
  );

  const removeRoutine = useCallback(
    async (id: string) => {
      await db.deleteRoutine(id);
      commit();
    },
    [commit],
  );

  const logWorkout = useCallback(
    async (routine: Routine, dateKey?: string) => {
      const workout: Workout = {
        id: newId(),
        dateKey: dateKey ?? computeTodayKey(),
        routineId: routine.id,
        routineName: routine.name,
        loggedAt: Date.now(),
      };
      await db.putWorkout(workout);
      commit();
    },
    [commit],
  );

  const removeWorkout = useCallback(
    async (id: string) => {
      await db.deleteWorkout(id);
      commit();
    },
    [commit],
  );

  const logWeight = useCallback(
    async (weightKg: number, dateKey?: string) => {
      if (!Number.isFinite(weightKg) || weightKg <= 0) return;
      await db.putWeight({ dateKey: dateKey ?? computeTodayKey(), weightKg });
      // Keep the profile weight (used by AI coaching) in step with the log.
      updateSettings({ weightKg });
      commit();
    },
    [commit, updateSettings],
  );

  const removeWeight = useCallback(
    async (dateKey: string) => {
      await db.deleteWeight(dateKey);
      commit();
    },
    [commit],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      todayKey,
      version,
      settings,
      updateSettings,
      tab,
      setTab,
      logMeal,
      repeatMeal,
      updateMeal,
      removeMeal,
      removeMealItem,
      setLightDay,
      addRoutine,
      removeRoutine,
      logWorkout,
      removeWorkout,
      logWeight,
      removeWeight,
      syncState,
      syncError,
      lastSyncedAt,
      syncNow: doSync,
    }),
    [
      ready,
      todayKey,
      version,
      settings,
      updateSettings,
      tab,
      logMeal,
      repeatMeal,
      updateMeal,
      removeMeal,
      removeMealItem,
      setLightDay,
      addRoutine,
      removeRoutine,
      logWorkout,
      removeWorkout,
      logWeight,
      removeWeight,
      syncState,
      syncError,
      lastSyncedAt,
      doSync,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

/** Live day summary (meals + totals + light-day flag) for one date. */
export function useDaySummary(dateKey: string): DaySummary | null {
  const { version, ready } = useApp();
  const [summary, setSummary] = useState<DaySummary | null>(null);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    db.getDaySummary(dateKey).then((s) => {
      if (!cancelled) setSummary(s);
    });
    return () => {
      cancelled = true;
    };
  }, [dateKey, version, ready]);
  return summary;
}

/** Live day summaries for a list of date keys (oldest-first order preserved). */
export function useDaySummaries(dateKeys: string[]): DaySummary[] | null {
  const { version, ready } = useApp();
  const [summaries, setSummaries] = useState<DaySummary[] | null>(null);
  const keysJoined = dateKeys.join(',');
  const keysRef = useRef(dateKeys);
  keysRef.current = dateKeys;
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    db.getDaySummaries(keysRef.current).then((s) => {
      if (!cancelled) setSummaries(s);
    });
    return () => {
      cancelled = true;
    };
  }, [keysJoined, version, ready]);
  return summaries;
}

/** Live light-day flag for one date (e.g. checking tomorrow's status). */
export function useLightDayFlag(dateKey: string): boolean {
  const { version, ready } = useApp();
  const [light, setLight] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    db.getDayFlags(dateKey).then((flags) => {
      if (!cancelled) setLight(flags.lightDay);
    });
    return () => {
      cancelled = true;
    };
  }, [dateKey, version, ready]);
  return light;
}

/**
 * Effective protein/calorie targets for one day, after spreading any light
 * day's shortfall across the rest of its calendar week. Null while loading.
 */
export function useEffectiveTargets(dateKey: string): EffectiveTargets | null {
  const { version, ready, settings } = useApp();
  const [result, setResult] = useState<EffectiveTargets | null>(null);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const weekKeys = weekDateKeys(dateKey);
    db.getLightDayFlags(weekKeys).then((flags) => {
      if (!cancelled) setResult(computeEffectiveTargets(dateKey, flags, settings));
    });
    return () => {
      cancelled = true;
    };
  }, [dateKey, version, ready, settings]);
  return result;
}

/** Live list of custom workout routines, alphabetical. */
export function useRoutines(): Routine[] | null {
  const { version, ready } = useApp();
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    db.getRoutines().then((r) => {
      if (!cancelled) setRoutines(r);
    });
    return () => {
      cancelled = true;
    };
  }, [version, ready]);
  return routines;
}

/** Live workouts per day for a list of date keys (calendar / day detail). */
export function useWorkouts(dateKeys: string[]): Map<string, Workout[]> | null {
  const { version, ready } = useApp();
  const [map, setMap] = useState<Map<string, Workout[]> | null>(null);
  const keysJoined = dateKeys.join(',');
  const keysRef = useRef(dateKeys);
  keysRef.current = dateKeys;
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    db.getWorkoutsInRange(keysRef.current).then((m) => {
      if (!cancelled) setMap(m);
    });
    return () => {
      cancelled = true;
    };
  }, [keysJoined, version, ready]);
  return map;
}

/** Live body-weight log, oldest-first. */
export function useWeights(): WeightEntry[] | null {
  const { version, ready } = useApp();
  const [weights, setWeights] = useState<WeightEntry[] | null>(null);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    db.getWeights().then((w) => {
      if (!cancelled) setWeights(w);
    });
    return () => {
      cancelled = true;
    };
  }, [version, ready]);
  return weights;
}

/** Load a stored photo's data URL by id. */
export function usePhoto(photoId: string | undefined): string | undefined {
  const [dataUrl, setDataUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!photoId) {
      setDataUrl(undefined);
      return;
    }
    let cancelled = false;
    db.getPhoto(photoId).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [photoId]);
  return dataUrl;
}
