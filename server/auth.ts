import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSnapshot, Permission, User } from '../src/types/models.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SECRET_FILE = path.join(DATA_DIR, '.session-secret');

function loadOrCreateSessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(SECRET_FILE)) {
    const existing = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (existing.length >= 32) return existing;
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  return generated;
}

const SESSION_SECRET = loadOrCreateSessionSecret();
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 kun

export function isHashedSecret(value?: string): boolean {
  return typeof value === 'string' && value.startsWith('scrypt$');
}

export function hashSecret(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifySecret(plain: string, stored?: string): boolean {
  if (!stored || !plain) return false;
  if (isHashedSecret(stored)) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    try {
      const actual = crypto.scryptSync(plain, salt, 64);
      const expected = Buffer.from(expectedHex, 'hex');
      if (actual.length !== expected.length) return false;
      return crypto.timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }
  const a = Buffer.from(plain);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-()+]/g, '');
}

export function normalizeLogin(raw: string): string {
  return raw.trim().toLowerCase();
}

export interface SessionTokenPayload {
  sub: string;
  roleId: string;
  iat: number;
  exp: number;
}

export function signSessionToken(user: User): string {
  const now = Date.now();
  const payload: SessionTokenPayload = {
    sub: user.id,
    roleId: user.roleId,
    iat: now,
    exp: now + TOKEN_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token?: string | null): SessionTokenPayload | null {
  if (!token) return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const encodedPayload = token.slice(0, dotIdx);
  const signature = token.slice(dotIdx + 1);
  if (!encodedPayload || !signature) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as SessionTokenPayload;
    if (!parsed.sub || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getUserPermissions(db: DatabaseSnapshot, user: User): Set<Permission> {
  const role = db.roles.find((r) => r.id === user.roleId);
  const set = new Set<Permission>(role?.permissions ?? []);
  if (user.customPermissions) {
    for (const p of user.customPermissions) {
      set.add(p);
    }
  }
  return set;
}

export function hasPermission(db: DatabaseSnapshot, user: User, perm: Permission): boolean {
  if (user.roleId === 'owner') return true;
  return getUserPermissions(db, user).has(perm);
}

export function getAllowedStoreIds(db: DatabaseSnapshot, user: User): string[] {
  const existingStoreIds = db.stores.map((s) => s.id);
  if (user.roleId === 'owner') return existingStoreIds;
  const assigned = (user.assignedStoreIds ?? []).filter((id) => existingStoreIds.includes(id));
  if (assigned.length > 0) return assigned;
  const fallback = user.primaryStoreId && existingStoreIds.includes(user.primaryStoreId)
    ? user.primaryStoreId
    : existingStoreIds.includes(user.storeId)
    ? user.storeId
    : existingStoreIds[0];
  return fallback ? [fallback] : [];
}

export function canAccessStore(db: DatabaseSnapshot, user: User, storeId?: string): boolean {
  if (!storeId) return true;
  if (user.roleId === 'owner') return true;
  if (storeId === 'all') return getAllowedStoreIds(db, user).length > 1;
  return getAllowedStoreIds(db, user).includes(storeId);
}

export function canSellInStore(db: DatabaseSnapshot, user: User, storeId: string): boolean {
  if (user.roleId === 'owner') return true;
  if (!hasPermission(db, user, 'use_pos')) return false;
  if (!canAccessStore(db, user, storeId)) return false;
  if (Array.isArray(user.sellStoreIds)) {
    return user.sellStoreIds.includes(storeId);
  }
  return true;
}

export function sanitizeUser(user: User): User {
  return {
    ...user,
    password: '••••••••',
    pin: '••••',
  };
}
