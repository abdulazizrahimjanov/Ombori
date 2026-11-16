import React, { useEffect, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { useAppStore, uid } from '../store/useAppStore';
import { Permission } from '../types/models';

export type QuickAddKind =
  | 'category'
  | 'brand'
  | 'color'
  | 'size'
  | 'supplier'
  | 'warehouse'
  | 'customer'
  | 'store'
  | 'role';

interface QuickAddModalProps {
  open: boolean;
  kind: QuickAddKind | null;
  storeId?: string;
  onClose: () => void;
  onCreated?: (created: { id: string; label: string }) => void;
}

const TITLES: Record<QuickAddKind, string> = {
  category: "Yangi kategoriya qo'shish",
  brand: "Yangi brend qo'shish",
  color: "Yangi rang qo'shish",
  size: "Yangi o'lcham qo'shish",
  supplier: "Yangi yetkazib beruvchi",
  warehouse: "Yangi ombor qo'shish",
  customer: "Yangi mijoz qo'shish",
  store: "Yangi filial qo'shish",
  role: "Yangi rol qo'shish",
};

const STORE_COLORS = ['#0F766E', '#2563EB', '#7C3AED', '#DC2626', '#D97706', '#059669'];

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  open,
  kind,
  storeId,
  onClose,
  onCreated,
}) => {
  const db = useAppStore((s) => s.db);
  const currentUser = useAppStore((s) => s.getCurrentUser());
  const activeStoreId = useAppStore((s) => s.activeStoreId);
  const notify = useAppStore((s) => s.notify);
  const upsertCategory = useAppStore((s) => s.upsertCategory);
  const upsertBrand = useAppStore((s) => s.upsertBrand);
  const addColor = useAppStore((s) => s.addColor);
  const addSize = useAppStore((s) => s.addSize);
  const upsertSupplier = useAppStore((s) => s.upsertSupplier);
  const upsertWarehouse = useAppStore((s) => s.upsertWarehouse);
  const upsertCustomer = useAppStore((s) => s.upsertCustomer);
  const upsertStore = useAppStore((s) => s.upsertStore);
  const upsertRole = useAppStore((s) => s.upsertRole);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [address, setAddress] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setPhone('+998');
      setAddress('');
      setError('');
      setSaving(false);
      const fallbackStore =
        storeId && storeId !== 'all'
          ? storeId
          : activeStoreId !== 'all'
          ? activeStoreId
          : db?.stores[0]?.id ?? '';
      setSelectedStoreId(fallbackStore);
    }
  }, [open, kind, storeId, activeStoreId, db]);

  if (!open || !kind || !db) return null;

  const targetStoreId = selectedStoreId || db.stores[0]?.id || 'store-toraqorgon';
  const nowIso = new Date().toISOString();
  const actorId = currentUser?.id ?? 'usr-owner';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Nom kiritish shart');
      return;
    }
    setError('');
    setSaving(true);
    try {
      if (kind === 'category') {
        const created = await upsertCategory({
          id: uid('cat'),
          nameUz: trimmed,
          nameRu: trimmed,
          sortOrder: db.categories.length + 1,
          storeId: 'all',
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: actorId,
        });
        notify(`Kategoriya qo'shildi: ${created.nameUz}`, 'success');
        onCreated?.({ id: created.id, label: created.nameUz });
      } else if (kind === 'brand') {
        const created = await upsertBrand({
          id: uid('brand'),
          name: trimmed,
          storeId: 'all',
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: actorId,
        });
        notify(`Brend qo'shildi: ${created.name}`, 'success');
        onCreated?.({ id: created.id, label: created.name });
      } else if (kind === 'color') {
        const created = await addColor(trimmed);
        notify(`Rang qo'shildi: ${created}`, 'success');
        onCreated?.({ id: created, label: created });
      } else if (kind === 'size') {
        const created = await addSize(trimmed);
        notify(`O'lcham qo'shildi: ${created}`, 'success');
        onCreated?.({ id: created, label: created });
      } else if (kind === 'supplier') {
        const created = await upsertSupplier({
          id: uid('sup'),
          name: trimmed,
          contactName: trimmed,
          phone: phone.trim() || '+998900000000',
          address: address.trim() || undefined,
          debtBalance: 0,
          storeId: targetStoreId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: actorId,
        });
        notify(`Yetkazib beruvchi qo'shildi: ${created.name}`, 'success');
        onCreated?.({ id: created.id, label: created.name });
      } else if (kind === 'warehouse') {
        const created = await upsertWarehouse({
          id: uid('wh'),
          name: trimmed,
          address: address.trim() || 'Ombor manzili',
          isMain: false,
          storeId: targetStoreId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: actorId,
        });
        notify(`Ombor qo'shildi: ${created.name}`, 'success');
        onCreated?.({ id: created.id, label: created.name });
      } else if (kind === 'customer') {
        const cleanPhone = phone.trim();
        if (cleanPhone.length < 7) {
          setError('Telefon raqamini kiriting');
          setSaving(false);
          return;
        }
        const created = await upsertCustomer({
          id: uid('cust'),
          name: trimmed,
          phone: cleanPhone,
          notes: address.trim() ? `Manzil: ${address.trim()}` : undefined,
          tags: [],
          segment: 'new',
          totalSpent: 0,
          ordersCount: 0,
          debtBalance: 0,
          storeId: targetStoreId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: actorId,
        });
        notify(`Mijoz qo'shildi: ${created.name}`, 'success');
        onCreated?.({ id: created.id, label: created.name });
      } else if (kind === 'store') {
        const sId = uid('store');
        const wId = uid('wh');
        await upsertWarehouse({
          id: wId,
          name: `${trimmed} ombori`,
          address: address.trim() || 'Asosiy ombor',
          isMain: false,
          storeId: sId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: actorId,
        });
        const created = await upsertStore({
          id: sId,
          name: trimmed,
          address: address.trim() || 'Manzil kiritilmagan',
          phone: phone.trim() || '+998900000000',
          isActive: true,
          defaultWarehouseId: wId,
          color: STORE_COLORS[db.stores.length % STORE_COLORS.length],
          storeId: sId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: actorId,
        });
        notify(`Filial qo'shildi: ${created.name}`, 'success');
        onCreated?.({ id: created.id, label: created.name });
      } else if (kind === 'role') {
        const defaultPerms: Permission[] = ['view_dashboard', 'view_catalog', 'use_pos'];
        const created = await upsertRole({
          id: uid('role'),
          nameUz: trimmed,
          nameRu: trimmed,
          permissions: defaultPerms,
        });
        notify(`Rol qo'shildi: ${created.nameUz}`, 'success');
        onCreated?.({ id: created.id, label: created.nameUz });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saqlashda xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xl space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-teal-600" />
            <span>{TITLES[kind]}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
              Nomi *
            </label>
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                kind === 'color'
                  ? 'Masalan: Zaytun'
                  : kind === 'size'
                  ? 'Masalan: 3XL'
                  : 'Nomini kiriting'
              }
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
            />
          </div>

          {(kind === 'supplier' || kind === 'customer' || kind === 'store') && (
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Telefon raqam {kind === 'customer' ? '*' : ''}
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998901234567"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white"
              />
            </div>
          )}

          {(kind === 'supplier' || kind === 'warehouse' || kind === 'customer' || kind === 'store') && (
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Manzil
              </label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Manzil (ixtiyoriy)"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              />
            </div>
          )}

          {(kind === 'warehouse' || kind === 'supplier' || kind === 'customer') && db.stores.length > 1 && (
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Filial
              </label>
              <select
                value={targetStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              >
                {db.stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold"
            >
              {saving ? 'Saqlanmoqda...' : "Qo'shish"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
