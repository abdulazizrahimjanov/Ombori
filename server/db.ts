import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { createSeedDatabase, DEFAULT_COLORS, DEFAULT_SIZES } from '../src/data/seed.ts';
import type { DatabaseSnapshot, User } from '../src/types/models.ts';
import {
  getAllowedStoreIds,
  hashSecret,
  isHashedSecret,
  sanitizeUser,
} from './auth.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'ombor-db.json');
const OPS_FILE = path.join(DATA_DIR, 'processed-ops.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const MAX_DISK_BACKUPS = 30;
const MAX_CACHED_OPS = 4000;

export interface ProcessedOpRecord {
  opId: string;
  opType: string;
  actorId: string;
  result?: unknown;
  createdAt: string;
}

export interface BackupMeta {
  id: string;
  label: string;
  revision: number;
  createdAt: string;
  sizeBytes?: number;
}

function shouldUsePgSsl(url: string): boolean {
  if (process.env.PGSSLMODE === 'disable') return false;
  return (
    url.includes('render.com') ||
    url.includes('neon.tech') ||
    url.includes('supabase') ||
    url.includes('sslmode=require') ||
    process.env.NODE_ENV === 'production'
  );
}

const DATABASE_URL = process.env.DATABASE_URL?.trim() || '';
const pgPool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: shouldUsePgSsl(DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
      max: 10,
    })
  : null;

export const storageBackendName = pgPool ? 'postgresql' : 'disk-json';

function ensureDataDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function migrateSnapshot(raw: DatabaseSnapshot): { snapshot: DatabaseSnapshot; changed: boolean } {
  const snap = structuredClone(raw);
  let changed = false;

  if (!snap.version || snap.version < 2) {
    snap.version = 2;
    changed = true;
  }
  if (!snap.revision || snap.revision < 1) {
    snap.revision = 1;
    changed = true;
  }
  if (!Array.isArray(snap.customSizes) || snap.customSizes.length === 0) {
    snap.customSizes = [...DEFAULT_SIZES];
    changed = true;
  }
  if (!Array.isArray(snap.customColors) || snap.customColors.length === 0) {
    snap.customColors = [...DEFAULT_COLORS];
    changed = true;
  }
  if (!Array.isArray(snap.deletedRecords)) {
    snap.deletedRecords = [];
    changed = true;
  }

  // Hash any legacy plaintext password/pin and fill missing login/sellStoreIds
  snap.users = snap.users.map((u, idx) => {
    const next = { ...u };
    if (!next.login) {
      if (next.id === 'usr-owner') next.login = 'islombek';
      else if (next.id === 'usr-admin') next.login = 'otabek';
      else next.login = `xodim_${idx + 1}`;
      changed = true;
    }
    if (!next.primaryStoreId) {
      next.primaryStoreId = next.assignedStoreIds[0] || next.storeId || snap.stores[0]?.id || '';
      changed = true;
    }
    if (!Array.isArray(next.sellStoreIds)) {
      next.sellStoreIds = next.roleId === 'warehouse' ? [] : [...(next.assignedStoreIds || [])];
      changed = true;
    }
    if (next.password && !isHashedSecret(next.password)) {
      next.password = hashSecret(next.password);
      changed = true;
    }
    if (next.pin && !isHashedSecret(next.pin)) {
      next.pin = hashSecret(next.pin);
      changed = true;
    }
    return next;
  });

  return { snapshot: snap, changed };
}

function writeJsonAtomic(filePath: string, payload: unknown) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function pruneDiskBackups() {
  ensureDataDirs();
  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  while (files.length > MAX_DISK_BACKUPS) {
    const oldest = files.shift();
    if (oldest) {
      try {
        fs.unlinkSync(path.join(BACKUPS_DIR, oldest));
      } catch {
        // ignore cleanup error
      }
    }
  }
}

