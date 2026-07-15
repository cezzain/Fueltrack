import type { FoodItem, Meal, MealType } from '../types';
import { seedOnce } from './db';

/** Epoch ms for a Dubai-local wall-clock time (GST is fixed UTC+4, no DST). */
function dubai(dateKey: string, time: string): number {
  return Date.parse(`${dateKey}T${time}:00+04:00`);
}

// Seed records use STABLE ids (not random) so that if two devices each seed
// their own demo data before syncing, the identical ids dedupe on merge
// instead of showing doubled demo meals.
function item(
  id: string,
  name: string,
  portion: string,
  protein_g: number,
  calories: number,
): FoodItem {
  return { id, name, portion, protein_g, calories, confidence: 'medium' };
}

function udonBowlItems(prefix: string): FoodItem[] {
  return [
    item(`${prefix}-beef`, 'Shaved beef', '~250g cooked', 62, 700),
    item(`${prefix}-tofu`, 'Fried tofu', '4 pieces', 12, 220),
    item(`${prefix}-udon`, 'Udon noodles', '1 serving', 7, 250),
    item(`${prefix}-veg`, 'Mushrooms + bok choy', '1 cup', 3, 40),
    // 9g so the items sum to the meal's 93g total (250ml milk is 8-9g).
    item(`${prefix}-milk`, 'Glass of milk', '250 ml', 9, 115),
  ];
}

function omelette(id: string, dateKey: string, time: string): Meal {
  return {
    id,
    dateKey,
    name: 'Omelette (3 eggs, cheese, veggies)',
    loggedAt: dubai(dateKey, time),
    mealType: 'breakfast',
    items: [item(`${id}-omelette`, 'Omelette', '3 eggs, cheese, veggies, oil', 26, 475)],
    protein_g: 26,
    calories: 475,
    source: 'ai_text',
    edited: false,
    aiNotes: 'Assumed ~30g cheese and ~1 tbsp cooking oil.',
  };
}

function udonBowl(id: string, dateKey: string, time: string, mealType: MealType): Meal {
  return {
    id,
    dateKey,
    name: 'Beef & tofu udon bowl + milk',
    loggedAt: dubai(dateKey, time),
    mealType,
    items: udonBowlItems(id),
    protein_g: 93,
    calories: 1325,
    source: 'ai_text',
    edited: false,
    aiNotes: 'Beef portion estimated using the fork as a scale reference.',
  };
}

/**
 * Pre-populate storage on first run (atomically — see db.seedOnce):
 * Mon 13 Jul 2026 — 212g protein / 3,125 kcal across three meals.
 * Tue 14 Jul 2026 — 26g / 475 so far; flagged as a light (travel) day.
 * All entries are AI-estimated (source ai_text, edited=false).
 */
export async function seedIfNeeded(): Promise<boolean> {
  const monday = '2026-07-13';
  const tuesday = '2026-07-14';

  return seedOnce(
    'seeded.v1',
    [
      omelette('seed-mon-breakfast', monday, '08:45'),
      udonBowl('seed-mon-lunch', monday, '13:10', 'lunch'),
      udonBowl('seed-mon-dinner', monday, '19:40', 'dinner'),
      omelette('seed-tue-breakfast', tuesday, '08:20'),
    ],
    [{ dateKey: tuesday, lightDay: true }], // travel / airport day
  );
}
