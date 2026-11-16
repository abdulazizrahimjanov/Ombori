import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Download, Printer } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { formatDateTime, formatMoney, useT } from '../i18n';
import { AuditLog } from '../types/models';
import { exportToExcel, exportToPdf } from '../utils/export';
import { printHtmlDocument } from '../utils/print';

type ReportTab = 'sales' | 'abc' | 'valuation' | 'returnsDiscounts' | 'audit';

const AUDIT_ACTION_UZ: Record<AuditLog['action'], string> = {
  product_create: "Tovar qo'shish",
  product_edit: 'Tovar tahrirlash',
  product_delete: "Tovar o'chirish",
  price_change: "Narx o'zgartirish",
  purchase_receipt: 'Kirim hujjati',
  sale_create: 'Sotuv',
  sale_return: 'Qaytarish',
  big_discount: 'Katta chegirma',
  stock_writeoff: 'Hisobdan chiqarish',
  stocktake_apply: 'Inventarizatsiya',
  transfer_create: "Ko'chirish yuborish",
  transfer_receive: "Ko'chirish qabul qilish",
  transfer_reject: "Ko'chirish rad etildi",
  expense_create: 'Xarajat',
  shift_close: 'Smena yopish',
  settings_change: "Sozlamalar o'zgarishi",
  debt_repay: "Qarz to'lovi",
  employee_change: "Xodim o'zgarishi",
  entity_restore: 'Tiklash',
  backup_restore: 'Zaxiradan tiklash',
};