export async function createServerBackup(
  snapshot: DatabaseSnapshot,
  label = 'Avtomatik zaxira'
): Promise<BackupMeta> {
  const nowIso = new Date().toISOString();
  const safeStamp = nowIso.replace(/[:.]/g, '-');
  const id = `bkp-${safeStamp}-${Math.random().toString(36).slice(2, 6)}`;
  const rev = snapshot.revision ?? 1;

  if (pgPool) {
    await pgPool.query(
      'INSERT INTO ombor_backups (id, label, revision, snapshot, created_at) VALUES ($1, $2, $3, $4::jsonb, $5)',
      [id, label, rev, JSON.stringify(snapshot), nowIso]
    );
    await pgPool.query(
      `DELETE FROM ombor_backups WHERE id NOT IN (
        SELECT id FROM ombor_backups ORDER BY created_at DESC LIMIT $1
      )`,
      [MAX_DISK_BACKUPS]
    );
    return { id, label, revision: rev, createdAt: nowIso };
  }

  ensureDataDirs();
  const filePath = path.join(BACKUPS_DIR, `${id}.json`);
  const record = { id, label, revision: rev, createdAt: nowIso, snapshot };
  writeJsonAtomic(filePath, record);
  pruneDiskBackups();
  const stat = fs.statSync(filePath);
  return { id, label, revision: rev, createdAt: nowIso, sizeBytes: stat.size };
}

