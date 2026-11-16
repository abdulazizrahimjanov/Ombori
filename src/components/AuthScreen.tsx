import React, { useState } from 'react';
import { Phone, Lock, ArrowRight, Globe, Sun, Moon, Store as StoreIcon, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '../store/useAppStore';
import { useT } from '../i18n';
import { PWAInstallButton } from './PWAInstallButton';
import { BRAND_LOGO_SRC, BRAND_NAME } from './BrandLogo';

export const AuthScreen: React.FC<{ onOpenCatalog?: () => void }> = ({ onOpenCatalog }) => {
  const loginWithPhone = useAppStore((s) => s.loginWithPhone);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const t = useT();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await loginWithPhone(phone, password);
      if (!res.ok) {
        setError(res.error || t.auth.invalidCredentials);
      }
    } catch {
      setError(t.auth.invalidCredentials);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-teal-50/40 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 flex flex-col justify-between p-4 md:p-8">
      {/* Subtle animated ambient background accents */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.35, 0.5, 0.35] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-28 -right-24 w-80 h-80 rounded-full bg-teal-400/15 dark:bg-teal-500/10 blur-3xl"
        />
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.25, 0.4, 0.25] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute -bottom-28 -left-24 w-80 h-80 rounded-full bg-red-500/10 dark:bg-red-500/10 blur-3xl"
        />
      </div>

      {/* Top Navigation Bar */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative z-10 flex items-center justify-between max-w-6xl w-full mx-auto gap-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          <img
            src={BRAND_LOGO_SRC}
            alt={BRAND_NAME}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover bg-white ring-1 ring-slate-200 dark:ring-slate-700 shadow-xs shrink-0"
          />
          <span className="font-display text-xs sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            {BRAND_NAME}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onOpenCatalog && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              type="button"
              onClick={onOpenCatalog}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap transition-colors shadow-2xs"
            >
              <StoreIcon className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span className="hidden xs:inline sm:inline">{t.nav.storefront}</span>
            </motion.button>
          )}
          <PWAInstallButton />
          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={() => setLanguage(language === 'uz' ? 'ru' : 'uz')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-2xs"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{language.toUpperCase()}</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-2xs"
            aria-label="Theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </motion.button>
        </div>
      </motion.header>

      {/* Centered Login Card */}
      <main className="relative z-10 w-full max-w-md mx-auto my-8">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-900/5 dark:shadow-black/40"
        >
          {/* Official Brand Logo Hero */}
          <div className="flex flex-col items-center text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 240, damping: 18, delay: 0.08 }}
              className="relative"
            >
              <div className="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-red-500/20 via-teal-500/20 to-slate-400/20 blur-md" />
              <img
                src={BRAND_LOGO_SRC}
                alt={BRAND_NAME}
                className="relative w-20 h-20 rounded-full object-cover bg-white ring-2 ring-slate-200 dark:ring-slate-700 shadow-md"
              />
            </motion.div>

            <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              {language === 'uz' ? 'Chakana savdo va ombor tizimi' : 'Система розничной торговли и склада'}
            </span>
            <h1 className="mt-1.5 font-display text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {t.auth.loginTitle}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.auth.loginSubtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t.auth.phone}
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white dark:focus:bg-slate-900 transition-all"
                  placeholder="+998889260404 yoki login"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t.auth.password} / PIN-kod
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 pl-10 pr-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white dark:focus:bg-slate-900 transition-all"
                  placeholder="•••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -6, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -6, height: 0 }}
                  className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-3.5 py-2.5"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-gradient-to-r from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-md shadow-teal-700/20 transition-all cursor-pointer"
            >
              <span>{loading ? t.common.loading : t.auth.signIn}</span>
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </form>
        </motion.div>
      </main>

      <footer className="relative z-10 text-center text-xs text-slate-400 dark:text-slate-500">
        {BRAND_NAME} · {language === 'uz' ? "O'zbekiston chakana savdo tizimi" : 'Система розничной торговли'}
      </footer>
    </div>
  );
};
