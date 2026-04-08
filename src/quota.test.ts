import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  readOAuthToken,
  isTokenExpired,
  readActiveAccount,
  formatQuotaModule,
  _resetCache,
  type QuotaInfo,
} from './quota.js';
import { visibleLen } from './hud-utils.js';

const HOME = process.env['HOME'] || '';

// ─── readOAuthToken ─────────────────────────────────────────────────────────

describe('readOAuthToken', () => {
  it('returns null for nonexistent file', () => {
    expect(readOAuthToken('/tmp/nonexistent_oauth_creds_test.json')).toBeNull();
  });

  it('returns credentials from real file if available', () => {
    const realPath = path.join(HOME, '.gemini', 'oauth_creds.json');
    if (!fs.existsSync(realPath)) return; // skip if not present
    const creds = readOAuthToken(realPath);
    expect(creds).not.toBeNull();
    expect(creds!.access_token).toBeDefined();
    expect(creds!.refresh_token).toBeDefined();
    expect(typeof creds!.expiry_date).toBe('number');
  });
});

// ─── isTokenExpired ─────────────────────────────────────────────────────────

describe('isTokenExpired', () => {
  it('returns true for past expiry', () => {
    expect(isTokenExpired(Date.now() - 60_000)).toBe(true);
  });

  it('returns false for future expiry', () => {
    expect(isTokenExpired(Date.now() + 600_000)).toBe(false);
  });

  it('returns true within 5-minute buffer', () => {
    // 4 minutes from now — within the 5-min buffer
    expect(isTokenExpired(Date.now() + 240_000)).toBe(true);
  });

  it('returns false just outside 5-minute buffer', () => {
    // 6 minutes from now — outside the 5-min buffer
    expect(isTokenExpired(Date.now() + 360_000)).toBe(false);
  });
});

// ─── readActiveAccount ──────────────────────────────────────────────────────

describe('readActiveAccount', () => {
  it('returns null for nonexistent file', () => {
    expect(readActiveAccount('/tmp/nonexistent_accounts_test.json')).toBeNull();
  });

  it('reads real file if available', () => {
    const realPath = path.join(HOME, '.gemini', 'google_accounts.json');
    if (!fs.existsSync(realPath)) return; // skip if not present
    const account = readActiveAccount(realPath);
    expect(account).not.toBeNull();
    expect(typeof account).toBe('string');
    expect(account!.length).toBeGreaterThan(0);
  });
});

// ─── formatQuotaModule ──────────────────────────────────────────────────────

describe('formatQuotaModule', () => {
  beforeEach(() => {
    _resetCache();
  });

  it('formats Free tier in yellow with email username', () => {
    const info: QuotaInfo = {
      tier: 'Free',
      account: 'user@example.com',
      models: [],
    };
    const mod = formatQuotaModule(info);
    expect(mod.ansi).toContain('\x1b[33m'); // yellow for Free
    expect(mod.ansi).toContain('Free');
    expect(mod.ansi).toContain('user');
    expect(mod.ansi).not.toContain('@example.com');
  });

  it('formats Pro tier in cyan', () => {
    const info: QuotaInfo = {
      tier: 'Pro',
      account: 'test@gmail.com',
      models: [],
    };
    const mod = formatQuotaModule(info);
    expect(mod.ansi).toContain('\x1b[36m'); // cyan for non-Free
    expect(mod.ansi).toContain('Pro');
  });

  it('width matches visible length', () => {
    const info: QuotaInfo = {
      tier: 'Ultra',
      account: 'hello@world.com',
      models: [],
    };
    const mod = formatQuotaModule(info);
    expect(mod.width).toBe(visibleLen(mod.ansi));
  });

  it('handles email without @ sign gracefully', () => {
    const info: QuotaInfo = {
      tier: 'Free',
      account: 'noemail',
      models: [],
    };
    const mod = formatQuotaModule(info);
    expect(mod.ansi).toContain('noemail');
  });
});