export async function listServerBackups(): Promise<BackupMeta[]> {
  if (pgPool) {
    const res = await pgPool.query<{
      id: string;
      label: string;
      revision: string | number;
      created_at: Date | string;
    }>('SELECT id, label, revision, created_at FROM ombor_backups ORDER BY created_at DESC LIMIT 30');
    return res.rows.map((r) => ({
      id: r.id,
      label: r.label,
      revision: Number(r.revision),
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  ensureDataDirs();
  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, 30);

  const list: BackupMeta[] = [];
  for (const file of files) {
    try {
      const full = path.join(BACKUPS_DIR, file);
      const raw = JSON.parse(fs.readFileSync(full, 'utf8')) as {
        id?: string;
        label?: string;
        revision?: number;
        createdAt?: string;
      };
      const stat = fs.statSync(full);
      list.push({
        id: raw.id || file.replace(/\.json$/, ''),
        label: raw.label || 'Zaxira nusxa',
        revision: raw.revision ?? 1,
        createdAt: raw.createdAt || stat.mtime.toISOString(),
        sizeBytes: stat.size,
      });
    } catch {
      // skip malformed backup file
    }
  }
  return list;
}

export async function loadBackupSnapshot(backupId: string): Promise<DatabaseSnapshot | null> {
  if (pgPool) {
    const res = await pgPool.query<{ snapshot: DatabaseSnapshot }>(
      'SELECT snapshot FROM ombor_backups WHERE id = $1',
      [backupId]
    );
    return res.rows[0]?.snapshot ?? null;
  }

  ensureDataDirs();
  const safeId = path.basename(backupId).replace(/\.json$/, '');
  const full = path.join(BACKUPS_DIR, `${safeId}.json`);
  if (!fs.existsSync(full)) return null;
  const parsed = JSON.parse(fs.readFileSync(full, 'utf8')) as {
    snapshot?: DatabaseSnapshot;
  } & Partial<DatabaseSnapshot>;
  return parsed.snapshot ?? (Array.isArray(parsed.stores) ? (parsed as DatabaseSnapshot) : null);
}

let writeQueue: Promise<unknown> = Promise.resolve();

function enqueueSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.catch(() => undefined);
  return next;
}

let pgSchemaReady = false;
async function ensurePgSchema() {
  if (!pgPool || pgSchemaReady) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ombor_state (
      id TEXT PRIMARY KEY,
      revision BIGINT NOT NULL DEFAULT 1,
      snapshot JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ombor_processed_ops (
      op_id TEXT PRIMARY KEY,
      op_type TEXT NOT NULL,
      actor_id TEXT,
      result JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ombor_backups (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      revision BIGINT NOT NULL,
      snapshot JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  pgSchemaReady = true;
}

function loadDiskOps(): Record<string, ProcessedOpRecord> {
  ensureDataDirs();
  if (!fs.existsSync(OPS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(OPS_FILE, 'utf8')) as Record<string, ProcessedOpRecord>;
  } catch {
    return {};
  }
}

function saveDiskOps(ops: Record<string, ProcessedOpRecord>) {
  const entries = Object.entries(ops);
  if (entries.length > MAX_CACHED_OPS) {
    entries.sort((a, b) => a[1].createdAt.localeCompare(b[1].createdAt));
    const trimmed = entries.slice(entries.length - MAX_CACHED_OPS);
    writeJsonAtomic(OPS_FILE, Object.fromEntries(trimmed));
  } else {
    writeJsonAtomic(OPS_FILE, ops);
  }
}

export async function initializeDatabase(): Promise<DatabaseSnapshot> {
  return enqueueSerialized(async () => {
    if (pgPool) {
      await ensurePgSchema();
      const existing = await pgPool.query<{ snapshot: DatabaseSnapshot }>(
        'SELECT snapshot FROM ombor_state WHERE id = $1',
        ['primary']
      );
      if (existing.rows.length === 0) {
        const seeded = migrateSnapshot(createSeedDatabase()).snapshot;
        await pgPool.query(
          'INSERT INTO ombor_state (id, revision, snapshot) VALUES ($1, $2, $3::jsonb)',
          ['primary', seeded.revision ?? 1, JSON.stringify(seeded)]
        );
        await createServerBackup(seeded, "Boshlang'ich baza nusxasi");
        return seeded;
      }
      const rawSnap = existing.rows[0].snapshot;
      const { snapshot, changed } = migrateSnapshot(rawSnap);
      if (changed) {
        await createServerBackup(rawSnap, 'Migratsiyadan oldingi avtomatik zaxira');
        await pgPool.query(
          'UPDATE ombor_state SET revision = $1, snapshot = $2::jsonb, updated_at = NOW() WHERE id = $3',
          [snapshot.revision ?? 1, JSON.stringify(snapshot), 'primary']
        );
      }
      return snapshot;
    }

    ensureDataDirs();
    if (!fs.existsSync(DB_FILE)) {
      const seeded = migrateSnapshot(createSeedDatabase()).snapshot;
      writeJsonAtomic(DB_FILE, seeded);
      await createServerBackup(seeded, "Boshlang'ich baza nusxasi");
      return seeded;
    }

    const rawSnap = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as DatabaseSnapshot;
    const { snapshot, changed } = migrateSnapshot(rawSnap);
    if (changed) {
      await createServerBackup(rawSnap, 'Migratsiyadan oldingi avtomatik zaxira');
      writeJsonAtomic(DB_FILE, snapshot);
    }
    return snapshot;
  });
}

export async function readDatabase(): Promise<DatabaseSnapshot> {
  if (pgPool) {
    await ensurePgSchema();
    const res = await pgPool.query<{ snapshot: DatabaseSnapshot }>(
      'SELECT snapshot FROM ombor_state WHERE id = $1',
      ['primary']
    );
    if (res.rows[0]?.snapshot) {
      return res.rows[0].snapshot;
    }
    return initializeDatabase();
  }

  ensureDataDirs();
  if (!fs.existsSync(DB_FILE)) {
    return initializeDatabase();
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as DatabaseSnapshot;
}

export async function runAtomicMutation<T>(
  operationId: string | undefined,
  opType: string,
  actorId: string,
  mutator: (db: DatabaseSnapshot) => Promise<{
    nextDb?: DatabaseSnapshot;
    result: T;
    createBackupLabel?: string;
  }>
): Promise<{
  snapshot: DatabaseSnapshot;
  result: T;
  deduplicated: boolean;
}> {
  return enqueueSerialized(async () => {
    if (pgPool) {
      await ensurePgSchema();
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        const stateRes = await client.query<{ snapshot: DatabaseSnapshot }>(
          'SELECT snapshot FROM ombor_state WHERE id = $1 FOR UPDATE',
          ['primary']
        );
        const currentDb = stateRes.rows[0]?.snapshot ?? createSeedDatabase();

        if (operationId) {
          const opRes = await client.query<{ result: T }>(
            'SELECT result FROM ombor_processed_ops WHERE op_id = $1',
            [operationId]
          );
          if (opRes.rows.length > 0) {
            await client.query('COMMIT');
            return {
              snapshot: currentDb,
              result: opRes.rows[0].result,
              deduplicated: true,
            };
          }
        }

        const draft = structuredClone(currentDb);
        const { nextDb, result, createBackupLabel } = await mutator(draft);
        const finalDb = nextDb ?? draft;
        finalDb.revision = (currentDb.revision ?? 1) + 1;

        await client.query(
          'UPDATE ombor_state SET revision = $1, snapshot = $2::jsonb, updated_at = NOW() WHERE id = $3',
          [finalDb.revision, JSON.stringify(finalDb), 'primary']
        );

        if (operationId) {
          await client.query(
            'INSERT INTO ombor_processed_ops (op_id, op_type, actor_id, result) VALUES ($1, $2, $3, $4::jsonb)',
            [operationId, opType, actorId, JSON.stringify(result ?? null)]
          );
        }

        await client.query('COMMIT');
        if (createBackupLabel) {
          await createServerBackup(currentDb, createBackupLabel);
        }
        return { snapshot: finalDb, result, deduplicated: false };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    ensureDataDirs();
    const currentDb = fs.existsSync(DB_FILE)
      ? (JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as DatabaseSnapshot)
      : createSeedDatabase();

    const opsMap = loadDiskOps();
    if (operationId && opsMap[operationId]) {
      return {
        snapshot: currentDb,
        result: opsMap[operationId].result as T,
        deduplicated: true,
      };
    }

    const draft = structuredClone(currentDb);
    const { nextDb, result, createBackupLabel } = await mutator(draft);
    const finalDb = nextDb ?? draft;
    finalDb.revision = (currentDb.revision ?? 1) + 1;

    if (createBackupLabel) {
      await createServerBackup(currentDb, createBackupLabel);
    }

    writeJsonAtomic(DB_FILE, finalDb);

    if (operationId) {
      opsMap[operationId] = {
        opId: operationId,
        opType,
        actorId,
        result,
        createdAt: new Date().toISOString(),
      };
      saveDiskOps(opsMap);
    }

    return { snapshot: finalDb, result, deduplicated: false };
  });
}

export function scopeSnapshotForUser(
  fullDb: DatabaseSnapshot,
  user: User
): {
  snapshot: DatabaseSnapshot;
  branchDirectory: { id: string; name: string; color?: string; warehouseId: string; warehouseName: string }[];
} {
  const allowedStores = getAllowedStoreIds(fullDb, user);
  const allowedSet = new Set(allowedStores);
  const isOwner = user.roleId === 'owner';

  const branchDirectory = fullDb.stores.map((s) => {
    const wh =
      fullDb.warehouses.find((w) => w.id === s.defaultWarehouseId) ??
      fullDb.warehouses.find((w) => w.storeId === s.id);
    return {
      id: s.id,
      name: s.name,
      color: s.color,
      warehouseId: wh?.id ?? s.defaultWarehouseId,
      warehouseName: wh?.name ?? `${s.name} Ombori`,
    };
  });

  const allowedWarehouseIds = new Set(
    fullDb.warehouses.filter((w) => allowedSet.has(w.storeId)).map((w) => w.id)
  );

  const sanitizedUsers = fullDb.users
    .filter((u) => {
      if (isOwner) return true;
      const uStores = getAllowedStoreIds(fullDb, u);
      return uStores.some((sid) => allowedSet.has(sid));
    })
    .map(sanitizeUser);

  if (isOwner) {
    return {
      snapshot: {
        ...fullDb,
        users: fullDb.users.map(sanitizeUser),
        offlineQueue: [],
      },
      branchDirectory,
    };
  }

  const scoped: DatabaseSnapshot = {
    ...fullDb,
    stores: fullDb.stores.filter((s) => allowedSet.has(s.id)),
    warehouses: fullDb.warehouses.filter((w) => allowedSet.has(w.storeId)),
    users: sanitizedUsers,
    // Categories, brands, suppliers, customSizes, customColors, promoCodes stay available company-wide
    products: fullDb.products.filter((p) => allowedSet.has(p.storeId)),
    stockItems: fullDb.stockItems.filter(
      (s) => allowedSet.has(s.storeId) || allowedWarehouseIds.has(s.warehouseId)
    ),
    stockMovements: fullDb.stockMovements.filter(
      (m) => allowedSet.has(m.storeId) || allowedWarehouseIds.has(m.warehouseId)
    ),
    purchaseReceipts: fullDb.purchaseReceipts.filter((pr) => allowedSet.has(pr.storeId)),
    purchaseOrders: fullDb.purchaseOrders.filter((po) => allowedSet.has(po.storeId)),
    transfers: fullDb.transfers.filter(
      (tr) =>
        allowedSet.has(tr.storeId) ||
        (tr.fromStoreId ? allowedSet.has(tr.fromStoreId) : false) ||
        (tr.toStoreId ? allowedSet.has(tr.toStoreId) : false) ||
        allowedWarehouseIds.has(tr.fromWarehouseId) ||
        allowedWarehouseIds.has(tr.toWarehouseId)
    ),
    writeOffs: fullDb.writeOffs.filter((wo) => allowedSet.has(wo.storeId)),
    stocktakes: fullDb.stocktakes.filter((st) => allowedSet.has(st.storeId)),
    sales: fullDb.sales.filter((s) => allowedSet.has(s.storeId)),
    returns: fullDb.returns.filter((r) => allowedSet.has(r.storeId)),
    cashShifts: fullDb.cashShifts.filter((cs) => allowedSet.has(cs.storeId)),
    cashOperations: fullDb.cashOperations.filter((co) => allowedSet.has(co.storeId)),
    accounts: fullDb.accounts.filter((a) => allowedSet.has(a.storeId)),
    transactions: fullDb.transactions.filter((tr) => allowedSet.has(tr.storeId)),
    expenses: fullDb.expenses.filter((ex) => allowedSet.has(ex.storeId)),
    customers: fullDb.customers.filter((c) => allowedSet.has(c.storeId)),
    loyaltyAccounts: fullDb.loyaltyAccounts.filter((l) => allowedSet.has(l.storeId)),
    loyaltyTransactions: fullDb.loyaltyTransactions.filter((lt) => allowedSet.has(lt.storeId)),
    debts: fullDb.debts.filter((d) => allowedSet.has(d.storeId)),
    employees: fullDb.employees.filter(
      (e) =>
        allowedSet.has(e.storeId) ||
        (e.assignedStoreIds?.some((sid) => allowedSet.has(sid)) ?? false)
    ),
    targets: fullDb.targets.filter((t) => allowedSet.has(t.storeId)),
    onlineOrders: fullDb.onlineOrders.filter((o) => allowedSet.has(o.storeId)),
    auditLogs: fullDb.auditLogs.filter((a) => allowedSet.has(a.storeId)),
    deletedRecords: (fullDb.deletedRecords ?? []).filter((d) => allowedSet.has(d.storeId)),
    offlineQueue: [],
  };

  return { snapshot: scoped, branchDirectory };
}
