import type { FoodItem, Meal, MealType } from '../types';
import { newId } from '../types';
import { seedOnce } from './db';

/** Epoch ms for a Dubai-local wall-clock time (GST is fixed UTC+4, no DST). */
function dubai(dateKey: string, time: string): number {
  return Date.parse(`${dateKey}T${time}:00+04:00`);
}

function item(name: string, portion: string, protein_g: number, calories: number): FoodItem {
  return { id: newId(), name, portion, protein_g, calories, confidence: 'medium' };
}

function udonBowlItems(): FoodItem[] {
  return [
    item('Shaved beef', '~250g cooked', 62, 700),
    item('Fried tofu', '4 pieces', 12, 220),
    item('Udon noodles', '1 serving', 7, 250),
    item('Mushrooms + bok choy', '1 cup', 3, 40),
    // 9g so the items sum to the meal's 93g total (250ml milk is 8-9g).
    item('Glass of milk', '250 ml', 9, 115),
  ];
}

function omelette(dateKey: string, time: string): Meal {
  return {
    id: newId(),
    dateKey,
    name: 'Omelette (3 eggs, cheese, veggies)',
    loggedAt: dubai(dateKey, time),
    mealType: 'breakfast',
    items: [item('Omelette', '3 eggs, cheese, veggies, oil', 26, 475)],
    protein_g: 26,
    calories: 475,
    source: 'ai_text',
    edited: false,
    aiNotes: 'Assumed ~30g cheese and ~1 tbsp cooking oil.',
  };
}

function udonBowl(dateKey: string, time: string, mealType: MealType): Meal {
  return {
    id: newId(),
    dateKey,
    name: 'Beef & tofu udon bowl + milk',
    loggedAt: dubai(dateKey, time),
    mealType,
    items: udonBowlItems(),
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
      omelette(monday, '08:45'),
      udonBowl(monday, '13:10', 'lunch'),
      udonBowl(monday, '19:40', 'dinner'),
      omelette(tuesday, '08:20'),
    ],
    [{ dateKey: tuesday, lightDay: true }], // travel / airport day
  );
}
