import { useEffect, useRef, useState } from 'react'
import { useStore, type NewExpense } from '../store'
import type { ExtractedLine, Receipt } from '../types'
import { AiError, extractReceipt, onAiProgress, type AiProgress } from '../lib/ai'
import { compressImage } from '../lib/storage'
import { hashBlob, markDuplicates } from '../lib/dedupe'
import { distributeDiscount } from '../lib/analytics'
import { UNITS } from '../lib/defaults'
import { cx, formatBytes, formatMoney, formatNumber, parseNumber, todayISO, uid } from '../lib/utils'
import { Badge, Modal, Spinner } from './ui'
import { IconAlert, IconCamera, IconCheck, IconSparkles, IconTrash, IconUpload } from './Icons'

type Stage = 'pick' | 'scanning' | 'review'

export default function ReceiptScannerModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const {
    categories,
    expenses,
    receipts,
    funders,
    settings,
    addReceipt,
    updateReceipt,
    addExpenses,
    notify,
  } = useStore()

  const [stage, setStage] = useState<Stage>('pick')
  const [progress, setProgress] = useState<AiProgress | null>(null)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [lines, setLines] = useState<ExtractedLine[]>([])
  const [meta, setMeta] = useState<{
    vendor: string
    date: string
    /** المبلغ المدفوع فعلياً بعد الخصم */
    total: number | null
    /** قيمة الخصم المقروءة من الفاتورة */
    discount: number | null
  }>({ vendor: '', date: todayISO(), total: null, discount: null })
  /** توزيع الخصم على أسعار البنود بدل تسجيلها بالسعر الكامل */
  const [applyDiscount, setApplyDiscount] = useState(true)
  /** مصدر التمويل المطبَّق على كل بنود الفاتورة (الفاتورة يدفعها شخص واحد عادةً) */
  const [funderId, setFunderId] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  /* تقدّم إعادة المحاولة عند ازدحام الخدمة */
  useEffect(() => onAiProgress(setProgress), [])

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview)
    setStage('pick')
    setError('')
    setWarning('')
    setPreview(null)
    setReceipt(null)
    setLines([])
    setMeta({ vendor: '', date: todayISO(), total: null, discount: null })
    setApplyDiscount(true)
    setFunderId('')
  }

  const close = () => {
    // إيقاف أي تحليل جارٍ حتى لا تظهر نتيجة قديمة عند إعادة الفتح
    abortRef.current?.abort()
    abortRef.current = null
    reset()
    onClose()
  }

  useEffect(() => () => abortRef.current?.abort(), [])

  const handleFile = async (file: File) => {
    setError('')
    setWarning('')

    if (!file.type.startsWith('image/')) {
      setError('اختر صورة للفاتورة (JPG أو PNG أو WEBP).')
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('حجم الصورة كبير جداً (الحد 12 م.ب).')
      return
    }

    setStage('scanning')
    setProgress(null)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const blob = await compressImage(file)
      const hash = await hashBlob(blob)

      const twin = receipts.find((r) => r.hash === hash)
      if (twin) {
        setWarning(
          `سبق رفع هذه الفاتورة بنفس الصورة باسم «${twin.fileName}». البنود المكررة سيتم استبعادها تلقائياً.`,
        )
      }

      setPreview(URL.createObjectURL(blob))

      const result = await extractReceipt(blob, categories, settings, controller.signal)

      const savedReceipt = await addReceipt(file, blob, {
        hash,
        vendor: result.vendor,
        date: result.date,
        total: result.total,
        rawText: [result.vendor, result.notes, ...result.items.map((i) => i.itemName)]
          .filter(Boolean)
          .join(' | '),
      })
      setReceipt(savedReceipt)

      const fallbackCategory = categories.find((c) => c.id === 'cat_misc')?.id ?? categories[0]?.id ?? ''
      const date = result.date || todayISO()

      const extracted: ExtractedLine[] = result.items.map((item) => {
        /**
         * عمود «الإجمالي» في الفاتورة هو المرجع: بعض الموردين يخصمون على
         * بنود بعينها دون غيرها، فيكون الإجمالي أقل من (السعر × العدد).
         * نشتق منه سعر الوحدة الفعلي ونحتفظ بالسعر المعلن للمراجعة.
         */
        const printed = item.unitCost
        const gross = printed * item.quantity
        const hasLineDiscount =
          item.lineTotal != null && item.lineTotal > 0 && Math.abs(item.lineTotal - gross) > 0.01
        const effective = hasLineDiscount
          ? Math.round((item.lineTotal! / item.quantity) * 100) / 100
          : printed

        return {
        tempId: uid('line'),
        itemName: item.itemName,
        unitCost: effective,
        listUnitCost: hasLineDiscount ? printed : undefined,
        quantity: item.quantity,
        unit: item.unit || 'قطعة',
        date,
        categoryId: categories.some((c) => c.id === item.categoryHint)
          ? (item.categoryHint as string)
          : fallbackCategory,
        vendor: result.vendor,
        selected: true,
        edited: false,
        }
      })

      setMeta({
        vendor: result.vendor ?? '',
        date,
        total: result.total ?? null,
        discount: result.discount ?? null,
      })
      setLines(markDuplicates(extracted, expenses))
      setStage('review')

      if (!extracted.length) {
        setError('لم يتم العثور على بنود واضحة في الصورة. جرّب صورة أوضح أو أضف البنود يدوياً.')
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setStage('pick')
      setError(err instanceof AiError ? err.message : 'تعذّر تحليل الفاتورة. حاول مرة أخرى.')
    }
  }

  const patchLine = (tempId: string, patch: Partial<ExtractedLine>) =>
    setLines((ls) =>
      ls.map((l) => (l.tempId === tempId ? { ...l, ...patch, edited: l.edited || 'itemName' in patch || 'unitCost' in patch || 'quantity' in patch || 'unit' in patch || 'categoryId' in patch || 'date' in patch } : l)),
    )

  const removeLine = (tempId: string) => setLines((ls) => ls.filter((l) => l.tempId !== tempId))

  const addBlankLine = () =>
    setLines((ls) => [
      ...ls,
      {
        tempId: uid('line'),
        itemName: '',
        unitCost: 0,
        quantity: 1,
        unit: 'قطعة',
        date: meta.date,
        categoryId: categories[0]?.id ?? '',
        vendor: meta.vendor || undefined,
        selected: true,
        edited: true,
      },
    ])

  const selectedLines = lines.filter((l) => l.selected)
  const grossTotal = selectedLines.reduce((s, l) => s + l.unitCost * l.quantity, 0)
  const duplicateCount = lines.filter((l) => l.duplicateOf).length

  /**
   * الخصم يُحسب على البنود المحددة فقط، لأن المستخدم قد يستبعد بنوداً مكررة.
   * المرجع هو المبلغ المدفوع (total) لا قيمة الخصم، فهو الرقم المؤكد في الفاتورة.
   */
  /** بنود تحمل خصمها من الفاتورة نفسها (عمود الإجمالي) */
  const perLineDiscounts = lines.filter((l) => l.listUnitCost != null && l.listUnitCost > l.unitCost)

  /**
   * الخصم الإجمالي يُعرض فقط حين لا تحمل البنود خصمها أصلاً،
   * وإلا لخُصم مرتين. والمرجع هو إجمالي الفاتورة لا المبلغ المدفوع،
   * فالدفع الجزئي يترك «متبقياً» وليس خصماً.
   */
  const hasDiscount =
    perLineDiscounts.length === 0 &&
    meta.total != null &&
    meta.total > 0 &&
    grossTotal > 0 &&
    meta.total < grossTotal - 0.5
  const discountValue = hasDiscount ? grossTotal - (meta.total ?? 0) : 0
  const discounted = hasDiscount && applyDiscount
    ? distributeDiscount(selectedLines, meta.total ?? 0)
    : null
  const selectedTotal = discounted
    ? discounted.lines.reduce((s, l) => s + l.discountedUnitCost * l.quantity, 0)
    : grossTotal

  const confirmImport = () => {
    const valid = selectedLines.filter((l) => l.itemName.trim() && l.unitCost > 0 && l.quantity > 0)
    if (!valid.length) {
      setError('حدّد بنداً واحداً على الأقل باسم وسعر صحيحين.')
      return
    }

    // نُعيد حساب التوزيع على البنود الصالحة فقط حتى يطابق المجموع المدفوع
    const priced = hasDiscount && applyDiscount
      ? distributeDiscount(valid, meta.total ?? 0).lines
      : valid.map((l) => ({ ...l, discountedUnitCost: l.unitCost }))

    const payload: NewExpense[] = priced.map((l) => ({
      itemName: l.itemName.trim(),
      categoryId: l.categoryId,
      unitCost: l.discountedUnitCost,
      // السعر المعلن: من خصم السطر نفسه، أو من توزيع خصم إجمالي
      listUnitCost:
        l.listUnitCost ?? (l.discountedUnitCost !== l.unitCost ? l.unitCost : undefined),
      quantity: l.quantity,
      unit: l.unit || 'قطعة',
      date: l.date,
      vendor: (l.vendor || meta.vendor || '').trim() || undefined,
      notes: l.notes?.trim() || undefined,
      receiptId: receipt?.id,
      funderId: funderId || undefined,
      source: l.edited ? 'hybrid' : 'ocr',
    }))

    addExpenses(payload)
    if (receipt) {
      updateReceipt(receipt.id, {
        imported: true,
        vendor: meta.vendor || receipt.vendor,
        date: meta.date || receipt.date,
        total: meta.total ?? receipt.total,
      })
    }
    notify(
      hasDiscount && applyDiscount
        ? `تمت إضافة ${valid.length} بند بعد توزيع خصم ${formatMoney(discountValue, settings.currency)}`
        : `تمت إضافة ${valid.length} بند من الفاتورة`,
    )
    close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size={stage === 'review' ? 'xl' : 'md'}
      title="مسح فاتورة بالذكاء الاصطناعي"
      subtitle={
        stage === 'review'
          ? 'راجع البنود المستخرجة وعدّلها قبل الحفظ — المكرر مستبعَد تلقائياً.'
          : 'ارفع صورة الفاتورة ليقرأها التطبيق ويملأ البنود عنك.'
      }
      footer={
        stage === 'review' ? (
          <>
            <span className="tnum me-auto text-xs font-bold text-ink-500 dark:text-ink-400">
              {selectedLines.length} بند محدّد · {formatMoney(selectedTotal, settings.currency)}
            </span>
            <button type="button" className="btn-ghost" onClick={close}>
              إلغاء
            </button>
            <button type="button" className="btn-primary" onClick={confirmImport}>
              <IconCheck width={17} height={17} /> إضافة البنود المحددة
            </button>
          </>
        ) : undefined
      }
    >
      {/* ------------------------------ اختيار الملف ------------------------------ */}
      {stage === 'pick' && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files?.[0]
              if (f) void handleFile(f)
            }}
            className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-ink-200 px-6 py-10 text-center dark:border-ink-700"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10">
              <IconUpload width={26} height={26} />
            </span>
            <p className="text-sm font-extrabold">اسحب صورة الفاتورة هنا</p>
            <p className="max-w-sm text-xs leading-6 text-ink-500 dark:text-ink-400">
              يدعم JPG و PNG و WEBP حتى 12 م.ب. كلما كانت الصورة أوضح كانت القراءة أدق.
            </p>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}>
                <IconUpload width={17} height={17} /> اختيار صورة
              </button>
              <button type="button" className="btn-outline" onClick={() => cameraRef.current?.click()}>
                <IconCamera width={17} height={17} /> التقاط بالكاميرا
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void handleFile(f)
              }}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void handleFile(f)
              }}
            />
          </div>

          {!settings.apiKey && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-xs font-bold leading-6 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              <IconAlert width={16} height={16} />
              يلزم مفتاح Gemini API لتشغيل قراءة الفواتير. أضفه من صفحة «الإعدادات».
            </p>
          )}

          {error && (
            <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>
      )}

      {/* -------------------------------- التحليل -------------------------------- */}
      {stage === 'scanning' && (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          {preview && (
            <img
              src={preview}
              alt="معاينة الفاتورة"
              className="max-h-56 rounded-2xl border border-ink-200 object-contain dark:border-ink-700"
            />
          )}
          <span className="flex items-center gap-2 text-sm font-extrabold text-brand-600 dark:text-brand-300">
            <Spinner /> جارٍ قراءة الفاتورة...
          </span>
          <p className="max-w-xs text-xs leading-6 text-ink-500 dark:text-ink-400">
            {progress
              ? `الخدمة مزدحمة — إعادة المحاولة ${progress.attempt}/${progress.max} بعد ${progress.waitSeconds} ثانية...`
              : 'يتم استخراج الأصناف والأسعار والكميات والتاريخ. قد يستغرق ذلك بضع ثوانٍ.'}
          </p>
        </div>
      )}

      {/* -------------------------------- المراجعة ------------------------------- */}
      {stage === 'review' && (
        <div className="space-y-4">
          {warning && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-xs font-bold leading-6 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              <IconAlert width={16} height={16} /> {warning}
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div className="space-y-3">
              {preview && (
                <a href={preview} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={preview}
                    alt="الفاتورة"
                    className="w-full rounded-2xl border border-ink-200 object-cover dark:border-ink-700"
                  />
                </a>
              )}
              <div>
                <label className="label" htmlFor="r-vendor">المورد</label>
                <input
                  id="r-vendor"
                  className="field"
                  value={meta.vendor}
                  onChange={(e) => setMeta((m) => ({ ...m, vendor: e.target.value }))}
                  placeholder="اسم المحل"
                />
              </div>
              <div>
                <label className="label" htmlFor="r-date">تاريخ الفاتورة</label>
                <input
                  id="r-date"
                  type="date"
                  className="field tnum"
                  value={meta.date}
                  onChange={(e) => {
                    const date = e.target.value
                    setMeta((m) => ({ ...m, date }))
                    setLines((ls) => markDuplicates(ls.map((l) => ({ ...l, date })), expenses))
                  }}
                />
              </div>
              <div>
                <label className="label" htmlFor="r-total">
                  إجمالي الفاتورة بعد الخصم
                </label>
                <input
                  id="r-total"
                  className="field tnum"
                  inputMode="decimal"
                  value={meta.total ?? ''}
                  onChange={(e) =>
                    setMeta((m) => ({
                      ...m,
                      total: e.target.value ? parseNumber(e.target.value) : null,
                    }))
                  }
                  placeholder="اتركه فارغاً لو لا يوجد خصم"
                />
                <p className="mt-1.5 text-[11px] font-semibold leading-6 text-ink-400">
                  ليس المبلغ المدفوع — «المتبقي» في الفاتورة دَين لم يُسدَّد بعد ولا يقلّل التكلفة.
                </p>
              </div>

              {perLineDiscounts.length > 0 && (
                <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-[11px] font-bold leading-6 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
                  الفاتورة تحمل خصماً على {formatNumber(perLineDiscounts.length)} بند — قُرئت
                  أسعارها من عمود «الإجمالي» كما هي، والبنود بلا خصم بقيت بسعرها الكامل.
                </p>
              )}

              {hasDiscount && (
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-500/40 dark:bg-emerald-500/10">
                  <p className="tnum text-[11px] font-bold leading-6 text-emerald-800 dark:text-emerald-200">
                    مجموع البنود: {formatMoney(grossTotal, settings.currency)}
                    <br />
                    الخصم: {formatMoney(discountValue, settings.currency)} (
                    {formatNumber((discountValue / grossTotal) * 100)}%)
                  </p>
                  <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] font-bold leading-6 text-emerald-900 dark:text-emerald-100">
                    <input
                      type="checkbox"
                      checked={applyDiscount}
                      onChange={(e) => setApplyDiscount(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
                    />
                    وزّع الخصم على أسعار البنود — فتُسجَّل بسعرها الفعلي المدفوع
                  </label>
                </div>
              )}
              {funders.length > 0 && (
                <div>
                  <label className="label">مصدر التمويل لكل البنود</label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFunderId('')}
                      className={
                        funderId === ''
                          ? 'chip bg-ink-700 text-white dark:bg-ink-600'
                          : 'chip bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300'
                      }
                    >
                      بدون
                    </button>
                    {funders.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFunderId(f.id)}
                        className={
                          funderId === f.id
                            ? 'chip text-white'
                            : 'chip bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300'
                        }
                        style={funderId === f.id ? { backgroundColor: f.color } : undefined}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {receipt && (
                <p className="text-[11px] font-semibold text-ink-400">
                  {receipt.fileName} · {formatBytes(receipt.size)}
                </p>
              )}
            </div>

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">
                  <IconSparkles width={13} height={13} /> {lines.length} بند مقروء
                </Badge>
                {duplicateCount > 0 && (
                  <Badge tone="warn">{duplicateCount} بند مشتبه في تكراره (غير محدّد)</Badge>
                )}
                <button type="button" className="btn-ghost btn-sm ms-auto" onClick={addBlankLine}>
                  + بند يدوي
                </button>
              </div>

              {lines.map((line) => (
                <LineRow
                  key={line.tempId}
                  line={line}
                  discountFactor={discounted && line.selected ? discounted.factor : 1}
                  currency={settings.currency}
                  categories={categories}
                  onPatch={(patch) => patchLine(line.tempId, patch)}
                  onRemove={() => removeLine(line.tempId)}
                />
              ))}

              {!lines.length && (
                <p className="rounded-xl bg-ink-50 px-4 py-6 text-center text-sm font-bold text-ink-500 dark:bg-ink-950 dark:text-ink-400">
                  لم تُقرأ أي بنود — أضف بنداً يدوياً أو أغلق النافذة وجرّب صورة أوضح.
                </p>
              )}

              {error && (
                <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function LineRow({
  line,
  categories,
  currency,
  discountFactor,
  onPatch,
  onRemove,
}: {
  line: ExtractedLine
  categories: { id: string; name: string; icon: string; color: string }[]
  currency: string
  /** 1 = بلا خصم، أقل من ذلك = نسبة السعر بعد توزيع الخصم */
  discountFactor: number
  onPatch: (patch: Partial<ExtractedLine>) => void
  onRemove: () => void
}) {
  const isDuplicate = Boolean(line.duplicateOf)
  return (
    <div
      className={cx(
        'rounded-2xl border p-3 transition',
        isDuplicate
          ? 'border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/5'
          : line.selected
            ? 'border-brand-200 bg-white dark:border-brand-500/30 dark:bg-ink-900'
            : 'border-ink-200 bg-ink-50/60 dark:border-ink-700 dark:bg-ink-950/40',
      )}
    >
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={line.selected}
          onChange={(e) => onPatch({ selected: e.target.checked })}
          className="mt-2.5 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          aria-label="تحديد البند"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <input
            className="field py-2 text-sm font-bold"
            value={line.itemName}
            onChange={(e) => onPatch({ itemName: e.target.value })}
            placeholder="اسم البند"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input
              className="field tnum py-2 text-sm"
              inputMode="decimal"
              value={line.unitCost || ''}
              onChange={(e) => onPatch({ unitCost: parseNumber(e.target.value) })}
              placeholder="سعر الوحدة"
              aria-label="سعر الوحدة"
            />
            <input
              className="field tnum py-2 text-sm"
              inputMode="decimal"
              value={line.quantity || ''}
              onChange={(e) => onPatch({ quantity: parseNumber(e.target.value) })}
              placeholder="الكمية"
              aria-label="الكمية"
            />
            <input
              className="field py-2 text-sm"
              list="units-list-ocr"
              value={line.unit}
              onChange={(e) => onPatch({ unit: e.target.value })}
              placeholder="الوحدة"
              aria-label="الوحدة"
            />
            <select
              className="field py-2 text-sm"
              value={line.categoryId}
              onChange={(e) => onPatch({ categoryId: e.target.value })}
              aria-label="التصنيف"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>
          <datalist id="units-list-ocr">
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>

          <div className="flex flex-wrap items-center gap-2">
            {line.listUnitCost != null && line.listUnitCost > line.unitCost ? (
              <span className="flex items-center gap-1.5">
                <span className="tnum text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                  {formatMoney(line.unitCost * line.quantity, currency)}
                </span>
                <span className="tnum text-[10px] font-bold text-ink-400 line-through">
                  {formatMoney(line.listUnitCost * line.quantity, currency)}
                </span>
              </span>
            ) : discountFactor < 1 ? (
              <span className="flex items-center gap-1.5">
                <span className="tnum text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                  {formatMoney(
                    Math.round(line.unitCost * discountFactor * 100) / 100 * line.quantity,
                    currency,
                  )}
                </span>
                <span className="tnum text-[10px] font-bold text-ink-400 line-through">
                  {formatMoney(line.unitCost * line.quantity, currency)}
                </span>
              </span>
            ) : (
              <span className="tnum text-xs font-extrabold text-brand-700 dark:text-brand-300">
                {formatMoney(line.unitCost * line.quantity, currency)}
              </span>
            )}
            {line.edited && <Badge>معدّل يدوياً</Badge>}
            {isDuplicate && <Badge tone="warn">مكرر: {line.duplicateReason}</Badge>}
            <button
              type="button"
              onClick={onRemove}
              className="ms-auto rounded-lg p-1.5 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
              aria-label="حذف السطر"
            >
              <IconTrash width={16} height={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
