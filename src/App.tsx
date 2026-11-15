import React, { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAppStore } from './store/useAppStore';
import { AuthScreen } from './components/AuthScreen';
import { Layout } from './components/Layout';
import { OnboardingWizard } from './components/OnboardingWizard';
import { BRAND_LOGO_SRC, BRAND_NAME } from './components/BrandLogo';
import { DashboardPage } from './pages/DashboardPage';
import { POSPage } from './pages/POSPage';
import { CatalogPage } from './pages/CatalogPage';
import { InventoryPage } from './pages/InventoryPage';
import { CustomersPage } from './pages/CustomersPage';
import { FinancePage } from './pages/FinancePage';
import { EmployeesPage } from './pages/EmployeesPage';
import { ReportsPage } from './pages/ReportsPage';
import { StorefrontPage } from './pages/StorefrontPage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { TransactionDetailPage } from './pages/TransactionDetailPage';
import { MenuPage } from './pages/MenuPage';

function AppRoutes() {
  const initialized = useAppStore((s) => s.initialized);
  const currentUser = useAppStore((s) => s.getCurrentUser());
  const can = useAppStore((s) => s.can);
  const [guestShop, setGuestShop] = useState(false);
  const navigate = useNavigate();

  if (!initialized) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
          className="text-center space-y-3"
        >
          <motion.img
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            src={BRAND_LOGO_SRC}
            alt={BRAND_NAME}
            className="w-16 h-16 rounded-full object-cover bg-white ring-2 ring-slate-200 dark:ring-slate-700 shadow-md mx-auto"
          />
          <div className="font-display text-sm font-bold tracking-tight text-slate-700 dark:text-slate-200">
            {BRAND_NAME} yuklanmoqda...
          </div>
        </motion.div>
      </div>
    );
  }

  if (!currentUser) {
    if (guestShop) {
      return <StorefrontPage publicStandalone onBackToLogin={() => setGuestShop(false)} />;
    }
    return <AuthScreen onOpenCatalog={() => setGuestShop(true)} />;
  }

  const defaultHomePath = can('view_dashboard')
    ? '/'
    : can('use_pos')
    ? '/pos'
    : can('view_catalog')
    ? '/catalog'
    : can('view_inventory')
    ? '/inventory'
    : '/menu';

  return (
    <>
      <OnboardingWizard onGoToPos={() => navigate('/pos')} />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={can('view_dashboard') ? <DashboardPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="pos" element={can('use_pos') ? <POSPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="catalog" element={can('view_catalog') ? <CatalogPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="transactions" element={can('use_pos') ? <TransactionsPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="transactions/:id" element={can('use_pos') ? <TransactionDetailPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="inventory" element={can('view_inventory') ? <InventoryPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="customers" element={can('view_customers') ? <CustomersPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="finance" element={can('view_finance') ? <FinancePage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="employees" element={can('view_employees') ? <EmployeesPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="reports" element={can('view_reports') ? <ReportsPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="storefront" element={<StorefrontPage />} />
          <Route path="settings" element={can('manage_settings') ? <SettingsPage /> : <Navigate to={defaultHomePath} replace />} />
          <Route path="*" element={<Navigate to={defaultHomePath} replace />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  const init = useAppStore((s) => s.init);
  const setOnline = useAppStore((s) => s.setOnline);

  useEffect(() => {
    init();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [init, setOnline]);

  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
