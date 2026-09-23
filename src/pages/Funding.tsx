import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Funder } from '../types'
import { funderStats, lineTotal, sumExpenses, unassignedExpenses } from '../lib/analytics'
import { CATEGORY_COLORS } from '../lib/defaults'
import { cx, formatMoney, formatNumber, parseNumber } from '../lib/utils'
import { Badge, ConfirmDialog, Modal, ProgressBar } from '../components/ui'
import { IconAlert, IconEdit, IconPlus, IconTrash, IconWallet } from '../components/Icons'

/** صفحة مصادر التمويل: احتياطي كل شخص وما صُرف منه وما تبقّى */
export default function Funding() {
  const { funders, expenses, categories, settings, deleteFunder, updateExpense, notify } = useStore()

  const [editing, setEditing] = useState<Funder | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Funder | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const stats = useMemo(() => funderStats(expenses, funders), [expenses, funders])
  const unassigned = useMemo(() => unassignedExpenses(expenses, funders), [expenses, funders])

  const totalReserve = stats.reduce((s, f) => s + f.reserve, 0)
  const totalSpent = stats.reduce((s, f) => s + f.spent, 0)
  const totalRemaining = totalReserve - totalSpent

  return (
    <div className="space-y-4">
      {/* ------------------------- الملخص العام ------------------------- */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-4 text-white shadow-card">
          <p className="text-xs font-bold opacity-85">إجمالي الاحتياطي</p>
          <p className="tnum mt-1.5 text-xl font-extrabold">
            {formatMoney(totalReserve, settings.currency)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold text-ink-500 dark:text-ink-400">المسحوب</p>
          <p className="tnum mt-1.5 text-xl font-extrabold">
            {formatMoney(totalSpent, settings.currency)}
          </p>
        </div>
        <div
          className={cx(
            'rounded-2xl bg-gradient-to-br p-4 text-white shadow-card',
            totalRemaining >= 0 ? 'from-emerald-500 to-emerald-700' : 'from-rose-500 to-rose-700',
          )}
        >
          <p className="text-xs font-bold opacity-85">
            {totalRemaining >= 0 ? 'المتبقي' : 'تجاوز الاحتياطي'}
          </p>
          <p className="tnum mt-1.5 text-xl font-extrabold">
            {formatMoney(Math.abs(totalRemaining), settings.currency)}
          </p>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <h2 className="me-auto text-sm font-extrabold">أرصدة المموّلين</h2>
        <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}>
          <IconPlus width={15} height={15} /> مصدر تمويل
        </button>
      </div>

      {/* ------------------------- بطاقات الأشخاص ------------------------- */}
      {funders.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm font-bold text-ink-500 dark:text-ink-400">
            لا توجد مصادر تمويل. أضف شخصاً وحدّد احتياطيه ليُخصم منه ما يُصرف.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {stats.map((s) => {
            const over = s.remaining < 0
            const items = expenses.filter((e) => e.funderId === s.funder.id)
            const isOpen = openId === s.funder.id

            return (
              <li key={s.funder.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold text-white"
                    style={{ backgroundColor: s.funder.color }}
                  >
                    {s.funder.name.trim().charAt(0) || '؟'}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-extrabold">{s.funder.name}</h3>
                        <p className="tnum mt-0.5 text-[11px] font-semibold text-ink-400">
                          {formatNumber(s.count)} مصروف
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(s.funder)}
                          className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-brand-600 dark:hover:bg-ink-800"
                          aria-label={`تعديل ${s.funder.name}`}
                        >
                          <IconEdit width={16} height={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(s.funder)}
                          className="rounded-lg p-1.5 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                          aria-label={`حذف ${s.funder.name}`}
                        >
                          <IconTrash width={16} height={16} />
                        </button>
                      </div>
                    </div>

                    <p
                      className="tnum mt-2 text-2xl font-extrabold"
                      style={{ color: over ? '#e11d48' : s.funder.color }}
                    >
                      {formatMoney(Math.abs(s.remaining), settings.currency)}
                    </p>
                    <p className="text-[11px] font-bold text-ink-500 dark:text-ink-400">
                      {over ? 'تجاوز الاحتياطي' : 'المتبقي من احتياطيه'}
                    </p>

                    {s.reserve > 0 && (
                      <div className="mt-2.5">
                        <ProgressBar value={s.spent / s.reserve} tone={over ? 'danger' : 'ok'} />
                      </div>
                    )}

                    <div className="tnum mt-2 grid grid-cols-2 gap-2 text-[11px] font-bold">
                      <span className="rounded-lg bg-ink-50 px-2 py-1.5 dark:bg-ink-950">
                        الاحتياطي: {formatMoney(s.reserve, settings.currency)}
                      </span>
                      <span className="rounded-lg bg-ink-50 px-2 py-1.5 dark:bg-ink-950">
                        المسحوب: {formatMoney(s.spent, settings.currency)}
                      </span>
                    </div>

                    {items.length > 0 && (
                      <button
                        type="button"
                        className="btn-ghost btn-sm mt-2.5 w-full"
                        onClick={() => setOpenId(isOpen ? null : s.funder.id)}
                      >
                        {isOpen ? 'إخفاء المصاريف' : `عرض مصاريفه (${formatNumber(items.length)})`}
                      </button>
                    )}

                    {isOpen && (
                      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                        {items
                          .slice()
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((e) => (
                            <li
                              key={e.id}
                              className="flex items-center gap-2 rounded-lg bg-ink-50 px-2.5 py-2 dark:bg-ink-950"
                            >
                              <span className="text-sm">
                                {categories.find((c) => c.id === e.categoryId)?.icon ?? '📦'}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[11px] font-bold">{e.itemName}</p>
                                <p className="tnum text-[10px] text-ink-400">{e.date}</p>
                              </div>
                              <span className="tnum text-[11px] font-extrabold">
                                {formatMoney(lineTotal(e), settings.currency)}
                              </span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* --------------------- مصاريف بلا مصدر تمويل --------------------- */}
      {unassigned.length > 0 && (
        <section className="card p-4">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 text-amber-500">
              <IconAlert width={18} height={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-extrabold">
                {formatNumber(unassigned.length)} مصروف بلا مصدر تمويل
              </h3>
              <p className="tnum mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                بقيمة {formatMoney(sumExpenses(unassigned), settings.currency)} — لم تُخصم من رصيد
                أحد.
              </p>
              {funders.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="text-[11px] font-bold text-ink-500 dark:text-ink-400">
                    اخصمها كلها من:
                  </span>
                  {funders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="chip text-white"
                      style={{ backgroundColor: f.color }}
                      onClick={() => {
                        unassigned.forEach((e) => updateExpense(e.id, { funderId: f.id }))
                        notify(`تم خصم ${unassigned.length} مصروف من رصيد ${f.name}`)
                      }}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <FunderFormModal
        open={creating || !!editing}
        funder={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        title={`حذف «${deleting?.name ?? ''}»`}
        message="سيُحذف مصدر التمويل، وتبقى مصاريفه مسجّلة لكن بلا مصدر — يمكنك إسنادها لشخص آخر بعدها."
        confirmLabel="حذف"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            deleteFunder(deleting.id)
            notify('تم حذف مصدر التمويل', 'info')
          }
          setDeleting(null)
        }}
      />
    </div>
  )
}

function FunderFormModal({
  open,
  funder,
  onClose,
}: {
  open: boolean
  funder: Funder | null
  onClose: () => void
}) {
  const { addFunder, updateFunder, settings, notify } = useStore()
  const [name, setName] = useState('')
  const [reserve, setReserve] = useState('')
  const [color, setColor] = useState(CATEGORY_COLORS[0])
  const [error, setError] = useState('')
  const [key, setKey] = useState('')

  /* إعادة التهيئة عند فتح النافذة على شخص مختلف */
  const openKey = `${open}:${funder?.id ?? 'new'}`
  if (key !== openKey) {
    setKey(openKey)
    setName(funder?.name ?? '')
    setReserve(funder?.reserve ? String(funder.reserve) : '')
    setColor(funder?.color ?? CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)])
    setError('')
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('اكتب الاسم.')

    const values = { name: name.trim(), reserve: parseNumber(reserve), color }
    if (funder) {
      updateFunder(funder.id, values)
      notify('تم تحديث مصدر التمويل')
    } else {
      addFunder(values)
      notify('تمت إضافة مصدر التمويل')
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={funder ? `تعديل «${funder.name}»` : 'مصدر تمويل جديد'}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" form="funder-form" className="btn-primary">
            حفظ
          </button>
        </>
      }
    >
      <form id="funder-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="funder-name">
            الاسم *
          </label>
          <input
            id="funder-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: أحمد"
            autoFocus
          />
        </div>

        <div>
          <label className="label" htmlFor="funder-reserve">
            المبلغ الاحتياطي
          </label>
          <input
            id="funder-reserve"
            className="field tnum"
            inputMode="decimal"
            value={reserve}
            onChange={(e) => setReserve(e.target.value)}
            placeholder="0"
          />
          <p className="mt-1.5 text-[11px] font-semibold leading-6 text-ink-400">
            إجمالي ما وضعه هذا الشخص. كلما أضاف مبلغاً جديداً، زِد هذا الرقم —
            والمصاريف المسجّلة عليه تُخصم منه تلقائياً.
          </p>
        </div>

        <div>
          <span className="label">اللون</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`اللون ${c}`}
                className={cx(
                  'h-8 w-8 rounded-full transition',
                  color === c &&
                    'ring-2 ring-offset-2 ring-ink-900 dark:ring-white dark:ring-offset-ink-900',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {funder && (
          <Badge tone="info">
            <IconWallet width={13} height={13} /> العملة: {settings.currency}
          </Badge>
        )}

        {error && (
          <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
