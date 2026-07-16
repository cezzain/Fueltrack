import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createClient, type RedisClientType } from 'redis';

/**
 * FuelTrack accounts.
 *
 * POST /api/auth  body { action: 'signup' | 'login', email, password }
 *   -> { token, email }
 *
 * Users and session tokens live in the same Redis the sync store uses:
 *   ft:auth:user:<email>   JSON { id, email, salt, hash }   (scrypt-hashed)
 *   ft:auth:token:<token>  user id
 * The token goes in the Authorization header of /api/sync calls; each
 * account's snapshot is stored under its user id, so people you share the
 * app with each get their own isolated data.
 */

function findConnectionUrl(): string | null {
  const e = process.env;
  for (const k of ['REDIS_URL', 'KV_URL', 'REDIS_CONNECTION_STRING']) {
    if (e[k]) return e[k] as string;
  }
  for (const [k, v] of Object.entries(e)) {
    if (v && /^rediss?:\/\//.test(v) && /redis|kv/i.test(k)) return v;
  }
  return null;
}

let clientPromise: Promise<RedisClientType> | null = null;
function redis(url: string): Promise<RedisClientType> {
  if (!clientPromise) {
    const c = createClient({ url }) as RedisClientType;
    c.on('error', () => {});
    clientPromise = c.connect().then(() => c);
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }
  return clientPromise;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const url = findConnectionUrl();
  if (!url) {
    res.status(503).json({ error: 'Accounts are not configured on the server (no storage).' });
    return;
  }
  // GET /api/auth → public client config (which providers are available).
  if (req.method === 'GET') {
    res.status(200).json({ googleClientId: process.env.GOOGLE_CLIENT_ID ?? null });
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const body = (req.body ?? {}) as {
    action?: string;
    email?: string;
    password?: string;
    idToken?: string;
  };
  const action = body.action;

  try {
    const db = await redis(url);

    const issueToken = async (user: StoredUser): Promise<void> => {
      const token = randomBytes(32).toString('hex');
      await db.set(`ft:auth:token:${token}`, JSON.stringify({ id: user.id, email: user.email }));
      res.status(200).json({ token, email: user.email, linkedGoogle: !!user.google });
    };

    // ---- Sign in / sign up with Google (also auto-links by verified email) ----
    if (action === 'google') {
      const info = await verifyGoogleToken(body.idToken ?? '');
      if (!info) {
        res.status(401).json({ error: 'Google sign-in could not be verified — try again.' });
        return;
      }
      // Existing account already linked to this Google identity?
      const linkedEmail = await db.get(`ft:auth:google:${info.sub}`);
      if (linkedEmail) {
        const raw = await db.get(`ft:auth:user:${linkedEmail}`);
        if (raw) {
          await issueToken(JSON.parse(raw) as StoredUser);
          return;
        }
      }
      // Account with the same (Google-verified) email → link it.
      const raw = await db.get(`ft:auth:user:${info.email}`);
      if (raw) {
        const user = JSON.parse(raw) as StoredUser;
        user.google = info.sub;
        await db.set(`ft:auth:user:${info.email}`, JSON.stringify(user));
        await db.set(`ft:auth:google:${info.sub}`, info.email);
        await issueToken(user);
        return;
      }
      // Brand-new user — create a password-less account.
      const user: StoredUser = { id: randomUUID(), email: info.email, google: info.sub };
      await db.set(`ft:auth:user:${info.email}`, JSON.stringify(user), { NX: true });
      await db.set(`ft:auth:google:${info.sub}`, info.email);
      await issueToken(user);
      return;
    }

    // ---- Link Google to the currently signed-in account ----
    if (action === 'link-google') {
      const session = await resolveSession(db, req.headers.authorization);
      if (!session) {
        res.status(401).json({ error: 'Session expired — log in again.' });
        return;
      }
      const info = await verifyGoogleToken(body.idToken ?? '');
      if (!info) {
        res.status(401).json({ error: 'Google sign-in could not be verified — try again.' });
        return;
      }
      const existing = await db.get(`ft:auth:google:${info.sub}`);
      if (existing && existing !== session.email) {
        res.status(409).json({ error: 'That Google account is already linked to a different FuelTrack account.' });
        return;
      }
      const raw = await db.get(`ft:auth:user:${session.email}`);
      if (!raw) {
        res.status(401).json({ error: 'Account not found — log in again.' });
        return;
      }
      const user = JSON.parse(raw) as StoredUser;
      user.google = info.sub;
      await db.set(`ft:auth:user:${session.email}`, JSON.stringify(user));
      await db.set(`ft:auth:google:${info.sub}`, session.email);
      res.status(200).json({ ok: true, linkedGoogle: true });
      return;
    }

    // ---- Email + password ----
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    if (action !== 'signup' && action !== 'login') {
      res.status(400).json({ error: 'Unknown action.' });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const userKey = `ft:auth:user:${email}`;
    let user: StoredUser;
    if (action === 'signup') {
      const salt = randomBytes(16).toString('hex');
      user = { id: randomUUID(), email, salt, hash: hashPassword(password, salt) };
      // NX so a concurrent signup for the same email can't overwrite.
      const created = await db.set(userKey, JSON.stringify(user), { NX: true });
      if (created === null) {
        res.status(409).json({ error: 'An account with this email already exists — log in instead.' });
        return;
      }
    } else {
      const raw = await db.get(userKey);
      if (!raw) {
        res.status(401).json({ error: 'No account with this email — create one first.' });
        return;
      }
      user = JSON.parse(raw) as StoredUser;
      if (!user.salt || !user.hash) {
        res.status(401).json({ error: 'This account uses Google Sign-In — use the Google button.' });
        return;
      }
      const attempt = Buffer.from(hashPassword(password, user.salt), 'hex');
      const stored = Buffer.from(user.hash, 'hex');
      if (attempt.length !== stored.length || !timingSafeEqual(attempt, stored)) {
        res.status(401).json({ error: 'Wrong password.' });
        return;
      }
    }

    await issueToken(user);
  } catch (err) {
    res.status(502).json({ error: `Account storage error: ${(err as Error).message}` });
  }
}

interface StoredUser {
  id: string;
  email: string;
  salt?: string;
  hash?: string;
  /** Google account id ("sub") once linked. */
  google?: string;
}

/** Resolve a Bearer session token to { id, email } (tokens store JSON). */
async function resolveSession(
  db: RedisClientType,
  authHeader: string | undefined,
): Promise<{ id: string; email: string } | null> {
  const token = (authHeader ?? '').startsWith('Bearer ') ? authHeader!.slice(7).trim() : '';
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const raw = await db.get(`ft:auth:token:${token}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: string; email?: string };
    if (parsed.id && parsed.email) return { id: parsed.id, email: parsed.email };
  } catch {
    // legacy token (plain user id, no email) — can't link, force re-login
  }
  return null;
}

/**
 * Verify a Google ID token via Google's tokeninfo endpoint (signature checked
 * by Google; we check audience/issuer/expiry/verified-email ourselves).
 */
async function verifyGoogleToken(
  idToken: string,
): Promise<{ sub: string; email: string } | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !idToken) return null;
  let res: Response;
  try {
    res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const info = (await res.json()) as {
    aud?: string;
    iss?: string;
    sub?: string;
    email?: string;
    email_verified?: string;
    exp?: string;
  };
  if (info.aud !== clientId) return null;
  if (info.iss !== 'https://accounts.google.com' && info.iss !== 'accounts.google.com') return null;
  if (info.email_verified !== 'true' || !info.sub || !info.email) return null;
  if (info.exp && Number(info.exp) * 1000 < Date.now()) return null;
  return { sub: info.sub, email: info.email.toLowerCase() };
}
