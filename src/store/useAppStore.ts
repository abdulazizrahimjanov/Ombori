import { create } from 'zustand';
import {
  Account,
  AppSettings,
  Brand,
  CashShift,
  Category,
  Customer,
  DatabaseSnapshot,
  Employee,
  Expense,
  HeldCart,
  OfflineSyncItem,
  OnlineOrder,
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
  Store,
  Supplier,
  Target,
  Transfer,
  User,
  Warehouse,
  WriteOff,
} from '../types/models';
import { repository } from '../data/repository';
import { Language } from '../i18n';
import {
  apiRequest,
  getSavedToken,
  getWsUrl,
  loadOfflineQueue,
  NetworkError,
  saveOfflineQueue,
  setSavedToken,
} from '../data/apiClient';

const THEME_KEY = 'shu_brend_theme_v1';
const LANG_KEY = 'shu_brend_lang_v1';
const HELD_CARTS_KEY = 'shu_brend_held_carts_v1';
const ACTIVE_STORE_KEY = 'shu_brend_active_store_v2';
const CACHED_USER_KEY = 'shu_brend_cached_user_v2';

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
}

export interface BranchDirectoryItem {
  id: string;
  name: string;
  color?: string;
  warehouseId: string;
  warehouseName: string;
}

export interface BackupSummary {
  id: string;
  label: string;
  revision: number;
  createdAt: string;
  sizeBytes?: number;
}

interface AuthResponse {
  token: string;
  user: User;
  snapshot: DatabaseSnapshot;
  branchDirectory: BranchDirectoryItem[];
  revision: number;
}

interface BootstrapResponse {
  user: User;
  snapshot: DatabaseSnapshot;
  branchDirectory: BranchDirectoryItem[];
  revision: number;
}

interface OpResponse<T = unknown> {
  ok: boolean;
  deduplicated?: boolean;
  result: T;
  snapshot: DatabaseSnapshot;
  branchDirectory: BranchDirectoryItem[];
  revision: number;
}

let activeWs: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsPingTimer: ReturnType<typeof setInterval> | null = null;

function closeSyncSocket() {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (wsPingTimer) {
    clearInterval(wsPingTimer);
    wsPingTimer = null;
  }
  if (activeWs) {
    try {
      activeWs.onclose = null;
      activeWs.close();
    } catch {
      // ignore
    }
    activeWs = null;
  }
}

