import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { AnalysisResult, MealType } from '../types';
import { activeApiKey, MEAL_TYPES } from '../types';
import { useApp } from '../state/AppContext';
import { AiError, analyzeMealPhoto, analyzeMealText } from '../lib/ai';
import { suggestedMealType } from '../lib/dates';
import { useOnline } from '../hooks/useOnline';
import { compressImage, type CompressedImage } from '../lib/images';
import { ConfirmationCard } from '../components/ConfirmationCard';

type Mode = 'photo' | 'describe' | 'manual';
type Phase = 'input' | 'analyzing' | 'review';

const MODES: { id: Mode; label: string }[] = [
  { id: 'photo', label: 'Photo' },
  { id: 'describe', label: 'Describe' },
  { id: 'manual', label: 'Manual' },
];

const STATUS_LINES = ['Reading the plate…', 'Estimating portions…', 'Counting macros…'];

function defaultMealName(analysis: AnalysisResult): string {
  const names = analysis.items.map((it) => it.name).filter(Boolean);
  let joined = names.slice(0, 3).join(' + ');
  if (names.length > 3) joined += ' & more';
  if (!joined) return 'Meal';
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

function toNonNegInt(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/** AI logging flow: input → analyzing → review → saved. Never auto-logs. */
export function Log() {
  const { settings, logMeal, setTab } = useApp();
  const hasKey = activeApiKey(settings).length > 0;

  const [mode, setMode] = useState<Mode>('photo');
  const [phase, setPhase] = useState<Phase>('input');
  const [error, setError] = useState<AiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [mealType, setMealType] = useState<MealType>(() => suggestedMealType());

  // Photo mode — the compressed photo survives analysis errors; it is only
  // cleared on explicit discard (✕) or a successful save.
  const [photo, setPhoto] = useState<CompressedImage | null>(null);
  const [note, setNote] = useState('');
  const [compressing, setCompressing] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  // Describe mode
  const [description, setDescription] = useState('');

  // Manual mode (also the AI-failure fallback)
  const [mName, setMName] = useState('');
  const [mProtein, setMProtein] = useState('');
  const [mCalories, setMCalories] = useState('');

  // Review state
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisSource, setAnalysisSource] = useState<'ai_photo' | 'ai_text'>('ai_photo');
  const [analysisSeq, setAnalysisSeq] = useState(0);

  // Online/offline awareness (advisory only — never blocks an API attempt).
  const online = useOnline();

  // Rotating status lines while analyzing
  const [statusIdx, setStatusIdx] = useState(0);
  useEffect(() => {
    if (phase !== 'analyzing') return;
    setStatusIdx(0);
    const t = setInterval(() => setStatusIdx((i) => (i + 1) % STATUS_LINES.length), 1600);
    return () => clearInterval(t);
  }, [phase]);

  const resetAll = () => {
    setPhoto(null);
    setNote('');
    setDescription('');
    setMName('');
    setMProtein('');
    setMCalories('');
    setAnalysis(null);
    setError(null);
    setSaving(false);
    setPhase('input');
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setCompressing(true);
    try {
      const img = await compressImage(file);
      setPhoto(img);
      setError(null);
    } catch {
      setError(new AiError('Could not read that image — try another photo.', false));
    } finally {
      setCompressing(false);
    }
  };

  const runAnalysis = async () => {
    if (!hasKey) return; // never call the API without a key — the warning card handles this
    if (mode === 'manual') return;
    if (mode === 'photo' && !photo) return;
    if (mode === 'describe' && !description.trim()) return;
    setError(null);
    setPhase('analyzing');
    try {
      const result =
        mode === 'photo' && photo
          ? await analyzeMealPhoto(settings, photo.base64, note)
          : await analyzeMealText(settings, description);
      setAnalysis(result);
      setAnalysisSource(mode === 'photo' ? 'ai_photo' : 'ai_text');
      setAnalysisSeq((s) => s + 1);
      setPhase('review');
    } catch (err) {
      setError(
        err instanceof AiError
          ? err
          : new AiError('Unexpected error while analyzing — you can retry or log manually.', true),
      );
      setPhase('input'); // photo/text stay intact for retry
    }
  };

  const enterManually = () => {
    const prefill = (mode === 'photo' ? note : description).trim();
    if (prefill) setMName(prefill);
    setError(null);
    setMode('manual');
  };

  const handleConfirm = async (result: { name: string; analysis: AnalysisResult; edited: boolean }) => {
    setSaving(true);
    setError(null);
    try {
      await logMeal({
        name: result.name,
        analysis: result.analysis,
        source: analysisSource,
        edited: result.edited,
        mealType,
        photoDataUrl: analysisSource === 'ai_photo' ? photo?.dataUrl : undefined,
      });
      resetAll();
      setTab('today');
    } catch {
      // Stay on the review card so nothing is lost — and say so.
      setSaving(false);
      setError(new AiError('Could not save the meal to storage — tap "Log it" to try again.', true));
    }
  };

  const saveManual = async () => {
    const nameTrim = mName.trim();
    if (!nameTrim || saving) return;
    const protein = toNonNegInt(mProtein);
    const calories = toNonNegInt(mCalories);
    const manualAnalysis: AnalysisResult = {
      items: [
        { name: nameTrim, portion_estimate: '', protein_g: protein, calories, confidence: 'high' },
      ],
      total_protein_g: protein,
      total_calories: calories,
      notes: '',
    };
    setSaving(true);
    try {
      await logMeal({
        name: nameTrim,
        analysis: manualAnalysis,
        source: 'manual',
        edited: false,
        mealType,
        // Never lose a photo: if one was taken before falling back to manual
        // entry, keep it attached to the meal.
        photoDataUrl: photo?.dataUrl,
      });
      resetAll();
      setTab('today');
    } catch {
      setSaving(false);
      setError(new AiError('Could not save the meal — try again.', true));
    }
  };

  const mealTypePicker = (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Meal type">
      {MEAL_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={mealType === t}
          onClick={() => setMealType(t)}
          className={`h-11 flex-1 rounded-xl text-xs font-medium capitalize transition-colors active:scale-[0.98] ${
            mealType === t ? 'bg-accent-dim text-accent-bright' : 'bg-surface text-ink-dim'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );

  const apiKeyCard = (
    <div className="rounded-2xl border border-edge bg-surface p-4">
      <div className="flex items-start gap-2.5">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warn" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-ink">
          Add your {settings.provider === 'gemini' ? 'Gemini' : 'Anthropic'} API key in Settings to
          use AI analysis.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setTab('settings')}
        className="mt-3 h-11 w-full rounded-xl bg-surface-2 text-sm font-medium text-ink active:scale-[0.98]"
      >
        Open Settings
      </button>
    </div>
  );

  const analyzeButton = (disabled: boolean) => (
    <button
      type="button"
      onClick={runAnalysis}
      disabled={disabled}
      className="h-12 w-full rounded-xl bg-accent font-semibold text-bg active:scale-[0.98] disabled:opacity-40"
    >
      Analyze
    </button>
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-ink">Log a meal</h1>
        <p className="mt-0.5 text-sm text-ink-dim">
          {phase === 'review'
            ? 'Review the estimate — nothing saves until you confirm.'
            : 'Snap it, describe it, or type it in.'}
        </p>
      </header>

      {phase === 'review' && analysis ? (
        <div className="space-y-3">
          {error && (
            <div className="animate-rise rounded-2xl border border-danger/40 bg-surface p-3">
              <p className="text-sm leading-relaxed text-ink">{error.message}</p>
            </div>
          )}
          {mealTypePicker}
          <ConfirmationCard
            key={analysisSeq}
            analysis={analysis}
            photoDataUrl={analysisSource === 'ai_photo' ? photo?.dataUrl : undefined}
            defaultName={defaultMealName(analysis)}
            saving={saving}
            onSave={handleConfirm}
            onDiscard={() => {
              // Back to input, keeping the photo/description intact.
              setAnalysis(null);
              setError(null);
              setPhase('input');
            }}
          />
        </div>
      ) : phase === 'analyzing' ? (
        <div className="space-y-4">
          {mode === 'photo' && photo && (
            <img
              src={photo.dataUrl}
              alt="Meal being analyzed"
              className="w-full rounded-2xl border border-edge opacity-70"
            />
          )}
          {mode === 'describe' && description.trim() && (
            <div className="rounded-2xl border border-edge bg-surface p-4 text-sm leading-relaxed text-ink-dim">
              {description}
            </div>
          )}
          <div className="animate-rise flex flex-col items-center gap-3 rounded-2xl border border-edge bg-surface p-6">
            <div
              className="h-11 w-11 animate-spin rounded-full border-2 border-surface-2 border-t-accent"
              aria-hidden="true"
            />
            <p key={statusIdx} className="animate-rise text-sm text-ink-dim" aria-live="polite">
              {STATUS_LINES[statusIdx]}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Mode switch */}
          <div className="flex gap-1 rounded-xl bg-surface p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                onClick={() => {
                  setMode(m.id);
                  setError(null);
                }}
                className={`h-11 flex-1 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] ${
                  mode === m.id ? 'bg-surface-2 text-ink' : 'text-ink-dim'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mealTypePicker}

          {!online && mode !== 'manual' && (
            <div className="rounded-xl border border-edge bg-surface px-3 py-2.5 text-xs text-ink-dim">
              Offline — AI analysis needs internet. Manual logging still works.
            </div>
          )}

          {error && (
            <div className="animate-rise rounded-2xl border border-danger/40 bg-surface p-4">
              <p className="text-sm leading-relaxed text-ink">{error.message}</p>
              {mode !== 'manual' && (
                <div className="mt-3 flex gap-2">
                  {error.retryable !== false && (
                    <button
                      type="button"
                      onClick={runAnalysis}
                      className="h-11 flex-1 rounded-xl bg-accent-dim text-sm font-semibold text-accent-bright active:scale-[0.98]"
                    >
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={enterManually}
                    className="h-11 flex-1 rounded-xl bg-surface-2 text-sm font-medium text-ink active:scale-[0.98]"
                  >
                    Enter manually
                  </button>
                </div>
              )}
            </div>
          )}

          {mode === 'photo' && (
            <div className="space-y-3">
              {photo ? (
                <div className="relative">
                  <img
                    src={photo.dataUrl}
                    alt="Meal preview"
                    className="w-full rounded-2xl border border-edge"
                  />
                  <button
                    type="button"
                    aria-label="Discard photo"
                    onClick={() => setPhoto(null)}
                    className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-bg/70 text-ink backdrop-blur active:scale-[0.98]"
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                    disabled={compressing}
                    className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-edge bg-surface active:scale-[0.98] disabled:opacity-60"
                  >
                    <svg
                      className="h-8 w-8 text-ink-dim"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span className="text-sm font-medium text-ink">
                      {compressing ? 'Processing photo…' : 'Take a photo'}
                    </span>
                    <span className="px-6 text-center text-xs text-ink-dim">
                      Tip: put your hand next to the plate for scale.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => libraryRef.current?.click()}
                    disabled={compressing}
                    className="h-11 w-full rounded-xl bg-surface text-sm font-medium text-ink-dim active:scale-[0.98] disabled:opacity-60"
                  >
                    Choose from library
                  </button>
                </>
              )}

              {photo && (
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anything the AI should know? e.g. “the glass is protein shake”"
                  className="h-12 w-full rounded-xl border border-edge bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                />
              )}

              {hasKey ? analyzeButton(!photo || compressing) : apiKeyCard}

              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFile}
              />
              <input
                ref={libraryRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFile}
              />
            </div>
          )}

          {mode === 'describe' && (
            <div className="space-y-3">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="3-egg omelette with cheese and oil…"
                className="w-full resize-none rounded-2xl border border-edge bg-surface p-4 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
              />
              {hasKey ? analyzeButton(!description.trim()) : apiKeyCard}
            </div>
          )}

          {mode === 'manual' && (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs text-ink-dim">Meal name</span>
                <input
                  type="text"
                  value={mName}
                  onChange={(e) => setMName(e.target.value)}
                  placeholder="Chicken & rice bowl"
                  className="h-12 w-full rounded-xl border border-edge bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-ink-dim">Protein (g)</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={mProtein}
                    onChange={(e) => setMProtein(e.target.value)}
                    placeholder="0"
                    className="num h-12 w-full rounded-xl border border-edge bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-ink-dim">Calories (kcal)</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={mCalories}
                    onChange={(e) => setMCalories(e.target.value)}
                    placeholder="0"
                    className="num h-12 w-full rounded-xl border border-edge bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={saveManual}
                disabled={!mName.trim() || saving}
                className="h-12 w-full rounded-xl bg-accent font-semibold text-bg active:scale-[0.98] disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save meal'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
