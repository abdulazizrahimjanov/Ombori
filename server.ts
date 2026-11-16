import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { OnlineOrder } from './src/types/models.ts';
import {
  getAllowedStoreIds,
  hasPermission,
  normalizeLogin,
  normalizePhone,
  sanitizeUser,
  signSessionToken,
  verifySecret,
  verifySessionToken,
} from './server/auth.ts';
import {
  createServerBackup,
  initializeDatabase,
  listServerBackups,
  readDatabase,
  runAtomicMutation,
  scopeSnapshotForUser,
  storageBackendName,
} from './server/db.ts';
import { AppOperationError, executeOperation } from './server/operations.ts';

interface AuthenticatedRequest extends Request {
  authUserId?: string;
}

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  await initializeDatabase();

  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // CORS for web, Render, and Capacitor mobile origins
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const authedSockets = new Set<WebSocket>();

  server.on('upgrade', (req, socket, head) => {
    const urlPath = (req.url || '').split('?')[0];
    if (urlPath !== '/ws') {
      return;
    }
    try {
      const fullUrl = new URL(req.url || '/ws', 'http://localhost');
      const token = fullUrl.searchParams.get('token');
      const payload = verifySessionToken(token);
      if (!payload) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        authedSockets.add(ws);
        ws.on('close', () => authedSockets.delete(ws));
        ws.on('error', () => authedSockets.delete(ws));
        ws.on('message', (msg) => {
          if (String(msg) === 'ping') {
            ws.send('pong');
          }
        });
        ws.send(JSON.stringify({ type: 'connected' }));
      });
    } catch {
      socket.destroy();
    }
  });

  function broadcastSync(rev: number, opType?: string) {
    const message = JSON.stringify({ type: 'sync', rev, opType });
    for (const ws of authedSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const payload = verifySessionToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Avtorizatsiya muddati tugagan. Qayta kiring.' });
      return;
    }
    req.authUserId = payload.sub;
    next();
  }

  // Health endpoint
  app.get('/api/health', async (_req: Request, res: Response) => {
    const db = await readDatabase();
    res.json({
      ok: true,
      storage: storageBackendName,
      revision: db.revision ?? 1,
      storesCount: db.stores.length,
      usersCount: db.users.length,
    });
  });

  // Auth: Phone OR Login + Password OR PIN
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const identifier = String(req.body?.identifier ?? req.body?.phone ?? '').trim();
      const secret = String(req.body?.secret ?? req.body?.password ?? '').trim();
      if (!identifier || !secret) {
        res.status(400).json({ error: 'Telefon raqam/login va parolni kiriting' });
        return;
      }

      const db = await readDatabase();
      const cleanPhone = normalizePhone(identifier);
      const cleanLogin = normalizeLogin(identifier);

      const user = db.users.find(
        (u) =>
          u.isActive &&
          ((cleanPhone && normalizePhone(u.phone) === cleanPhone) ||
            (u.login && normalizeLogin(u.login) === cleanLogin))
      );

      if (!user || (!verifySecret(secret, user.password) && !verifySecret(secret, user.pin))) {
        res.status(401).json({ error: "Telefon raqam/login yoki parol noto'g'ri" });
        return;
      }

      const token = signSessionToken(user);
      const { snapshot, branchDirectory } = scopeSnapshotForUser(db, user);
      res.json({
        token,
        user: sanitizeUser(user),
        snapshot,
        branchDirectory,
        revision: db.revision ?? 1,
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Server xatoligi yuz berdi' });
    }
  });

  // Switch active user by quick PIN
  app.post('/api/auth/switch-pin', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const pin = String(req.body?.pin ?? '').trim();
    if (!pin) {
      res.status(400).json({ error: 'PIN-kodni kiriting' });
      return;
    }
    const db = await readDatabase();
    const target = db.users.find((u) => u.isActive && verifySecret(pin, u.pin));
    if (!target) {
      res.status(401).json({ error: "PIN-kod noto'g'ri" });
      return;
    }
    const token = signSessionToken(target);
    const { snapshot, branchDirectory } = scopeSnapshotForUser(db, target);
    res.json({
      token,
      user: sanitizeUser(target),
      snapshot,
      branchDirectory,
      revision: db.revision ?? 1,
    });
  });

  // Verify manager/admin/owner PIN for big discounts
  app.post('/api/auth/verify-manager-pin', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const pin = String(req.body?.pin ?? '').trim();
    const db = await readDatabase();
    const mgr = db.users.find(
      (u) => u.isActive && verifySecret(pin, u.pin) && hasPermission(db, u, 'apply_big_discount')
    );
    if (!mgr) {
      res.status(403).json({ error: "Menejer PIN-kodi noto'g'ri" });
      return;
    }
    res.json({ user: sanitizeUser(mgr) });
  });

  // Fetch branch-scoped bootstrap state
  app.get('/api/bootstrap', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const db = await readDatabase();
    const user = db.users.find((u) => u.id === req.authUserId && u.isActive);
    if (!user) {
      res.status(401).json({ error: 'Foydalanuvchi faol emas' });
      return;
    }
    const { snapshot, branchDirectory } = scopeSnapshotForUser(db, user);
    res.json({
      user: sanitizeUser(user),
      allowedStoreIds: getAllowedStoreIds(db, user),
      snapshot,
      branchDirectory,
      revision: db.revision ?? 1,
    });
  });

  // Authoritative Idempotent Operations Endpoint
  app.post('/api/ops', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const operationId = typeof req.body?.operationId === 'string' ? req.body.operationId : undefined;
    const type = String(req.body?.type ?? '');
    const payload = req.body?.payload;

    if (!type) {
      res.status(400).json({ error: 'Amal turi ko\'rsatilmagan' });
      return;
    }

    try {
      const outcome = await runAtomicMutation(
        operationId,
        type,
        req.authUserId || 'unknown',
        async (db) => {
          const actor = db.users.find((u) => u.id === req.authUserId && u.isActive);
          if (!actor) {
            throw new AppOperationError('Foydalanuvchi faol emas', 401);
          }
          const execRes = await executeOperation(db, actor, type, payload);
          return {
            result: execRes.result,
            createBackupLabel: execRes.createBackupLabel,
          };
        }
      );

      const actorAfter =
        outcome.snapshot.users.find((u) => u.id === req.authUserId) ??
        outcome.snapshot.users[0];
      const { snapshot, branchDirectory } = actorAfter
        ? scopeSnapshotForUser(outcome.snapshot, actorAfter)
        : { snapshot: outcome.snapshot, branchDirectory: [] };

      if (!outcome.deduplicated) {
        broadcastSync(outcome.snapshot.revision ?? 1, type);
      }

      res.json({
        ok: true,
        deduplicated: outcome.deduplicated,
        result: outcome.result,
        snapshot,
        branchDirectory,
        revision: outcome.snapshot.revision ?? 1,
      });
    } catch (err) {
      if (err instanceof AppOperationError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Operation error:', type, err);
      res.status(500).json({ error: 'Amalni bajarishda server xatoligi yuz berdi' });
    }
  });

  // Backups Management
  app.get('/api/backups', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const db = await readDatabase();
    const actor = db.users.find((u) => u.id === req.authUserId && u.isActive);
    if (!actor || !hasPermission(db, actor, 'manage_settings')) {
      res.status(403).json({ error: "Zaxira nusxalarini ko'rish ruxsati yo'q" });
      return;
    }
    const backups = await listServerBackups();
    res.json({ backups });
  });

  app.post('/api/backups', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const db = await readDatabase();
    const actor = db.users.find((u) => u.id === req.authUserId && u.isActive);
    if (!actor || !hasPermission(db, actor, 'manage_settings')) {
      res.status(403).json({ error: "Zaxira yaratish ruxsati yo'q" });
      return;
    }
    const label = String(req.body?.label ?? `Qo'lda olingan zaxira (${actor.name})`);
    const meta = await createServerBackup(db, label);
    res.json({ backup: meta });
  });

  app.post('/api/backups/:id/restore', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const backupId = String(req.params.id ?? '');
      const outcome = await runAtomicMutation(
        undefined,
        'RESTORE_SERVER_BACKUP',
        req.authUserId || 'unknown',
        async (db) => {
          const actor = db.users.find((u) => u.id === req.authUserId && u.isActive);
          if (!actor) throw new AppOperationError('Foydalanuvchi faol emas', 401);
          const execRes = await executeOperation(db, actor, 'RESTORE_SERVER_BACKUP', { backupId });
          return { result: execRes.result, createBackupLabel: execRes.createBackupLabel };
        }
      );
      broadcastSync(outcome.snapshot.revision ?? 1, 'RESTORE_SERVER_BACKUP');
      const actorAfter = outcome.snapshot.users.find((u) => u.id === req.authUserId) ?? outcome.snapshot.users[0];
      const { snapshot, branchDirectory } = scopeSnapshotForUser(outcome.snapshot, actorAfter);
      res.json({ ok: true, snapshot, branchDirectory, revision: outcome.snapshot.revision ?? 1 });
    } catch (err) {
      if (err instanceof AppOperationError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Zaxirani tiklashda xatolik' });
    }
  });

  // Public Storefront Endpoints (for unauthenticated guest shopping)
  app.get('/api/public/storefront', async (_req: Request, res: Response) => {
    const db = await readDatabase();
    res.json({
      brandName: db.settings.brandName,
      telegramChannelHandle: db.settings.telegramChannelHandle,
      stores: db.stores.map((s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        phone: s.phone,
        defaultWarehouseId: s.defaultWarehouseId,
      })),
      warehouses: db.warehouses,
      categories: db.categories,
      brands: db.brands,
      products: db.products.filter((p) => p.isPublishedOnline),
      stockItems: db.stockItems,
    });
  });

  app.post('/api/public/orders', async (req: Request, res: Response) => {
    try {
      const orderPayload = req.body as Partial<OnlineOrder>;
      if (!orderPayload?.customerName?.trim() || !orderPayload?.customerPhone?.trim() || !Array.isArray(orderPayload.items) || orderPayload.items.length === 0) {
        res.status(400).json({ error: "Buyurtma ma'lumotlari to'liq emas" });
        return;
      }
      const outcome = await runAtomicMutation(
        req.body?.operationId,
        'CREATE_ONLINE_ORDER',
        'web-guest',
        async (db) => {
          const nowIso = new Date().toISOString();
          const storeId = orderPayload.storeId || db.stores[0]?.id || 'store-toraqorgon';
          const ord: OnlineOrder = {
            id: `ord-${Date.now().toString(36)}`,
            orderNumber: `WEB-${String(204 + db.onlineOrders.length + 1)}`,
            customerName: orderPayload.customerName!.trim(),
            customerPhone: orderPayload.customerPhone!.trim(),
            deliveryAddress: orderPayload.deliveryAddress?.trim() || 'Olib ketish',
            deliveryMethod: orderPayload.deliveryMethod || 'delivery',
            paymentMethod: orderPayload.paymentMethod || 'cash_on_delivery',
            items: orderPayload.items!,
            totalAmount: orderPayload.items!.reduce((s, i) => s + i.lineTotal, 0),
            status: 'new',
            note: orderPayload.note,
            storeId,
            createdAt: nowIso,
            updatedAt: nowIso,
            createdBy: 'web-guest',
          };
          db.onlineOrders.unshift(ord);
          return { result: ord };
        }
      );
      broadcastSync(outcome.snapshot.revision ?? 1, 'CREATE_ONLINE_ORDER');
      res.json({ ok: true, order: outcome.result });
    } catch (err) {
      console.error('Public order error:', err);
      res.status(500).json({ error: 'Buyurtmani saqlashda xatolik' });
    }
  });

  // Frontend serving (Vite dev middleware in dev, static dist/ in production)
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build topilmadi. Avval npm run build bajaring.');
      }
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(
      `SHU BREND OMBOR serveri port ${PORT} da ishga tushdi (${IS_PROD ? 'production' : 'development'}, baza: ${storageBackendName})`
    );
  });
}

startServer().catch((err) => {
  console.error('Server start failed:', err);
  process.exit(1);
});
