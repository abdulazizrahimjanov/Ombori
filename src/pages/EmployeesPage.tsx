import React, { useMemo, useState } from 'react';
import {
  UserPlus,
  Download,
  X,
  Edit3,
  Trash2,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  Plus,
  Users,
  Shield,
  Phone,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAppStore, uid } from '../store/useAppStore';
import { formatDateTime, formatMoney, useT } from '../i18n';
import { Employee, Permission, Role, RoleId } from '../types/models';
import { exportToExcel } from '../utils/export';

const PERMISSION_GROUPS: { title: string; items: { id: Permission; label: string }[] }[] = [
  {
    title: 'Sotuvlar va Kassa',
    items: [
      { id: 'use_pos', label: 'Sotuvlar (Savatcha / Tranzaksiyalar)' },
      { id: 'process_returns', label: 'Tovar qaytarish (Vozvrat)' },
      { id: 'manage_shifts', label: 'Kassa smenasini ochish/yopish' },
      { id: 'apply_big_discount', label: 'Katta chegirma berish' },
    ],
  },
  {
    title: 'Katalog va Narxlar',
    items: [
      { id: 'view_catalog', label: "Katalogni ko'rish" },
      { id: 'edit_catalog', label: "Tovar qo'shish / tahrirlash" },
      { id: 'bulk_edit_prices', label: "Ommaviy narx o'zgartirish" },
      { id: 'view_profit_cost', label: "Tannarx va foydani ko'rish" },
    ],
  },
  {
    title: 'Ombor va Mijozlar',
    items: [
      { id: 'view_inventory', label: "Ombor qoldiqlarini ko'rish" },
      { id: 'manage_inventory', label: 'Kirim / Transfer / Inventarizatsiya' },
      { id: 'view_customers', label: "Mijozlarni ko'rish" },
      { id: 'manage_customers', label: "Mijoz qo'shish / tahrirlash" },
      { id: 'manage_debts', label: 'Nasiya va qarzlarni boshqarish' },
    ],
  },
  {
    title: 'Boshqaruv va Moliya',
    items: [
      { id: 'view_dashboard', label: 'Asosiy dashboard (Analitika)' },
      { id: 'view_reports', label: 'Hisobotlar' },
      { id: 'view_finance', label: "Moliyani ko'rish" },
      { id: 'manage_finance', label: 'Xarajat va hisoblarni boshqarish' },
      { id: 'view_employees', label: "Xodimlarni ko'rish" },
      { id: 'manage_employees', label: "Xodim qo'shish / o'chirish / huquq" },
      { id: 'manage_online_orders', label: 'Onlayn buyurtmalar' },
      { id: 'manage_settings', label: 'Sozlamalar va API' },
      { id: 'view_audit_log', label: 'Audit jurnali' },
    ],
  },
];

const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.id));

