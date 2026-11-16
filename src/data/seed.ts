import {
  Account,
  AppSettings,
  AuditLog,
  Brand,
  CashOperation,
  CashShift,
  Category,
  Customer,
  DatabaseSnapshot,
  Debt,
  Employee,
  Expense,
  LoyaltyAccount,
  LoyaltyTransaction,
  OnlineOrder,
  Permission,
  Product,
  PromoCode,
  PurchaseOrder,
  PurchaseReceipt,
  Role,
  Sale,
  StockItem,
  StockMovement,
  Store,
  Supplier,
  Target,
  Transaction,
  User,
  Warehouse,
} from '../types/models.ts';
import { generateEAN13 } from '../utils/barcode.ts';
import { MEDIA } from '../assets/media.ts';

const now = new Date();
const daysAgo = (days: number, hour = 14, min = 30) => {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};
const daysAhead = (days: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

export const ALL_PERMISSIONS: Permission[] = [
  'view_dashboard',
  'view_profit_cost',
  'use_pos',
  'apply_big_discount',
  'process_returns',
  'manage_shifts',
  'view_catalog',
  'edit_catalog',
  'bulk_edit_prices',
  'view_inventory',
  'manage_inventory',
  'view_customers',
  'manage_customers',
  'manage_debts',
  'view_finance',
  'manage_finance',
  'view_employees',
  'manage_employees',
  'view_reports',
  'manage_online_orders',
  'manage_settings',
  'view_audit_log',
];

export const DEFAULT_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL', '30', '31', '32', '34', '39', '40', '41', '42', '43', '44', '48', '50', '52', '115cm', '120cm', '41-45', 'Standart'];
export const DEFAULT_COLORS = ['Qora', 'Oq', "Ko'k", 'Kulrang', 'Jigarrang', 'Bej', 'Qumrang', 'Yashil', 'Qizil'];

export function getMensClothingCategories(storeId: string, ts = new Date().toISOString()): Category[] {
  return [
    { id: 'cat-shirts', nameUz: "Ko'ylaklar (Rubashka)", nameRu: 'Рубашки', sortOrder: 1, storeId, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'cat-pants', nameUz: 'Shimlar va Jinsilar', nameRu: 'Брюки и джинсы', sortOrder: 2, storeId, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'cat-suits', nameUz: 'Kostyum-shimlar', nameRu: 'Костюмы', sortOrder: 3, storeId, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'cat-tshirts', nameUz: 'Futbolka va Polo', nameRu: 'Футболки и поло', sortOrder: 4, storeId, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'cat-knitwear', nameUz: 'Sviter va Tolstovka', nameRu: 'Свитера и толстовки', sortOrder: 5, storeId, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'cat-outerwear', nameUz: 'Kurtka va Palto', nameRu: 'Куртки и пальто', sortOrder: 6, storeId, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'cat-shoes', nameUz: 'Erkaklar poyabzali', nameRu: 'Мужская обувь', sortOrder: 7, storeId, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'cat-accessories', nameUz: 'Aksessuarlar', nameRu: 'Аксессуары', sortOrder: 8, storeId, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
  ];
}

export function createSeedDatabase(): DatabaseSnapshot {
  const ts = daysAgo(30, 9, 0);
  const store1Id = 'store-toraqorgon';
  const store2Id = 'store-mingbuloq';
  const wh1Id = 'wh-toraqorgon';
  const wh2Id = 'wh-mingbuloq';

  const roles: Role[] = [
    { id: 'owner', nameUz: 'Egasi (Owner)', nameRu: 'Владелец', permissions: ALL_PERMISSIONS },
    {
      id: 'admin',
      nameUz: 'Bosh administrator',
      nameRu: 'Главный администратор',
      permissions: ALL_PERMISSIONS.filter((p) => p !== 'manage_settings'),
    },
    {
      id: 'manager',
      nameUz: 'Filial menejeri',
      nameRu: 'Менеджер филиала',
      permissions: [
        'view_dashboard',
        'view_profit_cost',
        'use_pos',
        'apply_big_discount',
        'process_returns',
        'manage_shifts',
        'view_catalog',
        'edit_catalog',
        'view_inventory',
        'manage_inventory',
        'view_customers',
        'manage_customers',
        'manage_debts',
        'view_finance',
        'manage_finance',
        'view_employees',
        'view_reports',
        'manage_online_orders',
      ],
    },
    {
      id: 'cashier',
      nameUz: 'Kassir',
      nameRu: 'Кассир',
      permissions: ['view_dashboard', 'use_pos', 'process_returns', 'manage_shifts', 'view_catalog', 'view_customers', 'manage_customers'],
    },
    {
      id: 'warehouse',
      nameUz: 'Omborchi',
      nameRu: 'Кладовщик',
      permissions: ['view_dashboard', 'view_catalog', 'edit_catalog', 'view_inventory', 'manage_inventory', 'manage_online_orders'],
    },
  ];

  const warehouses: Warehouse[] = [
    {
      id: wh1Id,
      name: "To'raqo'rg'on Ombori",
      address: "Namangan vil., To'raqo'rg'on tumani, Markaziy ko'cha 12",
      isMain: true,
      storeId: store1Id,
      createdAt: ts,
      updatedAt: ts,
      createdBy: 'usr-owner',
    },
    {
      id: wh2Id,
      name: 'Mingbuloq Ombori',
      address: "Namangan vil., Mingbuloq tumani, Jomasho'y markazi 8",
      isMain: false,
      storeId: store2Id,
      createdAt: ts,
      updatedAt: ts,
      createdBy: 'usr-owner',
    },
  ];

  const stores: Store[] = [
    {
      id: store1Id,
      name: "SHU BREND TO'RAQO'RG'ON",
      address: "Namangan vil., To'raqo'rg'on tumani, Markaziy ko'cha 12",
      phone: '+998 88 926 04 04',
      isActive: true,
      defaultWarehouseId: wh1Id,
      storeCode: '01',
      color: '#2563EB',
      storeId: store1Id,
      createdAt: ts,
      updatedAt: ts,
      createdBy: 'usr-owner',
    },
    {
      id: store2Id,
      name: 'SHU BREND MINGBULOQ',
      address: "Namangan vil., Mingbuloq tumani, Jomasho'y markazi 8",
      phone: '+998 90 222 33 44',
      isActive: true,
      defaultWarehouseId: wh2Id,
      storeCode: '02',
      color: '#16A34A',
      storeId: store2Id,
      createdAt: ts,
      updatedAt: ts,
      createdBy: 'usr-owner',
    },
  ];

  // 10 Initial Users (Scalable to 20, 50, 100+ users without artificial limit)
  const users: User[] = [
    {
      id: 'usr-owner',
      name: 'ISLOMBEK',
      phone: '+998889260404',
      login: 'islombek',
      password: '51111',
      pin: '51111',
      position: "Do'kon egasi",
      roleId: 'owner',
      primaryStoreId: store1Id,
      assignedStoreIds: [store1Id, store2Id],
      sellStoreIds: [store1Id, store2Id],
      isActive: true,
      storeId: store1Id,
      createdAt: ts,
      updatedAt: ts,
      createdBy: 'usr-owner',
    },
    {
      id: 'usr-admin',
      name: 'OTABEK',
      phone: '+998902223344',
      login: 'otabek',
      password: '123456',
      pin: '2222',
      position: 'Bosh administrator',
      roleId: 'admin',
      primaryStoreId: store1Id,
      assignedStoreIds: [store1Id, store2Id],
      sellStoreIds: [store1Id, store2Id],
      isActive: true,
      storeId: store1Id,
      createdAt: ts,
      updatedAt: ts,
      createdBy: 'usr-owner',
    },
    {
      id: 'usr-manager',
      name: 'Jasur Alimov',
      phone: '+998903334455',
      login: 'jasur_trq',
      password: '123456',
      pin: '3333',
      position: 'Filial menejeri',
      roleId: 'manager',
      primaryStoreId: store1Id,
      assignedStoreIds: [store1Id],
      sellStoreIds: [store1Id],
      isActive: true,
      storeId: store1Id,
      createdAt: ts,
      updatedAt: ts,
      createdBy: 'usr-owner',
    },
    {
      id: 'usr-cashier',
      name: 'Madina Toshmatova',
      phone: '+998904445566',
      login: 'madina_trq',
      password: '123456',
      pin: '4444',
      position: 'Katta kassir',
      roleId: 'cashier',
      primaryStoreId: store1Id,
      assignedStoreIds: [store1Id],
      sellStoreIds: [store1Id],
      isActive: true,
      storeId: store1Id,
      createdAt: ts,
      updatedAt: ts,
      createdBy: 'usr-owner',
    },
    {
      id: 'usr-warehouse',
      name: 'Bobur Xolmatov',
      phone: '+998905556677',
      login: 'bobur_trq',
      password: '123456',
      pin: '5555',
      position: 'Omborchi',
      roleId: 'warehouse',
      primaryStoreId: store1Id,
      assignedStoreIds: [store1Id],
      sellStoreIds: [],
      isActive: true,
      storeId: store1Id,
      createdAt: ts,
      updatedAt: ts,
      createdBy: 'usr-owner',
    },
    {
      id: 'usr-trq-seller',
      name: 'Azizbek Rahmonov',
      phone: '+998906667788',
      login: 'azizbek_trq',
      password: '123456',
      pin: '6666',
      position: 'Sotuvchi-kassir',
      roleId: 'cashier',
      primaryStoreId: store1Id,
      assignedStoreIds: [store1Id],
      sellStoreIds: [store1Id],
      isActive: true,
      storeId: store1Id,
      createdAt: ts,
      updatedAt: ts,
      createdBy: 'usr-owner',
    },
    {
      id: 'usr-mng-manager',
      name: 'Sardorbek Rustamov',
      phone: '+998913334411',
      login: 'sardor_mng',
      password: '123456',
      pin: '7777',
      position: 'Filial menejeri',
      roleId: 'manager',
      primaryStoreId: store2Id,
      assignedStoreIds: [store2Id],
      sellStoreIds: [store2Id],
      isActive: true,
      storeId: store2Id,
      createdAt: ts,
      updatedAt: ts,
      createdBy: 'usr-owner',
    },
    {
      id: 'usr-mng-cashier1',
      name: 'Dilnoza Karimova',
      phone: '+998914445522',
      login: 'dilnoza_mng',
      password: '123456',
      pin: '8888',
      position: 'Katta kassir',
      roleId: 'cashier',
      primaryStoreId: store2Id,
      assignedStoreIds: [store2Id],
      sellStoreIds: [store2Id],
      isActive: true,
      storeId: store2Id,
      createdAt: ts,
      updatedAt: ts,
      createdBy: 'usr-owner',
    },
    {
      id: 'usr-mng-cashier2',
      name: 'Dostonbek Qodirov',
      phone: '+998915556633',
      login: 'doston_mng',
      password: '123456',
      pin: '9999',
      position: 'Sotuvchi-kassir',
      roleId: 'cashier',
      primaryStoreId: store2Id,
      assignedStoreIds: [store2Id],
      sellStoreIds: [store2Id],
      isActive: true,
      storeId: store2Id,
      createdAt: ts,
      updatedAt: ts,
      createdBy: 'usr-owner',
    },
    {
      id: 'usr-mng-warehouse',
      name: 'Shoxrux Olimov',
      phone: '+998916667744',
      login: 'shoxrux_mng',
      password: '123456',
      pin: '1010',
      position: 'Omborchi',
      roleId: 'warehouse',
      primaryStoreId: store2Id,
      assignedStoreIds: [store2Id],
      sellStoreIds: [],
      isActive: true,
      storeId: store2Id,
      createdAt: ts,
      updatedAt: ts,
      createdBy: 'usr-owner',
    },
  ];

  const categories: Category[] = getMensClothingCategories(store1Id, ts);

  const brands: Brand[] = [
    { id: 'br-samarkand', name: 'Samarkand Loom', country: "O'zbekiston", storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'br-terra', name: 'Terra Step', country: 'Turkiya', storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'br-aura', name: 'Ramsey Classic', country: 'Turkiya', storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'br-nordic', name: 'Milan Line', country: 'Italiya', storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'br-casa', name: 'Bukhara Tailor', country: "O'zbekiston", storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'br-chorsu', name: 'Chorsu Craft', country: "O'zbekiston", storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
  ];

  const suppliers: Supplier[] = [
    { id: 'sup-1', name: 'Tashkent Textile Optom', contactName: 'Azizbek Umarov', phone: '+998935011122', address: "Ipak Yo'li bozori, 14-blok", debtBalance: 4500000, storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'sup-2', name: 'Istanbul Shoes & Suit Import', contactName: 'Murat Yilmaz', phone: '+998909887766', address: 'Abu Saxiy savdo majmuasi, C-12', debtBalance: 2200000, storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'sup-3', name: 'Bursa Menswear Optom', contactName: 'Kemal Aydin', phone: '+998977772211', address: "Namangan Chorsu savdo markazi, 8-do'kon", debtBalance: 0, storeId: store2Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'sup-4', name: 'Chorsu Leather & Accessories', contactName: 'Otabek Qodirov', phone: '+998946554433', address: 'Bek Baraka, 45-pavilyon', debtBalance: 1850000, storeId: store2Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
  ];

  interface RawProd {
    store: string;
    wh: string;
    name: string;
    cat: string;
    brand: string;
    sup: string;
    unit: Product['unit'];
    collection: string;
    photo?: string;
    buy: number;
    sell: number;
    wholesale: number;
    variants: { size?: string; color?: string; q: number }[];
  }

  // Strictly isolated branch products: first 16 in SHU BREND TO'RAQO'RG'ON, next 14 in SHU BREND MINGBULOQ
  const rawProducts: RawProd[] = [
    { store: store1Id, wh: wh1Id, name: 'Jun Overshirt Kurtka', cat: 'cat-outerwear', brand: 'br-samarkand', sup: 'sup-1', unit: 'dona', collection: 'Kuz-Qish 2026', photo: MEDIA.apparel, buy: 280000, sell: 460000, wholesale: 390000, variants: [{ size: 'M', color: 'Qumrang', q: 12 }, { size: 'L', color: 'Qumrang', q: 9 }, { size: 'XL', color: "Ko'k", q: 6 }] },
    { store: store1Id, wh: wh1Id, name: 'Paxta Trikotaj Sviter', cat: 'cat-knitwear', brand: 'br-samarkand', sup: 'sup-1', unit: 'dona', collection: 'Kuz-Qish 2026', photo: MEDIA.apparel, buy: 145000, sell: 245000, wholesale: 210000, variants: [{ size: 'M', color: 'Kulrang', q: 18 }, { size: 'L', color: 'Qora', q: 14 }] },
    { store: store1Id, wh: wh1Id, name: 'Klassik Chinos Shim', cat: 'cat-pants', brand: 'br-samarkand', sup: 'sup-1', unit: 'dona', collection: 'Bazaviy', buy: 130000, sell: 220000, wholesale: 185000, variants: [{ size: '32', color: 'Bej', q: 15 }, { size: '34', color: 'Qora', q: 11 }] },
    { store: store1Id, wh: wh1Id, name: 'Oversize Futbolka 100% Paxta', cat: 'cat-tshirts', brand: 'br-chorsu', sup: 'sup-1', unit: 'dona', collection: 'Yozgi', buy: 48000, sell: 95000, wholesale: 75000, variants: [{ size: 'M', color: 'Oq', q: 34 }, { size: 'L', color: 'Qora', q: 28 }, { size: 'XL', color: 'Yashil', q: 4 }] },
    { store: store1Id, wh: wh1Id, name: "Linen Yozgi Ko'ylak", cat: 'cat-shirts', brand: 'br-samarkand', sup: 'sup-1', unit: 'dona', collection: 'Bahor-Yoz', buy: 115000, sell: 195000, wholesale: 165000, variants: [{ size: 'S', color: 'Oq', q: 10 }, { size: 'M', color: "Ko'k", q: 8 }] },
    { store: store1Id, wh: wh1Id, name: 'Denim Jinsi Kurtka', cat: 'cat-outerwear', brand: 'br-terra', sup: 'sup-1', unit: 'dona', collection: 'Kuz 2026', buy: 210000, sell: 365000, wholesale: 310000, variants: [{ size: 'M', color: "Ko'k", q: 7 }, { size: 'L', color: 'Qora', q: 3 }] },
    { store: store1Id, wh: wh1Id, name: 'Charm Krossovka Urban', cat: 'cat-shoes', brand: 'br-terra', sup: 'sup-2', unit: 'juft', collection: 'Premium', photo: MEDIA.shoes, buy: 340000, sell: 550000, wholesale: 480000, variants: [{ size: '41', color: 'Oq', q: 8 }, { size: '42', color: 'Oq', q: 11 }, { size: '43', color: 'Oq', q: 5 }] },
    { store: store1Id, wh: wh1Id, name: 'Zamsha Loferlar Klassik', cat: 'cat-shoes', brand: 'br-terra', sup: 'sup-2', unit: 'juft', collection: 'Ofis', photo: MEDIA.shoes, buy: 290000, sell: 480000, wholesale: 410000, variants: [{ size: '40', color: 'Jigarrang', q: 6 }, { size: '42', color: 'Qora', q: 7 }] },
    { store: store1Id, wh: wh1Id, name: 'Yugurish Krossovkasi AirFlex', cat: 'cat-shoes', brand: 'br-terra', sup: 'sup-2', unit: 'juft', collection: 'Sport', buy: 230000, sell: 390000, wholesale: 330000, variants: [{ size: '39', color: 'Kulrang', q: 9 }, { size: '41', color: 'Qora', q: 10 }] },
    { store: store1Id, wh: wh1Id, name: 'Qishki Chelsi Etik', cat: 'cat-shoes', brand: 'br-terra', sup: 'sup-2', unit: 'juft', collection: 'Qish 2026', buy: 410000, sell: 680000, wholesale: 580000, variants: [{ size: '42', color: 'Qora', q: 4 }, { size: '43', color: 'Jigarrang', q: 2 }] },
    { store: store1Id, wh: wh1Id, name: "Oxford Oq Klassik Ko'ylak", cat: 'cat-shirts', brand: 'br-aura', sup: 'sup-1', unit: 'dona', collection: 'Ofis', photo: MEDIA.apparel, buy: 120000, sell: 215000, wholesale: 175000, variants: [{ size: 'M', color: 'Oq', q: 15 }, { size: 'L', color: 'Oq', q: 12 }] },
    { store: store1Id, wh: wh1Id, name: 'Ikki Tugmali Klassik Kostyum', cat: 'cat-suits', brand: 'br-aura', sup: 'sup-2', unit: 'dona', collection: 'Premium', photo: MEDIA.apparel, buy: 650000, sell: 1150000, wholesale: 950000, variants: [{ size: '48', color: 'Qora', q: 6 }, { size: '50', color: "Ko'k", q: 5 }, { size: '52', color: 'Kulrang', q: 4 }] },
    { store: store1Id, wh: wh1Id, name: 'Smart Casual Pijak', cat: 'cat-suits', brand: 'br-nordic', sup: 'sup-2', unit: 'dona', collection: 'Ofis', buy: 390000, sell: 680000, wholesale: 560000, variants: [{ size: '48', color: "Ko'k", q: 7 }, { size: '50', color: 'Kulrang', q: 6 }] },
    { store: store1Id, wh: wh1Id, name: 'Polo Yoqali Futbolka Lacoste Usul', cat: 'cat-tshirts', brand: 'br-aura', sup: 'sup-1', unit: 'dona', collection: 'Bahor-Yoz', buy: 85000, sell: 165000, wholesale: 135000, variants: [{ size: 'M', color: 'Yashil', q: 16 }, { size: 'L', color: 'Qora', q: 14 }, { size: 'XL', color: 'Oq', q: 10 }] },
    { store: store1Id, wh: wh1Id, name: 'Streych Jinsi Shim Slim', cat: 'cat-pants', brand: 'br-terra', sup: 'sup-2', unit: 'dona', collection: 'Kundalik', buy: 145000, sell: 265000, wholesale: 215000, variants: [{ size: '31', color: "Ko'k", q: 12 }, { size: '32', color: 'Qora', q: 15 }, { size: '34', color: "Ko'k", q: 10 }] },
    { store: store1Id, wh: wh1Id, name: 'Tabiiy Charm Kamar', cat: 'cat-accessories', brand: 'br-chorsu', sup: 'sup-1', unit: 'dona', collection: 'Klassik', buy: 68000, sell: 135000, wholesale: 110000, variants: [{ size: '115cm', color: 'Qora', q: 20 }, { size: '120cm', color: 'Jigarrang', q: 14 }] },

    // Mingbuloq Branch Products
    { store: store2Id, wh: wh2Id, name: 'Slim Fit Rubashka Moviy', cat: 'cat-shirts', brand: 'br-aura', sup: 'sup-3', unit: 'dona', collection: 'Ofis', photo: MEDIA.apparel, buy: 110000, sell: 195000, wholesale: 160000, variants: [{ size: 'M', color: "Ko'k", q: 14 }, { size: 'XL', color: "Ko'k", q: 9 }] },
    { store: store2Id, wh: wh2Id, name: "Kletkali Flanel Ko'ylak", cat: 'cat-shirts', brand: 'br-chorsu', sup: 'sup-3', unit: 'dona', collection: 'Kuz 2026', buy: 125000, sell: 225000, wholesale: 185000, variants: [{ size: 'L', color: 'Qizil', q: 10 }, { size: 'XL', color: 'Qora', q: 8 }] },
    { store: store2Id, wh: wh2Id, name: "Troika To'y Kostyum-Shim", cat: 'cat-suits', brand: 'br-nordic', sup: 'sup-3', unit: 'dona', collection: 'Premium', photo: MEDIA.apparel, buy: 820000, sell: 1450000, wholesale: 1200000, variants: [{ size: '50', color: 'Qora', q: 5 }, { size: '52', color: 'Bej', q: 4 }] },
    { store: store2Id, wh: wh2Id, name: 'Bazaviy V-Yoqa Futbolka', cat: 'cat-tshirts', brand: 'br-chorsu', sup: 'sup-3', unit: 'dona', collection: 'Bazaviy', buy: 42000, sell: 85000, wholesale: 68000, variants: [{ size: 'M', color: 'Qora', q: 25 }, { size: 'L', color: 'Oq', q: 22 }] },
    { store: store2Id, wh: wh2Id, name: 'Klassik Ofis Shim (Shirstoy)', cat: 'cat-pants', brand: 'br-aura', sup: 'sup-3', unit: 'dona', collection: 'Ofis', buy: 160000, sell: 290000, wholesale: 240000, variants: [{ size: '32', color: 'Qora', q: 11 }, { size: '34', color: 'Kulrang', q: 9 }] },
    { store: store2Id, wh: wh2Id, name: 'Minimalist Charm Hamyon', cat: 'cat-accessories', brand: 'br-chorsu', sup: 'sup-4', unit: 'dona', collection: 'Klassik', buy: 82000, sell: 160000, wholesale: 130000, variants: [{ size: 'Standart', color: 'Qora', q: 16 }] },
    { store: store2Id, wh: wh2Id, name: 'Ipak Galstuk va Babochka', cat: 'cat-accessories', brand: 'br-nordic', sup: 'sup-4', unit: 'dona', collection: 'Ofis', buy: 45000, sell: 95000, wholesale: 75000, variants: [{ size: 'Standart', color: 'Qora', q: 18 }, { size: 'Standart', color: 'Qizil', q: 12 }] },
    { store: store2Id, wh: wh2Id, name: "Kargo Cho'ntakli Shim", cat: 'cat-pants', brand: 'br-samarkand', sup: 'sup-3', unit: 'dona', collection: 'Sport', buy: 135000, sell: 245000, wholesale: 195000, variants: [{ size: '32', color: 'Yashil', q: 10 }, { size: '34', color: 'Qora', q: 8 }] },
    { store: store2Id, wh: wh2Id, name: 'Kapishonli Flis Tolstovka (Hoodie)', cat: 'cat-knitwear', brand: 'br-chorsu', sup: 'sup-3', unit: 'dona', collection: 'Kuz-Qish 2026', buy: 135000, sell: 240000, wholesale: 195000, variants: [{ size: 'M', color: 'Qora', q: 14 }, { size: 'L', color: 'Kulrang', q: 12 }] },
    { store: store2Id, wh: wh2Id, name: 'Vodolazka (Baland Yoqali Sviter)', cat: 'cat-knitwear', brand: 'br-aura', sup: 'sup-3', unit: 'dona', collection: 'Kuz-Qish 2026', buy: 98000, sell: 185000, wholesale: 150000, variants: [{ size: 'M', color: 'Qora', q: 20 }, { size: 'L', color: 'Bej', q: 14 }] },
    { store: store2Id, wh: wh2Id, name: 'Kardigan Tugmali Jemfer', cat: 'cat-knitwear', brand: 'br-samarkand', sup: 'sup-3', unit: 'dona', collection: 'Kuz 2026', buy: 165000, sell: 295000, wholesale: 245000, variants: [{ size: 'L', color: "Ko'k", q: 9 }, { size: 'XL', color: 'Jigarrang', q: 7 }] },
    { store: store2Id, wh: wh2Id, name: 'Drapp Qishki Palto Klassik', cat: 'cat-outerwear', brand: 'br-nordic', sup: 'sup-3', unit: 'dona', collection: 'Qish 2026', buy: 520000, sell: 890000, wholesale: 740000, variants: [{ size: '48', color: 'Qora', q: 6 }, { size: '50', color: 'Bej', q: 5 }] },
    { store: store2Id, wh: wh2Id, name: "Shamolto'sar Bomber Kurtka", cat: 'cat-outerwear', brand: 'br-terra', sup: 'sup-3', unit: 'dona', collection: 'Bahor-Kuz', buy: 240000, sell: 420000, wholesale: 350000, variants: [{ size: 'M', color: 'Qora', q: 11 }, { size: 'L', color: 'Yashil', q: 9 }] },
    { store: store2Id, wh: wh2Id, name: "Erkaklar Paypoq To'plami (5 juft)", cat: 'cat-accessories', brand: 'br-chorsu', sup: 'sup-4', unit: 'quti', collection: 'Bazaviy', buy: 32000, sell: 65000, wholesale: 50000, variants: [{ size: '41-45', color: 'Qora', q: 35 }] },
  ];

  const products: Product[] = [];
  const stockItems: StockItem[] = [];
  const stockMovements: StockMovement[] = [];

  rawProducts.forEach((rp, pIdx) => {
    const productId = `prod-${String(pIdx + 1).padStart(2, '0')}`;
    const variants = rp.variants.map((rv, vIdx) => {
      const variantId = `${productId}-v${vIdx + 1}`;
      const barcode = generateEAN13(100000000 + pIdx * 100 + vIdx * 7);
      const sku = `SBO-${String(pIdx + 1).padStart(3, '0')}-${vIdx + 1}`;

      stockItems.push({
        id: `stk-${variantId}-${rp.wh}`,
        productId,
        variantId,
        warehouseId: rp.wh,
        qty: rv.q,
        storeId: rp.store,
        createdAt: ts,
        updatedAt: ts,
        createdBy: 'usr-owner',
      });
      stockMovements.push({
        id: `mov-init-${variantId}`,
        productId,
        variantId,
        warehouseId: rp.wh,
        type: 'kirim',
        qtyDelta: rv.q,
        qtyAfter: rv.q,
        unitCost: rp.buy,
        note: "Boshlang'ich filial ombor qoldig'i",
        storeId: rp.store,
        createdAt: ts,
        updatedAt: ts,
        createdBy: 'usr-owner',
      });

      return {
        id: variantId,
        productId,
        sku,
        size: rv.size,
        color: rv.color,
        purchasePrice: rp.buy,
        retailPrice: rp.sell,
        wholesalePrice: rp.wholesale,
        minStock: 5,
        barcodes: [barcode],
        storeId: rp.store,
        createdAt: ts,
        updatedAt: ts,
        createdBy: 'usr-owner',
      };
    });

    products.push({
      id: productId,
      name: rp.name,
      categoryId: rp.cat,
      brandId: rp.brand,
      collection: rp.collection,
      unit: rp.unit,
      description: `${rp.name} — yuqori sifatli kundalik va mavsumiy tanlov.`,
      photoUrl: rp.photo,
      supplierId: rp.sup,
      tags: [rp.collection],
      isPublishedOnline: true,
      variants,
      storeId: rp.store,
      createdAt: ts,
      updatedAt: ts,
      createdBy: 'usr-owner',
    });
  });

  const customerNames = [
    ['Alisher Vohidov', '+998901234501', 'vip', 'male', 4850000, 14, 0],
    ['Kamola Mirzayeva', '+998901234502', 'vip', 'female', 6200000, 19, 320000],
    ["Rustam Jo'rayev", '+998911234503', 'regular', 'male', 1850000, 6, 0],
    ['Nilufar Saidova', '+998931234504', 'vip', 'female', 5100000, 15, 0],
    ['Farrux Tursunov', '+998941234505', 'regular', 'male', 1420000, 5, 180000],
    ['Zarina Xasanova', '+998951234506', 'regular', 'female', 2340000, 8, 0],
    ['Sherzod Normatov', '+998971234507', 'sleeping', 'male', 890000, 2, 0],
    ['Malika Abdullayeva', '+998991234508', 'vip', 'female', 7450000, 22, 0],
    ['Umidjon Ergashev', '+998901234509', 'new', 'male', 460000, 1, 0],
    ['Gulnora Toshpulatova', '+998911234510', 'regular', 'female', 1980000, 7, 250000],
    ['Dostonbek Rasulov', '+998931234511', 'regular', 'male', 1290000, 4, 0],
    ['Shahnoza Karimova', '+998941234512', 'new', 'female', 390000, 1, 0],
    ['Javohir Sobirov', '+998951234513', 'sleeping', 'male', 650000, 2, 120000],
    ["Aziza Yo'ldosheva", '+998971234514', 'regular', 'female', 2780000, 9, 0],
    ['Bekzod Olimov', '+998991234515', 'regular', 'male', 1640000, 5, 0],
    ['Lola Qosimova', '+998901234516', 'vip', 'female', 4120000, 12, 0],
    ['Sanjar Murodov', '+998911234517', 'new', 'male', 245000, 1, 0],
    ['Dilbar Akbarova', '+998931234518', 'sleeping', 'female', 720000, 2, 0],
    ['Temur Ismoilov', '+998941234519', 'regular', 'male', 2150000, 7, 450000],
    ['Feruza Hamroyeva', '+998971234520', 'new', 'female', 550000, 2, 0],
  ] as const;

  const customers: Customer[] = [];
  const loyaltyAccounts: LoyaltyAccount[] = [];
  const loyaltyTransactions: LoyaltyTransaction[] = [];
  const debts: Debt[] = [];

  customerNames.forEach(([name, phone, seg, gender, spent, orders, debt], i) => {
    const cid = `cust-${String(i + 1).padStart(2, '0')}`;
    const cStore = i % 2 === 0 ? store1Id : store2Id;
    const lastDays = seg === 'sleeping' ? 45 + i : seg === 'new' ? 2 : 1 + (i % 10);
    customers.push({
      id: cid,
      name,
      phone,
      gender,
      birthday: `199${i % 9}-0${(i % 8) + 1}-1${i % 9}`,
      tags: seg === 'vip' ? ['VIP'] : [],
      segment: seg,
      totalSpent: spent,
      ordersCount: orders,
      lastPurchaseAt: daysAgo(lastDays),
      debtBalance: debt,
      storeId: cStore,
      createdAt: ts,
      updatedAt: daysAgo(lastDays),
      createdBy: 'usr-cashier',
    });

    const tier = spent >= 5000000 ? 'platinum' : spent >= 3000000 ? 'gold' : spent >= 1200000 ? 'silver' : 'bronze';
    const pct = tier === 'platinum' ? 7 : tier === 'gold' ? 5 : tier === 'silver' ? 3 : 2;
    const pts = Math.round((spent * pct) / 100 / 4);
    const laId = `loy-${cid}`;
    loyaltyAccounts.push({
      id: laId,
      customerId: cid,
      tier,
      cashbackPercent: pct,
      pointsBalance: pts,
      cardNumber: `SHU-${1001 + i}`,
      expiresAt: daysAhead(120),
      storeId: cStore,
      createdAt: ts,
      updatedAt: daysAgo(lastDays),
      createdBy: 'usr-cashier',
    });
    loyaltyTransactions.push({
      id: `ltx-${cid}-1`,
      customerId: cid,
      loyaltyAccountId: laId,
      type: 'earn',
      points: pts,
      expiresAt: daysAhead(120),
      note: 'Xarid uchun keshbek',
      storeId: cStore,
      createdAt: daysAgo(lastDays),
      updatedAt: daysAgo(lastDays),
      createdBy: 'usr-cashier',
    });

    if (debt > 0) {
      debts.push({
        id: `debt-${cid}`,
        customerId: cid,
        customerName: name,
        originalAmount: debt,
        remainingAmount: debt,
        dueDate: daysAhead(14),
        status: 'open',
        payments: [],
        storeId: cStore,
        createdAt: daysAgo(4),
        updatedAt: daysAgo(4),
        createdBy: 'usr-cashier',
      });
    }
  });

  // Historical Sales matching each branch's isolated products
  const sales: Sale[] = [];
  const saleTemplates: {
    d: number;
    h: number;
    pIdx: number;
    qty: number;
    method: 'cash' | 'card' | 'uzcard' | 'humo' | 'payme' | 'click' | 'uzum';
    cust: number;
    deferred?: boolean;
  }[] = [
    { d: 0, h: 16, pIdx: 4, qty: 1, method: 'cash', cust: 4, deferred: true },
    { d: 0, h: 15, pIdx: 16, qty: 2, method: 'uzcard', cust: 7, deferred: true },
    { d: 0, h: 10, pIdx: 0, qty: 1, method: 'uzcard', cust: 0 },
    { d: 0, h: 11, pIdx: 6, qty: 1, method: 'cash', cust: 2 },
    { d: 0, h: 12, pIdx: 17, qty: 2, method: 'payme', cust: 3 },
    { d: 0, h: 14, pIdx: 15, qty: 1, method: 'click', cust: 8 },
    { d: 0, h: 15, pIdx: 3, qty: 3, method: 'humo', cust: 6 },
    { d: 0, h: 17, pIdx: 19, qty: 2, method: 'cash', cust: 5 },
    { d: 1, h: 11, pIdx: 1, qty: 2, method: 'uzcard', cust: 4 },
    { d: 1, h: 15, pIdx: 20, qty: 1, method: 'cash', cust: 9 },
    { d: 1, h: 18, pIdx: 11, qty: 1, method: 'card', cust: 10 },
    { d: 2, h: 13, pIdx: 12, qty: 2, method: 'humo', cust: 12 },
    { d: 2, h: 18, pIdx: 21, qty: 1, method: 'uzum', cust: 13 },
    { d: 3, h: 12, pIdx: 22, qty: 2, method: 'cash', cust: 15 },
    { d: 4, h: 16, pIdx: 7, qty: 2, method: 'uzcard', cust: 0 },
    { d: 5, h: 14, pIdx: 14, qty: 1, method: 'payme', cust: 14 },
    { d: 6, h: 17, pIdx: 23, qty: 2, method: 'cash', cust: 17 },
    { d: 7, h: 13, pIdx: 24, qty: 1, method: 'click', cust: 3 },
    { d: 8, h: 11, pIdx: 25, qty: 3, method: 'humo', cust: 11 },
    { d: 9, h: 15, pIdx: 27, qty: 2, method: 'cash', cust: 19 },
    { d: 10, h: 12, pIdx: 29, qty: 2, method: 'card', cust: 16 },
    { d: 11, h: 16, pIdx: 20, qty: 2, method: 'cash', cust: 1 },
  ];

  saleTemplates.forEach((st, idx) => {
    const prod = products[st.pIdx];
    const variant = prod.variants[0];
    const sId = prod.storeId;
    const whId = sId === store1Id ? wh1Id : wh2Id;
    const unitPrice = variant.retailPrice;
    const lineTotal = unitPrice * st.qty;
    const costTotal = variant.purchasePrice * st.qty;
    const createdAt = daysAgo(st.d, st.h, 15 + (idx % 30));
    const saleId = `sale-${String(idx + 1).padStart(3, '0')}`;
    const cust = customers[st.cust];
    const storeCode = sId === store1Id ? '01' : '02';
    const seq = String(270 + (saleTemplates.length - idx)).padStart(4, '0');
    const receiptNumber = `#${storeCode}010104${seq}`;
    const isDeferred = Boolean(st.deferred);

    sales.push({
      id: saleId,
      receiptNumber,
      warehouseId: whId,
      shiftId: !isDeferred && st.d === 0 ? (sId === store1Id ? 'shift-active-trq' : 'shift-active-mng') : undefined,
      cashierId: sId === store1Id ? 'usr-cashier' : 'usr-mng-cashier1',
      cashierName: sId === store1Id ? 'Madina Toshmatova' : 'Dilnoza Karimova',
      customerId: cust.id,
      customerName: cust.name,
      items: [
        {
          id: `si-${saleId}-1`,
          productId: prod.id,
          variantId: variant.id,
          productName: prod.name,
          variantLabel: [variant.size, variant.color].filter(Boolean).join(' / '),
          sku: variant.sku,
          qty: st.qty,
          unitPrice,
          purchasePrice: variant.purchasePrice,
          discountAmount: 0,
          discountPercent: 0,
          lineTotal,
        },
      ],
      subtotal: lineTotal,
      checkDiscountAmount: 0,
      checkDiscountPercent: 0,
      loyaltyPointsSpent: 0,
      loyaltyPointsEarned: isDeferred ? 0 : Math.round(lineTotal * 0.03),
      vatAmount: 0,
      totalAmount: lineTotal,
      costTotal,
      payments: isDeferred
        ? []
        : [
            {
              id: `pay-${saleId}-1`,
              saleId,
              method: st.method,
              amount: lineTotal,
              storeId: sId,
              createdAt,
              updatedAt: createdAt,
              createdBy: sId === store1Id ? 'usr-cashier' : 'usr-mng-cashier1',
            },
          ],
      paidAmount: isDeferred ? 0 : lineTotal,
      debtAmount: 0,
      paidAt: isDeferred ? undefined : createdAt,
      status: isDeferred ? 'deferred' : 'completed',
      fiscalStatus: 'not_configured',
      storeId: sId,
      createdAt,
      updatedAt: createdAt,
      createdBy: sId === store1Id ? 'usr-cashier' : 'usr-mng-cashier1',
    });
  });

  const cashShifts: CashShift[] = [
    {
      id: 'shift-active-trq',
      number: 'SM-TRQ-042',
      cashierId: 'usr-cashier',
      cashierName: 'Madina Toshmatova',
      openedAt: daysAgo(0, 9, 0),
      startingCash: 500000,
      cashSalesTotal: 550000,
      cardSalesTotal: 745000,
      otherSalesTotal: 135000,
      cashRefundsTotal: 0,
      cashInTotal: 0,
      cashOutTotal: 0,
      expectedCash: 1050000,
      status: 'open',
      storeId: store1Id,
      createdAt: daysAgo(0, 9, 0),
      updatedAt: daysAgo(0, 15, 0),
      createdBy: 'usr-cashier',
    },
    {
      id: 'shift-active-mng',
      number: 'SM-MNG-019',
      cashierId: 'usr-mng-cashier1',
      cashierName: 'Dilnoza Karimova',
      openedAt: daysAgo(0, 9, 0),
      startingCash: 350000,
      cashSalesTotal: 170000,
      cardSalesTotal: 0,
      otherSalesTotal: 450000,
      cashRefundsTotal: 0,
      cashInTotal: 0,
      cashOutTotal: 0,
      expectedCash: 520000,
      status: 'open',
      storeId: store2Id,
      createdAt: daysAgo(0, 9, 0),
      updatedAt: daysAgo(0, 17, 0),
      createdBy: 'usr-mng-cashier1',
    },
  ];

  const cashOperations: CashOperation[] = [];

  const accounts: Account[] = [
    { id: 'acc-cash-trq', name: "To'raqo'rg'on Kassa (Naqd)", type: 'cash', balance: 4850000, isDefault: true, storeId: store1Id, createdAt: ts, updatedAt: now.toISOString(), createdBy: 'usr-owner' },
    { id: 'acc-card-trq', name: "To'raqo'rg'on Uzcard / Humo", type: 'card_terminal', balance: 12450000, storeId: store1Id, createdAt: ts, updatedAt: now.toISOString(), createdBy: 'usr-owner' },
    { id: 'acc-bank-trq', name: "To'raqo'rg'on Bank H/R", type: 'bank', balance: 28900000, storeId: store1Id, createdAt: ts, updatedAt: now.toISOString(), createdBy: 'usr-owner' },
    { id: 'acc-cash-mng', name: 'Mingbuloq Kassa (Naqd)', type: 'cash', balance: 3250000, isDefault: true, storeId: store2Id, createdAt: ts, updatedAt: now.toISOString(), createdBy: 'usr-owner' },
    { id: 'acc-card-mng', name: 'Mingbuloq Uzcard / Humo', type: 'card_terminal', balance: 8100000, storeId: store2Id, createdAt: ts, updatedAt: now.toISOString(), createdBy: 'usr-owner' },
    { id: 'acc-bank-mng', name: 'Mingbuloq Bank H/R', type: 'bank', balance: 14500000, storeId: store2Id, createdAt: ts, updatedAt: now.toISOString(), createdBy: 'usr-owner' },
  ];

  const expenses: Expense[] = [
    { id: 'exp-1', accountId: 'acc-bank-trq', category: 'rent', amount: 6500000, description: "To'raqo'rg'on filiali oylik ijarasi", isRecurring: true, recurringDay: 5, date: daysAgo(8), storeId: store1Id, createdAt: daysAgo(8), updatedAt: daysAgo(8), createdBy: 'usr-owner' },
    { id: 'exp-2', accountId: 'acc-cash-trq', category: 'utilities', amount: 740000, description: 'Elektr energiya va internet', isRecurring: true, recurringDay: 10, date: daysAgo(4), storeId: store1Id, createdAt: daysAgo(4), updatedAt: daysAgo(4), createdBy: 'usr-admin' },
    { id: 'exp-3', accountId: 'acc-cash-mng', category: 'delivery', amount: 380000, description: 'Mingbuloq tovar tashish xarajati', isRecurring: false, date: daysAgo(2), storeId: store2Id, createdAt: daysAgo(2), updatedAt: daysAgo(2), createdBy: 'usr-mng-manager' },
  ];

  const transactions: Transaction[] = [
    { id: 'trx-1', accountId: 'acc-bank-trq', type: 'expense', category: 'rent', amount: 6500000, description: "To'raqo'rg'on filiali ijarasi", storeId: store1Id, createdAt: daysAgo(8), updatedAt: daysAgo(8), createdBy: 'usr-owner' },
    { id: 'trx-2', accountId: 'acc-cash-trq', type: 'expense', category: 'utilities', amount: 740000, description: "Kommunal to'lovlar", storeId: store1Id, createdAt: daysAgo(4), updatedAt: daysAgo(4), createdBy: 'usr-admin' },
    { id: 'trx-3', accountId: 'acc-cash-mng', type: 'expense', category: 'delivery', amount: 380000, description: 'Mingbuloq kuryerlik xarajati', storeId: store2Id, createdAt: daysAgo(2), updatedAt: daysAgo(2), createdBy: 'usr-mng-manager' },
  ];

  const purchaseReceipts: PurchaseReceipt[] = [
    {
      id: 'pr-1',
      number: 'KIR-018',
      supplierId: 'sup-1',
      warehouseId: wh1Id,
      items: [
        { productId: 'prod-01', variantId: 'prod-01-v1', productName: 'Jun Overshirt Kurtka', variantLabel: 'M / Qumrang', qty: 10, purchasePrice: 280000, total: 2800000 },
      ],
      totalAmount: 2800000,
      paidAmount: 2800000,
      paymentStatus: 'paid',
      storeId: store1Id,
      createdAt: daysAgo(5),
      updatedAt: daysAgo(5),
      createdBy: 'usr-warehouse',
    },
  ];

  const purchaseOrders: PurchaseOrder[] = [
    {
      id: 'po-1',
      number: 'BUY-009',
      supplierId: 'sup-2',
      warehouseId: wh1Id,
      items: [
        { productId: 'prod-10', variantId: 'prod-10-v1', productName: 'Qishki Chelsi Etik', variantLabel: '42 / Qora', qty: 12, purchasePrice: 410000, total: 4920000 },
      ],
      totalAmount: 4920000,
      status: 'ordered',
      expectedDate: daysAhead(3),
      storeId: store1Id,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
      createdBy: 'usr-manager',
    },
  ];

  const promoCodes: PromoCode[] = [
    { id: 'promo-1', code: 'YANGI10', discountType: 'percent', discountValue: 10, minOrderAmount: 200000, maxUses: 100, usedCount: 14, expiresAt: daysAhead(60), isActive: true, storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'promo-2', code: 'SHU50000', discountType: 'fixed', discountValue: 50000, minOrderAmount: 400000, maxUses: 50, usedCount: 6, expiresAt: daysAhead(30), isActive: true, storeId: store2Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
  ];

  const employees: Employee[] = [
    { id: 'emp-owner', userId: 'usr-owner', name: 'ISLOMBEK', phone: '+998889260404', login: 'islombek', position: "Do'kon egasi", roleId: 'owner', primaryStoreId: store1Id, assignedStoreIds: [store1Id, store2Id], sellStoreIds: [store1Id, store2Id], baseSalary: 0, commissionPercent: 0, schedule: 'Doimiy boshqaruv', hiredAt: daysAgo(365), storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'emp-admin', userId: 'usr-admin', name: 'OTABEK', phone: '+998902223344', login: 'otabek', position: 'Bosh administrator', roleId: 'admin', primaryStoreId: store1Id, assignedStoreIds: [store1Id, store2Id], sellStoreIds: [store1Id, store2Id], baseSalary: 7000000, commissionPercent: 1.0, schedule: 'Du–Sha, 09:00–19:00', hiredAt: daysAgo(240), storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'emp-1', userId: 'usr-manager', name: 'Jasur Alimov', phone: '+998903334455', login: 'jasur_trq', position: 'Filial menejeri', roleId: 'manager', primaryStoreId: store1Id, assignedStoreIds: [store1Id], sellStoreIds: [store1Id], baseSalary: 5500000, commissionPercent: 1.5, schedule: 'Du–Sha, 09:00–19:00', hiredAt: daysAgo(180), storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'emp-2', userId: 'usr-cashier', name: 'Madina Toshmatova', phone: '+998904445566', login: 'madina_trq', position: 'Katta kassir', roleId: 'cashier', primaryStoreId: store1Id, assignedStoreIds: [store1Id], sellStoreIds: [store1Id], baseSalary: 3800000, commissionPercent: 2.0, schedule: '2/2 smena, 09:00–21:00', hiredAt: daysAgo(120), storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'emp-3', userId: 'usr-warehouse', name: 'Bobur Xolmatov', phone: '+998905556677', login: 'bobur_trq', position: 'Omborchi', roleId: 'warehouse', primaryStoreId: store1Id, assignedStoreIds: [store1Id], sellStoreIds: [], baseSalary: 4200000, commissionPercent: 0.5, schedule: 'Du–Ju, 09:00–18:00', hiredAt: daysAgo(90), storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'emp-4', userId: 'usr-trq-seller', name: 'Azizbek Rahmonov', phone: '+998906667788', login: 'azizbek_trq', position: 'Sotuvchi-kassir', roleId: 'cashier', primaryStoreId: store1Id, assignedStoreIds: [store1Id], sellStoreIds: [store1Id], baseSalary: 3500000, commissionPercent: 2.0, schedule: 'Du–Sha, 09:00–20:00', hiredAt: daysAgo(80), storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'emp-5', userId: 'usr-mng-manager', name: 'Sardorbek Rustamov', phone: '+998913334411', login: 'sardor_mng', position: 'Filial menejeri', roleId: 'manager', primaryStoreId: store2Id, assignedStoreIds: [store2Id], sellStoreIds: [store2Id], baseSalary: 5500000, commissionPercent: 1.5, schedule: 'Du–Sha, 09:00–19:00', hiredAt: daysAgo(150), storeId: store2Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'emp-6', userId: 'usr-mng-cashier1', name: 'Dilnoza Karimova', phone: '+998914445522', login: 'dilnoza_mng', position: 'Katta kassir', roleId: 'cashier', primaryStoreId: store2Id, assignedStoreIds: [store2Id], sellStoreIds: [store2Id], baseSalary: 3800000, commissionPercent: 2.0, schedule: '2/2 smena, 09:00–21:00', hiredAt: daysAgo(100), storeId: store2Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'emp-7', userId: 'usr-mng-cashier2', name: 'Dostonbek Qodirov', phone: '+998915556633', login: 'doston_mng', position: 'Sotuvchi-kassir', roleId: 'cashier', primaryStoreId: store2Id, assignedStoreIds: [store2Id], sellStoreIds: [store2Id], baseSalary: 3500000, commissionPercent: 2.0, schedule: 'Du–Sha, 09:00–20:00', hiredAt: daysAgo(60), storeId: store2Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'emp-8', userId: 'usr-mng-warehouse', name: 'Shoxrux Olimov', phone: '+998916667744', login: 'shoxrux_mng', position: 'Omborchi', roleId: 'warehouse', primaryStoreId: store2Id, assignedStoreIds: [store2Id], sellStoreIds: [], baseSalary: 4200000, commissionPercent: 0.5, schedule: 'Du–Ju, 09:00–18:00', hiredAt: daysAgo(45), storeId: store2Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
  ];

  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const targets: Target[] = [
    { id: 'tgt-store-1', month: monthKey, targetAmount: 85000000, storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'tgt-store-2', month: monthKey, targetAmount: 65000000, storeId: store2Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'tgt-emp-2', employeeId: 'emp-2', month: monthKey, targetAmount: 45000000, storeId: store1Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
    { id: 'tgt-emp-6', employeeId: 'emp-6', month: monthKey, targetAmount: 40000000, storeId: store2Id, createdAt: ts, updatedAt: ts, createdBy: 'usr-owner' },
  ];

  const onlineOrders: OnlineOrder[] = [
    {
      id: 'ord-1',
      orderNumber: 'WEB-204',
      customerName: 'Olimjon Bahromov',
      customerPhone: '+998908887766',
      deliveryAddress: "Namangan, To'raqo'rg'on, Mustaqillik ko'chasi 23",
      deliveryMethod: 'delivery',
      paymentMethod: 'cash_on_delivery',
      items: [
        { productId: 'prod-07', variantId: 'prod-07-v1', productName: 'Charm Krossovka Urban', variantLabel: '41 / Oq', qty: 1, unitPrice: 550000, lineTotal: 550000 },
      ],
      totalAmount: 550000,
      status: 'new',
      note: 'Kechki 18:00 dan keyin yetkazib bering',
      storeId: store1Id,
      createdAt: daysAgo(0, 13, 20),
      updatedAt: daysAgo(0, 13, 20),
      createdBy: 'web-guest',
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: 'aud-1',
      userId: 'usr-owner',
      userName: 'ISLOMBEK',
      action: 'price_change',
      entityType: 'Product',
      entityId: 'prod-01',
      summary: "Jun Overshirt Kurtka narxi yangilandi: 440 000 -> 460 000 so'm",
      storeId: store1Id,
      createdAt: daysAgo(2, 11, 0),
      updatedAt: daysAgo(2, 11, 0),
      createdBy: 'usr-owner',
    },
  ];

  const settings: AppSettings = {
    brandName: 'SHU BREND OMBOR',
    currency: 'UZS',
    showUsdOption: false,
    usdRate: 12800,
    roundingStep: 100,
    vatEnabled: false,
    vatRate: 12,
    allowNegativeStock: false,
    discountApprovalThresholdPercent: 15,
    receiptWidth: '80mm',
    receiptHeader: "SHU BREND OMBOR\nSHU BREND TO'RAQO'RG'ON\nTel: +998 88 926 04 04",
    receiptFooter: "Xaridingiz uchun rahmat!\n14 kun ichida chek bilan almashtirish mumkin.",
    showReceiptQr: true,
    labelTemplate: '40x30',
    enabledPaymentMethods: ['cash', 'card', 'uzcard', 'humo', 'visa', 'mastercard', 'unionpay', 'transfer', 'click', 'payme', 'uzum', 'debt'],
    loyaltyTiers: [
      { tier: 'bronze', minSpend: 0, cashbackPercent: 2 },
      { tier: 'silver', minSpend: 1200000, cashbackPercent: 3 },
      { tier: 'gold', minSpend: 3000000, cashbackPercent: 5 },
      { tier: 'platinum', minSpend: 5000000, cashbackPercent: 7 },
    ],
    cashbackExpiryDays: 180,
    birthdayBonusAmount: 50000,
    telegramChannelHandle: '@shubrend_ombor',
    integrations: {
      fiscalProvider: 'none',
      paymentGateway: 'none',
      smsProvider: 'none',
      telegramBotConfigured: false,
      marketplaceSync: 'none',
    },
  };

  return {
    version: 2,
    revision: 1,
    stores,
    warehouses,
    users,
    roles,
    categories,
    brands,
    customSizes: [...DEFAULT_SIZES],
    customColors: [...DEFAULT_COLORS],
    products,
    suppliers,
    stockItems,
    stockMovements,
    purchaseReceipts,
    purchaseOrders,
    transfers: [],
    writeOffs: [],
    stocktakes: [],
    sales,
    returns: [],
    cashShifts,
    cashOperations,
    accounts,
    transactions,
    expenses,
    customers,
    loyaltyAccounts,
    loyaltyTransactions,
    debts,
    promoCodes,
    employees,
    targets,
    onlineOrders,
    auditLogs,
    deletedRecords: [],
    offlineQueue: [],
    settings,
  };
}
