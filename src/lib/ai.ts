/**
 * Provider-agnostic AI facade: routes to Claude (Anthropic) or Gemini
 * (Google AI Studio) based on the settings' selected provider.
 */
import type { AnalysisResult, DaySummary, Settings, WeeklyInsights } from '../types';
import { activeApiKey } from '../types';
import {
  analyzeMealPhoto as claudePhoto,
  analyzeMealText as claudeText,
  ClaudeError as AiError,
  generateWeeklyInsights as claudeInsights,
} from './claude';
import { geminiAnalyzeMealPhoto, geminiAnalyzeMealText, geminiWeeklyInsights } from './gemini';

export { AiError };

function requireKey(settings: Settings): string {
  const key = activeApiKey(settings);
  if (!key) {
    const provider = settings.provider === 'gemini' ? 'Gemini' : 'Anthropic';
    throw new AiError(`No ${provider} API key set. Add it in Settings first.`, false);
  }
  return key;
}

export function analyzeMealPhoto(
  settings: Settings,
  photoBase64: string,
  note?: string,
): Promise<AnalysisResult> {
  const key = requireKey(settings);
  return settings.provider === 'gemini'
    ? geminiAnalyzeMealPhoto(key, photoBase64, note)
    : claudePhoto(key, photoBase64, note);
}

export function analyzeMealText(settings: Settings, description: string): Promise<AnalysisResult> {
  const key = requireKey(settings);
  return settings.provider === 'gemini'
    ? geminiAnalyzeMealText(key, description)
    : claudeText(key, description);
}

export function generateWeeklyInsights(
  settings: Settings,
  days: DaySummary[],
): Promise<WeeklyInsights> {
  const key = requireKey(settings);
  return settings.provider === 'gemini'
    ? geminiWeeklyInsights(key, days, settings)
    : claudeInsights(key, days, settings);
}

/** Display name of the active model, for footers/labels. */
export function activeModelLabel(settings: Settings): string {
  return settings.provider === 'gemini' ? 'gemini-flash-latest' : 'claude-sonnet-4-6';
}
