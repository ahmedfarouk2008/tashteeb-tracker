import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Expense } from '../types'
import { EMPTY_FILTERS, filterExpenses, lineTotal, sumExpenses, toCsv, type Filters } from '../lib/analytics'
import { cx, downloadFile, formatMoney, formatNumber, todayISO } from '../lib/utils'
import { Badge, ConfirmDialog, EmptyState } from '../components/ui'
import {
  IconDownload,
  IconEdit,
  IconFilter,
  IconList,
  IconSearch,
  IconSparkles,
  IconTrash,
} from '../components/Icons'
import ExpenseFormModal from '../components/ExpenseFormModal'
import MarketCompareModal from '../components/MarketCompareModal'

export default function Expenses() {
  const { expenses, categories, receipts, settings, deleteExpense, insights, notify } = useStore()

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState<Expense | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)

  const visible = useMemo(
    () => filterExpenses(expenses, filters, categories, receipts),
    [expenses, filters, categories, receipts],
  )
  const visibleTotal = sumExpenses(visible)

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }))

  const toggleCategory = (id: string) =>
    setFilters((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id)
        ? f.categoryIds.filter((c) => c !== id)
        : [...f.categoryIds, id],
    }))

  const toggleSelect = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const activeFilterCount =
    (filters.categoryIds.length ? 1 : 0) +
    (filters.from || filters.to ? 1 : 0) +
    (filters.minCost || filters.maxCost ? 1 : 0) +
    (filters.onlyWithReceipt ? 1 : 0)

  const compareTargets = selected.length
    ? expenses.filter((e) => selected.includes(e.id))
    : visible

  const exportCsv = () => {
    if (!visible.length) return
    downloadFile(
      toCsv(visible, categories),
      `مصاريف-التشطيب-${todayISO()}.csv`,
      'text/csv',
    )
    notify('تم تصدير الملف')
  }

  if (!expenses.length) {
    return (
      <EmptyState
        icon={<IconList width={26} height={26} />}
        title="لا توجد مصاريف بعد"
        description="أضف أول مصروف من زر «إضافة مصروف» بالأعلى، أو ارفع صورة فاتورة من صفحة الفواتير."
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* ------------------------------ البحث ------------------------------ */}
      <div className="card p-3.5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-ink-400">
              <IconSearch width={18} height={18} />
            </span>
            <input
              className="field ps-10"
              placeholder="ابحث في البنود والملاحظات والموردين والفواتير..."
              value={filters.query}
              onChange={(e) => set('query', e.target.value)}
              aria-label="بحث"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={cx(
              'btn relative shrink-0 px-3',
              showFilters || activeFilterCount
                ? 'bg-brand-600 text-white'
                : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
            )}
            aria-label="تصفية"
          >
            <IconFilter width={18} height={18} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -start-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-extrabold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 space-y-4 border-t border-ink-100 pt-4 dark:border-ink-800">
            <div>
              <span className="label">التصنيفات</span>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => {
                  const on = filters.categoryIds.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCategory(c.id)}
                      className={cx(
                        'chip border',
                        on
                          ? 'border-transparent text-white'
                          : 'border-ink-200 bg-white text-ink-600 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300',
                      )}
                      style={on ? { backgroundColor: c.color } : undefined}
                    >
                      {c.icon} {c.name}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label" htmlFor="f-from">من تاريخ</label>
                <input id="f-from" type="date" className="field tnum" value={filters.from} onChange={(e) => set('from', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="f-to">إلى تاريخ</label>
                <input id="f-to" type="date" className="field tnum" value={filters.to} onChange={(e) => set('to', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="f-min">أقل إجمالي</label>
                <input id="f-min" inputMode="decimal" className="field tnum" value={filters.minCost} onChange={(e) => set('minCost', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="label" htmlFor="f-max">أعلى إجمالي</label>
                <input id="f-max" inputMode="decimal" className="field tnum" value={filters.maxCost} onChange={(e) => set('maxCost', e.target.value)} placeholder="∞" />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[180px] flex-1">
                <label className="label" htmlFor="f-sort">الترتيب</label>
                <select
                  id="f-sort"
                  className="field"
                  value={filters.sort}
                  onChange={(e) => set('sort', e.target.value as Filters['sort'])}
                >
                  <option value="date-desc">الأحدث أولاً</option>
                  <option value="date-asc">الأقدم أولاً</option>
                  <option value="cost-desc">الأعلى تكلفة</option>
                  <option value="cost-asc">الأقل تكلفة</option>
                  <option value="name-asc">حسب الاسم</option>
                </select>
              </div>
              <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-xs font-bold">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                  checked={filters.onlyWithReceipt}
                  onChange={(e) => set('onlyWithReceipt', e.target.checked)}
                />
                المرتبط بفاتورة فقط
              </label>
              <button
                type="button"
                className="btn-ghost btn-sm pb-2 pt-2"
                onClick={() => setFilters({ ...EMPTY_FILTERS, query: filters.query })}
              >
                مسح التصفية
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ----------------------------- شريط الإجراءات ----------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="tnum me-auto text-sm font-bold text-ink-600 dark:text-ink-300">
          {formatNumber(visible.length)} بند ·{' '}
          <span className="text-brand-700 dark:text-brand-300">
            {formatMoney(visibleTotal, settings.currency)}
          </span>
          {selected.length > 0 && (
            <span className="ms-2 text-xs font-bold text-ink-400">({selected.length} محدّد)</span>
          )}
        </p>

        {selected.length > 0 && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setSelected([])}>
            إلغاء التحديد
          </button>
        )}
        <button type="button" className="btn-outline btn-sm" onClick={exportCsv}>
          <IconDownload width={15} height={15} /> تصدير CSV
        </button>
        <button
          type="button"
          className="btn-primary btn-sm"
          onClick={() => setCompareOpen(true)}
          disabled={!compareTargets.length}
        >
          <IconSparkles width={15} height={15} />
          مقارنة بالسوق {selected.length > 0 ? `(${selected.length})` : ''}
        </button>
      </div>

      {/* -------------------------------- القائمة -------------------------------- */}
      {visible.length === 0 ? (
        <EmptyState
          icon={<IconSearch width={26} height={26} />}
          title="لا توجد نتائج مطابقة"
          description="جرّب كلمات بحث أخرى أو امسح عوامل التصفية."
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((e) => {
            const cat = categories.find((c) => c.id === e.categoryId)
            const receipt = e.receiptId ? receipts.find((r) => r.id === e.receiptId) : null
            const insight = insights.find((i) => i.expenseId === e.id)
            const isSelected = selected.includes(e.id)

            return (
              <li
                key={e.id}
                className={cx(
                  'card p-3.5 transition',
                  isSelected && 'ring-2 ring-brand-500',
                )}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(e.id)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                    aria-label={`تحديد ${e.itemName}`}
                  />
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                    style={{ backgroundColor: `${cat?.color ?? '#8591a8'}1f` }}
                  >
                    {cat?.icon ?? '📦'}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <h3 className="text-sm font-extrabold">{e.itemName}</h3>
                      <span className="tnum text-sm font-extrabold text-brand-700 dark:text-brand-300">
                        {formatMoney(lineTotal(e), settings.currency)}
                      </span>
                    </div>

                    <p className="tnum mt-1 text-[11px] font-semibold text-ink-400">
                      {e.date} · {cat?.name ?? '—'} · {formatNumber(e.quantity)} {e.unit} ×{' '}
                      {formatMoney(e.unitCost, settings.currency)}
                      {e.vendor && ` · ${e.vendor}`}
                    </p>

                    {e.notes && (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-6 text-ink-500 dark:text-ink-400">
                        {e.notes}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {e.source !== 'manual' && (
                        <Badge tone="info">{e.source === 'ocr' ? 'من فاتورة' : 'فاتورة + تعديل'}</Badge>
                      )}
                      {receipt && <Badge>📎 {receipt.fileName}</Badge>}
                      {insight && (
                        <Badge
                          tone={
                            insight.verdict === 'good'
                              ? 'ok'
                              : insight.verdict === 'high'
                                ? 'danger'
                                : insight.verdict === 'fair'
                                  ? 'warn'
                                  : 'neutral'
                          }
                        >
                          {insight.verdict === 'good'
                            ? 'أقل من السوق'
                            : insight.verdict === 'high'
                              ? 'أعلى من السوق'
                              : insight.verdict === 'fair'
                                ? 'سعر معقول'
                                : 'بلا تقييم'}
                        </Badge>
                      )}

                      <div className="ms-auto flex gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(e)}
                          className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-brand-600 dark:hover:bg-ink-800"
                          aria-label="تعديل"
                        >
                          <IconEdit width={17} height={17} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(e)}
                          className="rounded-lg p-1.5 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                          aria-label="حذف"
                        >
                          <IconTrash width={17} height={17} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ExpenseFormModal open={!!editing} expense={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={!!deleting}
        title="حذف المصروف"
        message={`سيتم حذف «${deleting?.itemName ?? ''}» نهائياً. لا يمكن التراجع عن هذه الخطوة.`}
        confirmLabel="حذف"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            deleteExpense(deleting.id)
            setSelected((s) => s.filter((id) => id !== deleting.id))
            notify('تم حذف البند', 'info')
          }
          setDeleting(null)
        }}
      />

      <MarketCompareModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        expenses={compareTargets}
      />
    </div>
  )
}
