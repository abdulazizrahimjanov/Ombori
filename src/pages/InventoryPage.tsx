import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PackageCheck,
  ArrowLeftRight,
  Trash2,
  ClipboardList,
  History,
  Truck,
  Plus,
  Search,
  AlertTriangle,
  Download,
  X,
  Check,
  XCircle,
} from 'lucide-react';
import { useAppStore, uid } from '../store/useAppStore';
import { formatDate, formatDateTime, formatMoney, useT } from '../i18n';
import {
  Product,
  PurchaseReceiptItem,
  StockMovementType,
  StocktakeItem,
  TransferItem,
  Variant,
  WriteOffItem,
  WriteOffReason,
} from '../types/models';
import { exportToExcel } from '../utils/export';
import { QuickAddKind, QuickAddModal } from '../components/QuickAddModal';

type InvTab = 'stock' | 'receiving' | 'transfers' | 'writeoffs' | 'stocktake' | 'movements' | 'suppliers';

const PAYMENT_STATUS_UZ: Record<string, string> = {
  paid: "To'langan",
  partial: "Qisman to'langan",
  debt: 'Nasiya (qarz)',
};

const TRANSFER_STATUS_UZ: Record<string, string> = {
  sent: "Yo'lda (yuborilgan)",
  received: 'Qabul qilindi',
  discrepancy: 'Farq bilan qabul qilindi',
  rejected: 'Rad etildi',
};

const WRITEOFF_REASON_UZ: Record<WriteOffReason, string> = {
  damaged: 'Shikastlangan / Yaroqsiz',
  expired: "Muddati o'tgan",
  lost: "Yo'qolgan / Kamomad",
  other: 'Boshqa',
};

const MOVEMENT_TYPE_UZ: Record<StockMovementType, string> = {
  kirim: 'Kirim',
  sotuv: 'Sotuv',
  qaytarish: 'Qaytarish',
  kochirish_out: "Ko'chirish (chiqim)",
  kochirish_in: "Ko'chirish (kirim)",
  chiqim: 'Hisobdan chiqarish',
  inventarizatsiya: 'Inventarizatsiya',
  online_sotuv: 'Onlayn sotuv',
};

const PO_STATUS_UZ: Record<string, string> = {
  draft: 'Qoralama',
  ordered: 'Buyurtma berilgan',
  received: 'Qabul qilingan',
  canceled: 'Bekor qilingan',
};