export const EmployeesPage: React.FC = () => {
  const db = useAppStore((s) => s.db);
  const can = useAppStore((s) => s.can);
  const currentUser = useAppStore((s) => s.getCurrentUser());
  const language = useAppStore((s) => s.language);
  const upsertEmployee = useAppStore((s) => s.upsertEmployee);
  const deleteEmployee = useAppStore((s) => s.deleteEmployee);
  const upsertTarget = useAppStore((s) => s.upsertTarget);
  const upsertRole = useAppStore((s) => s.upsertRole);
  const deleteRole = useAppStore((s) => s.deleteRole);
  const updateRolePermissions = useAppStore((s) => s.updateRolePermissions);
  const notify = useAppStore((s) => s.notify);
  const t = useT();

  const canManage = can('manage_employees');
  const [activeTab, setActiveTab] = useState<'employees' | 'roles'>('employees');

  // Employee modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [roleId, setRoleId] = useState<RoleId>('cashier');
  const [assignedStoreIds, setAssignedStoreIds] = useState<string[]>([]);
  const [baseSalary, setBaseSalary] = useState(3500000);
  const [commissionPct, setCommissionPct] = useState(1.5);
  const [schedule, setSchedule] = useState('2/2 smena, 09:00–21:00');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [useCustomPerms, setUseCustomPerms] = useState(false);
  const [customPerms, setCustomPerms] = useState<Permission[]>([]);

  // Inline quick role creator inside Employee Modal
  const [inlineRoleOpen, setInlineRoleOpen] = useState(false);
  const [inlineRoleName, setInlineRoleName] = useState('');

  // Role management tab state
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleBaseId, setNewRoleBaseId] = useState('cashier');
  const [newRolePerms, setNewRolePerms] = useState<Permission[]>(['view_dashboard', 'use_pos', 'view_catalog']);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<Role | null>(null);

  const payrollRows = useMemo(() => {
    if (!db) return [];
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return db.employees.map((emp) => {
      const linkedUser = db.users.find((u) => u.id === emp.userId);
      const empSales = db.sales.filter(
        (s) => s.cashierId === emp.userId && s.status !== 'returned' && s.status !== 'deferred'
      );
      const salesTotal = empSales.reduce((sum, s) => sum + s.totalAmount, 0);
      const avgCheck = empSales.length > 0 ? Math.round(salesTotal / empSales.length) : 0;
      const target = db.targets.find((tg) => tg.employeeId === emp.id && tg.month === monthKey)?.targetAmount ?? 30000000;
      const kpiPct = target > 0 ? Math.round((salesTotal / target) * 100) : 0;
      const commission = Math.round((salesTotal * emp.commissionPercent) / 100);
      const bonus = kpiPct >= 100 ? 500000 : 0;
      const totalPay = emp.baseSalary + commission + bonus;
      return { emp, linkedUser, salesCount: empSales.length, salesTotal, avgCheck, target, kpiPct, commission, bonus, totalPay };
    });
  }, [db]);

  if (!db) return null;

  const getRoleLabel = (rId: RoleId) => {
    const found = db.roles.find((r) => r.id === rId);
    if (found) return language === 'ru' ? found.nameRu : found.nameUz;
    return t.auth.roles[rId as keyof typeof t.auth.roles] ?? rId;
  };

  const generateUniquePin = () => {
    const used = new Set(db.users.map((u) => u.pin));
    for (let i = 0; i < 50; i++) {
      const candidate = String(Math.floor(10000 + Math.random() * 89999));
      if (!used.has(candidate)) return candidate;
    }
    return String(Math.floor(10000 + Math.random() * 89999));
  };

  const openCreateModal = () => {
    const generatedPin = generateUniquePin();
    const defaultRoleId = db.roles.find((r) => r.id === 'cashier')?.id ?? db.roles.find((r) => r.id !== 'owner')?.id ?? 'cashier';
    setEditingEmp(null);
    setName('');
    setPhone('+998');
    setRoleId(defaultRoleId);
    setAssignedStoreIds(db.stores[0] ? [db.stores[0].id] : []);
    setBaseSalary(3500000);
    setCommissionPct(1.5);
    setSchedule('2/2 smena, 09:00–21:00');
    setPin(generatedPin);
    setPassword(generatedPin);
    setUseCustomPerms(false);
    const defaultRolePerms = db.roles.find((r) => r.id === defaultRoleId)?.permissions ?? ['use_pos', 'view_catalog'];
    setCustomPerms(defaultRolePerms);
    setInlineRoleOpen(false);
    setInlineRoleName('');
    setShowPass(false);
    setModalOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    const linkedUser = db.users.find((u) => u.id === emp.userId);
    setEditingEmp(emp);
    setName(emp.name);
    setPhone(linkedUser?.phone || emp.phone);
    setRoleId(emp.roleId);
    setAssignedStoreIds(linkedUser?.assignedStoreIds?.length ? linkedUser.assignedStoreIds : [emp.storeId]);
    setBaseSalary(emp.baseSalary);
    setCommissionPct(emp.commissionPercent);
    setSchedule(emp.schedule);
    setPin(linkedUser?.pin ?? '51111');
    setPassword(linkedUser?.password ?? linkedUser?.pin ?? '');
    const hasCustom = Array.isArray(linkedUser?.customPermissions);
    setUseCustomPerms(hasCustom);
    const rolePerms = db.roles.find((r) => r.id === emp.roleId)?.permissions ?? [];
    setCustomPerms(hasCustom ? linkedUser!.customPermissions! : rolePerms);
    setInlineRoleOpen(false);
    setInlineRoleName('');
    setShowPass(false);
    setModalOpen(true);
  };

  const applyPreset = (preset: 'role' | 'sales_only' | 'cashier' | 'warehouse' | 'full') => {
    if (preset === 'role') {
      setUseCustomPerms(false);
      const rolePerms = db.roles.find((r) => r.id === roleId)?.permissions ?? [];
      setCustomPerms(rolePerms);
      return;
    }
    setUseCustomPerms(true);
    if (preset === 'sales_only') {
      setCustomPerms(['use_pos', 'view_catalog']);
    } else if (preset === 'cashier') {
      setCustomPerms(['use_pos', 'view_catalog', 'process_returns', 'manage_shifts', 'view_customers', 'manage_customers']);
    } else if (preset === 'warehouse') {
      setCustomPerms(['view_catalog', 'edit_catalog', 'view_inventory', 'manage_inventory', 'manage_online_orders']);
    } else {
      setCustomPerms([...ALL_PERMISSIONS]);
    }
  };

  const togglePerm = (perm: Permission) => {
    setUseCustomPerms(true);
    setCustomPerms((prev) => (prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]));
  };

  const toggleStore = (id: string) => {
    setAssignedStoreIds((prev) => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter((x) => x !== id) : prev;
      }
      return [...prev, id];
    });
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const cleanPhone = phone.replace(/\s+/g, '');
    const phoneDigits = cleanPhone.replace(/\D/g, '');
    if (phoneDigits.length < 9) {
      notify("To'liq telefon raqamini kiriting (masalan: +998889260404)", 'error');
      return;
    }

    const cleanPin = pin.replace(/\D/g, '');
    if (cleanPin.length < 4 || cleanPin.length > 6) {
      notify("PIN-kod 4 dan 6 tagacha raqamdan iborat bo'lishi kerak", 'error');
      return;
    }

    const targetUserId = editingEmp ? editingEmp.userId : uid('usr');
    const duplicatePin = db.users.find((u) => u.id !== targetUserId && u.pin === cleanPin && u.isActive);
    if (duplicatePin) {
      notify(`PIN-kod (${cleanPin}) ${duplicatePin.name} da band! Boshqa PIN tanlang.`, 'error');
      return;
    }

    const duplicatePhone = db.users.find(
      (u) => u.id !== targetUserId && u.phone.replace(/\D/g, '') === phoneDigits && u.isActive
    );
    if (duplicatePhone) {
      notify(`Telefon raqam (${cleanPhone}) ${duplicatePhone.name} da band!`, 'error');
      return;
    }

    const finalPassword = password.trim() || cleanPin;
    if (finalPassword.length < 4) {
      notify("Kirish paroli kamida 4 ta belgidan iborat bo'lishi kerak", 'error');
      return;
    }

    const nowIso = new Date().toISOString();
    const primaryStoreId = assignedStoreIds[0] || db.stores[0]?.id || 'store-chilonzor';
    const empId = editingEmp ? editingEmp.id : uid('emp');

    await upsertEmployee(
      {
        id: empId,
        userId: targetUserId,
        name: name.trim(),
        phone: cleanPhone,
        roleId,
        baseSalary,
        commissionPercent: commissionPct,
        schedule: schedule.trim() || '2/2 smena, 09:00–21:00',
        hiredAt: editingEmp ? editingEmp.hiredAt : nowIso,
        storeId: primaryStoreId,
        createdAt: editingEmp ? editingEmp.createdAt : nowIso,
        updatedAt: nowIso,
        createdBy: currentUser?.id ?? 'usr-owner',
      },
      {
        pin: cleanPin,
        password: finalPassword,
        assignedStoreIds: assignedStoreIds.length ? assignedStoreIds : [primaryStoreId],
        ...(useCustomPerms ? { customPermissions: customPerms } : {}),
      },
      { clearCustomPermissions: !useCustomPerms }
    );

    if (!editingEmp) {
      const now = new Date();
      await upsertTarget({
        id: uid('tgt'),
        employeeId: empId,
        month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        targetAmount: 30000000,
        storeId: primaryStoreId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: currentUser?.id ?? 'usr-owner',
      });
    }

    notify(editingEmp ? "Xodim ma'lumotlari yangilandi" : "Yangi xodim (nomer va PIN-kod) qo'shildi", 'success');
    setModalOpen(false);
  };

  const handleQuickCreateInlineRole = async () => {
    const clean = inlineRoleName.trim();
    if (!clean) {
      notify('Yangi rol nomini kiriting', 'error');
      return;
    }
    const newId = uid('role');
    const permsToUse = useCustomPerms
      ? customPerms
      : db.roles.find((r) => r.id === roleId)?.permissions ?? ['view_dashboard', 'use_pos', 'view_catalog'];
    await upsertRole({
      id: newId,
      nameUz: clean,
      nameRu: clean,
      permissions: [...permsToUse],
    });
    setRoleId(newId);
    setInlineRoleName('');
    setInlineRoleOpen(false);
    notify(`"${clean}" roli yaratildi va tanlandi`, 'success');
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newRoleName.trim();
    if (!clean) {
      notify('Rol nomini kiriting', 'error');
      return;
    }
    const newId = uid('role');
    await upsertRole({
      id: newId,
      nameUz: clean,
      nameRu: clean,
      permissions: [...newRolePerms],
    });
    setNewRoleName('');
    notify(`"${clean}" roli yaratildi`, 'success');
  };

  const toggleMatrixPermission = async (targetRoleId: RoleId, perm: Permission) => {
    const role = db.roles.find((r) => r.id === targetRoleId);
    if (!role) return;
    const exists = role.permissions.includes(perm);
    const nextPerms = exists ? role.permissions.filter((p) => p !== perm) : [...role.permissions, perm];
    await updateRolePermissions(targetRoleId, nextPerms);
  };

  return (
    <div className="space-y-4">
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('employees')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              activeTab === 'employees'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{t.employees.title} ({db.employees.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('roles')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              activeTab === 'roles'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Rollar va Ruxsatlar ({db.roles.length})</span>
          </button>
        </div>

        <div className="flex gap-2">
          {activeTab === 'employees' && (
            <>
              <button
                type="button"
                onClick={() =>
                  exportToExcel(
                    payrollRows.map((r) => ({
                      Xodim: r.emp.name,
                      Telefon: r.linkedUser?.phone || r.emp.phone,
                      PIN: r.linkedUser?.pin ?? '',
                      Rol: getRoleLabel(r.emp.roleId),
                      Sotuvlar: r.salesTotal,
                      OylikMaosh: r.emp.baseSalary,
                      FoizBonus: r.commission + r.bonus,
                      JamiTolov: r.totalPay,
                    })),
                    'xodimlar-oylik'
                  )
                }
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
              {canManage && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={openCreateModal}
                  className="h-9 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{t.employees.addEmployee}</span>
                </motion.button>
              )}
            </>
          )}
        </div>
      </div>

      {/* TAB 1: EMPLOYEES */}
      {activeTab === 'employees' && (
        <>
          {/* Staff Performance & Payroll Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-slate-500 font-semibold">
                  <th className="py-3 px-3">Xodim va Rol</th>
                  <th className="py-3 px-3">Telefon / PIN-kod</th>
                  <th className="py-3 px-3 text-right">Cheklar / Savdo</th>
                  <th className="py-3 px-3 text-right">Reja / KPI</th>
                  <th className="py-3 px-3 text-right">{t.employees.baseSalary}</th>
                  <th className="py-3 px-3 text-right">{t.employees.commission}</th>
                  <th className="py-3 px-3 text-right">{t.employees.totalPay}</th>
                  {canManage && <th className="py-3 px-3 text-right">{t.common.actions}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {payrollRows.map((r) => {
                  const isCustom = Array.isArray(r.linkedUser?.customPermissions);
                  const permCount = isCustom
                    ? r.linkedUser!.customPermissions!.length
                    : db.roles.find((rl) => rl.id === r.emp.roleId)?.permissions.length ?? 0;
                  const displayPhone = r.linkedUser?.phone || r.emp.phone;

                  return (
                    <tr key={r.emp.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{r.emp.name}</span>
                          {isCustom && (
                            <span className="px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-semibold">
                              Maxsus ({permCount})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {getRoleLabel(r.emp.roleId)} · {r.emp.schedule}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-mono text-slate-800 dark:text-slate-200 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-teal-600 shrink-0" />
                          <span>{displayPhone}</span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <KeyRound className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>PIN: {r.linkedUser?.pin ?? '—'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        <div>{formatMoney(r.salesTotal, { lang: language })}</div>
                        <div className="text-[11px] text-slate-400">
                          {r.salesCount} ta chek · o'rt. {formatMoney(r.avgCheck, { lang: language })}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        <div className="font-semibold">{r.kpiPct}%</div>
                        <div className="text-[11px] text-slate-400">{formatMoney(r.target, { lang: language })}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {formatMoney(r.emp.baseSalary, { lang: language })}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-teal-700 dark:text-teal-400">
                        +{formatMoney(r.commission + r.bonus, { lang: language })} ({r.emp.commissionPercent}%)
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-bold">
                        {formatMoney(r.totalPay, { lang: language })}
                      </td>
                      {canManage && (
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(r.emp)}
                              title="Tahrirlash (nomer, PIN, rol, huquqlar)"
                              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {r.emp.userId !== 'usr-owner' && r.emp.userId !== currentUser?.id && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(r.emp)}
                                title="Xodimni o'chirish"
                                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Attendance from Cash Shifts */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-semibold text-sm">
              {t.employees.attendance}
            </div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500">
                  <th className="py-2.5 px-3">Smena</th>
                  <th className="py-2.5 px-3">Kassir</th>
                  <th className="py-2.5 px-3">Ochildi</th>
                  <th className="py-2.5 px-3">Yopildi</th>
                  <th className="py-2.5 px-3 text-right">Naqd savdo</th>
                  <th className="py-2.5 px-3">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {db.cashShifts.map((sh) => (
                  <tr key={sh.id}>
                    <td className="py-2.5 px-3 font-mono font-bold">{sh.number}</td>
                    <td className="py-2.5 px-3">{sh.cashierName}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{formatDateTime(sh.openedAt, language)}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">
                      {sh.closedAt ? formatDateTime(sh.closedAt, language) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatMoney(sh.cashSalesTotal, { lang: language })}
                    </td>
                    <td className="py-2.5 px-3 font-semibold">{sh.status === 'open' ? 'Ochiq' : 'Yopiq'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* TAB 2: ROLES & PERMISSIONS */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          {canManage && (
            <form
              onSubmit={handleCreateRole}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Yangi rol yaratish
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Rol nomini kiriting, shablon tanlang yoki ruxsatlarni belgilang — keyin xodimlarga biriktirishingiz mumkin.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-slate-500 mb-1 font-medium">Rol nomi *</label>
                  <input
                    required
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="Masalan: Sotuvchi-konsultant"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1 font-medium">Ruxsatlar shabloni</label>
                  <select
                    value={newRoleBaseId}
                    onChange={(e) => {
                      const baseId = e.target.value;
                      setNewRoleBaseId(baseId);
                      if (baseId === 'empty') {
                        setNewRolePerms(['view_dashboard', 'use_pos', 'view_catalog']);
                      } else {
                        const baseRole = db.roles.find((r) => r.id === baseId);
                        setNewRolePerms(baseRole ? [...baseRole.permissions] : []);
                      }
                    }}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    <option value="empty">Minimal (Dashboard + POS + Katalog)</option>
                    {db.roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        Shablon: {language === 'ru' ? r.nameRu : r.nameUz}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full h-10 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold inline-flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Rol yaratish</span>
                  </button>
                </div>
              </div>

              {/* Select permissions for the new role */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                {PERMISSION_GROUPS.map((grp) => (
                  <div key={grp.title} className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{grp.title}</div>
                    {grp.items.map((item) => (
                      <label key={item.id} className="flex items-center gap-2 py-0.5 cursor-pointer text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={newRolePerms.includes(item.id)}
                          onChange={() =>
                            setNewRolePerms((prev) =>
                              prev.includes(item.id) ? prev.filter((p) => p !== item.id) : [...prev, item.id]
                            )
                          }
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </form>
          )}

          {/* Existing Roles Cards */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 text-xs">
            <div className="font-display font-bold text-sm">Mavjud rollar</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {db.roles.map((r) => {
                const usersCount = db.users.filter((u) => u.roleId === r.id).length;
                return (
                  <div
                    key={r.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">
                        {language === 'ru' ? r.nameRu : r.nameUz}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {r.permissions.length} ta ruxsat · {usersCount} ta xodim
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingRole(structuredClone(r))}
                          title="Rolni tahrirlash"
                          className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {r.id !== 'owner' && db.roles.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setDeleteRoleTarget(r)}
                            title="Rolni o'chirish"
                            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 inline-flex items-center justify-center text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Permissions Matrix */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <th className="py-2.5 px-3">Ruxsat</th>
                  {db.roles.map((r) => (
                    <th key={r.id} className="py-2.5 px-3 text-center whitespace-nowrap">
                      {language === 'ru' ? r.nameRu : r.nameUz}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {PERMISSION_GROUPS.flatMap((g) => g.items).map((perm) => (
                  <tr key={perm.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-2 px-3">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{perm.label}</div>
                      <div className="text-[10px] font-mono text-slate-400">{perm.id}</div>
                    </td>
                    {db.roles.map((r) => (
                      <td key={r.id} className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={r.permissions.includes(perm.id)}
                          disabled={!canManage || r.id === 'owner'}
                          onChange={() => toggleMatrixPermission(r.id, perm.id)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Employee + Permissions Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <form
            onSubmit={handleSaveEmployee}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-2xl text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-display text-base font-bold">
                {editingEmp ? `${editingEmp.name} — tahrirlash` : t.employees.addEmployee}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-500 mb-1 font-medium">F.I.Sh. *</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Masalan: Jasur Alimov"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1 font-medium">Telefon nomer (kirish uchun) *</label>
                <input
                  required
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+998889260404"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-500 font-medium">Asosiy rol</label>
                  {editingEmp?.userId !== 'usr-owner' && (
                    <button
                      type="button"
                      onClick={() => setInlineRoleOpen((v) => !v)}
                      className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Yangi rol</span>
                    </button>
                  )}
                </div>
                <select
                  value={roleId}
                  onChange={(e) => {
                    const nextRole = e.target.value as RoleId;
                    setRoleId(nextRole);
                    if (!useCustomPerms) {
                      setCustomPerms(db.roles.find((r) => r.id === nextRole)?.permissions ?? []);
                    }
                  }}
                  disabled={editingEmp?.userId === 'usr-owner'}
                  className="w-full h-10 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                >
                  {db.roles
                    .filter((r) => r.id !== 'owner' || editingEmp?.userId === 'usr-owner')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {language === 'ru' ? r.nameRu : r.nameUz}
                      </option>
                    ))}
                </select>
                {inlineRoleOpen && (
                  <div className="mt-2 flex gap-1.5">
                    <input
                      value={inlineRoleName}
                      onChange={(e) => setInlineRoleName(e.target.value)}
                      placeholder="Yangi rol nomi..."
                      className="flex-1 h-9 px-2.5 rounded-lg border border-teal-500 bg-white dark:bg-slate-950 text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleQuickCreateInlineRole}
                      className="h-9 px-3 rounded-lg bg-teal-700 text-white font-semibold"
                    >
                      Yaratish
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-medium">Ish jadvali</label>
                <input
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-medium">PIN-kod (4–6 raqam) *</label>
                <input
                  required
                  maxLength={6}
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => {
                    const nextPin = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setPin(nextPin);
                    if (!editingEmp && (!password || password === pin)) {
                      setPassword(nextPin);
                    }
                  }}
                  placeholder="51111"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono tracking-widest text-center"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-medium">Kirish paroli (bo'sh qolsa PIN bilan bir xil)</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={pin || '51111'}
                    className="w-full h-10 pl-3 pr-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-medium">{t.employees.baseSalary} (so'm)</label>
                <input
                  type="number"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-medium">{t.employees.commission} (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
              </div>
            </div>

            {/* Branch Assignment */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="font-semibold text-slate-700 dark:text-slate-200">Biriktirilgan filiallar</div>
              <div className="flex flex-wrap gap-2">
                {db.stores.map((st) => {
                  const checked = assignedStoreIds.includes(st.id);
                  return (
                    <label
                      key={st.id}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer ${
                        checked
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-800 text-slate-500'
                      }`}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleStore(st.id)} />
                      <span>{st.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Granular Permissions */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Xodim huquqlari</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPreset('role')}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                      !useCustomPerms
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    Rol standarti
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('sales_only')}
                    className="px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-[11px] font-semibold"
                  >
                    Faqat sotuv va katalog
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('cashier')}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium"
                  >
                    Kassir
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('warehouse')}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium"
                  >
                    Omborchi
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('full')}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium"
                  >
                    To'liq huquq
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                {PERMISSION_GROUPS.map((grp) => (
                  <div key={grp.title} className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{grp.title}</div>
                    {grp.items.map((item) => {
                      const activeList = useCustomPerms
                        ? customPerms
                        : db.roles.find((r) => r.id === roleId)?.permissions ?? [];
                      const checked = activeList.includes(item.id);
                      return (
                        <label
                          key={item.id}
                          className="flex items-center gap-2 py-0.5 cursor-pointer text-slate-700 dark:text-slate-300"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={editingEmp?.userId === 'usr-owner'}
                            onChange={() => togglePerm(item.id)}
                          />
                          <span>{item.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-700 font-medium"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="h-10 px-5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold"
              >
                {t.common.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Role Modal */}
      {editingRole && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Rolni tahrirlash</h3>
              <button type="button" onClick={() => setEditingRole(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-slate-500 mb-1">Rol nomi (O'zbekcha)</label>
                <input
                  value={editingRole.nameUz}
                  onChange={(e) => setEditingRole({ ...editingRole, nameUz: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Rol nomi (Ruscha)</label>
                <input
                  value={editingRole.nameRu}
                  onChange={(e) => setEditingRole({ ...editingRole, nameRu: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
              {PERMISSION_GROUPS.map((grp) => (
                <div key={grp.title} className="space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{grp.title}</div>
                  {grp.items.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 py-0.5 cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={editingRole.id === 'owner'}
                        checked={editingRole.permissions.includes(item.id)}
                        onChange={() => {
                          const exists = editingRole.permissions.includes(item.id);
                          setEditingRole({
                            ...editingRole,
                            permissions: exists
                              ? editingRole.permissions.filter((p) => p !== item.id)
                              : [...editingRole.permissions, item.id],
                          });
                        }}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={async () => {
                if (!editingRole.nameUz.trim()) return;
                await upsertRole({
                  ...editingRole,
                  nameUz: editingRole.nameUz.trim(),
                  nameRu: editingRole.nameRu.trim() || editingRole.nameUz.trim(),
                });
                notify('Rol yangilandi', 'success');
                setEditingRole(null);
              }}
              className="w-full h-10 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold"
            >
              {t.common.save}
            </button>
          </div>
        </div>
      )}

      {/* Delete Role Confirmation Modal */}
      {deleteRoleTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl text-xs">
            <h3 className="font-display text-base font-bold">Rolni o'chirish</h3>
            <p className="text-slate-600 dark:text-slate-300">
              <span className="font-semibold">{deleteRoleTarget.nameUz}</span> rolini o'chirmoqchimisiz? Shu roldagi xodimlar avtomatik boshqa rolga o'tkaziladi.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteRoleTarget(null)}
                className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 font-medium"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await deleteRole(deleteRoleTarget.id);
                  if (!res.ok) notify(res.error || "O'chirib bo'lmadi", 'error');
                  else notify("Rol o'chirildi", 'info');
                  setDeleteRoleTarget(null);
                }}
                className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
              >
                {t.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Employee Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Xodimni o'chirish
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold">{deleteTarget.name}</span> ({deleteTarget.phone}) hisobini tizimdan o'chirmoqchimisiz? Bu xodim endi tizimga kira olmaydi.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await deleteEmployee(deleteTarget.id);
                  if (!res.ok) {
                    notify(res.error || "O'chirib bo'lmadi", 'error');
                  } else {
                    notify("Xodim o'chirildi", 'info');
                  }
                  setDeleteTarget(null);
                }}
                className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                {t.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
