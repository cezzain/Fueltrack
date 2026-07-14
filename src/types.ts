/** Core data model: days → meals → items. */

export type Confidence = 'low' | 'medium' | 'high';

/** How a meal entered the log. AI sources get an "AI estimate" badge until edited. */
export type MealSource = 'ai_photo' | 'ai_text' | 'manual';

export interface FoodItem {
  id: string;
  name: string;
  /** Human-readable portion, e.g. "~250g cooked" */
  portion: string;
  protein_g: number;
  calories: number;
  confidence: Confidence;
}

export interface Meal {
  id: string;
  /** YYYY-MM-DD in Asia/Dubai time — the day this meal counts toward. */
  dateKey: string;
  /** Display name, e.g. "Beef & tofu udon bowl + milk" */
  name: string;
  /** Epoch ms when logged/eaten. */
  loggedAt: number;
  items: FoodItem[];
  protein_g: number;
  calories: number;
  source: MealSource;
  /** True once the user manually adjusted numbers after AI analysis. */
  edited: boolean;
  /** Assumptions the AI stated during analysis. */
  aiNotes?: string;
  /** Key into the photos store (compressed JPEG data URL). */
  photoId?: string;
}

export interface DayFlags {
  dateKey: string;
  /** Travel/sick day: soften target messaging instead of showing failure. */
  lightDay: boolean;
}

export interface DaySummary {
  dateKey: string;
  protein_g: number;
  calories: number;
  mealCount: number;
  lightDay: boolean;
  meals: Meal[];
}

/** Shape returned by Claude for photo/text meal analysis (strict JSON). */
export interface AnalysisItem {
  name: string;
  portion_estimate: string;
  protein_g: number;
  calories: number;
  confidence: Confidence;
}

export interface AnalysisResult {
  items: AnalysisItem[];
  total_protein_g: number;
  total_calories: number;
  notes: string;
}

/** Shape returned by Claude for the weekly insights call (strict JSON). */
export interface WeeklyInsights {
  summary: string;
  trends: string[];
  best_day: { dateKey: string; reason: string };
  worst_day: { dateKey: string; reason: string };
  suggestion: string;
}

export interface CachedInsights {
  /** The day (Dubai time) this was generated on — regenerate at most once per day. */
  dateKey: string;
  generatedAt: number;
  insights: WeeklyInsights;
}

export interface Settings {
  apiKey: string;
  proteinTarget_g: number;
  calorieTarget_kcal: number;
  heightCm: number;
  weightKg: number;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  proteinTarget_g: 110,
  calorieTarget_kcal: 3000,
  heightCm: 185, // 6'1"
  weightKg: 61,
};

export type Tab = 'today' | 'log' | 'history' | 'insights' | 'settings';

export function newId(): string {
  return crypto.randomUUID();
}
