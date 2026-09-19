import type { AppData, Category, Settings } from '../types'

export const CURRENT_VERSION = 1

/** بنود التشطيب الأساسية المعدّة مسبقاً */
export const DEFAULT_CATEGORIES: Omit<Category, 'createdAt'>[] = [
  { id: 'cat_plumbing', name: 'السباكة', nameEn: 'Plumbing', icon: '🚿', color: '#3381fb', isSystem: true },
  { id: 'cat_electrical', name: 'الكهرباء', nameEn: 'Electrical Work', icon: '💡', color: '#f5a524', isSystem: true },
  { id: 'cat_tiling', name: 'السيراميك والبورسلين', nameEn: 'Tiling & Flooring', icon: '🧱', color: '#17b26a', isSystem: true },
  { id: 'cat_plaster', name: 'المحارة', nameEn: 'Plastering', icon: '🪣', color: '#a879f7', isSystem: true },
  { id: 'cat_paint', name: 'النقاشة والدهانات', nameEn: 'Painting & Finishes', icon: '🎨', color: '#ef4b6b', isSystem: true },
  { id: 'cat_gypsum', name: 'الجبسبورد والديكورات', nameEn: 'Gypsum Board & Ceiling Decor', icon: '🏛️', color: '#06b6d4', isSystem: true },
  { id: 'cat_carpentry', name: 'النجارة والأبواب', nameEn: 'Carpentry & Doors', icon: '🚪', color: '#b45309', isSystem: true },
  { id: 'cat_aluminum', name: 'الألوميتال والـ PVC', nameEn: 'Aluminum & PVC Fixtures', icon: '🪟', color: '#64748b', isSystem: true },
  { id: 'cat_labor', name: 'العمالة والصنايعية', nameEn: 'Labor & Contractor Payouts', icon: '👷', color: '#0ea5e9', isSystem: true },
  { id: 'cat_misc', name: 'مصاريف أخرى', nameEn: 'Miscellaneous', icon: '📦', color: '#8591a8', isSystem: true },
]

export const CATEGORY_COLORS = [
  '#3381fb', '#f5a524', '#17b26a', '#a879f7', '#ef4b6b',
  '#06b6d4', '#b45309', '#64748b', '#0ea5e9', '#8591a8',
  '#d946ef', '#14b8a6', '#eab308', '#f97316', '#6366f1',
]

export const CATEGORY_ICONS = [
  '🚿', '💡', '🧱', '🪣', '🎨', '🏛️', '🚪', '🪟', '👷', '📦',
  '🔧', '🪜', '🧰', '🛁', '🛋️', '🪞', '🔩', '📐', '🧴', '🚧',
]

export const UNITS = [
  'قطعة',
  'متر',
  'متر مربع',
  'متر مكعب',
  'شيكارة',
  'لتر',
  'كيلو',
  'طن',
  'يومية',
  'مقطوعية',
  'لفة',
  'علبة',
]

export const DEFAULT_SETTINGS: Settings = {
  projectName: 'تشطيب الشقة',
  currency: 'ج.م',
  totalBudget: 0,
  apiKey: '',
  model: 'gemini-3.6-flash',
  region: 'مصر — القاهرة الكبرى',
  theme: 'light',
}

export function createInitialData(): AppData {
  const now = new Date().toISOString()
  return {
    version: CURRENT_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, createdAt: now })),
    expenses: [],
    receipts: [],
    chat: [],
    insights: [],
  }
}
