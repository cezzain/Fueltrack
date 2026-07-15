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

const REST_URL =
  process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '';
const REST_TOKEN =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '';

/** Reject anything that isn't a clean 64-char hex namespace. */
const NS_RE = /^[a-f0-9]{64}$/;

/** Guard rail — snapshots are text-only (no photos), so this is generous. */
const MAX_BYTES = 3 * 1024 * 1024;

function redisKey(ns: string): string {
  return `ft:sync:${ns}`;
}

async function redisGet(key: string): Promise<string | null> {
  const res = await fetch(`${REST_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REST_TOKEN}` },
  });
  if (!res.ok) throw new Error(`redis get ${res.status}`);
  const body = (await res.json()) as { result: string | null };
  return body.result;
}

async function redisSet(key: string, value: string): Promise<void> {
  const res = await fetch(`${REST_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}` },
    body: value,
  });
  if (!res.ok) throw new Error(`redis set ${res.status}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!REST_URL || !REST_TOKEN) {
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
      const value = await redisGet(key);
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
      await redisSet(key, value);
      res.status(204).end();
      return;
    }

    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    res.status(502).json({ error: `Sync storage error: ${(err as Error).message}` });
  }
}
