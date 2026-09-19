import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { Expense, MarketInsight, MarketVerdict } from '../types'
import { AiError, compareWithMarket } from '../lib/ai'
import { formatMoney, similarity, uid } from '../lib/utils'
import { Badge, Modal, Spinner } from './ui'
import { IconAlert, IconRefresh, IconSparkles } from './Icons'

const VERDICT: Record<MarketVerdict, { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }> = {
  good: { label: 'سعر ممتاز', tone: 'ok' },
  fair: { label: 'سعر معقول', tone: 'warn' },
  high: { label: 'أعلى من السوق', tone: 'danger' },
  unknown: { label: 'غير محدد', tone: 'neutral' },
}

/** الحد الأقصى للبنود في الطلب الواحد — يحافظ على دقة الرد وسرعته */
const MAX_ITEMS = 25

export default function MarketCompareModal({
  open,
  onClose,
  expenses,
}: {
  open: boolean
  onClose: () => void
  expenses: Expense[]
}) {
  const { categories, settings, insights, saveInsights, notify } = useStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<MarketInsight[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const batch = expenses.slice(0, MAX_ITEMS)

  const run = async () => {
    setLoading(true)
    setError('')
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const comparison = await compareWithMarket(batch, categories, settings, controller.signal)
      const now = new Date().toISOString()

      /* مطابقة نتائج الذكاء الاصطناعي بالبنود عن طريق تشابه الاسم */
      const mapped: MarketInsight[] = batch.map((expense, index) => {
        const match =
          comparison.find((c) => similarity(c.itemName, expense.itemName) > 0.7) ??
          comparison[index]
        return {
          id: uid('ins'),
          expenseId: expense.id,
          itemName: expense.itemName,
          paidUnitCost: expense.unitCost,
          marketLow: match?.marketLow ?? null,
          marketHigh: match?.marketHigh ?? null,
          verdict: match?.verdict ?? 'unknown',
          summary: match?.summary ?? 'تعذّر تقدير سعر السوق لهذا البند.',
          tips: match?.tips ?? [],
          createdAt: now,
        }
      })

      setResults(mapped)
      saveInsights(mapped)
      notify('تمت مقارنة الأسعار بالسوق')
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(err instanceof AiError ? err.message : 'حدث خطأ غير متوقع أثناء المقارنة.')
    } finally {
      setLoading(false)
    }
  }

  /* عرض النتائج المحفوظة سابقاً عند الفتح، وإلا تشغيل المقارنة */
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      return
    }
    const cached = batch
      .map((e) => insights.find((i) => i.expenseId === e.id))
      .filter(Boolean) as MarketInsight[]
    if (cached.length === batch.length && cached.length > 0) {
      setResults(cached)
      setError('')
    } else {
      setResults([])
      void run()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="مقارنة الأسعار بالسوق"
      subtitle={`تقدير تقريبي لأسعار ${settings.region} — ${batch.length} بند`}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            إغلاق
          </button>
          <button type="button" className="btn-outline" onClick={run} disabled={loading}>
            {loading ? <Spinner /> : <IconRefresh width={16} height={16} />}
            إعادة التحليل
          </button>
        </>
      }
    >
      {expenses.length > MAX_ITEMS && (
        <p className="mb-3 rounded-xl bg-brand-50 px-3.5 py-2.5 text-xs font-bold text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
          تتم مقارنة أول {MAX_ITEMS} بند فقط للحفاظ على دقة النتائج. حدّد بنوداً بعينها لمقارنة الباقي.
        </p>
      )}

      {loading && !results.length && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-2xl border border-ink-100 p-4 dark:border-ink-800">
              <div className="skeleton h-4 w-1/3" />
              <div className="skeleton h-3 w-2/3" />
              <div className="skeleton h-3 w-1/2" />
            </div>
          ))}
          <p className="text-center text-xs font-bold text-ink-400">
            جارٍ تحليل الأسعار مقابل متوسطات السوق...
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          <IconAlert />
          <span>{error}</span>
        </div>
      )}

      {!!results.length && (
        <div className="space-y-3">
          <Summary results={results} />
          {results.map((r) => {
            const v = VERDICT[r.verdict]
            const range =
              r.marketLow != null && r.marketHigh != null
                ? `${formatMoney(r.marketLow, settings.currency)} — ${formatMoney(r.marketHigh, settings.currency)}`
                : 'غير متاح'
            return (
              <article
                key={r.id}
                className="rounded-2xl border border-ink-100 p-4 dark:border-ink-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-sm font-extrabold">{r.itemName}</h3>
                  <Badge tone={v.tone}>{v.label}</Badge>
                </div>
                <div className="mt-2.5 grid gap-2 text-xs font-bold sm:grid-cols-2">
                  <p className="tnum rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-950">
                    سعرك للوحدة:{' '}
                    <span className="text-brand-700 dark:text-brand-300">
                      {formatMoney(r.paidUnitCost, settings.currency)}
                    </span>
                  </p>
                  <p className="tnum rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-950">
                    نطاق السوق: <span className="text-ink-600 dark:text-ink-300">{range}</span>
                  </p>
                </div>
                <p className="mt-2.5 text-sm leading-7 text-ink-600 dark:text-ink-300">{r.summary}</p>
                {r.tips.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {r.tips.map((tip, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-xs leading-6 text-ink-500 dark:text-ink-400"
                      >
                        <span className="text-brand-500">
                          <IconSparkles width={14} height={14} />
                        </span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            )
          })}
          <p className="pt-1 text-center text-[11px] font-semibold text-ink-400">
            التقديرات استرشادية من الذكاء الاصطناعي وقد تختلف عن السوق الفعلي — راجعها قبل اتخاذ قرار.
          </p>
        </div>
      )}
    </Modal>
  )
}

function Summary({ results }: { results: MarketInsight[] }) {
  const counts = results.reduce<Record<MarketVerdict, number>>(
    (acc, r) => ({ ...acc, [r.verdict]: acc[r.verdict] + 1 }),
    { good: 0, fair: 0, high: 0, unknown: 0 },
  )
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl bg-ink-50 p-3 dark:bg-ink-950">
      <Badge tone="ok">أسعار ممتازة: {counts.good}</Badge>
      <Badge tone="warn">معقولة: {counts.fair}</Badge>
      <Badge tone="danger">أعلى من السوق: {counts.high}</Badge>
      {counts.unknown > 0 && <Badge>غير محددة: {counts.unknown}</Badge>}
    </div>
  )
}
