import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AiProvider } from '../types';
import { useApp } from '../state/AppContext';
import { activeModelLabel } from '../lib/ai';
import { exportAllData } from '../lib/db';
import { todayKey } from '../lib/dates';

function Section({ title, chip, children }: { title: string; chip?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm uppercase tracking-wide text-ink-dim">{title}</h2>
        {chip}
      </div>
      <div className="rounded-2xl border border-edge bg-surface p-4">{children}</div>
    </section>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}

/** Controlled numeric input: free typing (including empty), clamp + commit on blur. */
function NumberField({ label, value, min, max, onCommit }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  const focusedRef = useRef(false);

  // If the setting changes while we're not editing, reflect it.
  useEffect(() => {
    if (!focusedRef.current) setText(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const n = Number(raw.trim());
    // Empty/invalid on blur reverts to the last committed value — typing is
    // never committed mid-keystroke, so transient prefixes ("35" while typing
    // "350") can't overwrite the setting.
    if (!Number.isFinite(n) || raw.trim() === '') {
      setText(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    onCommit(clamped);
    setText(String(clamped));
  };

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-ink-dim">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        className="num h-12 w-full rounded-xl bg-surface-2 px-3 text-sm text-ink outline-none focus:ring-1 focus:ring-accent/50"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => {
          focusedRef.current = true;
          e.currentTarget.select();
        }}
        onBlur={(e) => {
          focusedRef.current = false;
          commit(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.8" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

export function Settings() {
  const { settings, updateSettings } = useApp();
  const [showKey, setShowKey] = useState(false);
  const [exported, setExported] = useState(false);
  const exportTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => window.clearTimeout(exportTimer.current);
  }, []);

  const handleExport = async () => {
    const json = await exportAllData();
    const filename = `fueltrack-export-${todayKey()}.json`;

    // iOS standalone web apps don't support anchor-download of blob: URLs —
    // prefer the share sheet there, fall back to a download link elsewhere.
    const file = new File([json], filename, { type: 'application/json' });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'FuelTrack export' });
      } catch {
        return; // user cancelled the share sheet — no false "Exported ✓"
      }
    } else {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
    setExported(true);
    window.clearTimeout(exportTimer.current);
    exportTimer.current = window.setTimeout(() => setExported(false), 2000);
  };

  const isGemini = settings.provider === 'gemini';
  const activeKey = (isGemini ? settings.geminiApiKey : settings.apiKey).trim();
  const hasKey = activeKey.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="px-1 text-lg font-semibold text-ink">Settings</h1>

      <Section
        title="AI provider"
        chip={
          hasKey ? (
            <span className="rounded-md bg-accent-dim px-1.5 py-0.5 text-[10px] font-medium text-accent-bright">
              key set ✓
            </span>
          ) : (
            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
              no key
            </span>
          )
        }
      >
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="AI provider">
          {(
            [
              { id: 'claude', label: 'Claude' },
              { id: 'gemini', label: 'Gemini' },
            ] as { id: AiProvider; label: string }[]
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={settings.provider === p.id}
              onClick={() => updateSettings({ provider: p.id })}
              className={`h-11 flex-1 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] ${
                settings.provider === p.id ? 'bg-surface text-ink' : 'text-ink-dim'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="relative mt-3">
          <input
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={isGemini ? 'AIza…' : 'sk-ant-…'}
            className="h-12 w-full rounded-xl bg-surface-2 px-3 pr-12 font-mono text-sm text-ink outline-none placeholder:text-ink-faint focus:ring-1 focus:ring-accent/50"
            value={isGemini ? settings.geminiApiKey : settings.apiKey}
            onChange={(e) =>
              updateSettings(isGemini ? { geminiApiKey: e.target.value } : { apiKey: e.target.value })
            }
            aria-label={isGemini ? 'Gemini API key' : 'Anthropic API key'}
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center rounded-xl text-ink-dim active:scale-[0.98]"
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
          >
            <EyeIcon off={showKey} />
          </button>
        </div>
        <p className="mt-2 text-xs text-warn/90">
          Your key is stored only on this device — don't share the device or the key.
        </p>
        <p className="mt-1 text-xs text-ink-faint">
          {isGemini ? (
            <>
              Get a key at{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                aistudio.google.com
              </a>
            </>
          ) : (
            <>
              Get a key at{' '}
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                console.anthropic.com
              </a>
            </>
          )}
        </p>
      </Section>

      <Section title="Daily targets">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Protein (g)"
            value={settings.proteinTarget_g}
            min={30}
            max={400}
            onCommit={(proteinTarget_g) => updateSettings({ proteinTarget_g })}
          />
          <NumberField
            label="Calories (kcal)"
            value={settings.calorieTarget_kcal}
            min={800}
            max={8000}
            onCommit={(calorieTarget_kcal) => updateSettings({ calorieTarget_kcal })}
          />
        </div>
        <p className="mt-3 text-xs text-ink-faint">Targets update the rings instantly.</p>
      </Section>

      <Section title="Profile">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Height (cm)"
            value={settings.heightCm}
            min={100}
            max={250}
            onCommit={(heightCm) => updateSettings({ heightCm })}
          />
          <NumberField
            label="Weight (kg)"
            value={settings.weightKg}
            min={30}
            max={200}
            onCommit={(weightKg) => updateSettings({ weightKg })}
          />
        </div>
        <p className="mt-3 text-xs text-ink-faint">18 · basketball 6d/week · lean bulk</p>
      </Section>

      <Section title="Data">
        <button
          type="button"
          onClick={() => void handleExport()}
          className="h-12 w-full rounded-xl bg-surface-2 font-medium text-ink active:scale-[0.98]"
        >
          {exported ? <span className="text-accent-bright">Exported ✓</span> : 'Export data as JSON'}
        </button>
        <p className="mt-2 text-xs text-ink-faint">Photos stay on-device and aren't included.</p>
      </Section>

      <footer className="pt-2 text-center text-xs leading-relaxed text-ink-faint">
        <p>FuelTrack · local-only data · AI analysis by {activeModelLabel(settings)}</p>
        <p>Works offline — only AI analysis needs internet.</p>
      </footer>
    </div>
  );
}
