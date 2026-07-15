import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { AnalysisResult, MealType } from '../types';
import { activeApiKey, MEAL_TYPES } from '../types';
import { useApp } from '../state/AppContext';
import { AiError, analyzeMealPhoto, analyzeMealText } from '../lib/ai';
import { dateTimeToEpoch, formatRelativeDayLabel, formatTime, lastNDateKeys, suggestedMealType } from '../lib/dates';
import { useOnline } from '../hooks/useOnline';
import { compressImage, type CompressedImage } from '../lib/images';
import { ConfirmationCard } from '../components/ConfirmationCard';
import { ClockIcon } from '../components/icons';

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
  const { settings, todayKey, logMeal, setTab } = useApp();
  const hasKey = activeApiKey(settings).length > 0;

  const [mode, setMode] = useState<Mode>('photo');
  const [phase, setPhase] = useState<Phase>('input');
  const [error, setError] = useState<AiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [mealType, setMealType] = useState<MealType>(() => suggestedMealType());

  // Which day/time this meal logs to — defaults to now, editable to backfill
  // a past day (e.g. "log this for yesterday").
  const [logDateKey, setLogDateKey] = useState(todayKey);
  const [logTime, setLogTime] = useState(() => formatTime(Date.now()));
  // The date/time controls stay collapsed behind a compact chip so the common
  // "log it now" case isn't buried under a form; expand only to backfill.
  const [whenOpen, setWhenOpen] = useState(false);
  const yesterdayKey = lastNDateKeys(2)[0];
  // Matches History's own 30-day window so a backfilled meal is never
  // logged somewhere the rest of the app can't show it.
  const minLogDateKey = lastNDateKeys(30)[0];

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
    setLogDateKey(todayKey);
    setLogTime(formatTime(Date.now()));
    setWhenOpen(false);
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
        dateKey: logDateKey,
        loggedAt: dateTimeToEpoch(logDateKey, logTime),
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
        dateKey: logDateKey,
        loggedAt: dateTimeToEpoch(logDateKey, logTime),
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
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Meal type">
      {MEAL_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={mealType === t}
          onClick={() => setMealType(t)}
          className={`h-[34px] border-[1.5px] border-edge px-3.5 text-[11px] font-semibold capitalize transition-colors ${
            mealType === t ? 'bg-ink text-surface' : 'bg-transparent text-ink'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );

  const isBackfill = logDateKey !== todayKey;
  const whenPicker = whenOpen ? (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { key: todayKey, label: 'Today' },
          { key: yesterdayKey, label: 'Yesterday' },
        ].map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setLogDateKey(d.key)}
            className={`h-[34px] border-[1.5px] border-edge px-3.5 text-[11px] font-semibold transition-colors ${
              logDateKey === d.key ? 'bg-ink text-surface' : 'bg-transparent text-ink'
            }`}
          >
            {d.label}
          </button>
        ))}
        <input
          type="date"
          value={logDateKey}
          max={todayKey}
          min={minLogDateKey}
          onChange={(e) => e.target.value && setLogDateKey(e.target.value)}
          aria-label="Log date"
          className="num h-[34px] border-[1.5px] border-edge bg-bg px-2 text-[12px] text-ink outline-none focus:border-accent"
        />
        <input
          type="time"
          value={logTime}
          onChange={(e) => e.target.value && setLogTime(e.target.value)}
          aria-label="Log time"
          className="num h-[34px] border-[1.5px] border-edge bg-bg px-2 text-[12px] text-ink outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => setWhenOpen(false)}
          className="label-caps ml-auto text-[10px] tracking-[0.06em] text-ink-faint underline decoration-hairline underline-offset-2"
        >
          Done
        </button>
      </div>
      {isBackfill && (
        <p className="serif mt-1.5 text-[12px] italic text-ink-faint">
          Logging for {formatRelativeDayLabel(logDateKey)}
        </p>
      )}
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setWhenOpen(true)}
      className="flex items-center gap-2 text-[12px] text-ink-dim"
    >
      <ClockIcon size={13} />
      <span className={`num ${isBackfill ? 'font-semibold text-accent' : ''}`}>
        {isBackfill ? formatRelativeDayLabel(logDateKey) : 'Today'} · {logTime}
      </span>
      <span className="label-caps text-[9.5px] tracking-[0.06em] text-ink-faint underline decoration-hairline underline-offset-2">
        change
      </span>
    </button>
  );

  const apiKeyCard = (
    <div className="border-[1.5px] border-edge bg-surface p-4">
      <p className="serif text-[16px] italic leading-relaxed text-ink">
        Add your {settings.provider === 'gemini' ? 'Gemini' : 'Anthropic'} API key in Settings to
        use AI analysis.
      </p>
      <button
        type="button"
        onClick={() => setTab('settings')}
        className="label-caps mt-3 h-11 w-full border-[1.5px] border-edge text-[11px] text-ink active:translate-y-px"
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
      className="label-caps h-[52px] w-full border-[1.5px] border-edge bg-accent text-[14px] tracking-[0.06em] text-surface shadow-offset-4 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40 disabled:shadow-offset-4"
    >
      Analyze ↗
    </button>
  );

  return (
    <div className="space-y-4 md:max-w-[560px]">
      <header className="mt-5 md:mt-0">
        <h1 className="serif text-[40px] leading-none text-ink md:text-[56px]">Log a meal</h1>
        <p className="mt-2 text-[13px] text-ink-faint">
          {phase === 'review'
            ? 'Review the estimate — nothing saves until you confirm.'
            : 'Snap it, describe it, or type it in.'}
        </p>
      </header>

      {phase === 'review' && analysis ? (
        <div className="space-y-3">
          {error && (
            <div className="animate-rise border-[1.5px] border-danger bg-surface p-3">
              <p className="text-sm leading-relaxed text-ink">{error.message}</p>
            </div>
          )}
          {whenPicker}
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
              className="w-full border-[1.5px] border-edge opacity-70"
            />
          )}
          {mode === 'describe' && description.trim() && (
            <div className="border-[1.5px] border-edge bg-surface p-4 text-sm leading-relaxed text-ink-dim">
              {description}
            </div>
          )}
          <div className="animate-rise flex flex-col items-center gap-4 border-[1.5px] border-edge bg-surface px-6 py-9">
            <p key={statusIdx} className="serif animate-rise text-[26px] italic text-ink" aria-live="polite">
              {STATUS_LINES[statusIdx]}
            </p>
            <div className="h-1.5 w-40 border-[1.5px] border-edge" style={{ padding: 1.5 }}>
              <div className="animate-pulse-w h-full bg-accent" aria-hidden="true" />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Mode switch */}
          <div className="flex border-[1.5px] border-edge">
            {MODES.map((m, i) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                onClick={() => {
                  setMode(m.id);
                  setError(null);
                }}
                className={`label-caps h-[42px] flex-1 text-[11.5px] font-semibold tracking-[0.08em] transition-colors ${
                  i < MODES.length - 1 ? 'border-r border-edge' : ''
                } ${mode === m.id ? 'bg-ink text-surface' : 'bg-transparent text-ink-faint'}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {whenPicker}
          {mealTypePicker}

          {!online && mode !== 'manual' && (
            <div className="serif border border-hairline bg-surface px-3 py-2.5 text-[13px] italic text-ink-dim">
              Offline — AI analysis needs internet. Manual logging still works.
            </div>
          )}

          {error && (
            <div className="animate-rise border-[1.5px] border-danger bg-surface p-4">
              <p className="text-sm leading-relaxed text-ink">{error.message}</p>
              {mode !== 'manual' && (
                <div className="mt-3 flex gap-2">
                  {error.retryable !== false && (
                    <button
                      type="button"
                      onClick={runAnalysis}
                      className="label-caps h-11 flex-1 border-[1.5px] border-edge bg-accent text-[11px] text-surface active:translate-y-px"
                    >
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={enterManually}
                    className="label-caps h-11 flex-1 border-[1.5px] border-edge text-[11px] text-ink active:translate-y-px"
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
                    className="w-full border-[1.5px] border-edge"
                  />
                  <button
                    type="button"
                    aria-label="Discard photo"
                    onClick={() => setPhoto(null)}
                    className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center border-[1.5px] border-edge bg-surface text-ink active:translate-y-px"
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
                    className="paper-stripes flex aspect-[4/3] w-full flex-col items-center justify-center gap-2.5 border-[1.5px] border-dashed border-edge active:translate-y-px disabled:opacity-60"
                  >
                    <span className="serif text-[24px] text-ink">
                      {compressing ? 'Processing photo…' : 'Take a photo'}
                    </span>
                    <span className="px-10 text-center text-[11.5px] text-ink-faint">
                      Tip: put your hand next to the plate for scale.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => libraryRef.current?.click()}
                    disabled={compressing}
                    className="label-caps h-11 w-full border-[1.5px] border-edge text-[11px] text-ink active:translate-y-px disabled:opacity-60"
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
                  className="h-12 w-full border-[1.5px] border-edge bg-bg px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
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
                className="w-full resize-none border-[1.5px] border-edge bg-bg p-4 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-accent"
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
                  className="h-12 w-full border-[1.5px] border-edge bg-bg px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
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
                    className="num h-12 w-full border-[1.5px] border-edge bg-bg px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
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
                    className="num h-12 w-full border-[1.5px] border-edge bg-bg px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={saveManual}
                disabled={!mName.trim() || saving}
                className="label-caps h-[52px] w-full border-[1.5px] border-edge bg-accent text-[14px] tracking-[0.06em] text-surface shadow-offset-4 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40"
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
