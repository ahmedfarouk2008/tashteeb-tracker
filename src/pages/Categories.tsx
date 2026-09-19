import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Category } from '../types'
import { categoryStats } from '../lib/analytics'
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../lib/defaults'
import { cx, formatMoney, formatNumber, parseNumber } from '../lib/utils'
import { Badge, ConfirmDialog, Modal, ProgressBar } from '../components/ui'
import { IconEdit, IconPlus, IconTrash } from '../components/Icons'

export default function Categories() {
  const { categories, expenses, settings, addCategory, updateCategory, deleteCategory, notify } =
    useStore()

  const [editing, setEditing] = useState<Category | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [moveTo, setMoveTo] = useState('')

  const stats = useMemo(() => categoryStats(expenses, categories), [expenses, categories])
  const totalPlanned = categories.reduce((s, c) => s + (c.plannedBudget ?? 0), 0)
  const totalActual = stats.reduce((s, c) => s + c.total, 0)

  const affected = deleting ? expenses.filter((e) => e.categoryId === deleting.id).length : 0

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-extrabold">بنود التشطيب</h2>
          <p className="tnum mt-0.5 text-xs text-ink-500 dark:text-ink-400">
            المخطط {formatMoney(totalPlanned, settings.currency)} · الفعلي{' '}
            {formatMoney(totalActual, settings.currency)}
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          <IconPlus width={17} height={17} /> بند جديد
        </button>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {stats.map((s) => {
          const over = s.planned > 0 && s.total > s.planned
          return (
            <li key={s.category.id} className="card p-4">
              <div className="flex items-start gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl"
                  style={{ backgroundColor: `${s.category.color}22` }}
                >
                  {s.category.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-extrabold">{s.category.name}</h3>
                      <p className="tnum mt-0.5 text-[11px] font-semibold text-ink-400">
                        {formatNumber(s.count)} بند · {formatNumber(s.share * 100)}% من الإجمالي
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(s.category)}
                        className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-brand-600 dark:hover:bg-ink-800"
                        aria-label={`تعديل ${s.category.name}`}
                      >
                        <IconEdit width={16} height={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleting(s.category)
                          setMoveTo(categories.find((c) => c.id !== s.category.id)?.id ?? '')
                        }}
                        disabled={categories.length <= 1}
                        className="rounded-lg p-1.5 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 dark:hover:bg-rose-500/10"
                        aria-label={`حذف ${s.category.name}`}
                      >
                        <IconTrash width={16} height={16} />
                      </button>
                    </div>
                  </div>

                  <p className="tnum mt-2 text-lg font-extrabold" style={{ color: s.category.color }}>
                    {formatMoney(s.total, settings.currency)}
                  </p>

                  {s.planned > 0 ? (
                    <div className="mt-2">
                      <ProgressBar value={s.total / s.planned} tone={over ? 'danger' : 'ok'} />
                      <p className="tnum mt-1.5 text-[11px] font-bold text-ink-500 dark:text-ink-400">
                        المخطط {formatMoney(s.planned, settings.currency)} ·{' '}
                        <span className={over ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                          {over
                            ? `تجاوز ${formatMoney(-s.variance, settings.currency)}`
                            : `متبقٍ ${formatMoney(s.variance, settings.currency)}`}
                        </span>
                      </p>
                    </div>
                  ) : (
                    <Badge className="mt-2">بلا ميزانية مخططة</Badge>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <CategoryFormModal
        open={creating || !!editing}
        category={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSave={(values) => {
          if (editing) {
            updateCategory(editing.id, values)
            notify('تم تحديث البند')
          } else {
            addCategory(values)
            notify('تمت إضافة البند')
          }
          setCreating(false)
          setEditing(null)
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        title={`حذف بند «${deleting?.name ?? ''}»`}
        confirmLabel="حذف البند"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting && moveTo) {
            deleteCategory(deleting.id, moveTo)
            notify('تم حذف البند ونقل مصاريفه', 'info')
          }
          setDeleting(null)
        }}
      >
        <div className="space-y-3">
          <p className="text-sm leading-7 text-ink-600 dark:text-ink-300">
            {affected > 0
              ? `يوجد ${formatNumber(affected)} مصروف مرتبط بهذا البند. اختر البند الذي ستُنقل إليه حتى لا تفقد أي بيانات.`
              : 'لا توجد مصاريف مرتبطة بهذا البند.'}
          </p>
          <div>
            <label className="label" htmlFor="move-to">
              نقل المصاريف إلى
            </label>
            <select
              id="move-to"
              className="field"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
            >
              {categories
                .filter((c) => c.id !== deleting?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </ConfirmDialog>
    </div>
  )
}

function CategoryFormModal({
  open,
  category,
  onClose,
  onSave,
}: {
  open: boolean
  category: Category | null
  onClose: () => void
  onSave: (values: Omit<Category, 'id' | 'createdAt'>) => void
}) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(CATEGORY_ICONS[0])
  const [color, setColor] = useState(CATEGORY_COLORS[0])
  const [budget, setBudget] = useState('')
  const [error, setError] = useState('')
  const [key, setKey] = useState('')

  /* إعادة التهيئة عند فتح النافذة على بند مختلف */
  const openKey = `${open}:${category?.id ?? 'new'}`
  if (key !== openKey) {
    setKey(openKey)
    setName(category?.name ?? '')
    setIcon(category?.icon ?? CATEGORY_ICONS[0])
    setColor(category?.color ?? CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)])
    setBudget(category?.plannedBudget ? String(category.plannedBudget) : '')
    setError('')
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('اكتب اسم البند.')
    onSave({
      name: name.trim(),
      icon,
      color,
      plannedBudget: budget ? parseNumber(budget) : undefined,
      nameEn: category?.nameEn,
      isSystem: category?.isSystem,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={category ? 'تعديل البند' : 'بند جديد'}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" form="category-form" className="btn-primary">
            حفظ
          </button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="cat-name">
            اسم البند *
          </label>
          <input
            id="cat-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: تكييفات"
            autoFocus
          />
        </div>

        <div>
          <span className="label">الأيقونة</span>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_ICONS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                className={cx(
                  'flex h-9 w-9 items-center justify-center rounded-xl text-lg transition',
                  icon === i
                    ? 'bg-brand-600 ring-2 ring-brand-300'
                    : 'bg-ink-100 hover:bg-ink-200 dark:bg-ink-800 dark:hover:bg-ink-700',
                )}
              >
                {i}
              </button>
            ))}
          </div>
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
                  color === c && 'ring-2 ring-offset-2 ring-ink-900 dark:ring-white dark:ring-offset-ink-900',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="cat-budget">
            الميزانية المخططة (اختياري)
          </label>
          <input
            id="cat-budget"
            className="field tnum"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="0"
          />
          <p className="mt-1.5 text-[11px] font-semibold text-ink-400">
            تُستخدم في حساب الفرق بين المخطط والفعلي في لوحة التحكم.
          </p>
        </div>

        {error && (
          <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
