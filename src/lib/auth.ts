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
