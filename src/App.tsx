import { useState } from 'react'
import { useStore } from './store'
import { cx, formatMoney } from './lib/utils'
import { sumExpenses } from './lib/analytics'
import { Toasts } from './components/ui'
import {
  IconChat,
  IconDashboard,
  IconGallery,
  IconList,
  IconMoon,
  IconPlus,
  IconSettings,
  IconSun,
  IconTags,
} from './components/Icons'
import Dashboard from './pages/Dashboard'
import Expenses from './pages/Expenses'
import Receipts from './pages/Receipts'
import Categories from './pages/Categories'
import Assistant from './pages/Assistant'
import SettingsPage from './pages/Settings'
import ExpenseFormModal from './components/ExpenseFormModal'
import OfflineBar from './components/OfflineBar'

export type Tab = 'dashboard' | 'expenses' | 'receipts' | 'categories' | 'assistant' | 'settings'

const NAV: Array<{ id: Tab; label: string; short: string; icon: typeof IconDashboard }> = [
  { id: 'dashboard', label: 'لوحة التحكم', short: 'الرئيسية', icon: IconDashboard },
  { id: 'expenses', label: 'المصاريف', short: 'المصاريف', icon: IconList },
  { id: 'receipts', label: 'الفواتير', short: 'الفواتير', icon: IconGallery },
  { id: 'assistant', label: 'المساعد الذكي', short: 'المساعد', icon: IconChat },
  { id: 'categories', label: 'البنود', short: 'البنود', icon: IconTags },
  { id: 'settings', label: 'الإعدادات', short: 'الإعدادات', icon: IconSettings },
]

export default function App() {
  const { settings, expenses, updateSettings } = useStore()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [addOpen, setAddOpen] = useState(false)

  const total = sumExpenses(expenses)
  const active = NAV.find((n) => n.id === tab)

  return (
    <div className="min-h-screen lg:flex">
      {/* ---------------- الشريط الجانبي (سطح المكتب) ---------------- */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-s border-ink-200 bg-white px-4 py-6 dark:border-ink-800 dark:bg-ink-900 lg:flex">
        <Brand projectName={settings.projectName} />

        <nav className="mt-7 flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const Icon = item.icon
            const isActive = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cx(
                  'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold transition',
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
                )}
              >
                <Icon />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="mt-4 rounded-2xl bg-ink-50 p-4 dark:bg-ink-950">
          <p className="text-xs font-bold text-ink-500 dark:text-ink-400">إجمالي المصروف</p>
          <p className="tnum mt-1 text-xl font-extrabold text-brand-700 dark:text-brand-300">
            {formatMoney(total, settings.currency)}
          </p>
          {settings.totalBudget > 0 && (
            <p className="tnum mt-1 text-xs text-ink-500 dark:text-ink-400">
              من أصل {formatMoney(settings.totalBudget, settings.currency)}
            </p>
          )}
        </div>
      </aside>

      {/* ---------------------- المحتوى الرئيسي ---------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBar />

        <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/85 backdrop-blur-md dark:border-ink-800 dark:bg-ink-900/85">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
            <div className="lg:hidden">
              <Brand projectName={settings.projectName} compact />
            </div>
            <h1 className="hidden text-lg font-extrabold lg:block">{active?.label}</h1>

            <div className="ms-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
                className="rounded-xl p-2.5 text-ink-500 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
                aria-label={settings.theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
              >
                {settings.theme === 'dark' ? <IconSun /> : <IconMoon />}
              </button>
              <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>
                <IconPlus width={18} height={18} />
                <span className="hidden sm:inline">إضافة مصروف</span>
                <span className="sm:hidden">إضافة</span>
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-10">
          {tab === 'dashboard' && <Dashboard onNavigate={setTab} onAdd={() => setAddOpen(true)} />}
          {tab === 'expenses' && <Expenses />}
          {tab === 'receipts' && <Receipts />}
          {tab === 'categories' && <Categories />}
          {tab === 'assistant' && <Assistant />}
          {tab === 'settings' && <SettingsPage />}
        </main>

        {/* ------------------ شريط التنقل السفلي (الجوال) ------------------ */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:border-ink-800 dark:bg-ink-900/95 lg:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-6">
            {NAV.map((item) => {
              const Icon = item.icon
              const isActive = tab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cx(
                    'flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-bold transition',
                    isActive ? 'text-brand-600 dark:text-brand-400' : 'text-ink-400 dark:text-ink-500',
                  )}
                >
                  <Icon width={21} height={21} />
                  {item.short}
                </button>
              )
            })}
          </div>
        </nav>
      </div>

      <ExpenseFormModal open={addOpen} onClose={() => setAddOpen(false)} />
      <Toasts />
    </div>
  )
}

function Brand({ projectName, compact }: { projectName: string; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg text-white shadow-sm">
        🏠
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold leading-tight">{projectName || 'حاسب التشطيب'}</p>
        {!compact && (
          <p className="text-[11px] font-semibold text-ink-400">إدارة مصاريف التشطيب</p>
        )}
      </div>
    </div>
  )
}