export const InventoryPage: React.FC = () => {
  const db = useAppStore((s) => s.db);
  const can = useAppStore((s) => s.can);
  const canAccessStore = useAppStore((s) => s.canAccessStore);
  const currentUser = useAppStore((s) => s.getCurrentUser());
  const activeStoreId = useAppStore((s) => s.activeStoreId);
  const branchDirectory = useAppStore((s) => s.branchDirectory);
  const getWarehouseForStore = useAppStore((s) => s.getWarehouseForStore);
  const language = useAppStore((s) => s.language);
  const getVariantStock = useAppStore((s) => s.getVariantStock);
  const createPurchaseReceipt = useAppStore((s) => s.createPurchaseReceipt);
  const createPurchaseOrder = useAppStore((s) => s.createPurchaseOrder);
  const updatePurchaseOrderStatus = useAppStore((s) => s.updatePurchaseOrderStatus);
  const createTransfer = useAppStore((s) => s.createTransfer);
  const receiveTransfer = useAppStore((s) => s.receiveTransfer);
  const rejectTransfer = useAppStore((s) => s.rejectTransfer);
  const createWriteOff = useAppStore((s) => s.createWriteOff);
  const saveStocktake = useAppStore((s) => s.saveStocktake);
  const applyStocktake = useAppStore((s) => s.applyStocktake);
  const upsertSupplier = useAppStore((s) => s.upsertSupplier);
  const paySupplierDebt = useAppStore((s) => s.paySupplierDebt);
  const notify = useAppStore((s) => s.notify);
  const t = useT();

  const canManage = can('manage_inventory');
  const canViewCost = can('view_profit_cost');

  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as InvTab) || 'stock';
  const [tab, setTab] = useState<InvTab>(initialTab);
  useEffect(() => {
    const qTab = searchParams.get('tab') as InvTab | null;
    if (qTab && ['stock', 'receiving', 'transfers', 'writeoffs', 'stocktake', 'movements', 'suppliers'].includes(qTab)) {
      setTab(qTab);
    }
  }, [searchParams]);

  const [warehouseFilter, setWarehouseFilter] = useState('all');
  useEffect(() => {
    if (activeStoreId === 'all') {
      setWarehouseFilter('all');
    } else {
      const whId = getWarehouseForStore(activeStoreId);
      setWarehouseFilter(whId || 'all');
    }
  }, [activeStoreId, getWarehouseForStore]);

  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'dead'>('all');
  const [search, setSearch] = useState('');
  const [quickAdd, setQuickAdd] = useState<{ kind: QuickAddKind; target?: 'rec' | 'po' } | null>(null);

  // Receiving modal
  const [recOpen, setRecOpen] = useState(false);
  const [recSupplierId, setRecSupplierId] = useState('');
  const [recWarehouseId, setRecWarehouseId] = useState('');
  const [recVariantId, setRecVariantId] = useState('');
  const [recQty, setRecQty] = useState(10);
  const [recPrice, setRecPrice] = useState(100000);
  const [recItems, setRecItems] = useState<PurchaseReceiptItem[]>([]);
  const [recPaid, setRecPaid] = useState(0);

  // Transfer modal & reject modal
  const [trfOpen, setTrfOpen] = useState(false);
  const [trfFrom, setTrfFrom] = useState('');
  const [trfTo, setTrfTo] = useState('');
  const [trfVariantId, setTrfVariantId] = useState('');
  const [trfQty, setTrfQty] = useState(5);
  const [trfItems, setTrfItems] = useState<TransferItem[]>([]);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Write-off modal
  const [woOpen, setWoOpen] = useState(false);
  const [woWarehouse, setWoWarehouse] = useState('');
  const [woReason, setWoReason] = useState<WriteOffReason>('damaged');
  const [woVariantId, setWoVariantId] = useState('');
  const [woQty, setWoQty] = useState(1);
  const [woNote, setWoNote] = useState('');

  // Stocktake state
  const [activeStocktakeWh, setActiveStocktakeWh] = useState('');
  const [stocktakeItems, setStocktakeItems] = useState<StocktakeItem[]>([]);
  const [scanCode, setScanCode] = useState('');

  // Supplier modal
  const [supModalOpen, setSupModalOpen] = useState(false);
  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('+99890');

  // PO modal
  const [poOpen, setPoOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poVariantId, setPoVariantId] = useState('');
  const [poQty, setPoQty] = useState(15);

  const scopedWarehouses = useMemo(() => {
    if (!db) return [];
    return activeStoreId === 'all'
      ? db.warehouses
      : db.warehouses.filter((w) => w.storeId === activeStoreId);
  }, [db, activeStoreId]);

  const transferDestinations = useMemo(() => {
    if (!db) return [];
    const seen = new Set<string>();
    const list: { warehouseId: string; storeId: string; label: string }[] = [];
    db.warehouses.forEach((w) => {
      if (!seen.has(w.id)) {
        seen.add(w.id);
        const stName = db.stores.find((s) => s.id === w.storeId)?.name;
        list.push({
          warehouseId: w.id,
          storeId: w.storeId,
          label: stName ? `${stName} — ${w.name}` : w.name,
        });
      }
    });
    branchDirectory.forEach((b) => {
      if (b.warehouseId && !seen.has(b.warehouseId)) {
        seen.add(b.warehouseId);
        list.push({
          warehouseId: b.warehouseId,
          storeId: b.id,
          label: `${b.name} — ${b.warehouseName}`,
        });
      }
    });
    return list;
  }, [db, branchDirectory]);

  const resolveWarehouseName = (whId: string) => {
    const wh = db?.warehouses.find((w) => w.id === whId);
    if (wh) return wh.name;
    const br = branchDirectory.find((b) => b.warehouseId === whId);
    if (br) return `${br.name} (${br.warehouseName})`;
    return whId;
  };

  const scopedProducts = useMemo(() => {
    if (!db) return [];
    return activeStoreId === 'all'
      ? db.products
      : db.products.filter((p) => p.storeId === activeStoreId);
  }, [db, activeStoreId]);

  const scopedSuppliers = useMemo(() => {
    if (!db) return [];
    return activeStoreId === 'all'
      ? db.suppliers
      : db.suppliers.filter((s) => !s.storeId || s.storeId === 'all' || s.storeId === activeStoreId);
  }, [db, activeStoreId]);

  const scopedPurchaseReceipts = useMemo(() => {
    if (!db) return [];
    return activeStoreId === 'all'
      ? db.purchaseReceipts
      : db.purchaseReceipts.filter((pr) => pr.storeId === activeStoreId);
  }, [db, activeStoreId]);

  const scopedTransfers = useMemo(() => {
    if (!db) return [];
    if (activeStoreId === 'all') return db.transfers;
    const whIds = new Set(scopedWarehouses.map((w) => w.id));
    return db.transfers.filter(
      (tr) =>
        tr.storeId === activeStoreId ||
        tr.fromStoreId === activeStoreId ||
        tr.toStoreId === activeStoreId ||
        whIds.has(tr.fromWarehouseId) ||
        whIds.has(tr.toWarehouseId)
    );
  }, [db, activeStoreId, scopedWarehouses]);

  const scopedWriteOffs = useMemo(() => {
    if (!db) return [];
    return activeStoreId === 'all'
      ? db.writeOffs
      : db.writeOffs.filter((wo) => wo.storeId === activeStoreId);
  }, [db, activeStoreId]);

  const scopedStocktakes = useMemo(() => {
    if (!db) return [];
    return activeStoreId === 'all'
      ? db.stocktakes
      : db.stocktakes.filter((st) => st.storeId === activeStoreId);
  }, [db, activeStoreId]);

  const scopedMovements = useMemo(() => {
    if (!db) return [];
    return activeStoreId === 'all'
      ? db.stockMovements
      : db.stockMovements.filter((m) => m.storeId === activeStoreId);
  }, [db, activeStoreId]);

  const scopedPurchaseOrders = useMemo(() => {
    if (!db) return [];
    return activeStoreId === 'all'
      ? db.purchaseOrders
      : db.purchaseOrders.filter((po) => po.storeId === activeStoreId);
  }, [db, activeStoreId]);

  const scopedAccounts = useMemo(() => {
    if (!db) return [];
    return activeStoreId === 'all'
      ? db.accounts
      : db.accounts.filter((a) => a.storeId === activeStoreId);
  }, [db, activeStoreId]);

  const variantLookup = useMemo(() => {
    const map = new Map<string, { product: Product; variant: Variant }>();
    if (!db) return map;
    db.products.forEach((p) => p.variants.forEach((v) => map.set(v.id, { product: p, variant: v })));
    return map;
  }, [db]);

  // 30-day sales velocity per variant
  const velocityMap = useMemo(() => {
    if (!db) return new Map<string, number>();
    const cutoff = Date.now() - 30 * 86400000;
    const map = new Map<string, number>();
    db.sales.forEach((s) => {
      if (
        (activeStoreId === 'all' || s.storeId === activeStoreId) &&
        s.status !== 'deferred' &&
        s.status !== 'returned' &&
        new Date(s.createdAt).getTime() >= cutoff
      ) {
        s.items.forEach((it) => map.set(it.variantId, (map.get(it.variantId) ?? 0) + it.qty));
      }
    });
    return map;
  }, [db, activeStoreId]);

  const stockRows = useMemo(() => {
    if (!db) return [];
    const rows: {
      product: Product;
      variant: Variant;
      qty: number;
      sold30d: number;
      reorderQty: number;
    }[] = [];

    scopedProducts.forEach((p) => {
      p.variants.forEach((v) => {
        const qty =
          warehouseFilter === 'all' ? getVariantStock(v.id) : getVariantStock(v.id, warehouseFilter);
        const sold30d = velocityMap.get(v.id) ?? 0;
        const isLow = qty <= v.minStock;
        const isDead = sold30d === 0 && qty > 0;
        if (stockFilter === 'low' && !isLow) return;
        if (stockFilter === 'dead' && !isDead) return;
        if (search) {
          const q = search.toLowerCase();
          if (
            !p.name.toLowerCase().includes(q) &&
            !v.sku.toLowerCase().includes(q) &&
            !v.barcodes.some((b) => b.includes(q))
          ) {
            return;
          }
        }
        const dailyVel = sold30d / 30;
        const reorderQty = isLow ? Math.max(v.minStock * 2 - qty, Math.ceil(dailyVel * 14)) : 0;
        rows.push({ product: p, variant: v, qty, sold30d, reorderQty });
      });
    });
    return rows;
  }, [db, scopedProducts, warehouseFilter, stockFilter, search, getVariantStock, velocityMap]);

  if (!db) return null;

  const defaultStoreId =
    activeStoreId !== 'all' ? activeStoreId : scopedWarehouses[0]?.storeId ?? db.stores[0]?.id ?? '';

  const initReceivingModal = () => {
    const firstVar = scopedProducts[0]?.variants[0];
    setRecSupplierId(scopedSuppliers[0]?.id ?? db.suppliers[0]?.id ?? '');
    setRecWarehouseId(scopedWarehouses[0]?.id ?? db.warehouses[0]?.id ?? '');
    setRecVariantId(firstVar?.id ?? '');
    setRecPrice(firstVar?.purchasePrice ?? 100000);
    setRecQty(10);
    setRecItems([]);
    setRecPaid(0);
    setRecOpen(true);
  };

  const addReceivingItem = () => {
    const found = variantLookup.get(recVariantId);
    if (!found || recQty <= 0) return;
    const total = recQty * recPrice;
    const item: PurchaseReceiptItem = {
      productId: found.product.id,
      variantId: found.variant.id,
      productName: found.product.name,
      variantLabel: [found.variant.size, found.variant.color].filter(Boolean).join(' / ') || found.variant.sku,
      qty: recQty,
      purchasePrice: recPrice,
      total,
    };
    const next = [...recItems, item];
    setRecItems(next);
    setRecPaid(next.reduce((s, i) => s + i.total, 0));
  };

  const startNewStocktake = (whId: string) => {
    const wh = db.warehouses.find((w) => w.id === whId);
    const productsForWh = wh ? db.products.filter((p) => p.storeId === wh.storeId) : scopedProducts;
    const list: StocktakeItem[] = [];
    productsForWh.forEach((p) => {
      p.variants.forEach((v) => {
        const sysQty = getVariantStock(v.id, whId);
        list.push({
          productId: p.id,
          variantId: v.id,
          productName: p.name,
          variantLabel: [v.size, v.color].filter(Boolean).join(' / '),
          sku: v.sku,
          barcode: v.barcodes[0],
          systemQty: sysQty,
          countedQty: sysQty,
          unitCost: v.purchasePrice,
        });
      });
    });
    setActiveStocktakeWh(whId);
    setStocktakeItems(list);
  };

  const handleStocktakeScan = (code: string) => {
    const q = code.trim().toLowerCase();
    if (!q) return;
    const idx = stocktakeItems.findIndex(
      (it) => it.barcode?.toLowerCase() === q || it.sku.toLowerCase() === q
    );
    if (idx < 0) {
      notify('Shtrix-kod topilmadi', 'error');
      return;
    }
    const next = [...stocktakeItems];
    next[idx] = { ...next[idx], countedQty: next[idx].countedQty + 1 };
    setStocktakeItems(next);
    setScanCode('');
    notify(`${next[idx].productName}: ${next[idx].countedQty}`, 'success');
  };

  const tabs: { id: InvTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'stock', label: t.inventory.tabs.stock, icon: PackageCheck },
    { id: 'receiving', label: t.inventory.tabs.receiving, icon: Plus },
    { id: 'transfers', label: t.inventory.tabs.transfers, icon: ArrowLeftRight },
    { id: 'writeoffs', label: t.inventory.tabs.writeoffs, icon: Trash2 },
    { id: 'stocktake', label: t.inventory.tabs.stocktake, icon: ClipboardList },
    { id: 'movements', label: t.inventory.tabs.movements, icon: History },
    { id: 'suppliers', label: t.inventory.tabs.suppliers, icon: Truck },
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {tabs.map((tb) => {
          const Icon = tb.icon;
          return (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className={`h-10 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                tab === tb.id
                  ? 'bg-teal-700 text-white'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tb.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: STOCK BALANCES */}
      {tab === 'stock' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.common.search}
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium"
              >
                <option value="all">Barcha omborlar</option>
                {scopedWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>

              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(['all', 'low', 'dead'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStockFilter(f)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      stockFilter === f
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    {f === 'all' ? t.common.all : f === 'low' ? t.inventory.lowStock : t.inventory.deadStock}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  exportToExcel(
                    stockRows.map((r) => ({
                      Mahsulot: r.product.name,
                      Variant: [r.variant.size, r.variant.color].filter(Boolean).join(' / '),
                      SKU: r.variant.sku,
                      Qoldiq: r.qty,
                      MinQoldiq: r.variant.minStock,
                      Sotuv30Kun: r.sold30d,
                      BuyurtmaTavsiya: r.reorderQty,
                    })),
                    'ombor-qoldiq'
                  )
                }
                className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-slate-500 font-semibold">
                    <th className="py-3 px-3">Mahsulot / Variant</th>
                    <th className="py-3 px-3">SKU</th>
                    <th className="py-3 px-3 text-right">Qoldiq</th>
                    <th className="py-3 px-3 text-right">Min</th>
                    <th className="py-3 px-3 text-right">30 kun sotuv</th>
                    <th className="py-3 px-3 text-right">{t.inventory.reorderAdvice}</th>
                    {canViewCost && <th className="py-3 px-3 text-right">Qiymat (tannarx)</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stockRows.map((r) => {
                    const isLow = r.qty <= r.variant.minStock;
                    return (
                      <tr key={r.variant.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{r.product.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {[r.variant.size, r.variant.color].filter(Boolean).join(' · ') || 'Standart'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{r.variant.sku}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold">
                          <span className={isLow ? 'text-amber-600 dark:text-amber-400' : ''}>
                            {r.qty} {r.product.unit}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500">{r.variant.minStock}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{r.sold30d}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {r.reorderQty > 0 ? (
                            <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                              <AlertTriangle className="w-3 h-3" />+{r.reorderQty}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        {canViewCost && (
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {formatMoney(r.qty * r.variant.purchasePrice, { lang: language })}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RECEIVING (KIRIM) */}
      {tab === 'receiving' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-display text-base font-bold">{t.inventory.tabs.receiving}</h2>
            {canManage && (
              <button
                type="button"
                onClick={initReceivingModal}
                className="h-10 px-4 rounded-xl bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{t.inventory.newReceiving}</span>
              </button>
            )}
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
            {scopedPurchaseReceipts.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">Hozircha kirim hujjatlari yo'q</div>
            ) : (
              scopedPurchaseReceipts.map((pr) => {
                const sup = db.suppliers.find((s) => s.id === pr.supplierId);
                return (
                  <div key={pr.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold font-mono">{pr.number} · {sup?.name ?? "Ta'minotchi"}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {resolveWarehouseName(pr.warehouseId)} · {pr.items.length} pozitsiya · {formatDateTime(pr.createdAt, language)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-sm">{formatMoney(pr.totalAmount, { lang: language })}</div>
                      <div className="text-xs text-slate-500">
                        To'landi: {formatMoney(pr.paidAmount, { lang: language })} · {PAYMENT_STATUS_UZ[pr.paymentStatus] ?? pr.paymentStatus}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: TRANSFERS */}
      {tab === 'transfers' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-display text-base font-bold">{t.inventory.tabs.transfers}</h2>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  const defaultFrom = scopedWarehouses[0]?.id ?? db.warehouses[0]?.id ?? '';
                  const firstOther = transferDestinations.find((d) => d.warehouseId !== defaultFrom)?.warehouseId ?? defaultFrom;
                  setTrfFrom(defaultFrom);
                  setTrfTo(firstOther);
                  setTrfVariantId(scopedProducts[0]?.variants[0]?.id ?? db.products[0]?.variants[0]?.id ?? '');
                  setTrfItems([]);
                  setTrfOpen(true);
                }}
                className="h-10 px-4 rounded-xl bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{t.inventory.newTransfer}</span>
              </button>
            )}
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
            {scopedTransfers.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">Hozircha ko'chirishlar yo'q</div>
            ) : (
              scopedTransfers.map((tr) => {
                const fromW = resolveWarehouseName(tr.fromWarehouseId);
                const toW = resolveWarehouseName(tr.toWarehouseId);
                const toStoreId = tr.toStoreId ?? db.warehouses.find((w) => w.id === tr.toWarehouseId)?.storeId ?? '';
                const fromStoreId = tr.fromStoreId ?? db.warehouses.find((w) => w.id === tr.fromWarehouseId)?.storeId ?? '';
                const canReceive = !toStoreId || canAccessStore(toStoreId);
                const canReject = canReceive || (!fromStoreId || canAccessStore(fromStoreId));

                return (
                  <div key={tr.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold font-mono">{tr.number} · {fromW} → {toW}</div>
                      <div className="text-xs text-slate-500">
                        {tr.items.length} ta pozitsiya · {TRANSFER_STATUS_UZ[tr.status] ?? tr.status} · {formatDateTime(tr.createdAt, language)}
                      </div>
                      {tr.rejectedReason && (
                        <div className="text-xs text-red-600 mt-0.5">Rad etish sababi: {tr.rejectedReason}</div>
                      )}
                    </div>
                    {tr.status === 'sent' && canManage && (
                      <div className="flex items-center gap-2">
                        {canReceive && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await receiveTransfer(
                                  tr.id,
                                  tr.items.map((it) => ({ variantId: it.variantId, receivedQty: it.sentQty }))
                                );
                                notify("Ko'chirish qabul qilindi", 'success');
                              } catch (err) {
                                notify(err instanceof Error ? err.message : "Qabul qilishda xatolik", 'error');
                              }
                            }}
                            className="px-3 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Qabul qilish</span>
                          </button>
                        )}
                        {canReject && (
                          <button
                            type="button"
                            onClick={() => {
                              setRejectTargetId(tr.id);
                              setRejectReason('');
                            }}
                            className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-900 text-red-600 text-xs font-semibold inline-flex items-center gap-1 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Rad etish</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 4: WRITE-OFFS */}
      {tab === 'writeoffs' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-display text-base font-bold">{t.inventory.tabs.writeoffs}</h2>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setWoWarehouse(scopedWarehouses[0]?.id ?? db.warehouses[0]?.id ?? '');
                  setWoVariantId(scopedProducts[0]?.variants[0]?.id ?? db.products[0]?.variants[0]?.id ?? '');
                  setWoQty(1);
                  setWoNote('');
                  setWoOpen(true);
                }}
                className="h-10 px-4 rounded-xl bg-red-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{t.inventory.newWriteOff}</span>
              </button>
            )}
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
            {scopedWriteOffs.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">Hisobdan chiqarish hujjatlari yo'q</div>
            ) : (
              scopedWriteOffs.map((wo) => (
                <div key={wo.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold font-mono">
                      {wo.number} · {WRITEOFF_REASON_UZ[wo.reason] ?? wo.reason}
                    </div>
                    <div className="text-xs text-slate-500">
                      {resolveWarehouseName(wo.warehouseId)} · {wo.note || formatDateTime(wo.createdAt, language)}
                    </div>
                  </div>
                  <div className="font-mono font-bold text-red-600 text-sm">
                    -{formatMoney(wo.totalCost, { lang: language })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: STOCKTAKE (INVENTARIZATSIYA) */}
      {tab === 'stocktake' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <select
                value={activeStocktakeWh || scopedWarehouses[0]?.id || db.warehouses[0]?.id}
                onChange={(e) => setActiveStocktakeWh(e.target.value)}
                className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium"
              >
                {scopedWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => startNewStocktake(activeStocktakeWh || scopedWarehouses[0]?.id || db.warehouses[0]?.id || '')}
                className="h-10 px-4 rounded-lg bg-teal-700 text-white text-xs font-semibold"
              >
                {t.inventory.startStocktake}
              </button>
            </div>

            {stocktakeItems.length > 0 && (
              <div className="flex items-center gap-2">
                <input
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleStocktakeScan(scanCode);
                    }
                  }}
                  placeholder="Shtrix-kod skanerlang (+1)..."
                  className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const wh = db.warehouses.find((w) => w.id === activeStocktakeWh);
                      const discrepancyVal = stocktakeItems.reduce(
                        (s, it) => s + (it.countedQty - it.systemQty) * it.unitCost,
                        0
                      );
                      const st = await saveStocktake({
                        number: `INV-${String(db.stocktakes.length + 1).padStart(3, '0')}`,
                        warehouseId: activeStocktakeWh,
                        status: 'in_progress',
                        items: stocktakeItems,
                        totalDiscrepancyValue: discrepancyVal,
                        storeId: wh?.storeId ?? defaultStoreId,
                      });
                      await applyStocktake(st.id);
                      setStocktakeItems([]);
                      notify('Inventarizatsiya tasdiqlandi va qoldiqlar tuzatildi', 'success');
                    } catch (err) {
                      notify(err instanceof Error ? err.message : 'Inventarizatsiyada xatolik', 'error');
                    }
                  }}
                  className="h-10 px-4 rounded-lg bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Tuzatishni qo'llash</span>
                </button>
              </div>
            )}
          </div>

          {stocktakeItems.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500">
                    <th className="py-2.5 px-3">Mahsulot</th>
                    <th className="py-2.5 px-3 text-right">Tizimda</th>
                    <th className="py-2.5 px-3 text-right">Haqiqiy (Sanov)</th>
                    <th className="py-2.5 px-3 text-right">Farq</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stocktakeItems.map((it, idx) => {
                    const diff = it.countedQty - it.systemQty;
                    return (
                      <tr key={it.variantId}>
                        <td className="py-2 px-3">
                          <div className="font-semibold">{it.productName}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{it.sku} · {it.variantLabel}</div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono">{it.systemQty}</td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            value={it.countedQty}
                            onChange={(e) => {
                              const next = [...stocktakeItems];
                              next[idx] = { ...it, countedQty: Number(e.target.value) };
                              setStocktakeItems(next);
                            }}
                            className="w-20 h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-right font-mono"
                          />
                        </td>
                        <td className={`py-2 px-3 text-right font-mono font-bold ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {scopedStocktakes.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
              {scopedStocktakes.map((st) => (
                <div key={st.id} className="p-3.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold font-mono">
                      {st.number} · {st.status === 'completed' ? 'Tasdiqlangan' : 'Jarayonda'}
                    </div>
                    <div className="text-slate-500">
                      {resolveWarehouseName(st.warehouseId)} · {formatDateTime(st.createdAt, language)}
                    </div>
                  </div>
                  <div className="font-mono font-bold">
                    Farq qiymati: {formatMoney(st.totalDiscrepancyValue, { lang: language })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: MOVEMENT HISTORY */}
      {tab === 'movements' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500">
                <th className="py-3 px-3">Sana</th>
                <th className="py-3 px-3">Turi</th>
                <th className="py-3 px-3">Mahsulot</th>
                <th className="py-3 px-3">Ombor</th>
                <th className="py-3 px-3 text-right">O'zgarish</th>
                <th className="py-3 px-3 text-right">Qoldiq</th>
                <th className="py-3 px-3">Izoh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {scopedMovements.slice(0, 80).map((m) => {
                const found = variantLookup.get(m.variantId);
                return (
                  <tr key={m.id}>
                    <td className="py-2 px-3 font-mono text-slate-500 whitespace-nowrap">{formatDateTime(m.createdAt, language)}</td>
                    <td className="py-2 px-3 font-semibold">{MOVEMENT_TYPE_UZ[m.type] ?? m.type}</td>
                    <td className="py-2 px-3">{found?.product.name ?? m.productId}</td>
                    <td className="py-2 px-3 text-slate-500">{resolveWarehouseName(m.warehouseId)}</td>
                    <td className={`py-2 px-3 text-right font-mono font-bold ${m.qtyDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {m.qtyDelta >= 0 ? `+${m.qtyDelta}` : m.qtyDelta}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{m.qtyAfter}</td>
                    <td className="py-2 px-3 text-slate-500 truncate max-w-[200px]">{m.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 7: SUPPLIERS & PURCHASE ORDERS */}
      {tab === 'suppliers' && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h2 className="font-display text-base font-bold">Ta'minotchilar</h2>
            <div className="flex gap-2">
              {canManage && (
                <>
                  <button
                    type="button"
                    onClick={() => setSupModalOpen(true)}
                    className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  >
                    + {t.inventory.newSupplier}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPoSupplierId(scopedSuppliers[0]?.id ?? db.suppliers[0]?.id ?? '');
                      setPoVariantId(scopedProducts[0]?.variants[0]?.id ?? db.products[0]?.variants[0]?.id ?? '');
                      setPoOpen(true);
                    }}
                    className="h-9 px-3 rounded-lg bg-teal-700 text-white text-xs font-semibold"
                  >
                    + {t.inventory.newPO}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {scopedSuppliers.map((sup) => (
              <div key={sup.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold">{sup.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{sup.contactName} · <span className="font-mono">{sup.phone}</span></div>
                  <div className="text-xs text-slate-400">{sup.address}</div>
                </div>
                <div className="text-right space-y-1.5">
                  <div className={`font-mono font-bold text-sm ${sup.debtBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatMoney(sup.debtBalance, { lang: language })}
                  </div>
                  {sup.debtBalance > 0 && can('manage_finance') && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const acc = scopedAccounts.find((a) => a.type === 'cash') ?? scopedAccounts[0] ?? db.accounts[0];
                          if (!acc) {
                            notify('To\'lov uchun hisob topilmadi', 'error');
                            return;
                          }
                          await paySupplierDebt(sup.id, sup.debtBalance, acc.id);
                          notify("Ta'minotchi qarzi to'landi", 'success');
                        } catch (err) {
                          notify(err instanceof Error ? err.message : "To'lovda xatolik", 'error');
                        }
                      }}
                      className="px-2.5 py-1 rounded bg-slate-900 dark:bg-slate-700 text-white text-[11px] font-medium"
                    >
                      Qarzni yopish
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
            <div className="px-4 py-3 font-semibold text-xs text-slate-500">Yetkazib beruvchilarga buyurtmalar</div>
            {scopedPurchaseOrders.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">Hozircha buyurtmalar yo'q</div>
            ) : (
              scopedPurchaseOrders.map((po) => {
                const sup = db.suppliers.find((s) => s.id === po.supplierId);
                return (
                  <div key={po.id} className="p-4 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <div className="font-bold font-mono">{po.number} · {sup?.name}</div>
                      <div className="text-slate-500">
                        Kutilayotgan sana: {formatDate(po.expectedDate)} · {PO_STATUS_UZ[po.status] ?? po.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">{formatMoney(po.totalAmount, { lang: language })}</span>
                      {po.status === 'ordered' && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await updatePurchaseOrderStatus(po.id, 'received');
                              notify('Buyurtma qabul qilindi', 'success');
                            } catch (err) {
                              notify(err instanceof Error ? err.message : 'Xatolik yuz berdi', 'error');
                            }
                          }}
                          className="px-2.5 py-1 rounded bg-teal-700 text-white font-medium"
                        >
                          Qabul qilindi
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Receiving Modal */}
      {recOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl max-h-[88vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-display text-base font-bold">{t.inventory.newReceiving}</h3>
              <button type="button" onClick={() => setRecOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-slate-500">Yetkazib beruvchi</label>
                  <button
                    type="button"
                    onClick={() => setQuickAdd({ kind: 'supplier', target: 'rec' })}
                    className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    + Yangi
                  </button>
                </div>
                <select value={recSupplierId} onChange={(e) => setRecSupplierId(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
                  {scopedSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-slate-500">Ombor</label>
                  <button
                    type="button"
                    onClick={() => setQuickAdd({ kind: 'warehouse', target: 'rec' })}
                    className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    + Yangi
                  </button>
                </div>
                <select value={recWarehouseId} onChange={(e) => setRecWarehouseId(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
                  {scopedWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <select
                value={recVariantId}
                onChange={(e) => {
                  setRecVariantId(e.target.value);
                  const found = variantLookup.get(e.target.value);
                  if (found) setRecPrice(found.variant.purchasePrice);
                }}
                className="sm:col-span-2 h-10 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              >
                {scopedProducts.flatMap((p) =>
                  p.variants.map((v) => (
                    <option key={v.id} value={v.id}>{p.name} ({[v.size, v.color].filter(Boolean).join('/') || v.sku})</option>
                  ))
                )}
              </select>
              <input type="number" min={1} value={recQty} onChange={(e) => setRecQty(Number(e.target.value))} placeholder="Soni" className="h-10 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono" />
              <button type="button" onClick={addReceivingItem} className="h-10 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold">+ Qo'shish</button>
            </div>
            {recItems.length > 0 && (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {recItems.map((it, i) => (
                  <div key={i} className="p-2.5 flex justify-between">
                    <span>{it.productName} ({it.variantLabel}) x{it.qty}</span>
                    <span className="font-mono font-bold">{formatMoney(it.total, { lang: language })}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Jami summa</label>
                <div className="h-10 px-3 flex items-center rounded-lg bg-slate-100 dark:bg-slate-950 font-mono font-bold">
                  {formatMoney(recItems.reduce((s, i) => s + i.total, 0), { lang: language })}
                </div>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">To'langan summa (qolgani qarz)</label>
                <input type="number" value={recPaid} onChange={(e) => setRecPaid(Number(e.target.value))} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono" />
              </div>
            </div>
            <button
              type="button"
              disabled={recItems.length === 0}
              onClick={async () => {
                try {
                  const totalAmount = recItems.reduce((s, i) => s + i.total, 0);
                  const wh = db.warehouses.find((w) => w.id === recWarehouseId);
                  await createPurchaseReceipt({
                    number: `KIR-${String(db.purchaseReceipts.length + 1).padStart(3, '0')}`,
                    supplierId: recSupplierId,
                    warehouseId: recWarehouseId,
                    items: recItems,
                    totalAmount,
                    paidAmount: recPaid,
                    paymentStatus: recPaid >= totalAmount ? 'paid' : recPaid > 0 ? 'partial' : 'debt',
                    storeId: wh?.storeId ?? defaultStoreId,
                  });
                  notify('Kirim hujjati saqlandi', 'success');
                  setRecOpen(false);
                } catch (err) {
                  notify(err instanceof Error ? err.message : 'Kirim saqlashda xatolik', 'error');
                }
              }}
              className="w-full h-11 rounded-xl bg-teal-700 text-white text-xs font-semibold disabled:opacity-40"
            >
              Kirimni saqlash
            </button>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {trfOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.inventory.newTransfer}</h3>
              <button type="button" onClick={() => setTrfOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select value={trfFrom} onChange={(e) => setTrfFrom(e.target.value)} className="h-10 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
                {scopedWarehouses.map((w) => <option key={w.id} value={w.id}>Qayerdan: {w.name}</option>)}
              </select>
              <select value={trfTo} onChange={(e) => setTrfTo(e.target.value)} className="h-10 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
                {transferDestinations.map((dest) => (
                  <option key={dest.warehouseId} value={dest.warehouseId}>Qayerga: {dest.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <select value={trfVariantId} onChange={(e) => setTrfVariantId(e.target.value)} className="flex-1 h-10 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
                {scopedProducts.flatMap((p) => p.variants.map((v) => <option key={v.id} value={v.id}>{p.name} ({v.sku})</option>))}
              </select>
              <input type="number" min={1} value={trfQty} onChange={(e) => setTrfQty(Number(e.target.value))} className="w-20 h-10 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono" />
              <button
                type="button"
                onClick={() => {
                  const found = variantLookup.get(trfVariantId);
                  if (!found || trfQty <= 0) return;
                  setTrfItems([...trfItems, { productId: found.product.id, variantId: found.variant.id, productName: found.product.name, variantLabel: found.variant.sku, sentQty: trfQty, receivedQty: 0 }]);
                }}
                className="px-3 h-10 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold"
              >
                +
              </button>
            </div>
            {trfItems.map((it, i) => (
              <div key={i} className="text-xs flex justify-between px-2">
                <span>{it.productName} ({it.variantLabel})</span>
                <span className="font-mono font-bold">{it.sentQty} dona</span>
              </div>
            ))}
            <button
              type="button"
              disabled={trfItems.length === 0 || trfFrom === trfTo}
              onClick={async () => {
                try {
                  const wh = db.warehouses.find((w) => w.id === trfFrom);
                  await createTransfer({
                    number: `KOC-${String(db.transfers.length + 1).padStart(3, '0')}`,
                    fromWarehouseId: trfFrom,
                    toWarehouseId: trfTo,
                    items: trfItems,
                    storeId: wh?.storeId ?? defaultStoreId,
                  });
                  notify("Ko'chirish yuborildi", 'success');
                  setTrfOpen(false);
                } catch (err) {
                  notify(err instanceof Error ? err.message : "Ko'chirish yuborishda xatolik", 'error');
                }
              }}
              className="w-full h-11 rounded-xl bg-teal-700 text-white text-xs font-semibold disabled:opacity-40"
            >
              Yuborish
            </button>
          </div>
        </div>
      )}

      {/* Reject Transfer Modal */}
      {rejectTargetId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Ko'chirishni rad etish</h3>
              <button type="button" onClick={() => setRejectTargetId(null)}><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-500">
              Ko'chirish rad etilganda tovarlar jo'natuvchi omborga qaytariladi.
            </p>
            <input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Rad etish sababi (ixtiyoriy)"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTargetId(null)}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await rejectTransfer(rejectTargetId, rejectReason.trim() || 'Qabul qilinmadi');
                    notify("Ko'chirish rad etildi va qoldiq qaytarildi", 'info');
                    setRejectTargetId(null);
                  } catch (err) {
                    notify(err instanceof Error ? err.message : 'Rad etishda xatolik', 'error');
                  }
                }}
                className="h-9 px-4 rounded-lg bg-red-600 text-white text-xs font-semibold"
              >
                Rad etish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Write-Off Modal */}
      {woOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.inventory.newWriteOff}</h3>
              <button type="button" onClick={() => setWoOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <select value={woWarehouse} onChange={(e) => setWoWarehouse(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              {scopedWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <select value={woReason} onChange={(e) => setWoReason(e.target.value as WriteOffReason)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              <option value="damaged">Shikastlangan / Yaroqsiz</option>
              <option value="expired">Muddati o'tgan</option>
              <option value="lost">Yo'qolgan / Kamomad</option>
              <option value="other">Boshqa</option>
            </select>
            <select value={woVariantId} onChange={(e) => setWoVariantId(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              {scopedProducts.flatMap((p) => p.variants.map((v) => <option key={v.id} value={v.id}>{p.name} ({v.sku})</option>))}
            </select>
            <input type="number" min={1} value={woQty} onChange={(e) => setWoQty(Number(e.target.value))} placeholder="Miqdori" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono" />
            <input value={woNote} onChange={(e) => setWoNote(e.target.value)} placeholder="Izoh" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs" />
            <button
              type="button"
              onClick={async () => {
                try {
                  const found = variantLookup.get(woVariantId);
                  if (!found || woQty <= 0) return;
                  const item: WriteOffItem = {
                    productId: found.product.id,
                    variantId: found.variant.id,
                    productName: found.product.name,
                    variantLabel: found.variant.sku,
                    qty: woQty,
                    unitCost: found.variant.purchasePrice,
                  };
                  const wh = db.warehouses.find((w) => w.id === woWarehouse);
                  await createWriteOff({
                    number: `CHI-${String(db.writeOffs.length + 1).padStart(3, '0')}`,
                    warehouseId: woWarehouse,
                    reason: woReason,
                    items: [item],
                    totalCost: item.qty * item.unitCost,
                    note: woNote,
                    storeId: wh?.storeId ?? defaultStoreId,
                  });
                  notify('Hisobdan chiqarildi', 'info');
                  setWoOpen(false);
                } catch (err) {
                  notify(err instanceof Error ? err.message : 'Hisobdan chiqarishda xatolik', 'error');
                }
              }}
              className="w-full h-11 rounded-xl bg-red-600 text-white text-xs font-semibold"
            >
              Hisobdan chiqarish
            </button>
          </div>
        </div>
      )}

      {/* Supplier Modal */}
      {supModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.inventory.newSupplier}</h3>
              <button type="button" onClick={() => setSupModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <input value={supName} onChange={(e) => setSupName(e.target.value)} placeholder="Kompaniya nomi" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs" />
            <input value={supContact} onChange={(e) => setSupContact(e.target.value)} placeholder="Mas'ul shaxs" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs" />
            <input value={supPhone} onChange={(e) => setSupPhone(e.target.value)} placeholder="Telefon" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono" />
            <button
              type="button"
              onClick={async () => {
                if (!supName.trim()) return;
                try {
                  const nowIso = new Date().toISOString();
                  await upsertSupplier({
                    id: uid('sup'),
                    name: supName.trim(),
                    contactName: supContact.trim() || supName.trim(),
                    phone: supPhone.trim(),
                    debtBalance: 0,
                    storeId: defaultStoreId,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                    createdBy: currentUser?.id ?? 'usr-owner',
                  });
                  notify("Ta'minotchi qo'shildi", 'success');
                  setSupModalOpen(false);
                  setSupName('');
                  setSupContact('');
                } catch (err) {
                  notify(err instanceof Error ? err.message : "Ta'minotchini saqlashda xatolik", 'error');
                }
              }}
              className="w-full h-10 rounded-lg bg-teal-700 text-white text-xs font-semibold"
            >
              {t.common.save}
            </button>
          </div>
        </div>
      )}

      {/* PO Modal */}
      {poOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">{t.inventory.newPO}</h3>
              <button type="button" onClick={() => setPoOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-slate-500">Yetkazib beruvchi</label>
                <button
                  type="button"
                  onClick={() => setQuickAdd({ kind: 'supplier', target: 'po' })}
                  className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                >
                  + Yangi
                </button>
              </div>
              <select value={poSupplierId} onChange={(e) => setPoSupplierId(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
                {scopedSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <select value={poVariantId} onChange={(e) => setPoVariantId(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              {scopedProducts.flatMap((p) => p.variants.map((v) => <option key={v.id} value={v.id}>{p.name} ({v.sku})</option>))}
            </select>
            <input type="number" min={1} value={poQty} onChange={(e) => setPoQty(Number(e.target.value))} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono" />
            <button
              type="button"
              onClick={async () => {
                try {
                  const found = variantLookup.get(poVariantId);
                  if (!found || poQty <= 0) return;
                  const total = found.variant.purchasePrice * poQty;
                  const whId = scopedWarehouses[0]?.id ?? db.warehouses[0]?.id ?? '';
                  await createPurchaseOrder({
                    number: `BUY-${String(db.purchaseOrders.length + 1).padStart(3, '0')}`,
                    supplierId: poSupplierId,
                    warehouseId: whId,
                    items: [{ productId: found.product.id, variantId: found.variant.id, productName: found.product.name, variantLabel: found.variant.sku, qty: poQty, purchasePrice: found.variant.purchasePrice, total }],
                    totalAmount: total,
                    status: 'ordered',
                    expectedDate: new Date(Date.now() + 3 * 86400000).toISOString(),
                    storeId: scopedWarehouses[0]?.storeId ?? defaultStoreId,
                  });
                  notify('Buyurtma yaratildi', 'success');
                  setPoOpen(false);
                } catch (err) {
                  notify(err instanceof Error ? err.message : 'Buyurtma yaratishda xatolik', 'error');
                }
              }}
              className="w-full h-10 rounded-lg bg-teal-700 text-white text-xs font-semibold"
            >
              Buyurtma berish
            </button>
          </div>
        </div>
      )}

      <QuickAddModal
        open={Boolean(quickAdd)}
        kind={quickAdd?.kind ?? null}
        storeId={defaultStoreId}
        onClose={() => setQuickAdd(null)}
        onCreated={(created) => {
          if (!quickAdd) return;
          if (quickAdd.kind === 'supplier') {
            if (quickAdd.target === 'rec') setRecSupplierId(created.id);
            else if (quickAdd.target === 'po') setPoSupplierId(created.id);
          } else if (quickAdd.kind === 'warehouse') {
            setRecWarehouseId(created.id);
          }
        }}
      />
    </div>
  );
};
