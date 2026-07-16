import { AccountAuthForm } from '../components/AccountAuth';

/**
 * First-run login screen (Editorial Type): create an account or log in so
 * data follows you across devices — or skip and use the app on this device
 * only (an account can always be added later in Settings).
 */
export function AuthGate({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-5 py-10 safe-top">
      <div className="w-full max-w-[420px] border-[1.5px] border-edge bg-surface p-6 shadow-offset-8 md:p-8">
        <div className="flex items-center justify-between border-b-[1.5px] border-edge pb-3">
          <span className="label-caps text-[12px] tracking-[0.14em] text-ink">FuelTrack</span>
          <svg width="16" height="16" viewBox="0 0 64 64" aria-hidden="true">
            <path d="M36 8 L18 36 L30 36 L26 56 L46 26 L33 26 Z" fill="#c2410c" />
          </svg>
        </div>

        <h1 className="serif mt-6 text-[40px] leading-[1.02] text-ink">
          Your fuel,
          <br />
          everywhere.
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
          Create an account and your meals, workouts, and weight sync to every device you log in
          on.
        </p>

        <div className="mt-6">
          <AccountAuthForm />
        </div>

        <button
          type="button"
          onClick={onSkip}
          className="label-caps mt-5 w-full text-center text-[10.5px] tracking-[0.08em] text-ink-faint underline decoration-hairline underline-offset-[3px]"
        >
          Skip — use on this device only
        </button>
      </div>
    </div>
  );
}
