import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type RedisClientType } from 'redis';

/**
 * FuelTrack cross-device sync store.
 *
 * A single JSON snapshot per "account", keyed by a SHA-256 namespace the
 * client derives from the user's secret sync code (the raw code never reaches
 * here). Backed by Vercel's native Redis (node-redis over a TCP connection
 * string), also falling back to Upstash's REST API if that's what's
 * connected instead — whichever the storage integration injects.
 *
 * GET  /api/sync?ns=<hex>  -> { snapshot } | 404 if empty
 * PUT  /api/sync?ns=<hex>  body { snapshot } -> 204
 */

/** Any env var that looks like a Redis connection string (redis:// or rediss://). */
function findConnectionUrl(): { url: string; source: string } | null {
  const e = process.env;
  const known = ['REDIS_URL', 'KV_URL', 'REDIS_CONNECTION_STRING'];
  for (const k of known) {
    if (e[k]) return { url: e[k] as string, source: k };
  }
  for (const [k, v] of Object.entries(e)) {
    if (v && /^rediss?:\/\//.test(v) && /redis|kv/i.test(k)) return { url: v, source: k };
  }
  return null;
}

/**
 * Find Upstash/KV REST credentials (fetch-based, no TCP) as a fallback for
 * whichever integration named its env vars slightly differently.
 */
function resolveRestCreds(): { url: string; token: string; source: string } | null {
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

// Reused across warm invocations of the same function instance so we don't
// reconnect on every request.
let tcpClient: Promise<RedisClientType> | null = null;

function getTcpClient(url: string): Promise<RedisClientType> {
  if (!tcpClient) {
    const client = createClient({ url }) as RedisClientType;
    client.on('error', () => {
      // Swallow — a broken connection surfaces as a rejected command instead,
      // which the request handler already catches and reports as a 502.
    });
    tcpClient = client.connect().then(() => client);
    tcpClient.catch(() => {
      tcpClient = null; // let the next request retry the connection
    });
  }
  return tcpClient;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const connUrl = findConnectionUrl();
  const restCreds = connUrl ? null : resolveRestCreds();

  // Safe diagnostic: `/api/sync?diag=1` reports whether storage was found and
  // which storage-related env var NAMES exist (never any values). Lets us tell
  // a "not connected / not redeployed" problem from a "named differently" one.
  if (req.query.diag != null) {
    res.status(200).json({
      configured: connUrl != null || restCreds != null,
      mode: connUrl ? 'tcp' : restCreds ? 'rest' : null,
      matchedVar: connUrl?.source ?? restCreds?.source ?? null,
      storageEnvNames: storageEnvNames(),
    });
    return;
  }

  if (!connUrl && !restCreds) {
    res.status(503).json({ error: 'Sync storage is not configured on the server.' });
    return;
  }

  // Preferred: account auth. A Bearer token from /api/auth maps to a user id,
  // and each account's snapshot lives under that id. The legacy ?ns=<hash>
  // path (pre-account sync codes) still reads/writes so old clients keep
  // working until every device has signed in.
  let key: string;
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (token) {
    if (!/^[a-f0-9]{64}$/.test(token)) {
      res.status(401).json({ error: 'Invalid session — log in again.' });
      return;
    }
    let userId: string | null;
    try {
      const tokenKey = `ft:auth:token:${token}`;
      userId = connUrl
        ? await (await getTcpClient(connUrl.url)).get(tokenKey)
        : await restGet(restCreds!.url, restCreds!.token, tokenKey);
    } catch (err) {
      res.status(502).json({ error: `Sync storage error: ${(err as Error).message}` });
      return;
    }
    if (!userId) {
      res.status(401).json({ error: 'Session expired — log in again.' });
      return;
    }
    key = `ft:sync:acct:${userId}`;
  } else {
    const nsRaw = req.query.ns;
    const ns = Array.isArray(nsRaw) ? nsRaw[0] : nsRaw;
    if (!ns || !NS_RE.test(ns)) {
      res.status(401).json({ error: 'Not signed in.' });
      return;
    }
    key = redisKey(ns);
  }

  try {
    if (req.method === 'GET') {
      const value = connUrl
        ? await (await getTcpClient(connUrl.url)).get(key)
        : await restGet(restCreds!.url, restCreds!.token, key);
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
      if (connUrl) {
        await (await getTcpClient(connUrl.url)).set(key, value);
      } else {
        await restSet(restCreds!.url, restCreds!.token, key, value);
      }
      res.status(204).end();
      return;
    }

    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    res.status(502).json({ error: `Sync storage error: ${(err as Error).message}` });
  }
}

async function restGet(url: string, token: string, key: string): Promise<string | null> {
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`redis get ${res.status}`);
  const body = (await res.json()) as { result: string | null };
  return body.result;
}

async function restSet(url: string, token: string, key: string, value: string): Promise<void> {
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: value,
  });
  if (!res.ok) throw new Error(`redis set ${res.status}`);
}
