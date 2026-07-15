import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * FuelTrack cross-device sync store.
 *
 * A single JSON snapshot per "account", keyed by a SHA-256 namespace the
 * client derives from the user's secret sync code (the raw code never reaches
 * here). Backed by Upstash Redis over its REST API — works with either the
 * Vercel-KV-style env vars or Upstash's own, whichever the connected storage
 * integration injects.
 *
 * GET  /api/sync?ns=<hex>  -> { snapshot } | 404 if empty
 * PUT  /api/sync?ns=<hex>  body { snapshot } -> 204
 */

/**
 * Find the Upstash/KV REST credentials regardless of what the connected
 * storage integration named them. Tries the well-known pairs first, then
 * falls back to any `<PREFIX>REST_API_URL` (or `<PREFIX>REST_URL`) that has a
 * matching token var — this covers custom env-var prefixes chosen in the
 * Vercel Marketplace flow.
 */
function resolveCreds(): { url: string; token: string; source: string } | null {
  const e = process.env;
  const known: [string, string][] = [
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
    ['REDIS_REST_API_URL', 'REDIS_REST_API_TOKEN'],
    ['STORAGE_REST_API_URL', 'STORAGE_REST_API_TOKEN'],
  ];
  for (const [u, t] of known) {
    if (e[u] && e[t]) return { url: e[u] as string, token: e[t] as string, source: u };
  }
  for (const suffix of ['REST_API_URL', 'REST_URL'] as const) {
    const tokenSuffix = suffix.replace('URL', 'TOKEN');
    for (const key of Object.keys(e)) {
      if (key.endsWith(suffix)) {
        const tokenKey = key.slice(0, -suffix.length) + tokenSuffix;
        if (e[key] && e[tokenKey]) {
          return { url: e[key] as string, token: e[tokenKey] as string, source: key };
        }
      }
    }
  }
  return null;
}

/** Env var NAMES (never values) that look storage-related, for diagnostics. */
function storageEnvNames(): string[] {
  return Object.keys(process.env)
    .filter((k) => /redis|kv|upstash|storage/i.test(k))
    .sort();
}

/** Reject anything that isn't a clean 64-char hex namespace. */
const NS_RE = /^[a-f0-9]{64}$/;

/** Guard rail — snapshots are text-only (no photos), so this is generous. */
const MAX_BYTES = 3 * 1024 * 1024;

function redisKey(ns: string): string {
  return `ft:sync:${ns}`;
}

async function redisGet(url: string, token: string, key: string): Promise<string | null> {
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`redis get ${res.status}`);
  const body = (await res.json()) as { result: string | null };
  return body.result;
}

async function redisSet(url: string, token: string, key: string, value: string): Promise<void> {
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: value,
  });
  if (!res.ok) throw new Error(`redis set ${res.status}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const creds = resolveCreds();

  // Safe diagnostic: `/api/sync?diag=1` reports whether storage was found and
  // which storage-related env var NAMES exist (never any values). Lets us tell
  // a "not connected / not redeployed" problem from a "named differently" one.
  if (req.query.diag != null) {
    res.status(200).json({
      configured: creds != null,
      matchedVar: creds?.source ?? null,
      storageEnvNames: storageEnvNames(),
    });
    return;
  }

  if (!creds) {
    res.status(503).json({ error: 'Sync storage is not configured on the server.' });
    return;
  }

  const nsRaw = req.query.ns;
  const ns = Array.isArray(nsRaw) ? nsRaw[0] : nsRaw;
  if (!ns || !NS_RE.test(ns)) {
    res.status(400).json({ error: 'Missing or malformed ns.' });
    return;
  }
  const key = redisKey(ns);

  try {
    if (req.method === 'GET') {
      const value = await redisGet(creds.url, creds.token, key);
      if (value == null) {
        res.status(404).json({ error: 'No snapshot yet.' });
        return;
      }
      res.status(200).json({ snapshot: JSON.parse(value) });
      return;
    }

    if (req.method === 'PUT') {
      const snapshot = (req.body as { snapshot?: unknown })?.snapshot;
      if (snapshot == null) {
        res.status(400).json({ error: 'Missing snapshot.' });
        return;
      }
      const value = JSON.stringify(snapshot);
      if (Buffer.byteLength(value, 'utf8') > MAX_BYTES) {
        res.status(413).json({ error: 'Snapshot too large.' });
        return;
      }
      await redisSet(creds.url, creds.token, key, value);
      res.status(204).end();
      return;
    }

    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    res.status(502).json({ error: `Sync storage error: ${(err as Error).message}` });
  }
}
