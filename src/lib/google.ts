/**
 * Google Identity Services loader — renders the official "Continue with
 * Google" button and hands back the ID token (credential) on success.
 * The script comes from Google's CDN, so provider buttons only appear when
 * online and when a Client ID is configured on the server.
 */

interface GsiButtonApi {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
      }) => void;
      renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GsiButtonApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error('Could not load Google Sign-In.'));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/** Render Google's sign-in button into `el`; `onCredential` gets the ID token. */
export async function renderGoogleButton(
  el: HTMLElement,
  clientId: string,
  onCredential: (idToken: string) => void,
): Promise<void> {
  await loadGsi();
  const api = window.google;
  if (!api) throw new Error('Google Sign-In unavailable.');
  api.accounts.id.initialize({ client_id: clientId, callback: (r) => onCredential(r.credential) });
  api.accounts.id.renderButton(el, {
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    width: Math.min(360, Math.max(200, el.clientWidth || 320)),
  });
}
