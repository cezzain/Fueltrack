import Anthropic from '@anthropic-ai/sdk';
import type {
  AnalysisItem,
  AnalysisResult,
  ChatMessage,
  Confidence,
  DaySummary,
  Settings,
  WeeklyInsights,
} from '../types';
import { formatDayLabel } from './dates';

/** Vision-capable model, per app spec. */
const MODEL = 'claude-sonnet-4-6';

/** Friendly error the UI can show, with a retry hint. */
export class ClaudeError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'ClaudeError';
    this.retryable = retryable;
  }
}

function makeClient(apiKey: string): Anthropic {
  if (!apiKey.trim()) {
    throw new ClaudeError('No API key set. Add your Anthropic API key in Settings first.', false);
  }
  // Single-user personal tool: the key lives on-device and calls go straight
  // from the browser. dangerouslyAllowBrowser sends the
  // `anthropic-dangerous-direct-browser-access: true` header.
  return new Anthropic({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });
}

function toFriendlyError(err: unknown): ClaudeError {
  if (err instanceof ClaudeError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new ClaudeError('Invalid API key — check it in Settings.', false);
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new ClaudeError('This API key does not have access to the model.', false);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ClaudeError('Rate limited — wait a moment and retry.', true);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ClaudeError('Could not reach the Claude API — check your connection and retry.', true);
  }
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    return new ClaudeError(
      status >= 500 ? 'Claude API is having trouble — retry in a moment.' : `Claude API error (${status}).`,
      status >= 500 || status === 429 || status === 408,
    );
  }
  return new ClaudeError('Unexpected error while analyzing — you can retry or log manually.', true);
}

export const ANALYSIS_SYSTEM = `You are a nutrition analyst inside FuelTrack, a personal calorie & protein tracker.

When given a meal (photo and/or text description):
- Identify EVERY food item on the plate or in the description.
- Estimate portions using visual scale references when present: hands, fingers, forks, spoons, a standard dinner plate (~26 cm), a drinking glass (~250 ml). Prefer these over guessing.
- Estimate protein (g) and calories (kcal) per item using typical nutritional values for the visible preparation (oils, cheese, sauces count).
- State every assumption you made (portion guesses, hidden ingredients, cooking fat) in "notes".
- confidence is "low", "medium", or "high" per item based on how sure you are of the portion and preparation.

Respond with STRICT JSON only — no markdown fences, no preamble, no trailing text. Exactly this shape:
{
  "items": [
    { "name": "shaved beef", "portion_estimate": "~250g cooked", "protein_g": 62, "calories": 700, "confidence": "medium" }
  ],
  "total_protein_g": 93,
  "total_calories": 1325,
  "notes": "Beef portion estimated using the fork as a scale reference."
}
"total_protein_g" and "total_calories" must equal the sums over items. All numbers are plain numbers, not strings.`;

/** Strip markdown fences / prose and parse + validate the strict-JSON analysis. */
export function parseAnalysis(raw: string): AnalysisResult {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ClaudeError(
      `The AI response was not valid JSON — retry the analysis.${diagnosticSuffix(raw)}`,
      true,
    );
  }
  const obj = parsed as Record<string, unknown>;
  const rawItems = Array.isArray(obj.items) ? obj.items : null;
  if (!rawItems || rawItems.length === 0) {
    throw new ClaudeError('The AI response had no food items — retry or log manually.', true);
  }
  const items: AnalysisItem[] = rawItems.map((it) => {
    const r = (it ?? {}) as Record<string, unknown>;
    return {
      name: asString(r.name, 'item'),
      portion_estimate: asString(r.portion_estimate, ''),
      protein_g: asNumber(r.protein_g),
      calories: asNumber(r.calories),
      confidence: asConfidence(r.confidence),
    };
  });
  const totalProtein = asNumber(obj.total_protein_g, sum(items, 'protein_g'));
  const totalCalories = asNumber(obj.total_calories, sum(items, 'calories'));
  return {
    items,
    total_protein_g: totalProtein,
    total_calories: totalCalories,
    notes: asString(obj.notes, ''),
  };
}

