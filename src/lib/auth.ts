/** Client for /api/auth — account signup/login for cross-device sync. */

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface AuthSession {
  token: string;
  email: string;
  linkedGoogle?: boolean;
}

export interface AuthConfig {
  googleClientId: string | null;
}

let configPromise: Promise<AuthConfig> | null = null;

/** Which sign-in providers the server has configured (cached per session). */
export function fetchAuthConfig(): Promise<AuthConfig> {
  if (!configPromise) {
    configPromise = fetch('/api/auth')
      .then((r) => (r.ok ? (r.json() as Promise<AuthConfig>) : { googleClientId: null }))
      .catch(() => ({ googleClientId: null }));
  }
  return configPromise;
}

async function call(action: 'signup' | 'login', email: string, password: string): Promise<AuthSession> {
  let res: Response;
  try {
    res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, email, password }),
    });
  } catch {
    throw new AuthError('Could not reach the server — check your connection.');
  }
  let body: { token?: string; email?: string; error?: string } = {};
  try {
    body = await res.json();
  } catch {
    // fall through to status-based error
  }
  if (!res.ok || !body.token || !body.email) {
    throw new AuthError(body.error ?? `Sign-in failed (${res.status}).`);
  }
  return { token: body.token, email: body.email };
}

export function signUp(email: string, password: string): Promise<AuthSession> {
  return call('signup', email, password);
}

export function logIn(email: string, password: string): Promise<AuthSession> {
  return call('login', email, password);
}

/** Sign in (or sign up / auto-link by email) with a Google ID token. */
export async function googleSignIn(idToken: string): Promise<AuthSession> {
  let res: Response;
  try {
    res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'google', idToken }),
    });
  } catch {
    throw new AuthError('Could not reach the server — check your connection.');
  }
  const body = (await res.json().catch(() => ({}))) as {
    token?: string;
    email?: string;
    linkedGoogle?: boolean;
    error?: string;
  };
  if (!res.ok || !body.token || !body.email) {
    throw new AuthError(body.error ?? `Google sign-in failed (${res.status}).`);
  }
  return { token: body.token, email: body.email, linkedGoogle: body.linkedGoogle };
}

/** Link a Google account to the currently signed-in account. */
export async function linkGoogle(idToken: string, sessionToken: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ action: 'link-google', idToken }),
    });
  } catch {
    throw new AuthError('Could not reach the server — check your connection.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new AuthError(body.error ?? `Linking failed (${res.status}).`);
  }
}
