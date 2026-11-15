import React from 'react';
import { motion } from 'motion/react';

export const BRAND_LOGO_SRC = '/assets/aistudio/IMG_20261007_140535_653_64e97dff.jpg';
export const BRAND_NAME = 'SHU BREND OMBOR';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  subtitle?: string;
  animate?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-12 h-12',
  xl: 'w-20 h-20',
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showText = false,
  subtitle,
  animate = false,
  className = '',
}) => {
  const imgEl = (
    <img
      src={BRAND_LOGO_SRC}
      alt={BRAND_NAME}
      className={`${SIZE_MAP[size]} rounded-full object-cover bg-white ring-1 ring-slate-200 dark:ring-slate-700 shadow-xs shrink-0`}
    />
  );

  return (
    <div className={`inline-flex items-center gap-2.5 min-w-0 ${className}`}>
      {animate ? (
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          whileHover={{ scale: 1.05 }}
          className="shrink-0"
        >
          {imgEl}
        </motion.div>
      ) : (
        imgEl
      )}
      {showText && (
        <div className="min-w-0">
          <span className="block font-display text-sm sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap truncate">
            {BRAND_NAME}
          </span>
          {subtitle && (
            <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