export function extractJson(raw: string): unknown {
  let text = raw.trim();
  // Strip ```json ... ``` fences if the model added them anyway.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) text = fence[1].trim();
  // Fall back to the outermost braces if there's stray prose around the JSON.
  if (!text.startsWith('{')) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    text = text.slice(start, end + 1);
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * A short, safe preview of what the model actually returned, appended to
 * parse-failure error messages. Without this, "not valid JSON" gives no clue
 * whether the response was empty, truncated mid-object, wrapped in prose the
 * fence-stripping missed, or something else entirely.
 */
function diagnosticSuffix(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return ' (the response was empty)';
  const preview = trimmed.slice(0, 180).replace(/\s+/g, ' ');
  return ` Response started with: "${preview}${trimmed.length > 180 ? '…' : ''}"`;
}

function sum(items: AnalysisItem[], field: 'protein_g' | 'calories'): number {
  return Math.round(items.reduce((acc, it) => acc + it[field], 0));
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

function asConfidence(v: unknown): Confidence {
  return v === 'low' || v === 'high' ? v : 'medium';
}

async function requestAnalysis(
  apiKey: string,
  content: Anthropic.ContentBlockParam[],
): Promise<AnalysisResult> {
  const client = makeClient(apiKey);
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: ANALYSIS_SYSTEM,
      messages: [{ role: 'user', content }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return parseAnalysis(text);
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/** Analyze a meal photo (compressed JPEG base64), with an optional text note. */
export async function analyzeMealPhoto(
  apiKey: string,
  photoBase64: string,
  note?: string,
): Promise<AnalysisResult> {
  const content: Anthropic.ContentBlockParam[] = [
    {
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: photoBase64 },
    },
    {
      type: 'text',
      text: note?.trim()
        ? `Analyze this meal photo. Extra context from me: ${note.trim()}`
        : 'Analyze this meal photo.',
    },
  ];
  return requestAnalysis(apiKey, content);
}

/** Analyze a text-only meal description ("3-egg omelette with cheese and oil"). */
export async function analyzeMealText(apiKey: string, description: string): Promise<AnalysisResult> {
  if (!description.trim()) {
    throw new ClaudeError('Describe the meal first.', false);
  }
  return requestAnalysis(apiKey, [
    { type: 'text', text: `Analyze this meal description: ${description.trim()}` },
  ]);
}

export const INSIGHTS_SYSTEM = `You are the weekly coach inside FuelTrack, a calorie & protein tracker for an 18-year-old, 6'1", 61 kg basketball player (6 days/week) on a lean bulk.

You get the last 7 days of logged data plus daily targets. Days flagged "lightDay" were travel/sick days — treat lower intake there as expected, not failure. Days with zero meals were likely unlogged, not fasted; say so rather than treating them as zero intake.

Respond with STRICT JSON only — no markdown fences, no preamble. Exactly this shape:
{
  "summary": "2-3 sentence overview of the week",
  "trends": ["short trend observation", "another one"],
  "best_day": { "dateKey": "2026-07-13", "reason": "why it was the best day" },
  "worst_day": { "dateKey": "2026-07-10", "reason": "why it lagged (skip light days unless everything else was fine)" },
  "suggestion": "ONE concrete, specific action for next week"
}
Keep it encouraging but honest. 2-4 trends max.`;

/** Shared shape sent to the model for both the weekly-insights call and the follow-up chat. */
export function buildWeeklyPayload(days: DaySummary[], settings: Settings) {
  return {
    targets: { protein_g: settings.proteinTarget_g, calories: settings.calorieTarget_kcal },
    profile: { heightCm: settings.heightCm, weightKg: settings.weightKg },
    days: days.map((d) => ({
      dateKey: d.dateKey,
      label: formatDayLabel(d.dateKey),
      protein_g: d.protein_g,
      calories: d.calories,
      lightDay: d.lightDay,
      meals: d.meals.map((m) => ({ name: m.name, protein_g: m.protein_g, calories: m.calories })),
    })),
  };
}

/** One Claude call over the last 7 days of data → structured weekly insights. */
export async function generateWeeklyInsights(
  apiKey: string,
  days: DaySummary[],
  settings: Settings,
): Promise<WeeklyInsights> {
  const client = makeClient(apiKey);
  const payload = buildWeeklyPayload(days, settings);
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: INSIGHTS_SYSTEM,
      messages: [{ role: 'user', content: `Last 7 days of data:\n${JSON.stringify(payload, null, 2)}` }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return parseInsights(text);
  } catch (err) {
    throw toFriendlyError(err);
  }
}

export function parseInsights(raw: string): WeeklyInsights {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ClaudeError(
      `The AI insights response was not valid JSON — retry.${diagnosticSuffix(raw)}`,
      true,
    );
  }
  const obj = parsed as Record<string, unknown>;
  const day = (v: unknown): { dateKey: string; reason: string } => {
    const r = (v ?? {}) as Record<string, unknown>;
    return { dateKey: asString(r.dateKey, ''), reason: asString(r.reason, '') };
  };
  return {
    summary: asString(obj.summary, 'Not enough data for a summary yet.'),
    trends: Array.isArray(obj.trends)
      ? obj.trends.filter((t): t is string => typeof t === 'string' && !!t.trim()).slice(0, 4)
      : [],
    best_day: day(obj.best_day),
    worst_day: day(obj.worst_day),
    suggestion: asString(obj.suggestion, ''),
  };
}

export const INSIGHTS_CHAT_SYSTEM = `You are the weekly coach inside FuelTrack, continuing a conversation about the weekly summary you already gave an 18-year-old, 6'1", 61 kg basketball player (6 days/week) on a lean bulk.

Answer follow-up questions conversationally and concretely, grounded in the week's logged data and the summary below. If asked something like how long a change will take to show results, give a realistic timeframe for a lean bulk at this training frequency rather than hedging. Keep replies short — 2-5 sentences of plain prose, no markdown headers, no JSON. If the logged data genuinely can't answer something, say so briefly and still give your best practical guidance.`;

/** Builds the system-prompt context block shared by both AI providers' chat calls. */
export function buildInsightsChatContext(
  days: DaySummary[],
  settings: Settings,
  insights: WeeklyInsights,
): string {
  const payload = { ...buildWeeklyPayload(days, settings), insights_already_given: insights };
  return `${INSIGHTS_CHAT_SYSTEM}\n\nHere is the week's logged data and the summary you already gave:\n${JSON.stringify(payload, null, 2)}`;
}

/** Follow-up chat about an already-generated weekly summary — plain text, not JSON. */
export async function chatAboutInsights(
  apiKey: string,
  days: DaySummary[],
  settings: Settings,
  insights: WeeklyInsights,
  history: ChatMessage[],
): Promise<string> {
  const client = makeClient(apiKey);
  const system = buildInsightsChatContext(days, settings, insights);
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) throw new ClaudeError('Empty response — retry.', true);
    return text;
  } catch (err) {
    throw toFriendlyError(err);
  }
}
