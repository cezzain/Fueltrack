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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const body = (req.body ?? {}) as { action?: string; email?: string; password?: string };
  const action = body.action;
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

  try {
    const db = await redis(url);
    const userKey = `ft:auth:user:${email}`;

    let userId: string;
    if (action === 'signup') {
      const salt = randomBytes(16).toString('hex');
      const user = { id: randomUUID(), email, salt, hash: hashPassword(password, salt) };
      // NX so a concurrent signup for the same email can't overwrite.
      const created = await db.set(userKey, JSON.stringify(user), { NX: true });
      if (created === null) {
        res.status(409).json({ error: 'An account with this email already exists — log in instead.' });
        return;
      }
      userId = user.id;
    } else {
      const raw = await db.get(userKey);
      if (!raw) {
        res.status(401).json({ error: 'No account with this email — create one first.' });
        return;
      }
      const user = JSON.parse(raw) as { id: string; salt: string; hash: string };
      const attempt = Buffer.from(hashPassword(password, user.salt), 'hex');
      const stored = Buffer.from(user.hash, 'hex');
      if (attempt.length !== stored.length || !timingSafeEqual(attempt, stored)) {
        res.status(401).json({ error: 'Wrong password.' });
        return;
      }
      userId = user.id;
    }

    const token = randomBytes(32).toString('hex');
    await db.set(`ft:auth:token:${token}`, userId);
    res.status(200).json({ token, email });
  } catch (err) {
    res.status(502).json({ error: `Account storage error: ${(err as Error).message}` });
  }
}
