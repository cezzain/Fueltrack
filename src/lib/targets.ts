import type { Settings } from '../types';

/**
 * Assumed fraction of a normal day's target you'll actually hit on a flagged
 * light day (travel, sick, etc.) — the rest is the "shortfall" redistributed
 * across the week's other days so the week still averages out.
 */
const LIGHT_DAY_FRACTION = 0.5;

export interface EffectiveTargets {
  proteinTarget: number;
  calorieTarget: number;
  /** Whether this specific day is itself flagged light. */
  isLight: boolean;
  /** How many OTHER light days this week are being compensated for. */
  compensatingFor: number;
  proteinBoost: number;
  calorieBoost: number;
}

/**
 * Effective daily targets for one day, given which days in its calendar week
 * are flagged light. A light day gets a reduced target (it's not expected to
 * hit the normal number); that shortfall is spread evenly across the week's
 * remaining non-light days, so hitting the *week* still adds up even though
 * one day was intentionally lighter.
 */
export function computeEffectiveTargets(
  dateKey: string,
  weekLightFlags: Map<string, boolean>,
  settings: Settings,
): EffectiveTargets {
  const isLight = weekLightFlags.get(dateKey) ?? false;
  const numLight = [...weekLightFlags.values()].filter(Boolean).length;
  const numNonLight = weekLightFlags.size - numLight;

  if (numLight === 0 || numNonLight === 0) {
    // Nothing to compensate: no light days this week, or the whole week is
    // light (no day left to absorb the shortfall) — fall back to baseline.
    return {
      proteinTarget: settings.proteinTarget_g,
      calorieTarget: settings.calorieTarget_kcal,
      isLight,
      compensatingFor: 0,
      proteinBoost: 0,
      calorieBoost: 0,
    };
  }

  const proteinShortfallPerLightDay = settings.proteinTarget_g * LIGHT_DAY_FRACTION;
  const calorieShortfallPerLightDay = settings.calorieTarget_kcal * LIGHT_DAY_FRACTION;

  if (isLight) {
    return {
      proteinTarget: Math.round(settings.proteinTarget_g - proteinShortfallPerLightDay),
      calorieTarget: Math.round(settings.calorieTarget_kcal - calorieShortfallPerLightDay),
      isLight: true,
      compensatingFor: 0,
      proteinBoost: 0,
      calorieBoost: 0,
    };
  }

  const proteinBoost = Math.round((proteinShortfallPerLightDay * numLight) / numNonLight);
  const calorieBoost = Math.round((calorieShortfallPerLightDay * numLight) / numNonLight);

  return {
    proteinTarget: settings.proteinTarget_g + proteinBoost,
    calorieTarget: settings.calorieTarget_kcal + calorieBoost,
    isLight: false,
    compensatingFor: numLight,
    proteinBoost,
    calorieBoost,
  };
}
