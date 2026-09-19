import { Suspense, lazy, useMemo } from 'react'
import { useStore } from '../store'
import type { Tab } from '../App'
import { categoryStats, lineTotal, monthlyStats, sumExpenses } from '../lib/analytics'
import { clamp, formatMoney, formatNumber } from '../lib/utils'
import { EmptyState, ProgressBar } from '../components/ui'
import { IconChart, IconPlus, IconWallet } from '../components/Icons'

const DashboardCharts = lazy(() => import('../components/DashboardCharts'))

export default function Dashboard({
  onNavigate,
  onAdd,
}: {
  onNavigate: (tab: Tab) => void
  onAdd: () => void
}) {
  const { expenses, categories, receipts, settings } = useStore()

  const total = sumExpenses(expenses)
  const stats = useMemo(() => categoryStats(expenses, categories), [expenses, categories])
  const active = stats.filter((s) => s.count > 0)
  const months = useMemo(() => monthlyStats(expenses), [expenses])

  const planned = categories.reduce((s, c) => s + (c.plannedBudget ?? 0), 0)
  const budget = settings.totalBudget || planned
  const remaining = budget - total
  const usage = budget > 0 ? total / budget : 0

  const recent = useMemo(
    () =>
      [...expenses]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6),
    [expenses],
  )

  if (!expenses.length) {
    return (
      <div className="space-y-5">
        <EmptyState
          icon={<IconWallet width={26} height={26} />}
          title="ابدأ بتسجيل أول مصروف"
          description="سجّل مصاريفك يدوياً أو ارفع صورة فاتورة ليقرأها الذكاء الاصطناعي ويملأ البيانات عنك."
          action={
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-primary" onClick={onAdd}>
                <IconPlus width={18} height={18} /> إضافة مصروف
              </button>
              <button type="button" className="btn-outline" onClick={() => onNavigate('receipts')}>
                رفع فاتورة
              </button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* --------------------------- بطاقات الملخص --------------------------- */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="إجمالي المصروف"
          value={formatMoney(total, settings.currency)}
          hint={`${formatNumber(expenses.length)} بند مسجّل`}
          tone="brand"
        />
        <SummaryCard
          label="الميزانية المخططة"
          value={budget > 0 ? formatMoney(budget, settings.currency) : 'غير محددة'}
          hint={budget > 0 ? `مستهلك ${formatNumber(usage * 100)}%` : 'حدّدها من الإعدادات'}
          tone="neutral"
        />
        <SummaryCard
          label={budget <= 0 || remaining >= 0 ? 'المتبقي من الميزانية' : 'تجاوز الميزانية'}
          value={budget > 0 ? formatMoney(Math.abs(remaining), settings.currency) : '—'}
          hint={budget > 0 ? (remaining >= 0 ? 'ضمن الحدود' : 'راجع البنود الأعلى صرفاً') : 'حدّد ميزانية للمتابعة'}
          tone={budget > 0 ? (remaining >= 0 ? 'ok' : 'danger') : 'neutral'}
        />
        <SummaryCard
          label="أعلى بند صرفاً"
          value={active[0] ? `${active[0].category.icon} ${active[0].category.name}` : '—'}
          hint={active[0] ? formatMoney(active[0].total, settings.currency) : ' '}
          tone="warn"
        />
      </section>

      {/* ------------------------- شريط تقدم الميزانية ------------------------ */}
      {budget > 0 && (
        <section className="card p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-extrabold">استهلاك الميزانية</h2>
            <span className="tnum text-xs font-bold text-ink-500 dark:text-ink-400">
              {formatMoney(total, settings.currency)} / {formatMoney(budget, settings.currency)}
            </span>
          </div>
          <ProgressBar value={usage} tone={usage > 0.9 ? 'warn' : 'brand'} />
          <p className="mt-2.5 text-xs text-ink-500 dark:text-ink-400">
            {remaining >= 0
              ? `تبقّى ${formatMoney(remaining, settings.currency)} — استهلكت ${formatNumber(clamp(usage, 0, 99) * 100)}% من الميزانية.`
              : `تجاوزت الميزانية بمقدار ${formatMoney(-remaining, settings.currency)}.`}
          </p>
        </section>
      )}

      {/* ------------------------------ الرسوم ------------------------------ */}
      <Suspense
        fallback={
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="skeleton h-80" />
            <div className="skeleton h-80" />
          </div>
        }
      >
        <DashboardCharts stats={active} months={months} currency={settings.currency} />
      </Suspense>

      {/* ---------------------- المخطط مقابل الفعلي ---------------------- */}
      <section className="card overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
          <h2 className="text-sm font-extrabold">المخطط مقابل الفعلي</h2>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => onNavigate('categories')}
          >
            تعديل الميزانيات
          </button>
        </header>
        <div className="divide-y divide-ink-100 dark:divide-ink-800">
          {stats.filter((s) => s.count > 0 || s.planned > 0).map((s) => {
            const over = s.planned > 0 && s.total > s.planned
            return (
              <div key={s.category.id} className="px-5 py-3.5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: s.category.color }}
                    />
                    {s.category.icon} {s.category.name}
                  </span>
                  <span className="tnum text-xs font-bold text-ink-500 dark:text-ink-400">
                    {formatMoney(s.total, settings.currency)}
                    {s.planned > 0 && ` / ${formatMoney(s.planned, settings.currency)}`}
                  </span>
                </div>
                {s.planned > 0 ? (
                  <>
                    <ProgressBar value={s.total / s.planned} tone={over ? 'danger' : 'ok'} />
                    <p
                      className={`mt-1.5 text-[11px] font-bold ${
                        over ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {over
                        ? `تجاوز بمقدار ${formatMoney(s.total - s.planned, settings.currency)}`
                        : `متبقٍ ${formatMoney(s.planned - s.total, settings.currency)}`}
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] font-bold text-ink-400">
                    لم تُحدّد ميزانية لهذا البند — {formatNumber(s.share * 100)}% من إجمالي الصرف
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ----------------------------- آخر الحركات ---------------------------- */}
      <section className="card overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
          <h2 className="text-sm font-extrabold">آخر المصاريف</h2>
          <button type="button" className="btn-ghost btn-sm" onClick={() => onNavigate('expenses')}>
            عرض الكل
          </button>
        </header>
        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
          {recent.map((e) => {
            const cat = categories.find((c) => c.id === e.categoryId)
            return (
              <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base"
                  style={{ backgroundColor: `${cat?.color ?? '#8591a8'}1f` }}
                >
                  {cat?.icon ?? '📦'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{e.itemName}</p>
                  <p className="tnum text-[11px] text-ink-400">
                    {e.date} · {cat?.name ?? '—'} · {formatNumber(e.quantity)} {e.unit}
                  </p>
                </div>
                <span className="tnum shrink-0 text-sm font-extrabold">
                  {formatMoney(lineTotal(e), settings.currency)}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      {receipts.length > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-ink-400">
          <IconChart width={14} height={14} />
          {formatNumber(receipts.length)} فاتورة محفوظة في الأرشيف
        </p>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone: 'brand' | 'ok' | 'warn' | 'danger' | 'neutral'
}) {
  const tones = {
    brand: 'from-brand-500 to-brand-700 text-white',
    ok: 'from-emerald-500 to-emerald-700 text-white',
    warn: 'from-amber-500 to-orange-600 text-white',
    danger: 'from-rose-500 to-rose-700 text-white',
    neutral: '',
  }

  if (tone === 'neutral') {
    return (
      <div className="card p-4">
        <p className="text-xs font-bold text-ink-500 dark:text-ink-400">{label}</p>
        <p className="tnum mt-1.5 truncate text-xl font-extrabold">{value}</p>
        {hint && <p className="mt-1 truncate text-[11px] font-semibold text-ink-400">{hint}</p>}
      </div>
    )
  }

  return (
    <div className={`rounded-2xl bg-gradient-to-br p-4 shadow-card ${tones[tone]}`}>
      <p className="text-xs font-bold opacity-85">{label}</p>
      <p className="tnum mt-1.5 truncate text-xl font-extrabold">{value}</p>
      {hint && <p className="mt-1 truncate text-[11px] font-semibold opacity-80">{hint}</p>}
    </div>
  )
}
