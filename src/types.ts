/** Core data model: days → meals → items. */

export type Confidence = 'low' | 'medium' | 'high';

/** How a meal entered the log. AI sources get an "AI estimate" badge until edited. */
export type MealSource = 'ai_photo' | 'ai_text' | 'manual';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

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
  /** Breakfast / lunch / dinner / snack. */
  mealType?: MealType;
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

export type AiProvider = 'claude' | 'gemini';

export interface Settings {
  provider: AiProvider;
  /** Anthropic API key (Claude provider). */
  apiKey: string;
  /** Google AI Studio API key (Gemini provider). */
  geminiApiKey: string;
  proteinTarget_g: number;
  calorieTarget_kcal: number;
  heightCm: number;
  weightKg: number;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'claude',
  apiKey: '',
  geminiApiKey: '',
  proteinTarget_g: 110,
  calorieTarget_kcal: 3000,
  heightCm: 185, // 6'1"
  weightKg: 61,
};

/** The key for the currently selected AI provider. */
export function activeApiKey(settings: Settings): string {
  return (settings.provider === 'gemini' ? settings.geminiApiKey : settings.apiKey).trim();
}

export type Tab = 'today' | 'log' | 'history' | 'insights' | 'settings';

export function newId(): string {
  // crypto.randomUUID needs Safari 15.4+ and a secure context.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
