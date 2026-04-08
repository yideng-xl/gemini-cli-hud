/**
 * Gemini CLI HUD — Quota & account management
 *
 * Reads OAuth credentials from ~/.gemini/oauth_creds.json,
 * refreshes tokens when expired, and fetches quota via loadCodeAssist API.
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { execSync } from 'child_process';
import { visibleLen } from './hud-utils.js';
const HOME = process.env['HOME'] || '';
// ─── OAuth credential reading ───────────────────────────────────────────────
const DEFAULT_CREDS_PATH = path.join(HOME, '.gemini', 'oauth_creds.json');
const DEFAULT_ACCOUNTS_PATH = path.join(HOME, '.gemini', 'google_accounts.json');
export function readOAuthToken(filePath = DEFAULT_CREDS_PATH) {
    try {
        if (!fs.existsSync(filePath))
            return null;
        const raw = fs.readFileSync(filePath, 'utf8');
        const json = JSON.parse(raw);
        if (!json.access_token || !json.refresh_token || typeof json.expiry_date !== 'number') {
            return null;
        }
        return json;
    }
    catch {
        return null;
    }
}
export function isTokenExpired(expiryDate) {
    return Date.now() >= expiryDate - 300_000; // 5-minute buffer
}
export function readActiveAccount(filePath = DEFAULT_ACCOUNTS_PATH) {
    try {
        if (!fs.existsSync(filePath))
            return null;
        const raw = fs.readFileSync(filePath, 'utf8');
        const json = JSON.parse(raw);
        return typeof json.active === 'string' ? json.active : null;
    }
    catch {
        return null;
    }
}
function detectProxy() {
    // 1. Check env vars
    const envProxy = process.env['HTTPS_PROXY'] || process.env['https_proxy'] ||
        process.env['HTTP_PROXY'] || process.env['http_proxy'] ||
        process.env['ALL_PROXY'] || process.env['all_proxy'];
    if (envProxy) {
        try {
            const url = new URL(envProxy.startsWith('http') ? envProxy : `http://${envProxy}`);
            return { host: url.hostname, port: parseInt(url.port, 10) || 7897 };
        }
        catch { /* ignore */ }
    }
    // 2. macOS: read system proxy via networksetup
    if (process.platform === 'darwin') {
        try {
            const out = execSync('networksetup -getsecurewebproxy Wi-Fi', {
                encoding: 'utf8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'],
            });
            const enabled = /Enabled:\s*Yes/i.test(out);
            if (enabled) {
                const hostMatch = out.match(/Server:\s*(\S+)/);
                const portMatch = out.match(/Port:\s*(\d+)/);
                if (hostMatch && portMatch) {
                    return { host: hostMatch[1], port: parseInt(portMatch[1], 10) };
                }
            }
        }
        catch { /* ignore */ }
    }
    return null;
}
/**
 * Get an https.Agent that tunnels through the system proxy.
 * Returns null if no proxy, meaning use direct connection.
 */
function getProxyAgent(hostname, port = 443) {
    const proxy = detectProxy();
    if (!proxy)
        return Promise.resolve(null);
    return new Promise((resolve) => {
        const connectReq = http.request({
            host: proxy.host,
            port: proxy.port,
            method: 'CONNECT',
            path: `${hostname}:${port}`,
            timeout: 5000,
        });
        connectReq.on('connect', (_res, socket) => {
            resolve(new https.Agent({ socket }));
        });
        connectReq.on('error', () => resolve(null));
        connectReq.on('timeout', () => { connectReq.destroy(); resolve(null); });
        connectReq.end();
    });
}
// ─── Token refresh ──────────────────────────────────────────────────────────
const CLIENT_ID = '539249604372-fir0ep2rrfq8skao3job0pfrqhb5ghlg.apps.googleusercontent.com';
// Gemini CLI is a public/installed-app OAuth client; no secret is required.
const CLIENT_SECRET = '';
export async function refreshAccessToken(creds) {
    const agent = await getProxyAgent('oauth2.googleapis.com');
    return new Promise((resolve) => {
        const body = new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: creds.refresh_token,
            grant_type: 'refresh_token',
        }).toString();
        const req = https.request('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body).toString(),
            },
            timeout: 5000,
            ...(agent ? { agent } : {}),
        }, (res) => {
            if (res.statusCode && res.statusCode >= 400) {
                resolve(null);
                return;
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk.toString(); });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.access_token) {
                        resolve(null);
                        return;
                    }
                    const updated = {
                        ...creds,
                        access_token: json.access_token,
                        expiry_date: Date.now() + (json.expires_in ?? 3600) * 1000,
                        token_type: json.token_type ?? creds.token_type,
                    };
                    try {
                        fs.writeFileSync(DEFAULT_CREDS_PATH, JSON.stringify(updated, null, 2), 'utf8');
                    }
                    catch { /* ignore write errors */ }
                    resolve(updated);
                }
                catch {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(body);
        req.end();
    });
}
// ─── Quota fetching ─────────────────────────────────────────────────────────
const CODE_ASSIST_URL = 'https://client-side-ai.google.com/v1/com.google.aia:loadCodeAssist';
export async function fetchQuota(accessToken) {
    const parsed = new URL(CODE_ASSIST_URL);
    const agent = await getProxyAgent(parsed.hostname);
    return new Promise((resolve) => {
        const body = '{}';
        const req = https.request(CODE_ASSIST_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body).toString(),
            },
            timeout: 8000,
            ...(agent ? { agent } : {}),
        }, (res) => {
            if (res.statusCode && res.statusCode >= 400) {
                resolve(null);
                return;
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk.toString(); });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    // Parse tier
                    let tier = 'Free';
                    if (json.subscriptionTier?.paidTier) {
                        tier = json.subscriptionTier.paidTier;
                    }
                    else if (json.currentTier) {
                        tier = json.currentTier;
                    }
                    // Normalise tier name
                    if (tier.toLowerCase().includes('pro'))
                        tier = 'Pro';
                    else if (tier.toLowerCase().includes('ultra'))
                        tier = 'Ultra';
                    else if (tier.toLowerCase().includes('free') || tier === 'FREE_TIER')
                        tier = 'Free';
                    // Parse account
                    const account = readActiveAccount() ?? 'unknown';
                    // Parse models
                    const models = [];
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
                }
                catch {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(body);
        req.end();
    });
}
// ─── Cached wrapper ─────────────────────────────────────────────────────────
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
let cachedQuota = null;
let lastFetchTime = 0;
let _inflightFetch = null;
export function getQuotaWithCache() {
    const now = Date.now();
    if (cachedQuota && now - lastFetchTime < CACHE_TTL) {
        return Promise.resolve(cachedQuota);
    }
    if (_inflightFetch)
        return _inflightFetch;
    _inflightFetch = _doFetch().finally(() => { _inflightFetch = null; });
    return _inflightFetch;
}
async function _doFetch() {
    let creds = readOAuthToken();
    if (!creds)
        return cachedQuota;
    if (isTokenExpired(creds.expiry_date)) {
        creds = await refreshAccessToken(creds);
        if (!creds)
            return cachedQuota;
    }
    const info = await fetchQuota(creds.access_token);
    if (info) {
        cachedQuota = info;
        lastFetchTime = Date.now();
    }
    return cachedQuota;
}
// ─── Formatting ─────────────────────────────────────────────────────────────
export function formatQuotaModule(info) {
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
export function _resetCache() {
    cachedQuota = null;
    lastFetchTime = 0;
    _inflightFetch = null;
}
