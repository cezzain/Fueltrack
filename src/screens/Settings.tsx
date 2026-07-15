import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AiProvider } from '../types';
import { useApp } from '../state/AppContext';
import { activeModelLabel } from '../lib/ai';
import { exportAllData } from '../lib/db';
import { formatTime, todayKey } from '../lib/dates';

function Section({ title, chip, children }: { title: string; chip?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-[1.5px] border-edge bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="label-caps text-[10px] tracking-[0.12em] text-ink-faint">{title}</h2>
        {chip}
      </div>
      {children}
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
        className="num h-11 w-full border-[1.5px] border-edge bg-bg px-3 text-sm text-ink outline-none focus:border-accent"
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

/** Readable, unambiguous random code (no 0/O/1/I) grouped for easy typing. */
function generateSyncCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

function SyncSection() {
  const { settings, updateSettings, syncState, syncError, lastSyncedAt, syncNow } = useApp();
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const enabled = settings.syncEnabled;
  const code = settings.syncCode;

  const toggle = () => {
    if (!enabled && !code.trim()) {
      updateSettings({ syncEnabled: true, syncCode: generateSyncCode() });
    } else {
      updateSettings({ syncEnabled: !enabled });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the code is visible to copy manually */
    }
  };

  const status = (() => {
    if (syncState === 'syncing') return <span className="text-ink-dim">Syncing…</span>;
    if (syncState === 'error') return <span className="text-danger">{syncError}</span>;
    if (lastSyncedAt) return <span className="text-accent">Last synced {formatTime(lastSyncedAt)}</span>;
    return <span className="text-ink-faint">Not synced yet</span>;
  })();

  return (
    <Section
      title="Sync across devices"
      chip={
        enabled ? (
          <span className="label-caps text-[10px] tracking-[0.08em] text-accent">on</span>
        ) : (
          <span className="label-caps text-[10px] tracking-[0.08em] text-ink-faint">off</span>
        )
      }
    >
      <button
        type="button"
        onClick={toggle}
        aria-pressed={enabled}
        className={`label-caps h-11 w-full border-[1.5px] border-edge text-[12px] tracking-[0.08em] transition-colors ${
          enabled ? 'bg-ink text-surface' : 'bg-transparent text-ink'
        }`}
      >
        {enabled ? 'Turn sync off' : 'Turn sync on'}
      </button>

      {enabled && (
        <>
          <p className="mt-3 text-xs text-ink-dim">
            Enter this <span className="font-semibold text-ink">same code</span> on your other
            devices to share one account.
          </p>
          <div className="relative mt-2">
            <input
              type={showCode ? 'text' : 'password'}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="num h-11 w-full border-[1.5px] border-edge bg-bg px-3 pr-12 text-[14px] tracking-[0.08em] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
              value={code}
              onChange={(e) => updateSettings({ syncCode: e.target.value })}
              aria-label="Sync code"
            />
            <button
              type="button"
              onClick={() => setShowCode((s) => !s)}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-ink-dim active:translate-y-px"
              aria-label={showCode ? 'Hide sync code' : 'Show sync code'}
            >
              <EyeIcon off={showCode} />
            </button>
          </div>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => updateSettings({ syncCode: generateSyncCode() })}
              className="label-caps h-10 flex-1 border border-hairline text-[10px] tracking-[0.06em] text-ink-dim active:translate-y-px"
            >
              New code
            </button>
            <button
              type="button"
              onClick={() => void copy()}
              className="label-caps h-10 flex-1 border border-hairline text-[10px] tracking-[0.06em] text-ink-dim active:translate-y-px"
            >
              {copied ? <span className="text-accent">Copied ✓</span> : 'Copy'}
            </button>
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={syncState === 'syncing' || !code.trim()}
              className="label-caps h-10 flex-1 border-[1.5px] border-edge bg-accent text-[10px] tracking-[0.06em] text-surface active:translate-y-px disabled:opacity-40"
            >
              Sync now
            </button>
          </div>

          <p className="mt-2.5 text-xs leading-relaxed">{status}</p>

          <p className="mt-3 text-xs leading-relaxed text-warn/90">
            Your data and API key are stored in the cloud under this code — anyone who has the code
            can read them, so keep it secret. Meal photos don&rsquo;t sync.
          </p>
        </>
      )}
    </Section>
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
      <h1 className="serif mt-5 text-[40px] leading-none text-ink">Settings</h1>

      <Section
        title="AI provider"
        chip={
          hasKey ? (
            <span className="label-caps text-[10px] tracking-[0.08em] text-accent">key set ✓</span>
          ) : (
            <span className="label-caps text-[10px] tracking-[0.08em] text-ink-faint">no key</span>
          )
        }
      >
        <div className="flex border-[1.5px] border-edge" role="radiogroup" aria-label="AI provider">
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
              className={`h-10 flex-1 text-[12px] font-semibold transition-colors first:border-r first:border-edge ${
                settings.provider === p.id ? 'bg-ink text-surface' : 'bg-transparent text-ink-faint'
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
            className="h-11 w-full border-[1.5px] border-edge bg-bg px-3 pr-12 font-mono text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
            value={isGemini ? settings.geminiApiKey : settings.apiKey}
            onChange={(e) =>
              updateSettings(isGemini ? { geminiApiKey: e.target.value } : { apiKey: e.target.value })
            }
            aria-label={isGemini ? 'Gemini API key' : 'Anthropic API key'}
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-ink-dim active:translate-y-px"
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
        <p className="mt-3 text-xs text-ink-faint">Targets update the bars instantly.</p>
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

      <SyncSection />

      <Section title="Data">
        <button
          type="button"
          onClick={() => void handleExport()}
          className="label-caps h-[50px] w-full border-[1.5px] border-edge text-[12px] tracking-[0.08em] text-ink active:translate-y-px"
        >
          {exported ? <span className="text-accent">Exported ✓</span> : 'Export data as JSON'}
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