function applyThemeToDOM(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function resolveDefaultStoreId(snapshot: DatabaseSnapshot, user: User | null, requested: string): string {
  const availableIds = snapshot.stores.map((s) => s.id);
  if (availableIds.length === 0) return 'all';
  if (user?.roleId === 'owner') {
    if (requested === 'all' || availableIds.includes(requested)) return requested;
    return 'all';
  }
  if (availableIds.length > 1 && requested === 'all') return 'all';
  if (availableIds.includes(requested)) return requested;
  if (user?.primaryStoreId && availableIds.includes(user.primaryStoreId)) {
    return user.primaryStoreId;
  }
  return availableIds[0];
}

function attachQueue(snapshot: DatabaseSnapshot): DatabaseSnapshot {
  return { ...snapshot, offlineQueue: loadOfflineQueue() };
}

interface AppState {
  db: DatabaseSnapshot | null;
  branchDirectory: BranchDirectoryItem[];
  revision: number;
  wsConnected: boolean;
  initialized: boolean;
  currentUser: User | null;
  currentUserId: string | null;
  activeStoreId: string;
  language: Language;
  theme: 'light' | 'dark';
  isOnline: boolean;
  heldCarts: HeldCart[];
  toasts: ToastMessage[];
  showOnboarding: boolean;

  cartItems: SaleItem[];
  cartCustomerId: string;
  cartDiscountPercent: number;
  cartDiscountFixed: number;
  cartPromoCode: string;
  cartLoyaltySpent: number;
  savatchaMenuOpen: boolean;

  setCartItems: (items: SaleItem[] | ((prev: SaleItem[]) => SaleItem[])) => void;
  setCartCustomerId: (id: string) => void;
  setCartDiscountPercent: (pct: number) => void;
  setCartDiscountFixed: (amt: number) => void;
  setCartPromoCode: (code: string) => void;
  setCartLoyaltySpent: (pts: number) => void;
  setSavatchaMenuOpen: (open: boolean) => void;
  clearCart: () => void;

  init: () => Promise<void>;
  refreshFromServer: () => Promise<void>;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setActiveStoreId: (storeId: string) => void;
  setOnline: (online: boolean) => void;
  setShowOnboarding: (open: boolean) => void;
  notify: (text: string, type?: ToastMessage['type']) => void;
  dismissToast: (id: string) => void;

  getCurrentUser: () => User | null;
  can: (perm: Permission) => boolean;
  getAllowedStoreIds: () => string[];
  canAccessStore: (storeId?: string) => boolean;
  canSellInStore: (storeId?: string) => boolean;
  loginWithPhone: (identifier: string, secret: string) => Promise<{ ok: boolean; error?: string }>;
  switchUserByPin: (pin: string) => Promise<User | null>;
  verifyManagerPin: (pin: string) => Promise<User | null>;
  logout: () => void;

  addHeldCart: (cart: HeldCart) => void;
  removeHeldCart: (id: string) => void;

  getVariantStock: (variantId: string, warehouseId?: string) => number;
  getWarehouseForStore: (storeId?: string) => string;

  dispatchOp: <T = unknown>(
    type: string,
    payload: Record<string, unknown>,
    options?: { queueIfOffline?: boolean }
  ) => Promise<T>;

  upsertProduct: (product: Product, extras?: { warehouseId?: string; initialQtyByVariant?: Record<string, number> }) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  bulkUpdatePrices: (productIds: string[], percentChange: number, field: 'retailPrice' | 'purchasePrice' | 'wholesalePrice') => Promise<void>;
  quickAddStock: (productId: string, variantId: string, warehouseId: string, qty: number, note?: string) => Promise<void>;
  importProducts: (products: Product[], initialStocks: { productId: string; variantId: string; warehouseId: string; qty: number; unitCost: number }[]) => Promise<void>;

  openShift: (startingCash: number, storeId: string) => Promise<CashShift>;
  recordCashOp: (shiftId: string, type: 'in' | 'out', amount: number, reason: string) => Promise<void>;
  closeShift: (shiftId: string, actualCash: number, notes?: string) => Promise<void>;
  createDeferredTransaction: (input: {
    storeId: string;
    warehouseId: string;
    items: SaleItem[];
    customerId?: string;
    checkDiscountAmount: number;
    checkDiscountPercent: number;
    loyaltyPointsSpent: number;
    promoCode?: string;
    note?: string;
  }) => Promise<Sale>;
  payDeferredTransaction: (
    saleId: string,
    input: {
      payments: { method: PaymentMethod; amount: number }[];
      cashGiven?: number;
      changeAmount?: number;
      customerId?: string;
      loyaltyPointsSpent?: number;
    }
  ) => Promise<Sale>;
  deleteDeferredTransaction: (saleId: string) => Promise<void>;
  completeSale: (input: {
    storeId: string;
    warehouseId: string;
    items: SaleItem[];
    customerId?: string;
    checkDiscountAmount: number;
    checkDiscountPercent: number;
    loyaltyPointsSpent: number;
    promoCode?: string;
    payments: { method: PaymentMethod; amount: number }[];
    note?: string;
  }) => Promise<Sale>;
  processReturn: (input: {
    saleId: string;
    items: { saleItemId: string; qty: number }[];
    refundMethod: PaymentMethod;
    reason: string;
    isExchange?: boolean;
  }) => Promise<Return>;
  syncOfflineQueue: () => Promise<number>;

  createPurchaseReceipt: (receipt: Omit<PurchaseReceipt, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<void>;
  createPurchaseOrder: (po: Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<void>;
  updatePurchaseOrderStatus: (poId: string, status: PurchaseOrder['status']) => Promise<void>;
  createTransfer: (transfer: Omit<Transfer, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'status'>) => Promise<void>;
  receiveTransfer: (transferId: string, receivedItems: { variantId: string; receivedQty: number }[]) => Promise<void>;
  rejectTransfer: (transferId: string, reason: string) => Promise<void>;
  createWriteOff: (wo: Omit<WriteOff, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<void>;
  saveStocktake: (st: Omit<Stocktake, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> & { id?: string }) => Promise<Stocktake>;
  applyStocktake: (stocktakeId: string) => Promise<void>;
  upsertSupplier: (supplier: Supplier) => Promise<Supplier>;
  paySupplierDebt: (supplierId: string, amount: number, accountId: string) => Promise<void>;

  upsertCustomer: (customer: Customer) => Promise<Customer>;
  repayDebt: (debtId: string, amount: number, method: PaymentMethod, note?: string) => Promise<void>;
  upsertPromoCode: (promo: PromoCode) => Promise<void>;

  addExpense: (exp: Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<void>;
  transferFunds: (fromAccountId: string, toAccountId: string, amount: number, note: string) => Promise<void>;
  upsertAccount: (acc: Account) => Promise<void>;

  upsertEmployee: (
    emp: Employee,
    userUpdates?: Partial<User>,
    options?: { clearCustomPermissions?: boolean }
  ) => Promise<Employee>;
  deleteEmployee: (empId: string) => Promise<{ ok: boolean; error?: string }>;
  updateUserCredentials: (
    userId: string,
    input: { currentPassword?: string; newPassword?: string; newPin?: string; name?: string }
  ) => Promise<{ ok: boolean; error?: string }>;
  upsertTarget: (target: Target) => Promise<void>;

  createOnlineOrder: (order: Omit<OnlineOrder, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt' | 'createdBy' | 'status'>) => Promise<OnlineOrder>;
  updateOnlineOrderStatus: (orderId: string, status: OnlineOrder['status']) => Promise<void>;

  upsertCategory: (cat: Category) => Promise<Category>;
  deleteCategory: (catId: string) => Promise<{ ok: boolean; error?: string }>;
  resetCategoriesToMensClothing: () => Promise<void>;
  upsertBrand: (brand: Brand) => Promise<Brand>;
  addColor: (color: string) => Promise<string>;
  addSize: (size: string) => Promise<string>;

  upsertStore: (store: Store) => Promise<Store>;
  deleteStore: (storeId: string) => Promise<{ ok: boolean; error?: string }>;
  upsertWarehouse: (wh: Warehouse) => Promise<Warehouse>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  updateRolePermissions: (roleId: RoleId, permissions: Permission[]) => Promise<void>;
  upsertRole: (role: Role) => Promise<Role>;
  deleteRole: (roleId: RoleId) => Promise<{ ok: boolean; error?: string }>;
  restoreDeletedRecord: (deletedId: string) => Promise<void>;
  listServerBackups: () => Promise<BackupSummary[]>;
  createServerBackup: (label?: string) => Promise<BackupSummary>;
  restoreServerBackup: (backupId: string) => Promise<void>;
  resetDemoData: () => Promise<void>;
  clearAllTestData: () => Promise<void>;
  importBackupJson: (json: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => {
  const startSyncSocket = (token: string) => {
    closeSyncSocket();
    if (typeof WebSocket === 'undefined') return;

    const connect = () => {
      if (!getSavedToken()) return;
      try {
        const ws = new WebSocket(getWsUrl(token));
        activeWs = ws;
        ws.onopen = () => {
          set({ wsConnected: true });
          wsPingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send('ping');
            }
          }, 25000);
        };
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(String(evt.data)) as { type?: string; rev?: number };
            if (msg.type === 'sync' && typeof msg.rev === 'number' && msg.rev > get().revision) {
              get().refreshFromServer();
            }
          } catch {
            // ignore pong or non-json
          }
        };
        ws.onclose = () => {
          set({ wsConnected: false });
          if (wsPingTimer) {
            clearInterval(wsPingTimer);
            wsPingTimer = null;
          }
          if (getSavedToken()) {
            wsReconnectTimer = setTimeout(connect, 3500);
          }
        };
        ws.onerror = () => {
          try {
            ws.close();
          } catch {
            // ignore
          }
        };
      } catch {
        // ignore ws creation errors in restricted environments
      }
    };
    connect();
  };

  const applyServerSnapshot = async (
    snapshot: DatabaseSnapshot,
    user: User,
    branchDirectory: BranchDirectoryItem[],
    revision: number
  ) => {
    const withQ = attachQueue(snapshot);
    await repository.save(withQ);
    try {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    } catch {
      // ignore
    }
    const nextStore = resolveDefaultStoreId(withQ, user, get().activeStoreId);
    localStorage.setItem(ACTIVE_STORE_KEY, nextStore);
    set({
      db: withQ,
      currentUser: user,
      currentUserId: user.id,
      branchDirectory,
      revision,
      activeStoreId: nextStore,
    });
  };

  return {
    db: null,
    branchDirectory: [],
    revision: 0,
    wsConnected: false,
    initialized: false,
    currentUser: null,
    currentUserId: null,
    activeStoreId: localStorage.getItem(ACTIVE_STORE_KEY) || 'all',
    language: (localStorage.getItem(LANG_KEY) as Language) || 'uz',
    theme: (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light',
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    heldCarts: (() => {
      try {
        const raw = localStorage.getItem(HELD_CARTS_KEY);
        return raw ? (JSON.parse(raw) as HeldCart[]) : [];
      } catch {
        return [];
      }
    })(),
    toasts: [],
    showOnboarding: false,

    cartItems: [],
    cartCustomerId: '',
    cartDiscountPercent: 0,
    cartDiscountFixed: 0,
    cartPromoCode: '',
    cartLoyaltySpent: 0,
    savatchaMenuOpen: false,

    setCartItems: (items) =>
      set((s) => ({
        cartItems: typeof items === 'function' ? items(s.cartItems) : items,
      })),
    setCartCustomerId: (id) => set({ cartCustomerId: id }),
    setCartDiscountPercent: (pct) => set({ cartDiscountPercent: pct }),
    setCartDiscountFixed: (amt) => set({ cartDiscountFixed: amt }),
    setCartPromoCode: (code) => set({ cartPromoCode: code }),
    setCartLoyaltySpent: (pts) => set({ cartLoyaltySpent: pts }),
    setSavatchaMenuOpen: (open) => set({ savatchaMenuOpen: open }),
    clearCart: () =>
      set({
        cartItems: [],
        cartCustomerId: '',
        cartDiscountPercent: 0,
        cartDiscountFixed: 0,
        cartPromoCode: '',
        cartLoyaltySpent: 0,
      }),

    init: async () => {
      const savedTheme = (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light';
      applyThemeToDOM(savedTheme);
      const token = getSavedToken();

      if (!token) {
        set({ initialized: true, theme: savedTheme, currentUser: null, currentUserId: null });
        return;
      }

      try {
        const data = await apiRequest<BootstrapResponse>('/api/bootstrap', { token });
        await applyServerSnapshot(data.snapshot, data.user, data.branchDirectory, data.revision);
        startSyncSocket(token);
        set({ initialized: true, theme: savedTheme });
        // Flush any pending offline queue items automatically on startup
        if (loadOfflineQueue().length > 0) {
          void get().syncOfflineQueue();
        }
      } catch (err) {
        if (err instanceof NetworkError) {
          // Offline mode -> hydrate from local IndexedDB cache
          const cachedDb = await repository.loadCached();
          let cachedUser: User | null = null;
          try {
            const rawU = localStorage.getItem(CACHED_USER_KEY);
            cachedUser = rawU ? (JSON.parse(rawU) as User) : null;
          } catch {
            cachedUser = null;
          }
          if (cachedDb && cachedUser) {
            set({
              db: attachQueue(cachedDb),
              currentUser: cachedUser,
              currentUserId: cachedUser.id,
              activeStoreId: resolveDefaultStoreId(cachedDb, cachedUser, get().activeStoreId),
              initialized: true,
              theme: savedTheme,
            });
            return;
          }
        }
        // Invalid/expired token or no cached DB
        setSavedToken(null);
        set({ initialized: true, theme: savedTheme, currentUser: null, currentUserId: null });
      }
    },

    refreshFromServer: async () => {
      const token = getSavedToken();
      if (!token) return;
      try {
        const data = await apiRequest<BootstrapResponse>('/api/bootstrap', { token });
        await applyServerSnapshot(data.snapshot, data.user, data.branchDirectory, data.revision);
      } catch {
        // ignore transient refresh failure
      }
    },

    setLanguage: (lang) => {
      localStorage.setItem(LANG_KEY, lang);
      set({ language: lang });
    },

    setTheme: (theme) => {
      localStorage.setItem(THEME_KEY, theme);
      applyThemeToDOM(theme);
      set({ theme });
    },

    setActiveStoreId: (storeId) => {
      const { db, currentUser } = get();
      const resolved = db ? resolveDefaultStoreId(db, currentUser, storeId) : storeId;
      localStorage.setItem(ACTIVE_STORE_KEY, resolved);
      set({ activeStoreId: resolved });
    },

    setOnline: (online) => {
      set({ isOnline: online });
      if (online && getSavedToken()) {
        void get().syncOfflineQueue().then((syncedCount) => {
          if (syncedCount > 0) {
            get().notify(`${syncedCount} ta oflayn amal sinxronlandi`, 'success');
          } else {
            void get().refreshFromServer();
          }
        });
      }
    },

    setShowOnboarding: (open) => set({ showOnboarding: open }),

    notify: (text, type = 'info') => {
      const id = uid('toast');
      set((s) => ({ toasts: [...s.toasts, { id, text, type }] }));
      setTimeout(() => {
        get().dismissToast(id);
      }, 3600);
    },

    dismissToast: (id) =>
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    getCurrentUser: () => {
      const { currentUser, db, currentUserId } = get();
      if (currentUser) return currentUser;
      if (!db || !currentUserId) return null;
      return db.users.find((u) => u.id === currentUserId) ?? null;
    },

    can: (perm) => {
      const { db } = get();
      const user = get().getCurrentUser();
      if (!db || !user) return false;
      if (user.roleId === 'owner') return true;
      if (user.customPermissions?.includes(perm)) return true;
      const role = db.roles.find((r) => r.id === user.roleId);
      return role?.permissions.includes(perm) ?? false;
    },

    getAllowedStoreIds: () => {
      const { db } = get();
      const user = get().getCurrentUser();
      if (!db || !user) return [];
      const existing = db.stores.map((s) => s.id);
      if (user.roleId === 'owner') return existing;
      const assigned = (user.assignedStoreIds ?? []).filter((id) => existing.includes(id));
      return assigned.length > 0 ? assigned : existing.slice(0, 1);
    },

    canAccessStore: (storeId) => {
      if (!storeId) return true;
      const user = get().getCurrentUser();
      if (!user) return false;
      if (user.roleId === 'owner') return true;
      const allowed = get().getAllowedStoreIds();
      if (storeId === 'all') return allowed.length > 1;
      return allowed.includes(storeId);
    },

    canSellInStore: (storeId) => {
      const user = get().getCurrentUser();
      if (!user) return false;
      if (user.roleId === 'owner') return true;
      if (!get().can('use_pos')) return false;
      const targetStore = storeId && storeId !== 'all' ? storeId : get().getAllowedStoreIds()[0];
      if (!targetStore || !get().canAccessStore(targetStore)) return false;
      if (Array.isArray(user.sellStoreIds)) {
        return user.sellStoreIds.includes(targetStore);
      }
      return true;
    },

    loginWithPhone: async (identifier, secret) => {
      try {
        const res = await apiRequest<AuthResponse>('/api/auth/login', {
          method: 'POST',
          body: { identifier, secret },
          skipAuth: true,
        });
        setSavedToken(res.token);
        await applyServerSnapshot(res.snapshot, res.user, res.branchDirectory, res.revision);
        startSyncSocket(res.token);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Telefon raqam/login yoki parol noto'g'ri",
        };
      }
    },

    switchUserByPin: async (pin) => {
      try {
        const res = await apiRequest<AuthResponse>('/api/auth/switch-pin', {
          method: 'POST',
          body: { pin },
        });
        setSavedToken(res.token);
        await applyServerSnapshot(res.snapshot, res.user, res.branchDirectory, res.revision);
        startSyncSocket(res.token);
        return res.user;
      } catch {
        return null;
      }
    },

    verifyManagerPin: async (pin) => {
      try {
        const res = await apiRequest<{ user: User }>('/api/auth/verify-manager-pin', {
          method: 'POST',
          body: { pin },
        });
        return res.user;
      } catch {
        return null;
      }
    },

    logout: () => {
      closeSyncSocket();
      setSavedToken(null);
      localStorage.removeItem(CACHED_USER_KEY);
      localStorage.removeItem(ACTIVE_STORE_KEY);
      void repository.clearCache();
      set({
        db: null,
        currentUser: null,
        currentUserId: null,
        activeStoreId: 'all',
        wsConnected: false,
        revision: 0,
      });
    },

    addHeldCart: (cart) => {
      const next = [cart, ...get().heldCarts];
      localStorage.setItem(HELD_CARTS_KEY, JSON.stringify(next));
      set({ heldCarts: next });
    },

    removeHeldCart: (id) => {
      const next = get().heldCarts.filter((c) => c.id !== id);
      localStorage.setItem(HELD_CARTS_KEY, JSON.stringify(next));
      set({ heldCarts: next });
    },

    getVariantStock: (variantId, warehouseId) => {
      const { db } = get();
      if (!db) return 0;
      const allowedWarehouseIds = new Set(db.warehouses.map((w) => w.id));
      return db.stockItems
        .filter((s) => {
          if (s.variantId !== variantId) return false;
          if (warehouseId && warehouseId !== 'all') return s.warehouseId === warehouseId;
          return allowedWarehouseIds.has(s.warehouseId);
        })
        .reduce((sum, s) => sum + s.qty, 0);
    },

    getWarehouseForStore: (storeId) => {
      const { db, activeStoreId } = get();
      if (!db) return '';
      const targetStore = storeId ?? (activeStoreId === 'all' ? db.stores[0]?.id : activeStoreId);
      const store = db.stores.find((s) => s.id === targetStore);
      if (store?.defaultWarehouseId) return store.defaultWarehouseId;
      const wh = db.warehouses.find((w) => w.storeId === targetStore);
      return wh?.id ?? db.warehouses[0]?.id ?? '';
    },

    dispatchOp: async <T = unknown>(
      type: string,
      payload: Record<string, unknown>,
      options?: { queueIfOffline?: boolean }
    ): Promise<T> => {
      const operationId = uid('op');
      try {
        const res = await apiRequest<OpResponse<T>>('/api/ops', {
          method: 'POST',
          body: { operationId, type, payload },
        });
        const user = get().currentUser;
        if (user) {
          await applyServerSnapshot(res.snapshot, user, res.branchDirectory, res.revision);
        }
        return res.result;
      } catch (err) {
        if (err instanceof NetworkError && options?.queueIfOffline) {
          const item: OfflineSyncItem = {
            id: uid('sync'),
            type: 'op',
            operationId,
            opType: type,
            payload,
            createdAt: new Date().toISOString(),
            attempts: 0,
          };
          const q = [...loadOfflineQueue(), item];
          saveOfflineQueue(q);
          if (get().db) {
            set({ db: { ...get().db!, offlineQueue: q } });
          }
          get().notify("Internet uzildi — amal navbatga qo'shildi va ulanganda sinxronlanadi", 'info');
          return {} as T;
        }
        throw err;
      }
    },

    syncOfflineQueue: async () => {
      const queue = loadOfflineQueue();
      if (queue.length === 0) return 0;
      let synced = 0;
      const remaining: OfflineSyncItem[] = [];

      for (const item of queue) {
        try {
          if (item.type === 'op' && item.opType) {
            const res = await apiRequest<OpResponse>('/api/ops', {
              method: 'POST',
              body: {
                operationId: item.operationId || item.id,
                type: item.opType,
                payload: item.payload,
              },
            });
            const user = get().currentUser;
            if (user) {
              await applyServerSnapshot(res.snapshot, user, res.branchDirectory, res.revision);
            }
            synced += 1;
          }
        } catch (err) {
          if (err instanceof NetworkError) {
            remaining.push({ ...item, attempts: item.attempts + 1 });
          } else {
            // Permanent business error (e.g. insufficient stock on conflict)
            get().notify(
              err instanceof Error ? `Oflayn amal xatosi: ${err.message}` : "Oflayn amal sinxronlanmadi",
              'error'
            );
          }
        }
      }

      saveOfflineQueue(remaining);
      if (get().db) {
        set({ db: { ...get().db!, offlineQueue: remaining } });
      }
      return synced;
    },

    upsertProduct: async (product, extras) => {
      await get().dispatchOp('UPSERT_PRODUCT', {
        product,
        warehouseId: extras?.warehouseId,
        initialQtyByVariant: extras?.initialQtyByVariant,
      });
    },

    deleteProduct: async (productId) => {
      await get().dispatchOp('DELETE_PRODUCT', { productId });
    },

    bulkUpdatePrices: async (productIds, percentChange, field) => {
      await get().dispatchOp('BULK_UPDATE_PRICES', {
        productIds,
        mode: 'percent',
        value: percentChange,
        field,
      });
    },

    quickAddStock: async (productId, variantId, warehouseId, qty, note) => {
      await get().dispatchOp('QUICK_ADD_STOCK', {
        productId,
        variantId,
        warehouseId,
        qtyDelta: qty,
        note,
      });
    },

    importProducts: async (products, initialStocks) => {
      const storeId = products[0]?.storeId || get().activeStoreId;
      const stockMap: Record<string, number> = {};
      initialStocks.forEach((st) => {
        stockMap[st.variantId] = st.qty;
      });
      await get().dispatchOp('IMPORT_PRODUCTS', {
        products,
        stockMap,
        storeId: storeId === 'all' ? get().getAllowedStoreIds()[0] : storeId,
        warehouseId: initialStocks[0]?.warehouseId,
      });
    },

    openShift: async (startingCash, storeId) => {
      return get().dispatchOp<CashShift>('OPEN_SHIFT', { startingCash, storeId });
    },

    recordCashOp: async (shiftId, type, amount, reason) => {
      await get().dispatchOp('RECORD_CASH_OP', { shiftId, opType: type, amount, reason });
    },

    closeShift: async (shiftId, actualCash, notes) => {
      await get().dispatchOp('CLOSE_SHIFT', { shiftId, actualCash, notes });
    },

    createDeferredTransaction: async (input) => {
      return get().dispatchOp<Sale>('CREATE_DEFERRED_SALE', input, { queueIfOffline: true });
    },

    payDeferredTransaction: async (saleId, input) => {
      return get().dispatchOp<Sale>('PAY_DEFERRED_SALE', { saleId, ...input }, { queueIfOffline: true });
    },

    deleteDeferredTransaction: async (saleId) => {
      await get().dispatchOp('DELETE_DEFERRED_SALE', { saleId });
    },

    completeSale: async (input) => {
      return get().dispatchOp<Sale>('COMPLETE_SALE', input, { queueIfOffline: true });
    },

    processReturn: async (input) => {
      return get().dispatchOp<Return>('PROCESS_RETURN', input, { queueIfOffline: true });
    },

    createPurchaseReceipt: async (receipt) => {
      await get().dispatchOp('CREATE_PURCHASE_RECEIPT', receipt as Record<string, unknown>);
    },

    createPurchaseOrder: async (po) => {
      await get().dispatchOp('CREATE_PURCHASE_ORDER', po as Record<string, unknown>);
    },

    updatePurchaseOrderStatus: async (poId, status) => {
      await get().dispatchOp('UPDATE_PO_STATUS', { poId, status });
    },

    createTransfer: async (transfer) => {
      await get().dispatchOp('CREATE_TRANSFER', transfer as Record<string, unknown>);
    },

    receiveTransfer: async (transferId, receivedItems) => {
      const receivedQtys: Record<string, number> = {};
      receivedItems.forEach((r) => {
        receivedQtys[r.variantId] = r.receivedQty;
      });
      await get().dispatchOp('RECEIVE_TRANSFER', { transferId, receivedQtys });
    },

    rejectTransfer: async (transferId, reason) => {
      await get().dispatchOp('REJECT_TRANSFER', { transferId, reason });
    },

    createWriteOff: async (wo) => {
      await get().dispatchOp('CREATE_WRITEOFF', wo as Record<string, unknown>);
    },

    saveStocktake: async (st) => {
      return get().dispatchOp<Stocktake>('SAVE_STOCKTAKE', st as Record<string, unknown>);
    },

    applyStocktake: async (stocktakeId) => {
      await get().dispatchOp('APPLY_STOCKTAKE', { stocktakeId });
    },

    upsertSupplier: async (supplier) => {
      return get().dispatchOp<Supplier>('UPSERT_SUPPLIER', { supplier });
    },

    paySupplierDebt: async (supplierId, amount, accountId) => {
      await get().dispatchOp('PAY_SUPPLIER_DEBT', { supplierId, amount, accountId });
    },

    upsertCustomer: async (customer) => {
      return get().dispatchOp<Customer>('UPSERT_CUSTOMER', { customer });
    },

    repayDebt: async (debtId, amount, method, note) => {
      await get().dispatchOp('REPAY_DEBT', { debtId, amount, method, note });
    },

    upsertPromoCode: async (promo) => {
      await get().dispatchOp('UPSERT_PROMO', { promo });
    },

    addExpense: async (exp) => {
      await get().dispatchOp('ADD_EXPENSE', exp as Record<string, unknown>);
    },

    transferFunds: async (fromAccountId, toAccountId, amount, note) => {
      await get().dispatchOp('TRANSFER_FUNDS', { fromAccountId, toAccountId, amount, description: note });
    },

    upsertAccount: async (acc) => {
      await get().dispatchOp('UPSERT_ACCOUNT', { account: acc });
    },

    upsertEmployee: async (emp, userUpdates, options) => {
      return get().dispatchOp<Employee>('UPSERT_EMPLOYEE', {
        employee: emp,
        password: userUpdates?.password,
        pin: userUpdates?.pin,
        assignedStoreIds: userUpdates?.assignedStoreIds ?? emp.assignedStoreIds,
        sellStoreIds: userUpdates?.sellStoreIds ?? emp.sellStoreIds,
        customPermissions: userUpdates?.customPermissions,
        clearCustomPermissions: options?.clearCustomPermissions,
      });
    },

    deleteEmployee: async (empId) => {
      try {
        await get().dispatchOp('DELETE_EMPLOYEE', { employeeId: empId });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "O'chirishda xatolik" };
      }
    },

    updateUserCredentials: async (userId, input) => {
      try {
        await get().dispatchOp('UPDATE_CREDENTIALS', { userId, ...input });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Xatolik' };
      }
    },

    upsertTarget: async (target) => {
      await get().dispatchOp('UPSERT_TARGET', { target });
    },

    createOnlineOrder: async (order) => {
      const res = await apiRequest<{ ok: boolean; order: OnlineOrder }>('/api/public/orders', {
        method: 'POST',
        body: { ...order, operationId: uid('ordop') },
        skipAuth: true,
      });
      await get().refreshFromServer();
      return res.order;
    },

    updateOnlineOrderStatus: async (orderId, status) => {
      await get().dispatchOp('UPDATE_ONLINE_ORDER_STATUS', { orderId, status });
    },

    upsertCategory: async (cat) => {
      return get().dispatchOp<Category>('UPSERT_CATEGORY', { category: cat });
    },

    deleteCategory: async (catId) => {
      try {
        await get().dispatchOp('DELETE_CATEGORY', { categoryId: catId });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "O'chirishda xatolik" };
      }
    },

    resetCategoriesToMensClothing: async () => {
      await get().dispatchOp('RESET_CATEGORIES', {});
    },

    upsertBrand: async (brand) => {
      return get().dispatchOp<Brand>('UPSERT_BRAND', { brand });
    },

    addColor: async (color) => {
      return get().dispatchOp<string>('ADD_COLOR', { color });
    },

    addSize: async (size) => {
      return get().dispatchOp<string>('ADD_SIZE', { size });
    },

    upsertStore: async (store) => {
      return get().dispatchOp<Store>('UPSERT_STORE', { store });
    },

    deleteStore: async (storeId) => {
      try {
        await get().dispatchOp('DELETE_STORE', { storeId });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "O'chirishda xatolik" };
      }
    },

    upsertWarehouse: async (wh) => {
      return get().dispatchOp<Warehouse>('UPSERT_WAREHOUSE', { warehouse: wh });
    },

    updateSettings: async (partial) => {
      await get().dispatchOp('UPDATE_SETTINGS', { partial });
    },

    updateRolePermissions: async (roleId, permissions) => {
      await get().dispatchOp('UPDATE_ROLE_PERMISSIONS', { roleId, permissions });
    },

    upsertRole: async (role) => {
      return get().dispatchOp<Role>('UPSERT_ROLE', { role });
    },

    deleteRole: async (roleId) => {
      try {
        await get().dispatchOp('DELETE_ROLE', { roleId });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "O'chirishda xatolik" };
      }
    },

    restoreDeletedRecord: async (deletedId) => {
      await get().dispatchOp('RESTORE_DELETED_RECORD', { deletedId });
    },

    listServerBackups: async () => {
      const res = await apiRequest<{ backups: BackupSummary[] }>('/api/backups');
      return res.backups;
    },

    createServerBackup: async (label) => {
      const res = await apiRequest<{ backup: BackupSummary }>('/api/backups', {
        method: 'POST',
        body: { label },
      });
      return res.backup;
    },

    restoreServerBackup: async (backupId) => {
      const res = await apiRequest<BootstrapResponse>(`/api/backups/${encodeURIComponent(backupId)}/restore`, {
        method: 'POST',
      });
      const user = get().currentUser;
      if (user) {
        await applyServerSnapshot(res.snapshot, user, res.branchDirectory, res.revision);
      }
    },

    resetDemoData: async () => {
      await get().dispatchOp('RESET_DEMO_DATA', {});
    },

    clearAllTestData: async () => {
      await get().dispatchOp('CLEAR_ALL_TEST_DATA', {});
      localStorage.removeItem(HELD_CARTS_KEY);
      set({
        heldCarts: [],
        cartItems: [],
        cartCustomerId: '',
        cartDiscountPercent: 0,
        cartDiscountFixed: 0,
        cartPromoCode: '',
        cartLoyaltySpent: 0,
      });
    },

    importBackupJson: async (json) => {
      const parsed = JSON.parse(json) as DatabaseSnapshot;
      if (!parsed || !Array.isArray(parsed.stores) || !Array.isArray(parsed.products)) {
        throw new Error("Zaxira fayli tuzilmasi noto'g'ri");
      }
      await get().dispatchOp('IMPORT_BACKUP', { snapshot: parsed });
    },
  };
});
