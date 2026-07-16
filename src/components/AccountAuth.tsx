import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext';
import { AuthError, fetchAuthConfig, googleSignIn, logIn, signUp } from '../lib/auth';
import { renderGoogleButton } from '../lib/google';

/**
 * Email + password form for creating an account or logging in. On success the
 * session token is stored (device-local) and a first sync runs, pulling the
 * account's data onto this device and pushing anything logged locally.
 */
export function AccountAuthForm({ onDone }: { onDone?: () => void }) {
  const { updateSettings, syncNow } = useApp();
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleRef = useRef<HTMLDivElement>(null);
  const [googleReady, setGoogleReady] = useState(false);

  // Render Google's button when the server has a Client ID configured.
  useEffect(() => {
    let cancelled = false;
    void fetchAuthConfig().then((cfg) => {
      if (cancelled || !cfg.googleClientId || !googleRef.current) return;
      renderGoogleButton(googleRef.current, cfg.googleClientId, (idToken) => {
        void (async () => {
          setError(null);
          try {
            const session = await googleSignIn(idToken);
            updateSettings({
              authToken: session.token,
              authEmail: session.email,
              linkedGoogle: session.linkedGoogle ?? true,
            });
            onDone?.();
            void syncNow();
          } catch (err) {
            setError(err instanceof AuthError ? err.message : 'Google sign-in failed — try again.');
          }
        })();
      })
        .then(() => {
          if (!cancelled) setGoogleReady(true);
        })
        .catch(() => {
          /* offline or blocked — email/password still works */
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const session =
        mode === 'signup' ? await signUp(email, password) : await logIn(email, password);
      updateSettings({
        authToken: session.token,
        authEmail: session.email,
        linkedGoogle: session.linkedGoogle ?? false,
      });
      onDone?.();
      void syncNow();
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Something went wrong — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex border-[1.5px] border-edge" role="radiogroup" aria-label="Account mode">
        {(
          [
            { id: 'signup', label: 'Create account' },
            { id: 'login', label: 'Log in' },
          ] as const
        ).map((m, i) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => {
              setMode(m.id);
              setError(null);
            }}
            className={`label-caps h-11 flex-1 text-[11px] tracking-[0.08em] transition-colors ${
              i === 0 ? 'border-r border-edge' : ''
            } ${mode === m.id ? 'bg-ink text-surface' : 'bg-transparent text-ink-faint'}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <input
        type="email"
        autoComplete="email"
        autoCapitalize="off"
        spellCheck={false}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email"
        className="mt-3 h-12 w-full border-[1.5px] border-edge bg-bg px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
      />
      <input
        type="password"
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={mode === 'signup' ? 'Password (8+ characters)' : 'Password'}
        aria-label="Password"
        className="mt-2 h-12 w-full border-[1.5px] border-edge bg-bg px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
      />

      {error && <p className="mt-2.5 text-[12.5px] leading-relaxed text-danger">{error}</p>}

      <button
        type="submit"
        disabled={busy || !email.trim() || password.length < 8}
        className="label-caps mt-3 h-12 w-full border-[1.5px] border-edge bg-accent text-[12px] tracking-[0.08em] text-surface shadow-offset-4 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40 disabled:shadow-offset-4"
      >
        {busy ? 'Working…' : mode === 'signup' ? 'Create account ↗' : 'Log in ↗'}
      </button>

      {/* Google — appears only when a Client ID is configured server-side.
          The mount div stays in the DOM from the start so GIS can render into it. */}
      <div className={googleReady ? 'mt-4 flex items-center gap-3' : 'hidden'}>
        <span className="h-px flex-1 bg-hairline" />
        <span className="label-caps text-[9.5px] tracking-[0.1em] text-ink-faint">or</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>
      <div ref={googleRef} className={googleReady ? 'mt-3 flex justify-center' : ''} />
    </form>
  );
}
