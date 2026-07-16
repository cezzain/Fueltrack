/**
 * Provider-agnostic AI facade: routes to Claude (Anthropic) or Gemini
 * (Google AI Studio) based on the settings' selected provider — with
 * resilience so one flaky response doesn't surface as a failure:
 *
 * 1. Retryable errors (rate limits, 5xx, truncated/unparseable output,
 *    network blips) are retried up to 2 more times with a short backoff.
 * 2. If the selected provider still fails and the OTHER provider's key is
 *    saved in Settings, that provider is tried as a fallback before giving up.
 */
import type { AnalysisResult, ChatMessage, DaySummary, Settings, WeeklyInsights } from '../types';
import { activeApiKey } from '../types';
import {
  analyzeMealPhoto as claudePhoto,
  analyzeMealText as claudeText,
  chatAboutInsights as claudeChatInsights,
  ClaudeError as AiError,
  generateWeeklyInsights as claudeInsights,
} from './claude';
import {
  geminiAnalyzeMealPhoto,
  geminiAnalyzeMealText,
  geminiChatAboutInsights,
  geminiWeeklyInsights,
} from './gemini';

export { AiError };

type Provider = 'claude' | 'gemini';

function requireKey(settings: Settings): string {
  const key = activeApiKey(settings);
  if (!key) {
    const provider = settings.provider === 'gemini' ? 'Gemini' : 'Anthropic';
    throw new AiError(`No ${provider} API key set. Add it in Settings first.`, false);
  }
  return key;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run `fn`, retrying retryable failures with backoff (1.5s, then 3s). */
async function withRetries<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof AiError ? err.retryable : true;
      if (!retryable || attempt === tries) throw err;
      await sleep(1500 * attempt);
    }
  }
  throw lastErr;
}

/**
 * Try the selected provider (with retries); if it still fails and the other
 * provider has a key, quietly fall back to it. The original provider's error
 * is reported if both fail.
 */
async function resilient<T>(
  settings: Settings,
  run: (provider: Provider, key: string) => Promise<T>,
): Promise<T> {
  const primary: Provider = settings.provider === 'gemini' ? 'gemini' : 'claude';
  const primaryKey = requireKey(settings);
  const fallback: Provider = primary === 'gemini' ? 'claude' : 'gemini';
  const fallbackKey = (fallback === 'gemini' ? settings.geminiApiKey : settings.apiKey).trim();

  try {
    return await withRetries(() => run(primary, primaryKey));
  } catch (primaryErr) {
    // Never fall back past a non-retryable *input* problem on our side
    // (e.g. "describe the meal first"); do fall back on bad keys, rate
    // limits, provider outages, and parse failures.
    if (!fallbackKey) throw primaryErr;
    try {
      return await withRetries(() => run(fallback, fallbackKey), 2);
    } catch {
      throw primaryErr; // the provider the user chose is the one to explain
    }
  }
}

export function analyzeMealPhoto(
  settings: Settings,
  photoBase64: string,
  note?: string,
): Promise<AnalysisResult> {
  return resilient(settings, (provider, key) =>
    provider === 'gemini'
      ? geminiAnalyzeMealPhoto(key, photoBase64, note)
      : claudePhoto(key, photoBase64, note),
  );
}

export function analyzeMealText(settings: Settings, description: string): Promise<AnalysisResult> {
  if (!description.trim()) {
    throw new AiError('Describe the meal first.', false);
  }
  return resilient(settings, (provider, key) =>
    provider === 'gemini' ? geminiAnalyzeMealText(key, description) : claudeText(key, description),
  );
}

export function generateWeeklyInsights(
  settings: Settings,
  days: DaySummary[],
): Promise<WeeklyInsights> {
  return resilient(settings, (provider, key) =>
    provider === 'gemini'
      ? geminiWeeklyInsights(key, days, settings)
      : claudeInsights(key, days, settings),
  );
}

/** Follow-up chat about an already-generated weekly summary. */
export function chatAboutInsights(
  settings: Settings,
  days: DaySummary[],
  insights: WeeklyInsights,
  history: ChatMessage[],
): Promise<string> {
  return resilient(settings, (provider, key) =>
    provider === 'gemini'
      ? geminiChatAboutInsights(key, days, settings, insights, history)
      : claudeChatInsights(key, days, settings, insights, history),
  );
}

/** Display name of the active model, for footers/labels. */
export function activeModelLabel(settings: Settings): string {
  return settings.provider === 'gemini' ? 'gemini-flash-latest' : 'claude-sonnet-4-6';
}
