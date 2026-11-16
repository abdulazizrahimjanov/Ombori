import { createSeedDatabase, getMensClothingCategories } from '../src/data/seed.ts';
import type {
  Account,
  AuditLog,
  Brand,
  CashShift,
  Category,
  Customer,
  DatabaseSnapshot,
  Debt,
  DeletedRecord,
  Employee,
  Expense,
  OnlineOrder,
  Payment,
  PaymentMethod,
  Permission,
  Product,
  PromoCode,
  PurchaseOrder,
  PurchaseReceipt,
  Return,
  Role,
  RoleId,
  Sale,
  SaleItem,
  Stocktake,
  StocktakeItem,
  Store,
  Supplier,
  Target,
  Transfer,
  User,
  Warehouse,
  WriteOff,
  WriteOffReason,
} from '../src/types/models.ts';
import {
  canAccessStore,
  canSellInStore,
  hashSecret,
  hasPermission,
  isHashedSecret,
  normalizeLogin,
  normalizePhone,
  sanitizeUser,
  verifySecret,
} from './auth.ts';
import { loadBackupSnapshot } from './db.ts';

export class AppOperationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function requirePerm(db: DatabaseSnapshot, actor: User, perm: Permission) {
  if (!hasPermission(db, actor, perm)) {
    throw new AppOperationError("Sizda bu amalni bajarish uchun ruxsat yo'q", 403);
  }
}

function requireStoreAccess(db: DatabaseSnapshot, actor: User, storeId?: string) {
  if (storeId && !canAccessStore(db, actor, storeId)) {
    throw new AppOperationError("Sizga bu filial ma'lumotlariga kirish ruxsati berilmagan", 403);
  }
}

function pushAudit(
  db: DatabaseSnapshot,
  actor: User,
  action: AuditLog['action'],
  entityType: string,
  entityId: string,
  summary: string,
  storeId: string,
  details?: string
) {
  const nowIso = new Date().toISOString();
  db.auditLogs.unshift({
    id: uid('aud'),
    userId: actor.id,
    userName: actor.name,
    action,
    entityType,
    entityId,
    summary,
    details,
    storeId,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: actor.id,
  });
  if (db.auditLogs.length > 500) {
    db.auditLogs = db.auditLogs.slice(0, 500);
  }
}

function pushDeleted(
  db: DatabaseSnapshot,
  actor: User,
  entityType: DeletedRecord['entityType'],
  entityId: string,
  label: string,
  storeId: string,
  data: unknown
) {
  if (!Array.isArray(db.deletedRecords)) db.deletedRecords = [];
  db.deletedRecords.unshift({
    id: uid('del'),
    entityType,
    entityId,
    label,
    storeId,
    deletedAt: new Date().toISOString(),
    deletedBy: actor.id,
    deletedByName: actor.name,
    data,
  });
  if (db.deletedRecords.length > 200) {
    db.deletedRecords = db.deletedRecords.slice(0, 200);
  }
}

function getStockQty(db: DatabaseSnapshot, variantId: string, warehouseId: string): number {
  return db.stockItems
    .filter((s) => s.variantId === variantId && s.warehouseId === warehouseId)
    .reduce((sum, s) => sum + s.qty, 0);
}

function adjustWarehouseStock(
  db: DatabaseSnapshot,
  productId: string,
  variantId: string,
  warehouseId: string,
  storeId: string,
  delta: number,
  unitCost: number,
  type: DatabaseSnapshot['stockMovements'][0]['type'],
  actorId: string,
  refId?: string,
  note?: string
) {
  const nowIso = new Date().toISOString();
  const idx = db.stockItems.findIndex(
    (s) => s.variantId === variantId && s.warehouseId === warehouseId
  );
  let newQty = delta;
  if (idx >= 0) {
    newQty = db.stockItems[idx].qty + delta;
    db.stockItems[idx] = { ...db.stockItems[idx], qty: newQty, updatedAt: nowIso };
  } else {
    db.stockItems.push({
      id: uid('stk'),
      productId,
      variantId,
      warehouseId,
      qty: newQty,
      storeId,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: actorId,
    });
  }

  db.stockMovements.unshift({
    id: uid('mov'),
    productId,
    variantId,
    warehouseId,
    type,
    qtyDelta: delta,
    qtyAfter: newQty,
    unitCost,
    referenceId: refId,
    note,
    storeId,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: actorId,
  });
}

function ensureStoreAccount(
  db: DatabaseSnapshot,
  storeId: string,
  type: Account['type'],
  actorId: string
): Account {
  const existing = db.accounts.find((a) => a.storeId === storeId && a.type === type);
  if (existing) return existing;

  const storeName = db.stores.find((s) => s.id === storeId)?.name ?? 'Filial';
  const label =
    type === 'cash'
      ? `${storeName} Kassa (Naqd)`
      : type === 'card_terminal'
      ? `${storeName} Terminal`
      : `${storeName} Bank H/R`;
  const nowIso = new Date().toISOString();
  const created: Account = {
    id: uid('acc'),
    name: label,
    type,
    balance: 0,
    isDefault: type === 'cash',
    storeId,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: actorId,
  };
  db.accounts.push(created);
  return created;
}

function creditPaymentsToStore(
  db: DatabaseSnapshot,
  payments: { method: PaymentMethod; amount: number }[],
  storeId: string,
  saleId: string,
  receiptNumber: string,
  actorId: string
) {
  const nowIso = new Date().toISOString();
  payments.forEach((p) => {
    if (p.method === 'debt' || p.method === 'loyalty' || p.amount <= 0) return;
    const accType: Account['type'] =
      p.method === 'cash' ? 'cash' : p.method === 'transfer' ? 'bank' : 'card_terminal';
    const targetAcc = ensureStoreAccount(db, storeId, accType, actorId);
    targetAcc.balance += p.amount;
    targetAcc.updatedAt = nowIso;
    db.transactions.unshift({
      id: uid('trx'),
      accountId: targetAcc.id,
      type: 'income',
      category: 'savdo',
      amount: p.amount,
      description: `Sotuv cheki ${receiptNumber} (${p.method})`,
      referenceId: saleId,
      storeId,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: actorId,
    });
  });
}

function finalizeSaleSideEffects(
  db: DatabaseSnapshot,
  sale: Sale,
  payments: Payment[],
  cashGiven: number | undefined,
  actor: User
) {
  const nowIso = new Date().toISOString();
  const paidAmount = payments
    .filter((p) => p.method !== 'debt' && p.method !== 'loyalty')
    .reduce((s, p) => s + p.amount, 0);
  const debtAmount = payments
    .filter((p) => p.method === 'debt')
    .reduce((s, p) => s + p.amount, 0);
  const changeAmount =
    cashGiven !== undefined
      ? Math.max(0, cashGiven - payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0))
      : 0;

  if (debtAmount > 0 && !sale.customerId) {
    throw new AppOperationError('Nasiya savdo uchun mijoz tanlanishi shart', 400);
  }

  creditPaymentsToStore(db, payments, sale.storeId, sale.id, sale.receiptNumber, actor.id);

  // Loyalty & Customer update
  let loyaltyEarned = 0;
  if (sale.customerId) {
    const cust = db.customers.find((c) => c.id === sale.customerId);
    let loy = db.loyaltyAccounts.find((l) => l.customerId === sale.customerId);
    if (cust) {
      cust.totalSpent += sale.totalAmount;
      cust.ordersCount += 1;
      cust.lastPurchaseAt = nowIso;
      cust.debtBalance += debtAmount;
      cust.updatedAt = nowIso;

      const sortedTiers = [...db.settings.loyaltyTiers].sort((a, b) => b.minSpend - a.minSpend);
      const matchedTier = sortedTiers.find((t) => cust.totalSpent >= t.minSpend) ?? db.settings.loyaltyTiers[0];
      if (!loy && matchedTier) {
        loy = {
          id: uid('loy'),
          customerId: cust.id,
          tier: matchedTier.tier,
          cashbackPercent: matchedTier.cashbackPercent,
          pointsBalance: 0,
          cardNumber: `SHU-${Math.floor(1000 + Math.random() * 8999)}`,
          storeId: sale.storeId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: actor.id,
        };
        db.loyaltyAccounts.push(loy);
      }

      if (loy && matchedTier) {
        loy.tier = matchedTier.tier;
        loy.cashbackPercent = matchedTier.cashbackPercent;
        if (sale.loyaltyPointsSpent > 0) {
          loy.pointsBalance = Math.max(0, loy.pointsBalance - sale.loyaltyPointsSpent);
          db.loyaltyTransactions.unshift({
            id: uid('ltx'),
            customerId: cust.id,
            loyaltyAccountId: loy.id,
            type: 'spend',
            points: -sale.loyaltyPointsSpent,
            saleId: sale.id,
            note: `Chek ${sale.receiptNumber} uchun sarflandi`,
            storeId: sale.storeId,
            createdAt: nowIso,
            updatedAt: nowIso,
            createdBy: actor.id,
          });
        }
        const paidReal = Math.max(0, sale.totalAmount - debtAmount);
        loyaltyEarned = Math.round((paidReal * loy.cashbackPercent) / 100);
        if (loyaltyEarned > 0) {
          loy.pointsBalance += loyaltyEarned;
          const exp = new Date();
          exp.setDate(exp.getDate() + db.settings.cashbackExpiryDays);
          db.loyaltyTransactions.unshift({
            id: uid('ltx'),
            customerId: cust.id,
            loyaltyAccountId: loy.id,
            type: 'earn',
            points: loyaltyEarned,
            saleId: sale.id,
            expiresAt: exp.toISOString(),
            note: `Chek ${sale.receiptNumber} keshbeki`,
            storeId: sale.storeId,
            createdAt: nowIso,
            updatedAt: nowIso,
            createdBy: actor.id,
          });
        }
        loy.updatedAt = nowIso;
      }

      if (debtAmount > 0) {
        const due = new Date();
        due.setDate(due.getDate() + 14);
        db.debts.unshift({
          id: uid('debt'),
          customerId: cust.id,
          customerName: cust.name,
          saleId: sale.id,
          originalAmount: debtAmount,
          remainingAmount: debtAmount,
          dueDate: due.toISOString(),
          status: 'open',
          payments: [],
          storeId: sale.storeId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: actor.id,
        });
      }
    }
  }

  // Update promo usage
  if (sale.promoCode) {
    const pr = db.promoCodes.find((p) => p.code.toLowerCase() === sale.promoCode?.toLowerCase());
    if (pr) {
      pr.usedCount += 1;
      pr.updatedAt = nowIso;
    }
  }

  // Update active shift in the same branch
  const activeShift = db.cashShifts.find(
    (s) => s.status === 'open' && s.storeId === sale.storeId
  );
  if (activeShift) {
    const cashAdded = payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0);
    const cardAdded = payments
      .filter((p) => ['card', 'uzcard', 'humo', 'visa', 'mastercard', 'unionpay'].includes(p.method))
      .reduce((s, p) => s + p.amount, 0);
    const otherAdded = payments
      .filter((p) => ['click', 'payme', 'uzum', 'transfer'].includes(p.method))
      .reduce((s, p) => s + p.amount, 0);
    activeShift.cashSalesTotal += cashAdded;
    activeShift.cardSalesTotal += cardAdded;
    activeShift.otherSalesTotal += otherAdded;
    activeShift.expectedCash += cashAdded;
    activeShift.updatedAt = nowIso;
  }

  sale.payments = payments;
  sale.paidAmount = paidAmount;
  sale.debtAmount = debtAmount;
  sale.cashGiven = cashGiven;
  sale.changeAmount = changeAmount;
  sale.loyaltyPointsEarned = loyaltyEarned;
  sale.paidAt = nowIso;
  sale.status = 'completed';
  sale.updatedAt = nowIso;
}

