import type { AnalysisResult, DaySummary, Settings, WeeklyInsights } from '../types';
import {
  ANALYSIS_SYSTEM,
  ClaudeError as AiError,
  INSIGHTS_SYSTEM,
  parseAnalysis,
  parseInsights,
} from './claude';
import { formatDayLabel } from './dates';

/**
 * Google AI Studio (Gemini API) — vision-capable, browser-callable with an
 * API key. Uses Google's rolling "-latest" alias (not a dated snapshot like
 * "gemini-2.5-flash") so this doesn't break again when Google retires a
 * specific model version for new API keys.
 */
const MODEL = 'gemini-flash-latest';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

async function generate(
  apiKey: string,
  system: string,
  parts: GeminiPart[],
  maxOutputTokens: number,
): Promise<string> {
  if (!apiKey.trim()) {
    throw new AiError('No Gemini API key set. Add it in Settings first.', false);
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}/${MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          maxOutputTokens,
          responseMimeType: 'application/json',
          // Flash models "think" by default, and those reasoning tokens are
          // deducted from maxOutputTokens before any JSON is written — with a
          // tight budget the model can burn it all thinking and return
          // truncated/empty text. This is a fixed-shape extraction task with
          // no need for extended reasoning, so turn thinking off.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
  } catch {
    throw new AiError('Could not reach the Gemini API — check your connection and retry.', true);
  }

  if (!res.ok) {
    let message = '';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      message = body.error?.message ?? '';
    } catch {
      // no JSON body
    }
    if (res.status === 400 && /api key/i.test(message)) {
      throw new AiError('Invalid Gemini API key — check it in Settings.', false);
    }
    if (res.status === 401 || res.status === 403) {
      throw new AiError('Gemini rejected the API key — check it in Settings.', false);
    }
    if (res.status === 429) {
      throw new AiError('Gemini rate limited — wait a moment and retry.', true);
    }
    throw new AiError(
      res.status >= 500
        ? 'Gemini API is having trouble — retry in a moment.'
        : `Gemini API error (${res.status})${message ? `: ${message}` : ''}.`,
      res.status >= 500 || res.status === 429 || res.status === 408,
    );
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };

  // The whole prompt can be blocked before any candidate is produced (e.g. a
  // food photo that trips a safety filter) — there's no candidate to inspect
  // for finishReason in that case, so check this first.
  if (data.promptFeedback?.blockReason) {
    throw new AiError(
      `Gemini declined this request (${data.promptFeedback.blockReason}) — try again or rephrase.`,
      false,
    );
  }

  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('\n')
    .trim();

  const finishReason = candidate?.finishReason;
  if (!text) {
    if (finishReason === 'MAX_TOKENS') {
      throw new AiError('Gemini ran out of output space before answering — retry.', true);
    }
    if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
      throw new AiError(`Gemini declined to answer (${finishReason.toLowerCase()}) — retry.`, false);
    }
    throw new AiError('Gemini returned an empty response — retry the analysis.', true);
  }
  // Partial text with a non-STOP finish reason means the JSON is likely cut
  // off mid-object — surface that distinctly rather than a generic parse
  // failure once this reaches parseAnalysis/parseInsights.
  if (finishReason && finishReason !== 'STOP') {
    throw new AiError(
      `Gemini stopped early (${finishReason.toLowerCase()}) before finishing its answer — retry.`,
      true,
    );
  }
  return text;
}

export async function geminiAnalyzeMealPhoto(
  apiKey: string,
  photoBase64: string,
  note?: string,
): Promise<AnalysisResult> {
  const text = await generate(
    apiKey,
    ANALYSIS_SYSTEM,
    [
      { inlineData: { mimeType: 'image/jpeg', data: photoBase64 } },
      {
        text: note?.trim()
          ? `Analyze this meal photo. Extra context from me: ${note.trim()}`
          : 'Analyze this meal photo.',
      },
    ],
    2048,
  );
  return parseAnalysis(text);
}

export async function geminiAnalyzeMealText(
  apiKey: string,
  description: string,
): Promise<AnalysisResult> {
  if (!description.trim()) {
    throw new AiError('Describe the meal first.', false);
  }
  const text = await generate(
    apiKey,
    ANALYSIS_SYSTEM,
    [{ text: `Analyze this meal description: ${description.trim()}` }],
    2048,
  );
  return parseAnalysis(text);
}

export async function geminiWeeklyInsights(
  apiKey: string,
  days: DaySummary[],
  settings: Settings,
): Promise<WeeklyInsights> {
  const payload = {
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
  const text = await generate(
    apiKey,
    INSIGHTS_SYSTEM,
    [{ text: `Last 7 days of data:\n${JSON.stringify(payload, null, 2)}` }],
    2048,
  );
  return parseInsights(text);
}
