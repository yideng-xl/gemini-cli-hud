/**
 * Gemini CLI HUD — Quota & account management
 *
 * Reads OAuth credentials from ~/.gemini/oauth_creds.json,
 * refreshes tokens when expired, and fetches quota via loadCodeAssist API.
 */

import fs   from 'fs';
import path from 'path';
import https from 'https';
import { visibleLen } from './hud-utils.js';

const HOME = process.env['HOME'] || '';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OAuthCredentials {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope?: string;
  id_token?: string;
}

export interface ModelQuota {
  name: string;
  displayName: string;
  percentage: number;       // 0-100, remaining quota
  resetTime?: string;
}

export interface QuotaInfo {
  tier: string;             // 'Free' | 'Pro' | 'Ultra' | 'unknown'
  account: string;          // email
  models: ModelQuota[];
}

// ─── OAuth credential reading ───────────────────────────────────────────────

const DEFAULT_CREDS_PATH = path.join(HOME, '.gemini', 'oauth_creds.json');
const DEFAULT_ACCOUNTS_PATH = path.join(HOME, '.gemini', 'google_accounts.json');

export function readOAuthToken(filePath: string = DEFAULT_CREDS_PATH): OAuthCredentials | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);
    if (!json.access_token || !json.refresh_token || typeof json.expiry_date !== 'number') {
      return null;
    }
    return json as OAuthCredentials;
  } catch {
    return null;
  }
}

export function isTokenExpired(expiryDate: number): boolean {
  return Date.now() >= expiryDate - 300_000; // 5-minute buffer
}

export function readActiveAccount(filePath: string = DEFAULT_ACCOUNTS_PATH): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);
    return typeof json.active === 'string' ? json.active : null;
  } catch {
    return null;
  }
}

// ─── Token refresh ──────────────────────────────────────────────────────────

const CLIENT_ID = '539249604372-fir0ep2rrfq8skao3job0pfrqhb5ghlg.apps.googleusercontent.com';
// Gemini CLI is a public/installed-app OAuth client; no secret is required.
const CLIENT_SECRET = '';

export function refreshAccessToken(creds: OAuthCredentials): Promise<OAuthCredentials | null> {
  return new Promise((resolve) => {
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }).toString();

    const req = https.request(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body).toString(),
        },
        timeout: 5000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          resolve(null);
          return;
        }
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (!json.access_token) { resolve(null); return; }
            const updated: OAuthCredentials = {
              ...creds,
              access_token: json.access_token,
              expiry_date: Date.now() + (json.expires_in ?? 3600) * 1000,
              token_type: json.token_type ?? creds.token_type,
            };
            // Write updated creds back
            try {
              fs.writeFileSync(DEFAULT_CREDS_PATH, JSON.stringify(updated, null, 2), 'utf8');
            } catch { /* ignore write errors */ }
            resolve(updated);
          } catch {
            resolve(null);
          }
        });
      },
    );

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ─── Quota fetching ─────────────────────────────────────────────────────────

const CODE_ASSIST_URL = 'https://client-side-ai.google.com/v1/com.google.aia:loadCodeAssist';

export function fetchQuota(accessToken: string): Promise<QuotaInfo | null> {
  return new Promise((resolve) => {
    const body = '{}';

    const req = https.request(
      CODE_ASSIST_URL,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body).toString(),
        },
        timeout: 8000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          resolve(null);
          return;
        }
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);

            // Parse tier
            let tier = 'Free';
            if (json.subscriptionTier?.paidTier) {
              tier = json.subscriptionTier.paidTier;
            } else if (json.currentTier) {
              tier = json.currentTier;
            }
            // Normalise tier name
            if (tier.toLowerCase().includes('pro')) tier = 'Pro';
            else if (tier.toLowerCase().includes('ultra')) tier = 'Ultra';
            else if (tier.toLowerCase().includes('free') || tier === 'FREE_TIER') tier = 'Free';

            // Parse account
            const account = readActiveAccount() ?? 'unknown';

            // Parse models
            const models: ModelQuota[] = [];
            const rawModels = json.models ?? json.modelQuotas ?? [];
            for (const m of rawModels) {
              const name = m.name ?? m.modelName ?? '';
              const displayName = m.displayName ?? name;
              const remaining = m.remainingQuota ?? m.percentage ?? 100;
              const percentage = typeof remaining === 'number'
                ? Math.max(0, Math.min(100, remaining))
                : 100;
              models.push({
                name,
                displayName,
                percentage,
                resetTime: m.resetTime ?? m.quotaResetTime,
              });
            }

            resolve({ tier, account, models });
          } catch {
            resolve(null);
          }
        });
      },
    );

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ─── Cached wrapper ─────────────────────────────────────────────────────────

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
let cachedQuota: QuotaInfo | null = null;
let lastFetchTime = 0;
let _inflightFetch: Promise<QuotaInfo | null> | null = null;

export function getQuotaWithCache(): Promise<QuotaInfo | null> {
  const now = Date.now();
  if (cachedQuota && now - lastFetchTime < CACHE_TTL) {
    return Promise.resolve(cachedQuota);
  }
  if (_inflightFetch) return _inflightFetch;
  _inflightFetch = _doFetch().finally(() => { _inflightFetch = null; });
  return _inflightFetch;
}

async function _doFetch(): Promise<QuotaInfo | null> {
  let creds = readOAuthToken();
  if (!creds) return cachedQuota;

  if (isTokenExpired(creds.expiry_date)) {
    creds = await refreshAccessToken(creds);
    if (!creds) return cachedQuota;
  }

  const info = await fetchQuota(creds.access_token);
  if (info) {
    cachedQuota = info;
    lastFetchTime = Date.now();
  }
  return cachedQuota;
}

// ─── Formatting ─────────────────────────────────────────────────────────────

export function formatQuotaModule(info: QuotaInfo): { ansi: string; width: number } {
  const tierColor = info.tier === 'Free' ? '\x1b[33m' : '\x1b[36m';
  const reset = '\x1b[0m';
  const dim = '\x1b[90m';

  const username = info.account.includes('@')
    ? info.account.split('@')[0]
    : info.account;

  const ansi = `${tierColor}${info.tier}${reset} ${dim}${username}${reset}`;
  return { ansi, width: visibleLen(ansi) };
}

// ─── Test helpers ───────────────────────────────────────────────────────────

export function _resetCache(): void {
  cachedQuota = null;
  lastFetchTime = 0;
  _inflightFetch = null;
}