export async function executeOperation(
  db: DatabaseSnapshot,
  actor: User,
  type: string,
  rawPayload: unknown
): Promise<{ result?: unknown; createBackupLabel?: string }> {
  const payload = (rawPayload ?? {}) as Record<string, unknown>;
  const nowIso = new Date().toISOString();

  switch (type) {
    case 'UPSERT_PRODUCT': {
      requirePerm(db, actor, 'edit_catalog');
      const prod = payload.product as Product;
      if (!prod?.name?.trim()) {
        throw new AppOperationError('Mahsulot nomi kiritilishi shart');
      }
      requireStoreAccess(db, actor, prod.storeId);

      // Normalize prices & ensure no negative values
      for (const v of prod.variants ?? []) {
        if (v.purchasePrice < 0 || v.retailPrice < 0 || v.wholesalePrice < 0) {
          throw new AppOperationError("Narx manfiy bo'lishi mumkin emas");
        }
      }

      const idx = db.products.findIndex((p) => p.id === prod.id);
      if (idx >= 0) {
        const old = db.products[idx];
        requireStoreAccess(db, actor, old.storeId);
        // Track price changes cleanly without touching historical sales
        old.variants.forEach((ov) => {
          const nv = prod.variants.find((x) => x.id === ov.id);
          if (nv && nv.retailPrice !== ov.retailPrice) {
            pushAudit(
              db,
              actor,
              'price_change',
              'Product',
              prod.id,
              `${prod.name} (${nv.sku}): ${ov.retailPrice.toLocaleString()} -> ${nv.retailPrice.toLocaleString()} so'm`,
              prod.storeId
            );
          }
        });
        db.products[idx] = { ...prod, updatedAt: nowIso };
        pushAudit(db, actor, 'product_edit', 'Product', prod.id, `Tovar tahrirlandi: ${prod.name}`, prod.storeId);
      } else {
        const created: Product = {
          ...prod,
          id: prod.id || uid('prod'),
          createdAt: prod.createdAt || nowIso,
          updatedAt: nowIso,
          createdBy: actor.id,
        };
        db.products.unshift(created);
        pushAudit(db, actor, 'product_create', 'Product', created.id, `Yangi tovar qo'shildi: ${created.name}`, created.storeId);

        const initialQtyByVariant = payload.initialQtyByVariant as Record<string, number> | undefined;
        const warehouseId =
          (payload.warehouseId as string | undefined) ??
          db.stores.find((s) => s.id === created.storeId)?.defaultWarehouseId ??
          db.warehouses.find((w) => w.storeId === created.storeId)?.id;

        if (initialQtyByVariant && warehouseId) {
          created.variants.forEach((v) => {
            const q = Number(initialQtyByVariant[v.id] ?? 0);
            if (q > 0) {
              adjustWarehouseStock(
                db,
                created.id,
                v.id,
                warehouseId,
                created.storeId,
                q,
                v.purchasePrice,
                'kirim',
                actor.id,
                created.id,
                "Yangi tovar boshlang'ich qoldig'i"
              );
            }
          });
        }
      }
      return { result: { ok: true } };
    }

    case 'DELETE_PRODUCT': {
      requirePerm(db, actor, 'edit_catalog');
      const productId = String(payload.productId ?? '');
      const prod = db.products.find((p) => p.id === productId);
      if (!prod) throw new AppOperationError('Mahsulot topilmadi', 404);
      requireStoreAccess(db, actor, prod.storeId);

      const stocks = db.stockItems.filter((s) => s.productId === productId);
      pushDeleted(db, actor, 'Product', prod.id, prod.name, prod.storeId, { product: prod, stockItems: stocks });
      db.products = db.products.filter((p) => p.id !== productId);
      db.stockItems = db.stockItems.filter((s) => s.productId !== productId);
      pushAudit(db, actor, 'product_delete', 'Product', prod.id, `Tovar o'chirildi: ${prod.name}`, prod.storeId);
      return { result: { ok: true } };
    }

    case 'BULK_UPDATE_PRICES': {
      requirePerm(db, actor, 'bulk_edit_prices');
      const ids = new Set((payload.productIds as string[]) ?? []);
      const mode = String(payload.mode ?? 'percent') as 'percent' | 'fixed';
      const value = Number(payload.value ?? 0);
      const changed: string[] = [];

      db.products = db.products.map((p) => {
        if (!ids.has(p.id)) return p;
        if (!canAccessStore(db, actor, p.storeId)) return p;
        changed.push(p.name);
        return {
          ...p,
          updatedAt: nowIso,
          variants: p.variants.map((v) => {
            const nextRetail =
              mode === 'percent'
                ? Math.max(0, Math.round(v.retailPrice * (1 + value / 100)))
                : Math.max(0, v.retailPrice + value);
            return { ...v, retailPrice: nextRetail, updatedAt: nowIso };
          }),
        };
      });

      if (changed.length > 0) {
        const firstStore = actor.primaryStoreId || actor.storeId || db.stores[0]?.id || '';
        pushAudit(
          db,
          actor,
          'price_change',
          'Product',
          'bulk',
          `Ommaviy narx yangilash (${changed.length} ta tovar): ${mode === 'percent' ? `${value}%` : `${value} so'm`}`,
          firstStore
        );
      }
      return { result: { ok: true, count: changed.length } };
    }

    case 'QUICK_ADD_STOCK': {
      requirePerm(db, actor, 'manage_inventory');
      const productId = String(payload.productId ?? '');
      const variantId = String(payload.variantId ?? '');
      const warehouseId = String(payload.warehouseId ?? '');
      const qtyDelta = Number(payload.qtyDelta ?? 0);
      const note = (payload.note as string | undefined) || 'Tezkor qoldiq tuzatish';

      const wh = db.warehouses.find((w) => w.id === warehouseId);
      if (!wh) throw new AppOperationError('Ombor topilmadi', 404);
      requireStoreAccess(db, actor, wh.storeId);
      const prod = db.products.find((p) => p.id === productId);
      if (!prod) throw new AppOperationError('Mahsulot topilmadi', 404);
      const variant = prod.variants.find((v) => v.id === variantId);
      if (!variant) throw new AppOperationError('Variant topilmadi', 404);
      if (!Number.isFinite(qtyDelta) || qtyDelta === 0) {
        throw new AppOperationError("Miqdor nolga teng bo'lishi mumkin emas");
      }

      adjustWarehouseStock(
        db,
        productId,
        variantId,
        warehouseId,
        wh.storeId,
        qtyDelta,
        variant.purchasePrice,
        qtyDelta >= 0 ? 'kirim' : 'chiqim',
        actor.id,
        undefined,
        note
      );
      return { result: { ok: true } };
    }

    case 'IMPORT_PRODUCTS': {
      requirePerm(db, actor, 'edit_catalog');
      const items = (payload.products as Product[]) ?? [];
      const stockMap = (payload.stockMap as Record<string, number>) ?? {};
      const storeId = String(payload.storeId ?? actor.primaryStoreId ?? db.stores[0]?.id ?? '');
      requireStoreAccess(db, actor, storeId);
      const warehouseId =
        String(payload.warehouseId ?? '') ||
        db.stores.find((s) => s.id === storeId)?.defaultWarehouseId ||
        db.warehouses.find((w) => w.storeId === storeId)?.id ||
        '';

      items.forEach((p) => {
        const cleanProd: Product = { ...p, storeId, createdBy: actor.id, updatedAt: nowIso };
        db.products.unshift(cleanProd);
        if (warehouseId) {
          cleanProd.variants.forEach((v) => {
            const q = Number(stockMap[v.id] ?? 0);
            if (q > 0) {
              adjustWarehouseStock(db, cleanProd.id, v.id, warehouseId, storeId, q, v.purchasePrice, 'kirim', actor.id, undefined, 'Excel import');
            }
          });
        }
      });
      pushAudit(db, actor, 'product_create', 'Product', 'import', `${items.length} ta tovar import qilindi`, storeId);
      return { result: { ok: true, count: items.length } };
    }

    case 'OPEN_SHIFT': {
      requirePerm(db, actor, 'manage_shifts');
      const storeId = String(payload.storeId ?? '');
      const startingCash = Number(payload.startingCash ?? 0);
      requireStoreAccess(db, actor, storeId);
      if (startingCash < 0) throw new AppOperationError("Boshlang'ich summa manfiy bo'lishi mumkin emas");
      const already = db.cashShifts.find((s) => s.status === 'open' && s.storeId === storeId);
      if (already) return { result: already };

      const shift: CashShift = {
        id: uid('shift'),
        number: `SM-${String(db.cashShifts.length + 1).padStart(3, '0')}`,
        cashierId: actor.id,
        cashierName: actor.name,
        openedAt: nowIso,
        startingCash,
        cashSalesTotal: 0,
        cardSalesTotal: 0,
        otherSalesTotal: 0,
        cashRefundsTotal: 0,
        cashInTotal: 0,
        cashOutTotal: 0,
        expectedCash: startingCash,
        status: 'open',
        storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      };
      db.cashShifts.unshift(shift);
      return { result: shift };
    }

    case 'RECORD_CASH_OP': {
      requirePerm(db, actor, 'manage_shifts');
      const shiftId = String(payload.shiftId ?? '');
      const opType = String(payload.opType ?? 'in') as 'in' | 'out';
      const amount = Number(payload.amount ?? 0);
      const reason = String(payload.reason ?? '').trim() || (opType === 'in' ? 'Kassaga kirim' : 'Kassadan chiqim');
      if (amount <= 0) throw new AppOperationError("Summa 0 dan katta bo'lishi kerak");

      const shift = db.cashShifts.find((s) => s.id === shiftId);
      if (!shift || shift.status !== 'open') throw new AppOperationError('Ochiq smena topilmadi', 404);
      requireStoreAccess(db, actor, shift.storeId);

      db.cashOperations.unshift({
        id: uid('cop'),
        shiftId,
        type: opType,
        amount,
        reason,
        storeId: shift.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      });
      if (opType === 'in') {
        shift.cashInTotal += amount;
        shift.expectedCash += amount;
      } else {
        shift.cashOutTotal += amount;
        shift.expectedCash -= amount;
      }
      shift.updatedAt = nowIso;
      return { result: { ok: true } };
    }

    case 'CLOSE_SHIFT': {
      requirePerm(db, actor, 'manage_shifts');
      const shiftId = String(payload.shiftId ?? '');
      const actualCash = Number(payload.actualCash ?? 0);
      const notes = payload.notes as string | undefined;
      const shift = db.cashShifts.find((s) => s.id === shiftId);
      if (!shift || shift.status !== 'open') throw new AppOperationError('Ochiq smena topilmadi', 404);
      requireStoreAccess(db, actor, shift.storeId);

      const discrepancy = actualCash - shift.expectedCash;
      shift.closedAt = nowIso;
      shift.actualCash = actualCash;
      shift.discrepancy = discrepancy;
      shift.status = 'closed';
      shift.notes = notes;
      shift.updatedAt = nowIso;
      pushAudit(db, actor, 'shift_close', 'CashShift', shiftId, `Smena yopildi (${shift.number}). Farq: ${discrepancy} so'm`, shift.storeId);
      return { result: { ok: true } };
    }

    case 'CREATE_DEFERRED_SALE': {
      requirePerm(db, actor, 'use_pos');
      const storeId = String(payload.storeId ?? '');
      const warehouseId = String(payload.warehouseId ?? '');
      const items = (payload.items as SaleItem[]) ?? [];
      if (!canSellInStore(db, actor, storeId)) {
        throw new AppOperationError("Sizda bu filialda sotuv qilish huquqi yo'q", 403);
      }
      if (items.length === 0) throw new AppOperationError("Savatcha bo'sh");

      // Validate stock atomically on server
      if (!db.settings.allowNegativeStock) {
        for (const it of items) {
          if (it.qty <= 0) throw new AppOperationError("Sotuv miqdori noto'g'ri");
          const avail = getStockQty(db, it.variantId, warehouseId);
          if (avail < it.qty) {
            throw new AppOperationError(`"${it.productName}" omborda yetarli emas (qoldiq: ${avail})`, 409);
          }
        }
      }

      const customerId = payload.customerId as string | undefined;
      const customer = customerId ? db.customers.find((c) => c.id === customerId) : undefined;
      const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
      const checkDiscountAmount = Number(payload.checkDiscountAmount ?? 0);
      const checkDiscountPercent = Number(payload.checkDiscountPercent ?? 0);
      const loyaltyPointsSpent = Number(payload.loyaltyPointsSpent ?? 0);
      const afterDiscounts = Math.max(0, subtotal - checkDiscountAmount - loyaltyPointsSpent);
      const vatAmount = db.settings.vatEnabled
        ? Math.round((afterDiscounts * db.settings.vatRate) / (100 + db.settings.vatRate))
        : 0;
      const costTotal = items.reduce((s, i) => s + i.purchasePrice * i.qty, 0);

      const store = db.stores.find((s) => s.id === storeId);
      const storeCode = store?.storeCode || '01';
      const seqNum = 270 + db.sales.length + 1;
      const receiptNumber = `#${storeCode}010104${String(seqNum).padStart(4, '0')}`;
      const saleId = (payload.saleId as string | undefined) || uid('sale');

      items.forEach((it) => {
        adjustWarehouseStock(db, it.productId, it.variantId, warehouseId, storeId, -it.qty, it.purchasePrice, 'sotuv', actor.id, saleId, `Chek ${receiptNumber}`);
      });

      const sale: Sale = {
        id: saleId,
        receiptNumber,
        warehouseId,
        shiftId: db.cashShifts.find((s) => s.status === 'open' && s.storeId === storeId)?.id,
        cashierId: actor.id,
        cashierName: actor.name,
        customerId: customer?.id,
        customerName: customer?.name,
        items,
        subtotal,
        checkDiscountAmount,
        checkDiscountPercent,
        loyaltyPointsSpent,
        loyaltyPointsEarned: 0,
        promoCode: payload.promoCode as string | undefined,
        vatAmount,
        totalAmount: afterDiscounts,
        costTotal,
        payments: [],
        paidAmount: 0,
        debtAmount: 0,
        status: 'deferred',
        fiscalStatus: db.settings.integrations.fiscalProvider === 'none' ? 'not_configured' : 'pending',
        note: payload.note as string | undefined,
        storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      };
      db.sales.unshift(sale);

      if (checkDiscountPercent >= db.settings.discountApprovalThresholdPercent) {
        pushAudit(db, actor, 'big_discount', 'Sale', sale.id, `Katta chegirma: ${checkDiscountPercent}% chek ${receiptNumber}`, storeId);
      }
      return { result: sale };
    }

    case 'PAY_DEFERRED_SALE': {
      requirePerm(db, actor, 'use_pos');
      const saleId = String(payload.saleId ?? '');
      const sale = db.sales.find((s) => s.id === saleId);
      if (!sale) throw new AppOperationError('Tranzaksiya topilmadi', 404);
      if (!canSellInStore(db, actor, sale.storeId)) {
        throw new AppOperationError("Sizda bu filialda to'lov qabul qilish huquqi yo'q", 403);
      }
      if (sale.status === 'completed') return { result: sale };

      if (payload.customerId && payload.customerId !== sale.customerId) {
        const cust = db.customers.find((c) => c.id === payload.customerId);
        sale.customerId = cust?.id;
        sale.customerName = cust?.name;
      }

      const rawPayments = (payload.payments as { method: PaymentMethod; amount: number }[]) ?? [];
      const payments: Payment[] = rawPayments.map((p) => ({
        id: uid('pay'),
        saleId: sale.id,
        method: p.method,
        amount: p.amount,
        storeId: sale.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      }));
      finalizeSaleSideEffects(db, sale, payments, payload.cashGiven as number | undefined, actor);
      pushAudit(db, actor, 'sale_create', 'Sale', sale.id, `Sotuv yakunlandi ${sale.receiptNumber}: ${sale.totalAmount.toLocaleString()} so'm`, sale.storeId);
      return { result: sale };
    }

    case 'DELETE_DEFERRED_SALE': {
      requirePerm(db, actor, 'use_pos');
      const saleId = String(payload.saleId ?? '');
      const sale = db.sales.find((s) => s.id === saleId);
      if (!sale) throw new AppOperationError('Tranzaksiya topilmadi', 404);
      requireStoreAccess(db, actor, sale.storeId);
      if (sale.status === 'deferred') {
        sale.items.forEach((it) => {
          adjustWarehouseStock(db, it.productId, it.variantId, sale.warehouseId, sale.storeId, it.qty, it.purchasePrice, 'qaytarish', actor.id, sale.id, `Kechiktirilgan chek bekor qilindi: ${sale.receiptNumber}`);
        });
      }
      pushDeleted(db, actor, 'Sale', sale.id, sale.receiptNumber, sale.storeId, sale);
      db.sales = db.sales.filter((s) => s.id !== saleId);
      return { result: { ok: true } };
    }

    case 'COMPLETE_SALE': {
      requirePerm(db, actor, 'use_pos');
      const storeId = String(payload.storeId ?? '');
      const warehouseId = String(payload.warehouseId ?? '');
      const items = (payload.items as SaleItem[]) ?? [];
      if (!canSellInStore(db, actor, storeId)) {
        throw new AppOperationError("Sizda bu filialda sotuv qilish huquqi yo'q", 403);
      }
      if (items.length === 0) throw new AppOperationError("Savatcha bo'sh");

      if (!db.settings.allowNegativeStock) {
        for (const it of items) {
          if (it.qty <= 0) throw new AppOperationError("Sotuv miqdori noto'g'ri");
          const avail = getStockQty(db, it.variantId, warehouseId);
          if (avail < it.qty) {
            throw new AppOperationError(`"${it.productName}" omborda yetarli emas (qoldiq: ${avail})`, 409);
          }
        }
      }

      const customerId = payload.customerId as string | undefined;
      const customer = customerId ? db.customers.find((c) => c.id === customerId) : undefined;
      const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
      const checkDiscountAmount = Number(payload.checkDiscountAmount ?? 0);
      const checkDiscountPercent = Number(payload.checkDiscountPercent ?? 0);
      const loyaltyPointsSpent = Number(payload.loyaltyPointsSpent ?? 0);
      const afterDiscounts = Math.max(0, subtotal - checkDiscountAmount - loyaltyPointsSpent);
      const vatAmount = db.settings.vatEnabled
        ? Math.round((afterDiscounts * db.settings.vatRate) / (100 + db.settings.vatRate))
        : 0;
      const costTotal = items.reduce((s, i) => s + i.purchasePrice * i.qty, 0);

      const store = db.stores.find((s) => s.id === storeId);
      const storeCode = store?.storeCode || '01';
      const seqNum = 270 + db.sales.length + 1;
      const receiptNumber = `#${storeCode}010104${String(seqNum).padStart(4, '0')}`;
      const saleId = (payload.saleId as string | undefined) || uid('sale');

      items.forEach((it) => {
        adjustWarehouseStock(db, it.productId, it.variantId, warehouseId, storeId, -it.qty, it.purchasePrice, 'sotuv', actor.id, saleId, `Chek ${receiptNumber}`);
      });

      const sale: Sale = {
        id: saleId,
        receiptNumber,
        warehouseId,
        shiftId: db.cashShifts.find((s) => s.status === 'open' && s.storeId === storeId)?.id,
        cashierId: actor.id,
        cashierName: actor.name,
        customerId: customer?.id,
        customerName: customer?.name,
        items,
        subtotal,
        checkDiscountAmount,
        checkDiscountPercent,
        loyaltyPointsSpent,
        loyaltyPointsEarned: 0,
        promoCode: payload.promoCode as string | undefined,
        vatAmount,
        totalAmount: afterDiscounts,
        costTotal,
        payments: [],
        paidAmount: 0,
        debtAmount: 0,
        status: 'completed',
        offlineCreated: Boolean(payload.offlineCreated),
        fiscalStatus: db.settings.integrations.fiscalProvider === 'none' ? 'not_configured' : 'pending',
        note: payload.note as string | undefined,
        storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      };

      const rawPayments = (payload.payments as { method: PaymentMethod; amount: number }[]) ?? [];
      const payments: Payment[] = rawPayments.map((p) => ({
        id: uid('pay'),
        saleId: sale.id,
        method: p.method,
        amount: p.amount,
        storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      }));
      finalizeSaleSideEffects(db, sale, payments, payload.cashGiven as number | undefined, actor);
      db.sales.unshift(sale);
      pushAudit(db, actor, 'sale_create', 'Sale', sale.id, `Sotuv ${receiptNumber}: ${sale.totalAmount.toLocaleString()} so'm`, storeId);
      return { result: sale };
    }

    case 'PROCESS_RETURN': {
      requirePerm(db, actor, 'process_returns');
      const saleId = String(payload.saleId ?? '');
      const sale = db.sales.find((s) => s.id === saleId);
      if (!sale) throw new AppOperationError('Sotuv cheki topilmadi', 404);
      requireStoreAccess(db, actor, sale.storeId);

      const retReq = (payload.items as { saleItemId: string; qty: number }[]) ?? [];
      const refundMethod = String(payload.refundMethod ?? 'cash') as PaymentMethod;
      const reason = String(payload.reason ?? 'Mijoz qaytardi');
      const isExchange = Boolean(payload.isExchange);

      const retItems = retReq
        .map((ri) => {
          const orig = sale.items.find((i) => i.id === ri.saleItemId);
          if (!orig || ri.qty <= 0 || ri.qty > orig.qty) return null;
          return {
            saleItemId: ri.saleItemId,
            productId: orig.productId,
            variantId: orig.variantId,
            productName: orig.productName,
            variantLabel: orig.variantLabel,
            qty: ri.qty,
            refundAmount: Math.round((orig.lineTotal / orig.qty) * ri.qty),
            purchasePrice: orig.purchasePrice,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      if (retItems.length === 0) throw new AppOperationError("Qaytariladigan tovar tanlanmagan");

      const totalRefund = retItems.reduce((s, r) => s + r.refundAmount, 0);
      const retId = uid('ret');
      const retNum = `QAY-${String(db.returns.length + 1).padStart(3, '0')}`;
      const retRecord: Return = {
        id: retId,
        number: retNum,
        saleId: sale.id,
        receiptNumber: sale.receiptNumber,
        warehouseId: sale.warehouseId,
        items: retItems,
        totalRefund,
        refundMethod,
        reason,
        isExchange,
        storeId: sale.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      };
      db.returns.unshift(retRecord);

      retItems.forEach((ri) => {
        adjustWarehouseStock(db, ri.productId, ri.variantId, sale.warehouseId, sale.storeId, ri.qty, ri.purchasePrice, 'qaytarish', actor.id, retId, `Qaytarish ${retNum}`);
      });

      const totalReturnedQty = retItems.reduce((s, i) => s + i.qty, 0);
      const totalOrigQty = sale.items.reduce((s, i) => s + i.qty, 0);
      sale.status = totalReturnedQty >= totalOrigQty ? 'returned' : 'partial_return';
      sale.updatedAt = nowIso;

      const accType: Account['type'] = refundMethod === 'cash' ? 'cash' : 'card_terminal';
      const acc = ensureStoreAccount(db, sale.storeId, accType, actor.id);
      acc.balance = Math.max(0, acc.balance - totalRefund);
      acc.updatedAt = nowIso;
      db.transactions.unshift({
        id: uid('trx'),
        accountId: acc.id,
        type: 'expense',
        category: 'qaytarish',
        amount: totalRefund,
        description: `Qaytarish ${retNum} (chek ${sale.receiptNumber})`,
        referenceId: retId,
        storeId: sale.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      });

      const shift = db.cashShifts.find((s) => s.status === 'open' && s.storeId === sale.storeId);
      if (shift && refundMethod === 'cash') {
        shift.cashRefundsTotal += totalRefund;
        shift.expectedCash -= totalRefund;
        shift.updatedAt = nowIso;
      }

      pushAudit(db, actor, 'sale_return', 'Return', retId, `Qaytarish ${retNum}: ${totalRefund.toLocaleString()} so'm (${sale.receiptNumber})`, sale.storeId);
      return { result: retRecord };
    }

    case 'CREATE_PURCHASE_RECEIPT': {
      requirePerm(db, actor, 'manage_inventory');
      const supplierId = String(payload.supplierId ?? '');
      const warehouseId = String(payload.warehouseId ?? '');
      const items = (payload.items as PurchaseReceipt['items']) ?? [];
      const paidAmount = Number(payload.paidAmount ?? 0);
      const note = payload.note as string | undefined;

      const wh = db.warehouses.find((w) => w.id === warehouseId);
      if (!wh) throw new AppOperationError('Ombor topilmadi', 404);
      requireStoreAccess(db, actor, wh.storeId);
      if (items.length === 0) throw new AppOperationError("Kamida 1 ta tovar qo'shing");
      if (paidAmount < 0) throw new AppOperationError("To'lov summasi manfiy bo'lishi mumkin emas");

      for (const it of items) {
        if (it.qty <= 0 || it.purchasePrice < 0) {
          throw new AppOperationError("Miqdor va narx musbat bo'lishi shart");
        }
      }

      const totalAmount = items.reduce((s, i) => s + i.total, 0);
      const clampedPaid = Math.min(totalAmount, paidAmount);
      const prId = uid('pr');
      const prNum = `KIR-${String(db.purchaseReceipts.length + 1).padStart(3, '0')}`;
      const pr: PurchaseReceipt = {
        id: prId,
        number: prNum,
        supplierId,
        warehouseId,
        items,
        totalAmount,
        paidAmount: clampedPaid,
        paymentStatus: clampedPaid >= totalAmount ? 'paid' : clampedPaid > 0 ? 'partial' : 'debt',
        note,
        storeId: wh.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      };
      db.purchaseReceipts.unshift(pr);

      items.forEach((it) => {
        adjustWarehouseStock(db, it.productId, it.variantId, warehouseId, wh.storeId, it.qty, it.purchasePrice, 'kirim', actor.id, prId, `Kirim ${prNum}`);
        const prod = db.products.find((p) => p.id === it.productId);
        const v = prod?.variants.find((vx) => vx.id === it.variantId);
        if (v) v.purchasePrice = it.purchasePrice;
      });

      const debtDelta = totalAmount - clampedPaid;
      const sup = db.suppliers.find((s) => s.id === supplierId);
      if (sup && debtDelta > 0) {
        sup.debtBalance += debtDelta;
        sup.updatedAt = nowIso;
      }

      if (clampedPaid > 0) {
        const cashAcc = ensureStoreAccount(db, wh.storeId, 'cash', actor.id);
        cashAcc.balance -= clampedPaid;
        cashAcc.updatedAt = nowIso;
        db.transactions.unshift({
          id: uid('trx'),
          accountId: cashAcc.id,
          type: 'expense',
          category: 'kirim',
          amount: clampedPaid,
          description: `Kirim ${prNum} uchun to'lov`,
          referenceId: prId,
          storeId: wh.storeId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: actor.id,
        });
      }

      pushAudit(db, actor, 'purchase_receipt', 'PurchaseReceipt', prId, `Kirim hujjati ${prNum}: ${totalAmount.toLocaleString()} so'm (${wh.name})`, wh.storeId);
      return { result: pr };
    }

    case 'CREATE_PURCHASE_ORDER': {
      requirePerm(db, actor, 'manage_inventory');
      const warehouseId = String(payload.warehouseId ?? '');
      const wh = db.warehouses.find((w) => w.id === warehouseId);
      if (!wh) throw new AppOperationError('Ombor topilmadi', 404);
      requireStoreAccess(db, actor, wh.storeId);
      const items = (payload.items as PurchaseOrder['items']) ?? [];
      if (items.length === 0) throw new AppOperationError("Buyurtmada kamida 1 ta tovar bo'lishi kerak");

      const po: PurchaseOrder = {
        id: uid('po'),
        number: `BUY-${String(db.purchaseOrders.length + 1).padStart(3, '0')}`,
        supplierId: String(payload.supplierId ?? ''),
        warehouseId,
        items,
        totalAmount: items.reduce((s, i) => s + i.total, 0),
        status: 'ordered',
        expectedDate: payload.expectedDate as string | undefined,
        note: payload.note as string | undefined,
        storeId: wh.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      };
      db.purchaseOrders.unshift(po);
      return { result: po };
    }

    case 'UPDATE_PO_STATUS': {
      requirePerm(db, actor, 'manage_inventory');
      const poId = String(payload.poId ?? '');
      const status = String(payload.status ?? '') as PurchaseOrder['status'];
      const po = db.purchaseOrders.find((x) => x.id === poId);
      if (!po) throw new AppOperationError('Buyurtma topilmadi', 404);
      requireStoreAccess(db, actor, po.storeId);
      po.status = status;
      po.updatedAt = nowIso;
      if (status === 'received') {
        po.items.forEach((it) => {
          adjustWarehouseStock(db, it.productId, it.variantId, po.warehouseId, po.storeId, it.qty, it.purchasePrice, 'kirim', actor.id, po.id, `Buyurtma qabuli ${po.number}`);
        });
      }
      return { result: { ok: true } };
    }

    case 'CREATE_TRANSFER': {
      requirePerm(db, actor, 'manage_inventory');
      const fromWarehouseId = String(payload.fromWarehouseId ?? '');
      const toWarehouseId = String(payload.toWarehouseId ?? '');
      const items = (payload.items as { productId: string; variantId: string; productName: string; variantLabel: string; sentQty: number }[]) ?? [];
      const note = payload.note as string | undefined;

      if (fromWarehouseId === toWarehouseId) {
        throw new AppOperationError("Chiqim va kirim ombori bir xil bo'lishi mumkin emas");
      }
      const fromWh = db.warehouses.find((w) => w.id === fromWarehouseId);
      const toWh = db.warehouses.find((w) => w.id === toWarehouseId);
      if (!fromWh || !toWh) throw new AppOperationError('Ombor topilmadi', 404);
      requireStoreAccess(db, actor, fromWh.storeId);
      if (items.length === 0) throw new AppOperationError("Ko'chirish uchun tovar tanlang");

      for (const it of items) {
        if (it.sentQty <= 0) throw new AppOperationError("Ko'chirish miqdori 0 dan katta bo'lishi shart");
        const avail = getStockQty(db, it.variantId, fromWarehouseId);
        if (!db.settings.allowNegativeStock && avail < it.sentQty) {
          throw new AppOperationError(`"${it.productName}" qoldig'i yetarli emas (mavjud: ${avail})`, 409);
        }
      }

      const trId = uid('tr');
      const trNum = `KOC-${String(db.transfers.length + 1).padStart(3, '0')}`;
      const tr: Transfer = {
        id: trId,
        number: trNum,
        fromStoreId: fromWh.storeId,
        toStoreId: toWh.storeId,
        fromWarehouseId,
        toWarehouseId,
        items: items.map((i) => ({ ...i, receivedQty: 0 })),
        status: 'sent',
        initiatedByName: actor.name,
        note,
        storeId: fromWh.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      };
      db.transfers.unshift(tr);

      items.forEach((it) => {
        const prod = db.products.find((p) => p.id === it.productId);
        const v = prod?.variants.find((vx) => vx.id === it.variantId);
        adjustWarehouseStock(db, it.productId, it.variantId, fromWarehouseId, fromWh.storeId, -it.sentQty, v?.purchasePrice ?? 0, 'kochirish_out', actor.id, trId, `${trNum}: ${fromWh.name} -> ${toWh.name}`);
      });

      pushAudit(db, actor, 'transfer_create', 'Transfer', trId, `Ko'chirish yuborildi ${trNum}: ${fromWh.name} -> ${toWh.name}`, fromWh.storeId);
      return { result: tr };
    }

    case 'RECEIVE_TRANSFER': {
      requirePerm(db, actor, 'manage_inventory');
      const transferId = String(payload.transferId ?? '');
      const tr = db.transfers.find((t) => t.id === transferId);
      if (!tr) throw new AppOperationError("Ko'chirish hujjati topilmadi", 404);
      const toWh = db.warehouses.find((w) => w.id === tr.toWarehouseId);
      if (!toWh) throw new AppOperationError('Qabul qiluvchi ombor topilmadi', 404);
      requireStoreAccess(db, actor, toWh.storeId);
      if (tr.status !== 'sent') throw new AppOperationError("Bu ko'chirish allaqachon yakunlangan");

      const receivedMap = payload.receivedQtys as Record<string, number> | undefined;
      let hasDiff = false;

      tr.items = tr.items.map((it) => {
        const rec = receivedMap && receivedMap[it.variantId] !== undefined ? Number(receivedMap[it.variantId]) : it.sentQty;
        if (rec !== it.sentQty) hasDiff = true;

        // Branch isolation: ensure target branch owns an independent Product/Variant if none matches SKU
        const srcProd = db.products.find((p) => p.id === it.productId);
        const srcVar = srcProd?.variants.find((v) => v.id === it.variantId);
        let destProductId = it.productId;
        let destVariantId = it.variantId;

        if (srcProd && srcProd.storeId !== toWh.storeId) {
          // Find existing product in target store matching SKU or exact name
          let destProd = db.products.find(
            (p) =>
              p.storeId === toWh.storeId &&
              (p.name.toLowerCase() === srcProd.name.toLowerCase() ||
                (srcVar && p.variants.some((v) => v.sku === srcVar.sku)))
          );
          if (!destProd) {
            const newProdId = uid('prod');
            const newVars = (srcVar ? [srcVar] : srcProd.variants).map((v) => ({
              ...v,
              id: uid('var'),
              productId: newProdId,
              storeId: toWh.storeId,
              createdAt: nowIso,
              updatedAt: nowIso,
              createdBy: actor.id,
            }));
            destProd = {
              ...srcProd,
              id: newProdId,
              storeId: toWh.storeId,
              variants: newVars,
              createdAt: nowIso,
              updatedAt: nowIso,
              createdBy: actor.id,
            };
            db.products.unshift(destProd);
          } else if (srcVar && !destProd.variants.some((v) => v.sku === srcVar.sku || (v.size === srcVar.size && v.color === srcVar.color))) {
            const newVar = {
              ...srcVar,
              id: uid('var'),
              productId: destProd.id,
              storeId: toWh.storeId,
              createdAt: nowIso,
              updatedAt: nowIso,
              createdBy: actor.id,
            };
            destProd.variants.push(newVar);
            destProd.updatedAt = nowIso;
          }
          const matchedDestVar =
            destProd.variants.find((v) => srcVar && (v.sku === srcVar.sku || (v.size === srcVar.size && v.color === srcVar.color))) ??
            destProd.variants[0];
          if (matchedDestVar) {
            destProductId = destProd.id;
            destVariantId = matchedDestVar.id;
          }
        }

        if (rec > 0) {
          adjustWarehouseStock(db, destProductId, destVariantId, tr.toWarehouseId, toWh.storeId, rec, srcVar?.purchasePrice ?? 0, 'kochirish_in', actor.id, tr.id, `Qabul qilindi ${tr.number}`);
        }
        return { ...it, receivedQty: rec };
      });

      tr.status = hasDiff ? 'discrepancy' : 'received';
      tr.receivedBy = actor.id;
      tr.receivedByName = actor.name;
      tr.receivedAt = nowIso;
      tr.updatedAt = nowIso;

      pushAudit(db, actor, 'transfer_receive', 'Transfer', tr.id, `Ko'chirish qabul qilindi ${tr.number} (${toWh.name})`, toWh.storeId);
      return { result: tr };
    }

    case 'REJECT_TRANSFER': {
      requirePerm(db, actor, 'manage_inventory');
      const transferId = String(payload.transferId ?? '');
      const reason = String(payload.reason ?? 'Qabul qilinmadi').trim();
      const tr = db.transfers.find((t) => t.id === transferId);
      if (!tr) throw new AppOperationError("Ko'chirish hujjati topilmadi", 404);
      const toWh = db.warehouses.find((w) => w.id === tr.toWarehouseId);
      const fromWh = db.warehouses.find((w) => w.id === tr.fromWarehouseId);
      if (!toWh || !fromWh) throw new AppOperationError('Ombor topilmadi', 404);
      if (!canAccessStore(db, actor, toWh.storeId) && !canAccessStore(db, actor, fromWh.storeId)) {
        throw new AppOperationError("Bu ko'chirishni rad etish ruxsati yo'q", 403);
      }
      if (tr.status !== 'sent') throw new AppOperationError("Bu ko'chirish allaqachon yakunlangan");

      tr.items.forEach((it) => {
        const prod = db.products.find((p) => p.id === it.productId);
        const v = prod?.variants.find((vx) => vx.id === it.variantId);
        adjustWarehouseStock(db, it.productId, it.variantId, tr.fromWarehouseId, fromWh.storeId, it.sentQty, v?.purchasePrice ?? 0, 'kochirish_in', actor.id, tr.id, `Rad etildi ${tr.number}: ${reason}`);
      });

      tr.status = 'rejected';
      tr.rejectedAt = nowIso;
      tr.rejectedReason = reason;
      tr.receivedBy = actor.id;
      tr.receivedByName = actor.name;
      tr.updatedAt = nowIso;

      pushAudit(db, actor, 'transfer_reject', 'Transfer', tr.id, `Ko'chirish rad etildi ${tr.number}: ${reason}`, toWh.storeId);
      return { result: tr };
    }

    case 'CREATE_WRITEOFF': {
      requirePerm(db, actor, 'manage_inventory');
      const warehouseId = String(payload.warehouseId ?? '');
      const reason = String(payload.reason ?? 'damaged') as WriteOffReason;
      const items = (payload.items as WriteOff['items']) ?? [];
      const note = payload.note as string | undefined;
      const wh = db.warehouses.find((w) => w.id === warehouseId);
      if (!wh) throw new AppOperationError('Ombor topilmadi', 404);
      requireStoreAccess(db, actor, wh.storeId);
      if (items.length === 0) throw new AppOperationError("Kamida 1 ta tovar tanlang");
      for (const it of items) {
        if (it.qty <= 0) throw new AppOperationError("Miqdor 0 dan katta bo'lishi shart");
      }

      const woId = uid('wo');
      const woNum = `CHQ-${String(db.writeOffs.length + 1).padStart(3, '0')}`;
      const totalCost = items.reduce((s, i) => s + i.qty * i.unitCost, 0);
      const wo: WriteOff = {
        id: woId,
        number: woNum,
        warehouseId,
        reason,
        items,
        totalCost,
        note,
        storeId: wh.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      };
      db.writeOffs.unshift(wo);

      items.forEach((it) => {
        adjustWarehouseStock(db, it.productId, it.variantId, warehouseId, wh.storeId, -it.qty, it.unitCost, 'chiqim', actor.id, woId, `Chiqim ${woNum} (${reason})`);
      });
      pushAudit(db, actor, 'stock_writeoff', 'WriteOff', woId, `Hisobdan chiqarish ${woNum}: ${totalCost.toLocaleString()} so'm (${wh.name})`, wh.storeId);
      return { result: wo };
    }

    case 'SAVE_STOCKTAKE': {
      requirePerm(db, actor, 'manage_inventory');
      const warehouseId = String(payload.warehouseId ?? '');
      const items = (payload.items as StocktakeItem[]) ?? [];
      const note = payload.note as string | undefined;
      const existingId = payload.id as string | undefined;
      const wh = db.warehouses.find((w) => w.id === warehouseId);
      if (!wh) throw new AppOperationError('Ombor topilmadi', 404);
      requireStoreAccess(db, actor, wh.storeId);

      const disc = items.reduce((s, i) => s + (i.countedQty - i.systemQty) * i.unitCost, 0);
      if (existingId) {
        const st = db.stocktakes.find((x) => x.id === existingId);
        if (st) {
          st.items = items;
          st.totalDiscrepancyValue = disc;
          st.note = note;
          st.updatedAt = nowIso;
          return { result: st };
        }
      }
      const st: Stocktake = {
        id: uid('st'),
        number: `INV-${String(db.stocktakes.length + 1).padStart(3, '0')}`,
        warehouseId,
        status: 'in_progress',
        items,
        totalDiscrepancyValue: disc,
        note,
        storeId: wh.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      };
      db.stocktakes.unshift(st);
      return { result: st };
    }

    case 'APPLY_STOCKTAKE': {
      requirePerm(db, actor, 'manage_inventory');
      const stocktakeId = String(payload.stocktakeId ?? '');
      const st = db.stocktakes.find((x) => x.id === stocktakeId);
      if (!st || st.status === 'completed') throw new AppOperationError('Inventarizatsiya topilmadi');
      requireStoreAccess(db, actor, st.storeId);

      st.items.forEach((it) => {
        const diff = it.countedQty - it.systemQty;
        if (diff !== 0) {
          adjustWarehouseStock(db, it.productId, it.variantId, st.warehouseId, st.storeId, diff, it.unitCost, 'inventarizatsiya', actor.id, st.id, `Inventarizatsiya ${st.number}`);
        }
      });
      st.status = 'completed';
      st.updatedAt = nowIso;
      pushAudit(db, actor, 'stocktake_apply', 'Stocktake', st.id, `Inventarizatsiya tasdiqlandi ${st.number}`, st.storeId);
      return { result: { ok: true } };
    }

    case 'UPSERT_SUPPLIER': {
      requirePerm(db, actor, 'manage_inventory');
      const sup = payload.supplier as Supplier;
      if (!sup?.name?.trim()) throw new AppOperationError("Ta'minotchi nomi kiritilishi shart");
      const idx = db.suppliers.findIndex((s) => s.id === sup.id);
      if (idx >= 0) db.suppliers[idx] = { ...sup, updatedAt: nowIso };
      else db.suppliers.unshift({ ...sup, id: sup.id || uid('sup'), createdAt: nowIso, updatedAt: nowIso, createdBy: actor.id });
      return { result: sup };
    }

    case 'PAY_SUPPLIER_DEBT': {
      requirePerm(db, actor, 'manage_finance');
      const supplierId = String(payload.supplierId ?? '');
      const amount = Number(payload.amount ?? 0);
      const accountId = String(payload.accountId ?? '');
      if (amount <= 0) throw new AppOperationError("Summa 0 dan katta bo'lishi kerak");
      const sup = db.suppliers.find((s) => s.id === supplierId);
      const acc = db.accounts.find((a) => a.id === accountId);
      if (!sup || !acc) throw new AppOperationError("Ta'minotchi yoki hisob topilmadi", 404);
      requireStoreAccess(db, actor, acc.storeId);

      sup.debtBalance = Math.max(0, sup.debtBalance - amount);
      sup.updatedAt = nowIso;
      acc.balance -= amount;
      acc.updatedAt = nowIso;
      db.transactions.unshift({
        id: uid('trx'),
        accountId,
        type: 'expense',
        category: 'taminotchi_qarz',
        amount,
        description: `${sup.name} qarz to'lovi`,
        referenceId: supplierId,
        storeId: acc.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      });
      return { result: { ok: true } };
    }

    case 'UPSERT_CUSTOMER': {
      requirePerm(db, actor, 'manage_customers');
      const c = payload.customer as Customer;
      if (!c?.name?.trim()) throw new AppOperationError('Mijoz ismi kiritilishi shart');
      requireStoreAccess(db, actor, c.storeId);
      const idx = db.customers.findIndex((x) => x.id === c.id);
      if (idx >= 0) {
        db.customers[idx] = { ...c, updatedAt: nowIso };
        return { result: db.customers[idx] };
      }
      const created: Customer = {
        ...c,
        id: c.id || uid('cust'),
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      };
      db.customers.unshift(created);
      db.loyaltyAccounts.push({
        id: uid('loy'),
        customerId: created.id,
        tier: 'bronze',
        cashbackPercent: db.settings.loyaltyTiers[0]?.cashbackPercent ?? 2,
        pointsBalance: 0,
        cardNumber: `SHU-${Math.floor(2000 + Math.random() * 7999)}`,
        storeId: created.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      });
      return { result: created };
    }

    case 'REPAY_DEBT': {
      requirePerm(db, actor, 'manage_debts');
      const debtId = String(payload.debtId ?? '');
      const amount = Number(payload.amount ?? 0);
      const method = String(payload.method ?? 'cash') as PaymentMethod;
      const note = payload.note as string | undefined;
      if (amount <= 0) throw new AppOperationError("To'lov summasi 0 dan katta bo'lishi kerak");

      const debt = db.debts.find((d) => d.id === debtId);
      if (!debt) throw new AppOperationError('Qarz yozuvi topilmadi', 404);
      requireStoreAccess(db, actor, debt.storeId);

      const paid = Math.min(amount, debt.remainingAmount);
      debt.remainingAmount -= paid;
      debt.status = debt.remainingAmount === 0 ? 'paid' : 'partial';
      debt.payments.push({ id: uid('dp'), amount: paid, method, paidAt: nowIso, note });
      debt.updatedAt = nowIso;

      const cust = db.customers.find((c) => c.id === debt.customerId);
      if (cust) {
        cust.debtBalance = Math.max(0, cust.debtBalance - paid);
        cust.updatedAt = nowIso;
      }
      const accType: Account['type'] = method === 'cash' ? 'cash' : method === 'transfer' ? 'bank' : 'card_terminal';
      const acc = ensureStoreAccount(db, debt.storeId, accType, actor.id);
      acc.balance += paid;
      acc.updatedAt = nowIso;
      db.transactions.unshift({
        id: uid('trx'),
        accountId: acc.id,
        type: 'income',
        category: 'nasiya_tolov',
        amount: paid,
        description: `${debt.customerName} nasiya to'lovi`,
        referenceId: debtId,
        storeId: debt.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      });
      pushAudit(db, actor, 'debt_repay', 'Debt', debtId, `${debt.customerName} qarz to'lovi: ${paid.toLocaleString()} so'm`, debt.storeId);
      return { result: { ok: true } };
    }

    case 'UPSERT_PROMO': {
      requirePerm(db, actor, 'manage_customers');
      const pr = payload.promo as PromoCode;
      if (!pr?.code?.trim()) throw new AppOperationError('Promokod matni kiritilishi shart');
      const idx = db.promoCodes.findIndex((p) => p.id === pr.id);
      if (idx >= 0) db.promoCodes[idx] = { ...pr, updatedAt: nowIso };
      else db.promoCodes.unshift({ ...pr, id: pr.id || uid('promo'), createdAt: nowIso, updatedAt: nowIso, createdBy: actor.id });
      return { result: { ok: true } };
    }

    case 'ADD_EXPENSE': {
      requirePerm(db, actor, 'manage_finance');
      const accountId = String(payload.accountId ?? '');
      const category = String(payload.category ?? 'other') as Expense['category'];
      const amount = Number(payload.amount ?? 0);
      const description = String(payload.description ?? '').trim();
      const isRecurring = Boolean(payload.isRecurring);
      const date = (payload.date as string | undefined) || nowIso;

      if (amount <= 0) throw new AppOperationError("Xarajat summasi 0 dan katta bo'lishi kerak");
      if (!description) throw new AppOperationError('Xarajat izohini kiriting');

      const acc = db.accounts.find((a) => a.id === accountId);
      if (!acc) throw new AppOperationError('Hisob topilmadi', 404);
      requireStoreAccess(db, actor, acc.storeId);

      const exp: Expense = {
        id: uid('exp'),
        accountId,
        category,
        amount,
        description,
        isRecurring,
        date,
        storeId: acc.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      };
      db.expenses.unshift(exp);
      acc.balance -= amount;
      acc.updatedAt = nowIso;
      db.transactions.unshift({
        id: uid('trx'),
        accountId,
        type: 'expense',
        category,
        amount,
        description,
        referenceId: exp.id,
        storeId: acc.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      });
      pushAudit(db, actor, 'expense_create', 'Expense', exp.id, `Xarajat (${category}): ${amount.toLocaleString()} so'm — ${description}`, acc.storeId);
      return { result: exp };
    }

    case 'TRANSFER_FUNDS': {
      requirePerm(db, actor, 'manage_finance');
      const fromAccountId = String(payload.fromAccountId ?? '');
      const toAccountId = String(payload.toAccountId ?? '');
      const amount = Number(payload.amount ?? 0);
      const description = String(payload.description ?? "Hisoblararo o'tkazma");
      if (amount <= 0) throw new AppOperationError("Summa 0 dan katta bo'lishi kerak");
      if (fromAccountId === toAccountId) throw new AppOperationError("Hisoblar bir xil bo'lishi mumkin emas");

      const fromAcc = db.accounts.find((a) => a.id === fromAccountId);
      const toAcc = db.accounts.find((a) => a.id === toAccountId);
      if (!fromAcc || !toAcc) throw new AppOperationError('Hisob topilmadi', 404);
      requireStoreAccess(db, actor, fromAcc.storeId);
      requireStoreAccess(db, actor, toAcc.storeId);

      fromAcc.balance -= amount;
      fromAcc.updatedAt = nowIso;
      toAcc.balance += amount;
      toAcc.updatedAt = nowIso;
      db.transactions.unshift({
        id: uid('trx'),
        accountId: fromAccountId,
        toAccountId,
        type: 'transfer',
        category: 'otkazma',
        amount,
        description,
        storeId: fromAcc.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.id,
      });
      return { result: { ok: true } };
    }

    case 'UPSERT_ACCOUNT': {
      requirePerm(db, actor, 'manage_finance');
      const acc = payload.account as Account;
      if (!acc?.name?.trim()) throw new AppOperationError('Hisob nomini kiriting');
      requireStoreAccess(db, actor, acc.storeId);
      const idx = db.accounts.findIndex((a) => a.id === acc.id);
      if (idx >= 0) db.accounts[idx] = { ...acc, updatedAt: nowIso };
      else db.accounts.push({ ...acc, id: acc.id || uid('acc'), createdAt: nowIso, updatedAt: nowIso, createdBy: actor.id });
      return { result: { ok: true } };
    }

    case 'UPSERT_EMPLOYEE': {
      requirePerm(db, actor, 'manage_employees');
      const emp = payload.employee as Employee;
      const passwordInput = (payload.password as string | undefined)?.trim();
      const pinInput = (payload.pin as string | undefined)?.trim();
      const assignedStoreIds =
        (payload.assignedStoreIds as string[] | undefined) ?? emp.assignedStoreIds ?? [emp.primaryStoreId || emp.storeId];
      const sellStoreIds =
        (payload.sellStoreIds as string[] | undefined) ?? emp.sellStoreIds ?? assignedStoreIds;

      if (!emp?.name?.trim() || !emp?.phone?.trim()) {
        throw new AppOperationError('Xodim ismi va telefon raqami majburiy');
      }

      const targetExistingUser = db.users.find((u) => u.id === emp.userId);
      // Protect Owner account from non-owners
      if (targetExistingUser?.roleId === 'owner' && actor.roleId !== 'owner') {
        throw new AppOperationError("Egasi (Owner) hisobini faqat Egasi tahrirlashi mumkin", 403);
      }
      if (emp.roleId === 'owner' && actor.roleId !== 'owner') {
        throw new AppOperationError("Administrator egasi rolini bera olmaydi", 403);
      }

      const cleanLogin = emp.login ? normalizeLogin(emp.login) : undefined;
      const cleanPhone = normalizePhone(emp.phone);

      // Duplicate login / phone check
      const dupUser = db.users.find(
        (u) =>
          u.id !== emp.userId &&
          ((cleanLogin && u.login && normalizeLogin(u.login) === cleanLogin) ||
            normalizePhone(u.phone) === cleanPhone)
      );
      if (dupUser) {
        throw new AppOperationError("Bu telefon raqam yoki login boshqa xodimga biriktirilgan");
      }

      if (pinInput) {
        if (!/^\d{4,6}$/.test(pinInput)) {
          throw new AppOperationError("PIN-kod 4 dan 6 tagacha raqam bo'lishi kerak");
        }
        const pinDup = db.users.find(
          (u) => u.id !== emp.userId && verifySecret(pinInput, u.pin)
        );
        if (pinDup) {
          throw new AppOperationError("Bu PIN-kod boshqa xodimda allaqachon ishlatilgan");
        }
      }

      const primaryStore = emp.primaryStoreId || assignedStoreIds[0] || emp.storeId || db.stores[0]?.id || '';
      const cleanEmp: Employee = {
        ...emp,
        login: cleanLogin || targetExistingUser?.login || `xodim_${Date.now().toString(36).slice(-4)}`,
        primaryStoreId: primaryStore,
        assignedStoreIds,
        sellStoreIds,
        storeId: primaryStore,
        updatedAt: nowIso,
      };

      const empIdx = db.employees.findIndex((e) => e.id === cleanEmp.id);
      if (empIdx >= 0) db.employees[empIdx] = cleanEmp;
      else db.employees.unshift(cleanEmp);

      const customPermissions = payload.customPermissions as Permission[] | undefined;
      const clearCustomPermissions = Boolean(payload.clearCustomPermissions);

      if (targetExistingUser) {
        targetExistingUser.name = cleanEmp.name;
        targetExistingUser.phone = cleanEmp.phone;
        targetExistingUser.login = cleanEmp.login;
        targetExistingUser.position = cleanEmp.position;
        targetExistingUser.roleId = cleanEmp.roleId;
        targetExistingUser.primaryStoreId = primaryStore;
        targetExistingUser.assignedStoreIds = assignedStoreIds;
        targetExistingUser.sellStoreIds = sellStoreIds;
        targetExistingUser.storeId = primaryStore;
        if (clearCustomPermissions) {
          delete targetExistingUser.customPermissions;
        } else if (Array.isArray(customPermissions)) {
          targetExistingUser.customPermissions = customPermissions;
        }
        if (passwordInput && passwordInput.length >= 4) {
          targetExistingUser.password = hashSecret(passwordInput);
        }
        if (pinInput) {
          targetExistingUser.pin = hashSecret(pinInput);
        }
        targetExistingUser.updatedAt = nowIso;
      } else {
        const finalPin = pinInput || String(Math.floor(1000 + Math.random() * 8999));
        const finalPass = passwordInput && passwordInput.length >= 4 ? passwordInput : '123456';
        db.users.push({
          id: cleanEmp.userId,
          name: cleanEmp.name,
          phone: cleanEmp.phone,
          login: cleanEmp.login,
          password: hashSecret(finalPass),
          pin: hashSecret(finalPin),
          position: cleanEmp.position,
          roleId: cleanEmp.roleId,
          primaryStoreId: primaryStore,
          assignedStoreIds,
          sellStoreIds,
          ...(Array.isArray(customPermissions) && !clearCustomPermissions ? { customPermissions } : {}),
          isActive: true,
          storeId: primaryStore,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: actor.id,
        });
      }

      pushAudit(db, actor, 'employee_change', 'Employee', cleanEmp.id, `Xodim saqlandi: ${cleanEmp.name} (${cleanEmp.roleId})`, primaryStore);
      return { result: cleanEmp };
    }

    case 'DELETE_EMPLOYEE': {
      requirePerm(db, actor, 'manage_employees');
      const employeeId = String(payload.employeeId ?? '');
      const emp = db.employees.find((e) => e.id === employeeId);
      if (!emp) throw new AppOperationError('Xodim topilmadi', 404);
      const usr = db.users.find((u) => u.id === emp.userId);
      if (emp.roleId === 'owner' || usr?.roleId === 'owner') {
        throw new AppOperationError("Egasi (Owner) hisobini o'chirib bo'lmaydi", 403);
      }
      if (emp.userId === actor.id) {
        throw new AppOperationError("O'zingizning hisobingizni o'chira olmaysiz");
      }

      pushDeleted(db, actor, 'Employee', emp.id, emp.name, emp.storeId, { employee: emp, user: usr });
      db.employees = db.employees.filter((e) => e.id !== employeeId);
      if (usr) {
        db.users = db.users.filter((u) => u.id !== usr.id);
      }
      pushAudit(db, actor, 'employee_change', 'Employee', emp.id, `Xodim o'chirildi: ${emp.name}`, emp.storeId);
      return { result: { ok: true } };
    }

    case 'UPDATE_CREDENTIALS': {
      const userId = String(payload.userId ?? '');
      const currentPassword = payload.currentPassword as string | undefined;
      const newPassword = (payload.newPassword as string | undefined)?.trim();
      const newPin = (payload.newPin as string | undefined)?.trim();

      const target = db.users.find((u) => u.id === userId);
      if (!target) throw new AppOperationError('Foydalanuvchi topilmadi', 404);

      const isSelf = actor.id === target.id;
      if (!isSelf && actor.roleId !== 'owner' && !hasPermission(db, actor, 'manage_settings')) {
        throw new AppOperationError("Parolni o'zgartirish ruxsati yo'q", 403);
      }
      if (target.roleId === 'owner' && !isSelf && actor.roleId !== 'owner') {
        throw new AppOperationError("Egasi (Owner) parolini faqat o'zi o'zgartira oladi", 403);
      }

      if (currentPassword !== undefined) {
        if (!verifySecret(currentPassword, target.password)) {
          throw new AppOperationError("Joriy parol noto'g'ri", 403);
        }
      }
      if (newPassword !== undefined) {
        if (newPassword.length < 4) {
          throw new AppOperationError("Yangi parol kamida 4 ta belgidan iborat bo'lishi kerak");
        }
        target.password = hashSecret(newPassword);
      }
      if (newPin !== undefined) {
        if (!/^\d{4,6}$/.test(newPin)) {
          throw new AppOperationError("PIN-kod 4 dan 6 tagacha raqam bo'lishi kerak");
        }
        const dup = db.users.find((u) => u.id !== target.id && verifySecret(newPin, u.pin));
        if (dup) {
          throw new AppOperationError("Bu PIN-kod boshqa xodimda ishlatilgan");
        }
        target.pin = hashSecret(newPin);
      }
      target.updatedAt = nowIso;
      pushAudit(db, actor, 'settings_change', 'User', target.id, `${target.name} parol/PIN yangilandi`, target.storeId);
      return { result: sanitizeUser(target) };
    }

    case 'UPSERT_CATEGORY': {
      requirePerm(db, actor, 'edit_catalog');
      const cat = payload.category as Category;
      if (!cat?.nameUz?.trim()) throw new AppOperationError('Turkum nomi kiritilishi shart');
      const dup = db.categories.find(
        (c) => c.id !== cat.id && c.nameUz.trim().toLowerCase() === cat.nameUz.trim().toLowerCase()
      );
      if (dup) return { result: dup };
      const idx = db.categories.findIndex((c) => c.id === cat.id);
      if (idx >= 0) {
        db.categories[idx] = { ...cat, updatedAt: nowIso };
        return { result: db.categories[idx] };
      }
      const created: Category = { ...cat, id: cat.id || uid('cat'), createdAt: nowIso, updatedAt: nowIso, createdBy: actor.id };
      db.categories.push(created);
      return { result: created };
    }

    case 'DELETE_CATEGORY': {
      requirePerm(db, actor, 'edit_catalog');
      const catId = String(payload.categoryId ?? '');
      const fallback = db.categories.find((c) => c.id !== catId);
      const cat = db.categories.find((c) => c.id === catId);
      if (!cat) throw new AppOperationError('Turkum topilmadi', 404);
      if (fallback) {
        db.products.forEach((p) => {
          if (p.categoryId === catId) p.categoryId = fallback.id;
        });
      }
      pushDeleted(db, actor, 'Category', cat.id, cat.nameUz, cat.storeId, cat);
      db.categories = db.categories.filter((c) => c.id !== catId);
      return { result: { ok: true } };
    }

    case 'RESET_CATEGORIES': {
      requirePerm(db, actor, 'edit_catalog');
      const storeId = db.stores[0]?.id ?? 'store-toraqorgon';
      const defaults = getMensClothingCategories(storeId, nowIso);
      db.categories = defaults;
      const validIds = new Set(defaults.map((d) => d.id));
      const fallbackId = defaults[0]?.id ?? 'cat-shirts';
      db.products.forEach((p) => {
        if (!validIds.has(p.categoryId)) p.categoryId = fallbackId;
      });
      return { result: { ok: true } };
    }

    case 'UPSERT_BRAND': {
      requirePerm(db, actor, 'edit_catalog');
      const b = payload.brand as Brand;
      if (!b?.name?.trim()) throw new AppOperationError('Brend nomi kiritilishi shart');
      const dup = db.brands.find(
        (x) => x.id !== b.id && x.name.trim().toLowerCase() === b.name.trim().toLowerCase()
      );
      if (dup) return { result: dup };
      const idx = db.brands.findIndex((x) => x.id === b.id);
      if (idx >= 0) {
        db.brands[idx] = { ...b, updatedAt: nowIso };
        return { result: db.brands[idx] };
      }
      const created: Brand = { ...b, id: b.id || uid('br'), createdAt: nowIso, updatedAt: nowIso, createdBy: actor.id };
      db.brands.push(created);
      return { result: created };
    }

    case 'ADD_COLOR': {
      requirePerm(db, actor, 'edit_catalog');
      const color = String(payload.color ?? '').trim();
      if (!color) throw new AppOperationError('Rang nomini kiriting');
      if (!Array.isArray(db.customColors)) db.customColors = [];
      const existing = db.customColors.find((c) => c.toLowerCase() === color.toLowerCase());
      if (existing) return { result: existing };
      db.customColors.push(color);
      return { result: color };
    }

    case 'ADD_SIZE': {
      requirePerm(db, actor, 'edit_catalog');
      const size = String(payload.size ?? '').trim();
      if (!size) throw new AppOperationError("O'lchamni kiriting");
      if (!Array.isArray(db.customSizes)) db.customSizes = [];
      const existing = db.customSizes.find((s) => s.toLowerCase() === size.toLowerCase());
      if (existing) return { result: existing };
      db.customSizes.push(size);
      return { result: size };
    }

    case 'UPSERT_STORE': {
      if (actor.roleId !== 'owner' && !hasPermission(db, actor, 'manage_settings')) {
        throw new AppOperationError("Filial qo'shish uchun sozlamalar ruxsati kerak", 403);
      }
      const store = payload.store as Store;
      if (!store?.name?.trim()) throw new AppOperationError('Filial nomini kiriting');
      const idx = db.stores.findIndex((s) => s.id === store.id);
      if (idx >= 0) {
        db.stores[idx] = { ...store, updatedAt: nowIso };
        return { result: db.stores[idx] };
      }
      const created: Store = { ...store, id: store.id || uid('store'), createdAt: nowIso, updatedAt: nowIso, createdBy: actor.id };
      db.stores.push(created);
      // Create default isolated accounts & warehouse for new branch
      if (!db.warehouses.some((w) => w.storeId === created.id || w.id === created.defaultWarehouseId)) {
        db.warehouses.push({
          id: created.defaultWarehouseId || uid('wh'),
          name: `${created.name} Ombori`,
          address: created.address || '',
          isMain: false,
          storeId: created.id,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: actor.id,
        });
      }
      ensureStoreAccount(db, created.id, 'cash', actor.id);
      ensureStoreAccount(db, created.id, 'card_terminal', actor.id);
      ensureStoreAccount(db, created.id, 'bank', actor.id);
      db.users.forEach((u) => {
        if (u.roleId === 'owner') {
          if (!u.assignedStoreIds.includes(created.id)) u.assignedStoreIds.push(created.id);
          if (u.sellStoreIds && !u.sellStoreIds.includes(created.id)) u.sellStoreIds.push(created.id);
        }
      });
      pushAudit(db, actor, 'settings_change', 'Store', created.id, `Yangi filial yaratildi: ${created.name}`, created.id);
      return { result: created };
    }

    case 'DELETE_STORE': {
      requirePerm(db, actor, 'manage_settings');
      const storeId = String(payload.storeId ?? '');
      if (db.stores.length <= 1) throw new AppOperationError("Kamida 1 ta filial qolishi shart");
      const target = db.stores.find((s) => s.id === storeId);
      if (!target) throw new AppOperationError('Filial topilmadi', 404);
      pushDeleted(db, actor, 'Store', target.id, target.name, target.id, target);
      db.stores = db.stores.filter((s) => s.id !== storeId);
      db.warehouses = db.warehouses.filter((w) => w.storeId !== storeId);
      db.users.forEach((u) => {
        u.assignedStoreIds = u.assignedStoreIds.filter((id) => id !== storeId);
        if (u.sellStoreIds) u.sellStoreIds = u.sellStoreIds.filter((id) => id !== storeId);
      });
      return { result: { ok: true } };
    }

    case 'UPSERT_WAREHOUSE': {
      requirePerm(db, actor, 'manage_inventory');
      const wh = payload.warehouse as Warehouse;
      if (!wh?.name?.trim()) throw new AppOperationError('Ombor nomini kiriting');
      requireStoreAccess(db, actor, wh.storeId);
      const idx = db.warehouses.findIndex((w) => w.id === wh.id);
      if (idx >= 0) {
        db.warehouses[idx] = { ...wh, updatedAt: nowIso };
        return { result: db.warehouses[idx] };
      }
      const created: Warehouse = { ...wh, id: wh.id || uid('wh'), createdAt: nowIso, updatedAt: nowIso, createdBy: actor.id };
      db.warehouses.push(created);
      return { result: created };
    }

    case 'UPDATE_SETTINGS': {
      requirePerm(db, actor, 'manage_settings');
      const partial = (payload.partial as Partial<DatabaseSnapshot['settings']>) ?? {};
      db.settings = { ...db.settings, ...partial };
      pushAudit(db, actor, 'settings_change', 'Settings', 'settings', 'Tizim sozlamalari yangilandi', actor.primaryStoreId || db.stores[0]?.id || '');
      return { result: db.settings };
    }

    case 'UPDATE_ROLE_PERMISSIONS': {
      requirePerm(db, actor, 'manage_settings');
      const roleId = String(payload.roleId ?? '') as RoleId;
      const permissions = (payload.permissions as Permission[]) ?? [];
      if (roleId === 'owner') throw new AppOperationError("Egasi roli ruxsatlari o'zgartirilmaydi", 403);
      const role = db.roles.find((r) => r.id === roleId);
      if (!role) throw new AppOperationError('Rol topilmadi', 404);
      role.permissions = permissions;
      return { result: role };
    }

    case 'UPSERT_ROLE': {
      if (!hasPermission(db, actor, 'manage_settings') && !hasPermission(db, actor, 'manage_employees')) {
        throw new AppOperationError("Rol yaratish ruxsati yo'q", 403);
      }
      const role = payload.role as Role;
      if (!role?.nameUz?.trim()) throw new AppOperationError('Rol nomini kiriting');
      if (role.id === 'owner' && actor.roleId !== 'owner') {
        throw new AppOperationError("Egasi rolini o'zgartirib bo'lmaydi", 403);
      }
      const idx = db.roles.findIndex((r) => r.id === role.id);
      if (idx >= 0) {
        db.roles[idx] = role;
        return { result: role };
      }
      const created: Role = { ...role, id: role.id || uid('role') };
      db.roles.push(created);
      return { result: created };
    }

    case 'DELETE_ROLE': {
      requirePerm(db, actor, 'manage_settings');
      const roleId = String(payload.roleId ?? '');
      if (roleId === 'owner') throw new AppOperationError("Egasi rolini o'chirib bo'lmaydi", 403);
      if (db.roles.length <= 2) throw new AppOperationError('Kamida 2 ta rol qolishi shart');
      const fallback = db.roles.find((r) => r.id !== roleId && r.id !== 'owner')?.id ?? 'cashier';
      db.roles = db.roles.filter((r) => r.id !== roleId);
      db.users.forEach((u) => {
        if (u.roleId === roleId) u.roleId = fallback;
      });
      db.employees.forEach((e) => {
        if (e.roleId === roleId) e.roleId = fallback;
      });
      return { result: { ok: true } };
    }

    case 'UPSERT_TARGET': {
      requirePerm(db, actor, 'manage_employees');
      const target = payload.target as Target;
      const idx = db.targets.findIndex((t) => t.id === target.id);
      if (idx >= 0) db.targets[idx] = { ...target, updatedAt: nowIso };
      else db.targets.unshift({ ...target, id: target.id || uid('tgt'), createdAt: nowIso, updatedAt: nowIso, createdBy: actor.id });
      return { result: { ok: true } };
    }

    case 'UPDATE_ONLINE_ORDER_STATUS': {
      requirePerm(db, actor, 'manage_online_orders');
      const orderId = String(payload.orderId ?? '');
      const status = String(payload.status ?? '') as OnlineOrder['status'];
      const ord = db.onlineOrders.find((o) => o.id === orderId);
      if (!ord) throw new AppOperationError('Buyurtma topilmadi', 404);
      requireStoreAccess(db, actor, ord.storeId);
      ord.status = status;
      ord.updatedAt = nowIso;
      if (status === 'delivered') {
        const whId = db.stores.find((s) => s.id === ord.storeId)?.defaultWarehouseId ?? db.warehouses.find((w) => w.storeId === ord.storeId)?.id ?? '';
        if (whId) {
          ord.items.forEach((it) => {
            const p = db.products.find((pr) => pr.id === it.productId);
            const v = p?.variants.find((vx) => vx.id === it.variantId);
            adjustWarehouseStock(db, it.productId, it.variantId, whId, ord.storeId, -it.qty, v?.purchasePrice ?? 0, 'online_sotuv', actor.id, ord.id, `Onlayn buyurtma ${ord.orderNumber}`);
          });
        }
      }
      return { result: { ok: true } };
    }

    case 'RESTORE_DELETED_RECORD': {
      requirePerm(db, actor, 'manage_settings');
      const deletedId = String(payload.deletedId ?? '');
      const list = db.deletedRecords ?? [];
      const rec = list.find((d) => d.id === deletedId);
      if (!rec) throw new AppOperationError("Tiklanadigan yozuv topilmadi", 404);

      if (rec.entityType === 'Product') {
        const d = rec.data as { product: Product; stockItems?: DatabaseSnapshot['stockItems'] };
        if (d.product && !db.products.some((p) => p.id === d.product.id)) {
          db.products.unshift({ ...d.product, updatedAt: nowIso });
        }
        if (Array.isArray(d.stockItems)) {
          d.stockItems.forEach((st) => {
            if (!db.stockItems.some((x) => x.id === st.id)) db.stockItems.push(st);
          });
        }
      } else if (rec.entityType === 'Employee') {
        const d = rec.data as { employee: Employee; user?: User };
        if (d.employee && !db.employees.some((e) => e.id === d.employee.id)) db.employees.push(d.employee);
        if (d.user && !db.users.some((u) => u.id === d.user!.id)) db.users.push(d.user);
      } else if (rec.entityType === 'Store') {
        const s = rec.data as Store;
        if (!db.stores.some((x) => x.id === s.id)) db.stores.push(s);
      } else if (rec.entityType === 'Category') {
        const c = rec.data as Category;
        if (!db.categories.some((x) => x.id === c.id)) db.categories.push(c);
      } else if (rec.entityType === 'Sale') {
        const s = rec.data as Sale;
        if (!db.sales.some((x) => x.id === s.id)) db.sales.unshift(s);
      }

      db.deletedRecords = list.filter((d) => d.id !== deletedId);
      pushAudit(db, actor, 'entity_restore', rec.entityType, rec.entityId, `Tiklandi: ${rec.label}`, rec.storeId);
      return { result: { ok: true } };
    }

    case 'RESET_DEMO_DATA': {
      requirePerm(db, actor, 'manage_settings');
      const seeded = createSeedDatabase();
      seeded.users = seeded.users.map((u) => ({
        ...u,
        password: isHashedSecret(u.password) ? u.password : hashSecret(u.password),
        pin: isHashedSecret(u.pin) ? u.pin : hashSecret(u.pin),
      }));
      Object.assign(db, seeded);
      pushAudit(db, actor, 'backup_restore', 'Database', 'demo', "Demo ma'lumotlar tiklandi", seeded.stores[0]?.id ?? '');
      return { result: { ok: true }, createBackupLabel: 'Demo tiklashdan oldingi zaxira' };
    }

    case 'CLEAR_ALL_TEST_DATA': {
      requirePerm(db, actor, 'manage_settings');
      db.products = [];
      db.stockItems = [];
      db.stockMovements = [];
      db.purchaseReceipts = [];
      db.purchaseOrders = [];
      db.transfers = [];
      db.writeOffs = [];
      db.stocktakes = [];
      db.sales = [];
      db.returns = [];
      db.cashShifts = [];
      db.cashOperations = [];
      db.transactions = [];
      db.expenses = [];
      db.customers = [];
      db.loyaltyAccounts = [];
      db.loyaltyTransactions = [];
      db.debts = [];
      db.onlineOrders = [];
      db.auditLogs = [];
      db.suppliers = db.suppliers.map((s) => ({ ...s, debtBalance: 0 }));
      db.accounts = db.accounts.map((a) => ({ ...a, balance: 0 }));
      return { result: { ok: true }, createBackupLabel: 'Tozalashdan oldingi avtomatik zaxira' };
    }

    case 'IMPORT_BACKUP': {
      requirePerm(db, actor, 'manage_settings');
      const parsed = payload.snapshot as DatabaseSnapshot;
      if (!parsed || !Array.isArray(parsed.stores) || !Array.isArray(parsed.products)) {
        throw new AppOperationError("Zaxira fayli tuzilmasi noto'g'ri");
      }
      parsed.users = parsed.users.map((u) => ({
        ...u,
        password: isHashedSecret(u.password) ? u.password : hashSecret(u.password),
        pin: isHashedSecret(u.pin) ? u.pin : hashSecret(u.pin),
      }));
      Object.assign(db, parsed);
      pushAudit(db, actor, 'backup_restore', 'Database', 'json', 'JSON zaxira nusxa tiklandi', db.stores[0]?.id ?? '');
      return { result: { ok: true }, createBackupLabel: 'JSON tiklashdan oldingi avtomatik zaxira' };
    }

    case 'RESTORE_SERVER_BACKUP': {
      requirePerm(db, actor, 'manage_settings');
      const backupId = String(payload.backupId ?? '');
      const bkp = await loadBackupSnapshot(backupId);
      if (!bkp) throw new AppOperationError('Zaxira nusxasi topilmadi', 404);
      Object.assign(db, bkp);
      pushAudit(db, actor, 'backup_restore', 'Database', backupId, `Server zaxirasi tiklandi (${backupId})`, db.stores[0]?.id ?? '');
      return { result: { ok: true }, createBackupLabel: 'Tiklashdan oldingi avtomatik zaxira' };
    }

    default:
      throw new AppOperationError(`Noma'lum amal turi: ${type}`, 400);
  }
}
