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
import type { AnalysisResult, DaySummary, Meal, MealSource, MealType, Settings, Tab } from '../types';
import { newId } from '../types';
import * as db from '../lib/db';
import { todayKey as computeTodayKey } from '../lib/dates';
import { loadSettings, saveSettings } from '../lib/settings';
import { seedIfNeeded } from '../lib/seed';

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
  setLightDay: (dateKey: string, lightDay: boolean) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [todayKey, setTodayKey] = useState(computeTodayKey);
  const [version, setVersion] = useState(0);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [tab, setTab] = useState<Tab>('today');

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    seedIfNeeded()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

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
      bump();
      return meal;
    },
    [bump],
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
      bump();
      return copy;
    },
    [bump],
  );

  const updateMeal = useCallback(
    async (meal: Meal) => {
      await db.putMeal(meal);
      bump();
    },
    [bump],
  );

  const removeMeal = useCallback(
    async (id: string) => {
      await db.deleteMeal(id);
      bump();
    },
    [bump],
  );

  const setLightDay = useCallback(
    async (dateKey: string, lightDay: boolean) => {
      await db.setLightDay(dateKey, lightDay);
      bump();
    },
    [bump],
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
      setLightDay,
    }),
    [ready, todayKey, version, settings, updateSettings, tab, logMeal, repeatMeal, updateMeal, removeMeal, setLightDay],
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
