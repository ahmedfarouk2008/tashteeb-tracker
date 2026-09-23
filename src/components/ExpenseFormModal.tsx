import { useEffect, useMemo, useState } from 'react'
import { useStore, type NewExpense } from '../store'
import type { Expense } from '../types'
import { UNITS } from '../lib/defaults'
import { findDuplicate } from '../lib/dedupe'
import { formatMoney, parseNumber, todayISO } from '../lib/utils'
import { Modal } from './ui'
import { IconAlert, IconLink } from './Icons'

interface Props {
  open: boolean
  onClose: () => void
  /** عند التمرير: الوضع تعديل بدل إضافة */
  expense?: Expense | null
  /** قيم ابتدائية عند الإضافة (مثلاً من فاتورة) */
  defaults?: Partial<NewExpense>
}

type FormState = {
  itemName: string
  categoryId: string
  unitCost: string
  quantity: string
  unit: string
  date: string
  vendor: string
  notes: string
  receiptId: string
  funderId: string
}

const emptyForm = (categoryId: string): FormState => ({
  itemName: '',
  categoryId,
  unitCost: '',
  quantity: '1',
  unit: 'قطعة',
  date: todayISO(),
  vendor: '',
  notes: '',
  receiptId: '',
  funderId: '',
})

export default function ExpenseFormModal({ open, onClose, expense = null, defaults }: Props) {
  const { categories, expenses, receipts, funders, addExpense, updateExpense, notify, settings } =
    useStore()
  const isEdit = Boolean(expense)

  const [form, setForm] = useState<FormState>(() => emptyForm(categories[0]?.id ?? ''))
  const [error, setError] = useState('')
  const [dupAck, setDupAck] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    setDupAck(false)
    if (expense) {
      setForm({
        itemName: expense.itemName,
        categoryId: expense.categoryId,
        unitCost: String(expense.unitCost),
        quantity: String(expense.quantity),
        unit: expense.unit,
        date: expense.date,
        vendor: expense.vendor ?? '',
        notes: expense.notes ?? '',
        receiptId: expense.receiptId ?? '',
        funderId: expense.funderId ?? '',
      })
    } else {
      setForm({ ...emptyForm(categories[0]?.id ?? ''), ...toFormState(defaults) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id])

  const unitCost = parseNumber(form.unitCost)
  const quantity = parseNumber(form.quantity)
  const total = unitCost * quantity

  /** تحذير التكرار يظهر مباشرة أثناء الكتابة */
  const duplicate = useMemo(() => {
    if (isEdit || !form.itemName.trim() || !unitCost) return null
    return findDuplicate(
      { itemName: form.itemName, date: form.date, unitCost, quantity },
      expenses,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.itemName, form.date, unitCost, quantity, expenses, isEdit])

  const duplicateExpense = duplicate ? expenses.find((e) => e.id === duplicate.expenseId) : null

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.itemName.trim()) return setError('اكتب اسم البند.')
    if (!form.categoryId) return setError('اختر التصنيف.')
    if (unitCost <= 0) return setError('أدخل سعر وحدة أكبر من صفر.')
    if (quantity <= 0) return setError('أدخل كمية أكبر من صفر.')
    if (!form.date) return setError('اختر تاريخ الصرف.')
    if (duplicate && !dupAck) {
      setError('هذا البند يبدو مكرراً — أكّد الإضافة من الصندوق البرتقالي بالأعلى.')
      return
    }

    const payload: NewExpense = {
      itemName: form.itemName.trim(),
      categoryId: form.categoryId,
      unitCost,
      quantity,
      unit: form.unit.trim() || 'قطعة',
      date: form.date,
      vendor: form.vendor.trim() || undefined,
      notes: form.notes.trim() || undefined,
      receiptId: form.receiptId || undefined,
      funderId: form.funderId || undefined,
      source: expense?.source ?? (form.receiptId ? 'hybrid' : 'manual'),
    }

    if (expense) {
      updateExpense(expense.id, payload)
      notify('تم تحديث البند')
    } else {
      addExpense(payload)
      notify('تمت إضافة المصروف')
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'تعديل المصروف' : 'إضافة مصروف جديد'}
      subtitle={isEdit ? undefined : 'سجّل ما دفعته يدوياً، أو اربطه بفاتورة مرفوعة.'}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" form="expense-form" className="btn-primary">
            {isEdit ? 'حفظ التعديلات' : 'إضافة المصروف'}
          </button>
        </>
      }
    >
      <form id="expense-form" onSubmit={submit} className="space-y-4">
        {duplicate && duplicateExpense && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3.5 dark:border-amber-500/40 dark:bg-amber-500/10">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 text-amber-600 dark:text-amber-400">
                <IconAlert />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-amber-800 dark:text-amber-200">
                  تنبيه تكرار محتمل
                </p>
                <p className="mt-1 text-xs leading-6 text-amber-700 dark:text-amber-300">
                  {duplicate.reason} — المسجّل بتاريخ {duplicateExpense.date} بقيمة{' '}
                  {formatMoney(duplicateExpense.unitCost * duplicateExpense.quantity, settings.currency)}.
                </p>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-200">
                  <input
                    type="checkbox"
                    checked={dupAck}
                    onChange={(e) => setDupAck(e.target.checked)}
                    className="h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  أعلم بذلك، أضِف البند على أي حال
                </label>
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="label" htmlFor="itemName">
            اسم البند *
          </label>
          <input
            id="itemName"
            className="field"
            value={form.itemName}
            onChange={(e) => set('itemName', e.target.value)}
            placeholder="مثال: سيراميك أرضيات 60×60"
            autoFocus
          />
        </div>

        <div>
          <label className="label">التصنيف *</label>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => set('categoryId', c.id)}
                className={
                  form.categoryId === c.id
                    ? 'chip border-2 text-white'
                    : 'chip border-2 border-transparent bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300'
                }
                style={
                  form.categoryId === c.id
                    ? { backgroundColor: c.color, borderColor: c.color }
                    : undefined
                }
              >
                <span>{c.icon}</span>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="unitCost">
              سعر الوحدة *
            </label>
            <input
              id="unitCost"
              className="field tnum"
              inputMode="decimal"
              value={form.unitCost}
              onChange={(e) => set('unitCost', e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="label" htmlFor="quantity">
              الكمية *
            </label>
            <input
              id="quantity"
              className="field tnum"
              inputMode="decimal"
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="unit">
              الوحدة
            </label>
            <input
              id="unit"
              className="field"
              list="units-list"
              value={form.unit}
              onChange={(e) => set('unit', e.target.value)}
            />
            <datalist id="units-list">
              {UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-brand-50 px-4 py-3 dark:bg-brand-500/10">
          <span className="text-sm font-bold text-brand-800 dark:text-brand-200">الإجمالي</span>
          <span className="tnum text-lg font-extrabold text-brand-700 dark:text-brand-300">
            {formatMoney(total || 0, settings.currency)}
          </span>
        </div>

        {funders.length > 0 && (
          <div>
            <label className="label">مصدر التمويل (يُخصم من رصيده)</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => set('funderId', '')}
                className={
                  form.funderId === ''
                    ? 'chip bg-ink-700 text-white dark:bg-ink-600'
                    : 'chip bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300'
                }
              >
                بدون
              </button>
              {funders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => set('funderId', f.id)}
                  className={
                    form.funderId === f.id
                      ? 'chip text-white'
                      : 'chip bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300'
                  }
                  style={form.funderId === f.id ? { backgroundColor: f.color } : undefined}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="date">
              التاريخ *
            </label>
            <input
              id="date"
              type="date"
              className="field tnum"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="vendor">
              المورد / المحل
            </label>
            <input
              id="vendor"
              className="field"
              value={form.vendor}
              onChange={(e) => set('vendor', e.target.value)}
              placeholder="اختياري"
            />
          </div>
        </div>

        {receipts.length > 0 && (
          <div>
            <label className="label" htmlFor="receiptId">
              <span className="inline-flex items-center gap-1.5">
                <IconLink width={14} height={14} /> ربط بفاتورة
              </span>
            </label>
            <select
              id="receiptId"
              className="field"
              value={form.receiptId}
              onChange={(e) => set('receiptId', e.target.value)}
            >
              <option value="">بدون فاتورة</option>
              {receipts.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.vendor ? `${r.vendor} — ` : ''}
                  {r.fileName} {r.date ? `(${r.date})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label" htmlFor="notes">
            ملاحظات
          </label>
          <textarea
            id="notes"
            className="field min-h-[84px] resize-y"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="تفاصيل إضافية: الماركة، المقاس، اسم الصنايعي..."
          />
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

function toFormState(defaults?: Partial<NewExpense>): Partial<FormState> {
  if (!defaults) return {}
  const out: Partial<FormState> = {}
  if (defaults.itemName != null) out.itemName = defaults.itemName
  if (defaults.categoryId) out.categoryId = defaults.categoryId
  if (defaults.unitCost != null) out.unitCost = String(defaults.unitCost)
  if (defaults.quantity != null) out.quantity = String(defaults.quantity)
  if (defaults.unit) out.unit = defaults.unit
  if (defaults.date) out.date = defaults.date
  if (defaults.vendor) out.vendor = defaults.vendor
  if (defaults.notes) out.notes = defaults.notes
  if (defaults.receiptId) out.receiptId = defaults.receiptId
  if (defaults.funderId) out.funderId = defaults.funderId
  return out
}