export const ReportsPage: React.FC = () => {
  const db = useAppStore((s) => s.db);
  const can = useAppStore((s) => s.can);
  const canAccessStore = useAppStore((s) => s.canAccessStore);
  const activeStoreId = useAppStore((s) => s.activeStoreId);
  const language = useAppStore((s) => s.language);
  const t = useT();

  const [tab, setTab] = useState<ReportTab>('sales');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const canViewProfit = can('view_profit_cost');

  const filteredSales = useMemo(() => {
    if (!db) return [];
    const fromMs = new Date(dateFrom).getTime();
    const toMs = new Date(dateTo + 'T23:59:59').getTime();
    return db.sales.filter((s) => {
      if (s.status === 'deferred') return false;
      if (!canAccessStore(s.storeId)) return false;
      if (activeStoreId !== 'all' && s.storeId !== activeStoreId) return false;
      const tMs = new Date(s.createdAt).getTime();
      return tMs >= fromMs && tMs <= toMs;
    });
  }, [db, dateFrom, dateTo, activeStoreId, canAccessStore]);

  const paymentSummary = useMemo(() => {
    const map = new Map<string, number>();
    filteredSales.forEach((s) =>
      s.payments.forEach((p) => {
        map.set(p.method, (map.get(p.method) ?? 0) + p.amount);
      })
    );
    return [...map.entries()].map(([method, amount]) => ({
      name: t.pos.methods[method as keyof typeof t.pos.methods] || method,
      amount,
    }));
  }, [filteredSales, t]);

  const abcRows = useMemo(() => {
    if (!db) return [];
    const prodStats = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
    filteredSales.forEach((s) =>
      s.items.forEach((it) => {
        const cur = prodStats.get(it.productId) ?? { name: it.productName, qty: 0, revenue: 0, profit: 0 };
        cur.qty += it.qty;
        cur.revenue += it.lineTotal;
        cur.profit += it.lineTotal - it.purchasePrice * it.qty;
        prodStats.set(it.productId, cur);
      })
    );
    const sorted = [...prodStats.values()].sort((a, b) => b.revenue - a.revenue);
    const totalRev = sorted.reduce((sum, x) => sum + x.revenue, 0) || 1;
    let cum = 0;
    return sorted.map((x) => {
      cum += x.revenue;
      const cumPct = (cum / totalRev) * 100;
      const cls = cumPct <= 80 ? 'A' : cumPct <= 95 ? 'B' : 'C';
      return { ...x, sharePct: Math.round((x.revenue / totalRev) * 100), abc: cls };
    });
  }, [db, filteredSales]);

  const valuationRows = useMemo(() => {
    if (!db) return [];
    const scopedWhSet = new Set(
      db.warehouses
        .filter((w) => canAccessStore(w.storeId) && (activeStoreId === 'all' || w.storeId === activeStoreId))
        .map((w) => w.id)
    );
    return db.products
      .filter((p) => !p.storeId || p.storeId === 'all' || activeStoreId === 'all' || p.storeId === activeStoreId)
      .map((p) => {
        let qty = 0;
        let costVal = 0;
        let retailVal = 0;
        p.variants.forEach((v) => {
          const q = db.stockItems
            .filter((st) => st.variantId === v.id && scopedWhSet.has(st.warehouseId))
            .reduce((sum, st) => sum + st.qty, 0);
          qty += q;
          costVal += q * v.purchasePrice;
          retailVal += q * v.retailPrice;
        });
        const soldQty = filteredSales
          .flatMap((s) => s.items)
          .filter((it) => it.productId === p.id)
          .reduce((s, it) => s + it.qty, 0);
        return { id: p.id, name: p.name, qty, costVal, retailVal, margin: retailVal - costVal, soldQty };
      });
  }, [db, filteredSales, activeStoreId, canAccessStore]);

  const scopedReturns = useMemo(() => {
    if (!db) return [];
    const fromMs = new Date(dateFrom).getTime();
    const toMs = new Date(dateTo + 'T23:59:59').getTime();
    return db.returns.filter((r) => {
      if (!canAccessStore(r.storeId)) return false;
      if (activeStoreId !== 'all' && r.storeId !== activeStoreId) return false;
      const tMs = new Date(r.createdAt).getTime();
      return tMs >= fromMs && tMs <= toMs;
    });
  }, [db, dateFrom, dateTo, activeStoreId, canAccessStore]);

  const scopedAuditLogs = useMemo(() => {
    if (!db) return [];
    const fromMs = new Date(dateFrom).getTime();
    const toMs = new Date(dateTo + 'T23:59:59').getTime();
    return db.auditLogs.filter((a) => {
      if (a.storeId && a.storeId !== 'all') {
        if (!canAccessStore(a.storeId)) return false;
        if (activeStoreId !== 'all' && a.storeId !== activeStoreId) return false;
      }
      const tMs = new Date(a.createdAt).getTime();
      return tMs >= fromMs && tMs <= toMs;
    });
  }, [db, dateFrom, dateTo, activeStoreId, canAccessStore]);

  if (!db) return null;

  const totalCostVal = valuationRows.reduce((s, r) => s + r.costVal, 0);
  const totalRetailVal = valuationRows.reduce((s, r) => s + r.retailVal, 0);

  return (
    <div className="space-y-4">
      {/* Date Range + Tabs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(
            [
              ['sales', t.reports.tabs.sales],
              ['abc', t.reports.tabs.abc],
              ['valuation', t.reports.tabs.valuation],
              ['returnsDiscounts', t.reports.tabs.returnsDiscounts],
              ...(can('view_audit_log') ? [['audit', t.reports.tabs.audit]] : []),
            ] as [ReportTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                tab === id ? 'bg-teal-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
          />
          <span className="text-xs text-slate-400">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
          />
          <button
            type="button"
            onClick={() => {
              if (tab === 'abc') {
                exportToExcel(
                  abcRows.map((r) => ({
                    Mahsulot: r.name,
                    SotilganSoni: r.qty,
                    Tushum: r.revenue,
                    ...(canViewProfit ? { Foyda: r.profit } : {}),
                    UlushFoiz: `${r.sharePct}%`,
                    ABC: r.abc,
                  })),
                  'abc-tahlil'
                );
              } else if (tab === 'valuation') {
                exportToExcel(
                  valuationRows.map((r) => ({
                    Mahsulot: r.name,
                    Qoldiq: r.qty,
                    DavrSotuv: r.soldQty,
                    ...(canViewProfit ? { TannarxQiymat: r.costVal } : {}),
                    SotuvQiymat: r.retailVal,
                  })),
                  'ombor-qiymati'
                );
              } else if (tab === 'audit') {
                exportToExcel(
                  scopedAuditLogs.map((a) => ({
                    Vaqt: formatDateTime(a.createdAt, language),
                    Foydalanuvchi: a.userName,
                    Amal: AUDIT_ACTION_UZ[a.action] || a.action,
                    Tafsilot: a.summary,
                  })),
                  'audit-jurnali'
                );
              } else {
                exportToExcel(
                  filteredSales.map((s) => ({
                    Chek: s.receiptNumber,
                    Sana: formatDateTime(s.createdAt, language),
                    Kassir: s.cashierName,
                    Summa: s.totalAmount,
                  })),
                  'savdo-hisoboti'
                );
              }
            }}
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (tab === 'abc') {
                exportToPdf(
                  `ABC tahlil (${dateFrom} - ${dateTo})`,
                  ['Mahsulot', 'Soni', 'Tushum', ...(canViewProfit ? ['Foyda'] : []), 'Ulush', 'ABC'],
                  abcRows.map((r) => [
                    r.name,
                    r.qty,
                    formatMoney(r.revenue, { lang: language }),
                    ...(canViewProfit ? [formatMoney(r.profit, { lang: language })] : []),
                    `${r.sharePct}%`,
                    r.abc,
                  ]),
                  'abc-tahlil'
                );
              } else if (tab === 'valuation') {
                exportToPdf(
                  'Ombor qiymati hisoboti',
                  ['Mahsulot', 'Qoldiq', 'Sotuv', ...(canViewProfit ? ['Tannarx'] : []), 'Sotuv qiymat'],
                  valuationRows.map((r) => [
                    r.name,
                    r.qty,
                    r.soldQty,
                    ...(canViewProfit ? [formatMoney(r.costVal, { lang: language })] : []),
                    formatMoney(r.retailVal, { lang: language }),
                  ]),
                  'ombor-qiymati'
                );
              } else if (tab === 'audit') {
                exportToPdf(
                  `Audit jurnali (${dateFrom} - ${dateTo})`,
                  ['Vaqt', 'Foydalanuvchi', 'Amal', 'Tafsilot'],
                  scopedAuditLogs.map((a) => [
                    formatDateTime(a.createdAt, language),
                    a.userName,
                    AUDIT_ACTION_UZ[a.action] || a.action,
                    a.summary,
                  ]),
                  'audit-jurnali'
                );
              } else {
                exportToPdf(
                  `Savdo hisoboti (${dateFrom} - ${dateTo})`,
                  ['Chek', 'Kassir', 'Sana', 'Summa'],
                  filteredSales.map((s) => [
                    s.receiptNumber,
                    s.cashierName,
                    formatDateTime(s.createdAt, language),
                    formatMoney(s.totalAmount, { lang: language }),
                  ]),
                  'savdo-hisoboti'
                );
              }
            }}
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>
          <button
            type="button"
            onClick={() =>
              printHtmlDocument(
                `<h2>SHU BREND OMBOR · Hisobot (${dateFrom} — ${dateTo})</h2>
                 <p>Jami cheklar: ${filteredSales.length} · Jami tushum: ${formatMoney(filteredSales.reduce((s, x) => s + x.totalAmount, 0), { lang: language })}</p>`,
                'Hisobot'
              )
            }
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* TAB 1: SALES */}
      {tab === 'sales' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <h3 className="font-display text-sm font-bold mb-3">To'lov turlari bo'yicha</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={paymentSummary}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}K`} width={48} />
                  <Tooltip formatter={(v: unknown) => formatMoney(Number(v), { lang: language })} />
                  <Bar dataKey="amount" fill="#0F766E" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-semibold text-sm">
              Oxirgi sotuvlar ({filteredSales.length})
            </div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500">
                  <th className="py-2 px-3">Chek</th>
                  <th className="py-2 px-3">Kassir</th>
                  <th className="py-2 px-3">Sana</th>
                  <th className="py-2 px-3 text-right">Summa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSales.slice(0, 20).map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 px-3 font-mono font-bold">{s.receiptNumber}</td>
                    <td className="py-2 px-3">{s.cashierName}</td>
                    <td className="py-2 px-3 font-mono text-slate-500">{formatDateTime(s.createdAt, language)}</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold">{formatMoney(s.totalAmount, { lang: language })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ABC ANALYSIS */}
      {tab === 'abc' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500">
                <th className="py-3 px-3">Mahsulot</th>
                <th className="py-3 px-3 text-right">Sotilgan soni</th>
                <th className="py-3 px-3 text-right">Tushum</th>
                {canViewProfit && <th className="py-3 px-3 text-right">Foyda</th>}
                <th className="py-3 px-3 text-right">Ulush %</th>
                <th className="py-3 px-3 text-center">ABC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {abcRows.map((r, i) => (
                <tr key={i}>
                  <td className="py-2.5 px-3 font-semibold">{r.name}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{r.qty}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{formatMoney(r.revenue, { lang: language })}</td>
                  {canViewProfit && (
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-600">{formatMoney(r.profit, { lang: language })}</td>
                  )}
                  <td className="py-2.5 px-3 text-right font-mono">{r.sharePct}%</td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold">{r.abc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: STOCK VALUATION */}
      {tab === 'valuation' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {canViewProfit && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-500">Ombor qiymati (tannarxda)</div>
                <div className="font-mono font-bold text-lg mt-1">{formatMoney(totalCostVal, { lang: language })}</div>
              </div>
            )}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500">Ombor qiymati (sotuv narxida)</div>
              <div className="font-mono font-bold text-lg mt-1 text-teal-700 dark:text-teal-400">{formatMoney(totalRetailVal, { lang: language })}</div>
            </div>
            {canViewProfit && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-500">Kutilayotgan yalpi marja</div>
                <div className="font-mono font-bold text-lg mt-1 text-emerald-600">{formatMoney(totalRetailVal - totalCostVal, { lang: language })}</div>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500">
                  <th className="py-2.5 px-3">Mahsulot</th>
                  <th className="py-2.5 px-3 text-right">Qoldiq</th>
                  <th className="py-2.5 px-3 text-right">Davr sotuv</th>
                  {canViewProfit && <th className="py-2.5 px-3 text-right">Tannarx qiymat</th>}
                  <th className="py-2.5 px-3 text-right">Sotuv qiymat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {valuationRows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 px-3 font-semibold">{r.name}</td>
                    <td className="py-2 px-3 text-right font-mono">{r.qty}</td>
                    <td className="py-2 px-3 text-right font-mono">{r.soldQty}</td>
                    {canViewProfit && <td className="py-2 px-3 text-right font-mono">{formatMoney(r.costVal, { lang: language })}</td>}
                    <td className="py-2 px-3 text-right font-mono font-semibold">{formatMoney(r.retailVal, { lang: language })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: RETURNS & DISCOUNTS */}
      {tab === 'returnsDiscounts' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="font-display text-sm font-bold">Qaytarishlar ({scopedReturns.length})</h3>
            {scopedReturns.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">Qaytarishlar mavjud emas</p>
            ) : (
              scopedReturns.map((r) => (
                <div key={r.id} className="py-2 border-b border-slate-100 dark:border-slate-800 flex justify-between text-xs">
                  <div>
                    <div className="font-mono font-bold">{r.number} ({r.receiptNumber})</div>
                    <div className="text-slate-500">{r.reason}</div>
                  </div>
                  <div className="font-mono font-bold text-red-600">-{formatMoney(r.totalRefund, { lang: language })}</div>
                </div>
              ))
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="font-display text-sm font-bold">Berilgan chegirmalar</h3>
            {filteredSales.filter((s) => s.checkDiscountAmount > 0).length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">Tanlangan davrda chegirmali cheklar yo'q</p>
            ) : (
              filteredSales
                .filter((s) => s.checkDiscountAmount > 0)
                .map((s) => (
                  <div key={s.id} className="py-2 border-b border-slate-100 dark:border-slate-800 flex justify-between text-xs">
                    <div>
                      <div className="font-mono font-bold">{s.receiptNumber} · {s.cashierName}</div>
                      <div className="text-slate-500">{s.checkDiscountPercent}% {s.promoCode ? `(${s.promoCode})` : ''}</div>
                    </div>
                    <div className="font-mono font-bold text-amber-600">-{formatMoney(s.checkDiscountAmount, { lang: language })}</div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: AUDIT LOG */}
      {tab === 'audit' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500">
                <th className="py-2.5 px-3">Vaqt</th>
                <th className="py-2.5 px-3">Foydalanuvchi</th>
                <th className="py-2.5 px-3">Amal</th>
                <th className="py-2.5 px-3">Tafsilot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {scopedAuditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">
                    Tanlangan davrda yozuvlar topilmadi
                  </td>
                </tr>
              ) : (
                scopedAuditLogs.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 px-3 font-mono text-slate-500 whitespace-nowrap">{formatDateTime(a.createdAt, language)}</td>
                    <td className="py-2 px-3 font-semibold">{a.userName}</td>
                    <td className="py-2 px-3 font-semibold text-slate-700 dark:text-slate-200">
                      {AUDIT_ACTION_UZ[a.action] || a.action}
                    </td>
                    <td className="py-2 px-3">{a.summary}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
