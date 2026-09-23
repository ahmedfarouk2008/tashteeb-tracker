import type { Category, ChatMessage, Expense, MarketVerdict, OcrResult, Settings } from '../types'
import { fileToBase64 } from './storage'
import { formatMoney, parseNumber, todayISO } from './utils'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

/** النموذج الافتراضي — يمكن تغييره من الإعدادات بعد جلب النماذج المتاحة للحساب */
export const DEFAULT_MODEL = 'gemini-3.6-flash'

export class AiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiError'
  }
}

interface Part {
  text?: string
  inlineData?: { mimeType: string; data: string }
}

interface CallOptions {
  settings: Settings
  system: string
  parts: Part[]
  json?: boolean
  temperature?: number
  signal?: AbortSignal
}

/** أكواد تُعاد المحاولة عندها: ازدحام مؤقت أو خطأ عابر في الخادم */
const RETRYABLE = new Set([429, 500, 502, 503, 504])
/** عدد المحاولات على النموذج الأساسي قبل التفكير في بديل */
const MAX_ATTEMPTS = 4
/** محاولات إضافية على النموذج الأساسي حين لا توجد نماذج بديلة للحساب */
const SOLO_MODEL_ATTEMPTS = 3
/** أقصى عدد نماذج بديلة تُجرَّب عند استمرار الازدحام */
const MAX_FALLBACKS = 3

/** خطأ عابر — يستدعي إعادة المحاولة أو تجربة نموذج بديل */
class TransientError extends AiError {
  constructor(message: string) {
    super(message)
    this.name = 'TransientError'
  }
}

/** يُطلق عند التحويل التلقائي لنموذج آخر، ليحفظه المتجر ويُعلم المستخدم */
export const MODEL_FALLBACK_EVENT = 'ai:model-fallback'

export interface AiProgress {
  /** رقم المحاولة الحالية */
  attempt: number
  /** إجمالي المحاولات على هذا النموذج */
  max: number
  model: string
  /** ثوانٍ الانتظار قبل المحاولة التالية */
  waitSeconds: number
}

type ProgressListener = (info: AiProgress) => void
const progressListeners = new Set<ProgressListener>()

/** الاشتراك في تقدّم المحاولات لعرضه للمستخدم بدل انتظار صامت */
export function onAiProgress(fn: ProgressListener): () => void {
  progressListeners.add(fn)
  return () => progressListeners.delete(fn)
}

function emitProgress(info: AiProgress) {
  progressListeners.forEach((fn) => fn(info))
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })

/** تباعد متزايد مع تشويش بسيط لتفادي ازدحام المحاولات */
function backoffDelay(attempt: number): number {
  return Math.round(1000 * 1.8 ** (attempt - 1) * (1 + Math.random() * 0.3))
}

function transientMessage(status: number): string {
  if (status === 429) {
    return 'تم تجاوز الحد المسموح من الطلبات على مفتاحك. انتظر دقيقة ثم أعد المحاولة.'
  }
  return `خوادم الخدمة مزدحمة حالياً (${status}).`
}

async function waitBeforeRetry(
  attempt: number,
  max: number,
  model: string,
  signal?: AbortSignal,
) {
  const delay = backoffDelay(attempt)
  emitProgress({ attempt: attempt + 1, max, model, waitSeconds: Math.ceil(delay / 1000) })
  await sleep(delay, signal)
}

/** نداء نموذج واحد مع إعادة المحاولة عند الأخطاء العابرة */
async function callModel(
  model: string,
  { settings, system, parts, json = false, temperature = 0.3, signal }: CallOptions,
  maxAttempts = MAX_ATTEMPTS,
): Promise<string> {
  const key = settings.apiKey.trim()
  let lastTransient: TransientError | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response
    try {
      res = await fetch(`${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature,
            maxOutputTokens: 4096,
            ...(json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
      lastTransient = new TransientError('تعذّر الاتصال بالخدمة. تأكد من اتصالك بالإنترنت.')
      if (attempt < maxAttempts) {
        await waitBeforeRetry(attempt, maxAttempts, model, signal)
        continue
      }
      throw lastTransient
    }

    if (!res.ok) {
      let detail = ''
      try {
        detail = (await res.json())?.error?.message ?? ''
      } catch {
        /* تجاهل */
      }

      if (RETRYABLE.has(res.status)) {
        lastTransient = new TransientError(transientMessage(res.status))
        if (attempt < maxAttempts) {
          await waitBeforeRetry(attempt, maxAttempts, model, signal)
          continue
        }
        throw lastTransient
      }

      if (res.status === 400 && /api key/i.test(detail)) {
        throw new AiError('مفتاح الـ API غير صالح. راجع الإعدادات.')
      }
      if (res.status === 403) throw new AiError('المفتاح مرفوض أو غير مُفعّل لهذه الخدمة.')
      if (res.status === 404) {
        // نموذج غير موجود — يُعامل كعابر ليجرّب البديل تلقائياً
        throw new TransientError(`النموذج «${model}» غير متاح لحسابك.`)
      }
      throw new AiError(`فشل الطلب (${res.status})${detail ? `: ${detail}` : ''}`)
    }

    const data = await res.json()
    if (data?.promptFeedback?.blockReason) {
      throw new AiError('تم رفض الطلب من الخدمة. جرّب صياغة أخرى أو صورة أوضح.')
    }

    const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: Part) => p.text ?? '')
      .join('')
      .trim()

    if (text) return text

    lastTransient = new TransientError('لم تصل إجابة من الخدمة.')
    if (attempt < maxAttempts) {
      await waitBeforeRetry(attempt, maxAttempts, model, signal)
      continue
    }
    throw lastTransient
  }

  throw lastTransient ?? new AiError('تعذّر إتمام الطلب. أعد المحاولة.')
}

/** ذاكرة مؤقتة لقائمة النماذج حتى لا تُطلب مع كل نداء */
let modelCache: { ids: string[]; at: number } | null = null
const MODEL_CACHE_MS = 10 * 60 * 1000

/** ترتيب البدائل: الأخف أولاً لأنه الأقل ازدحاماً عادةً */
function rankModel(id: string): number {
  if (/flash-lite/i.test(id)) return 0
  if (/flash/i.test(id)) return 1
  if (/pro/i.test(id)) return 2
  return 3
}

async function fallbackModels(settings: Settings, exclude: string): Promise<string[]> {
  try {
    const now = Date.now()
    if (!modelCache || now - modelCache.at > MODEL_CACHE_MS) {
      const list = await listModels(settings)
      modelCache = { ids: list.map((m) => m.id), at: now }
    }
    return modelCache.ids
      .filter((id) => id !== exclude && !/preview|exp|thinking/i.test(id))
      .sort((a, b) => rankModel(a) - rankModel(b) || b.localeCompare(a, 'en'))
      .slice(0, MAX_FALLBACKS)
  } catch {
    return []
  }
}

/**
 * نداء موحّد لواجهة Gemini:
 * 1) إعادة محاولة بتباعد متزايد على النموذج المختار.
 * 2) عند استمرار الازدحام: تحويل تلقائي لنموذج بديل متاح للحساب.
 */
async function callGemini(options: CallOptions): Promise<string> {
  const { settings } = options
  if (!settings.apiKey.trim()) {
    throw new AiError('لم يتم ضبط مفتاح الذكاء الاصطناعي. افتح «الإعدادات» وأضف مفتاح Gemini API.')
  }

  // بدون إنترنت لا فائدة من المحاولات — أبلغ المستخدم فوراً
  if (!navigator.onLine) {
    throw new AiError(
      'أنت بدون إنترنت حالياً. تسجيل المصاريف والتقارير تعمل بدون اتصال، أما قراءة الفواتير والمساعد الذكي فتحتاج اتصالاً.',
    )
  }

  const primary = settings.model || DEFAULT_MODEL

  try {
    return await callModel(primary, options)
  } catch (err) {
    if (!(err instanceof TransientError)) throw err

    const alternatives = await fallbackModels(settings, primary)

    // لا بديل متاح للحساب — الانتظار الأطول هو الخيار الوحيد
    if (!alternatives.length) {
      try {
        return await callModel(primary, options, SOLO_MODEL_ATTEMPTS)
      } catch (solo) {
        if ((solo as Error).name === 'AbortError') throw solo
        throw new AiError(
          `${err.message} حسابك لا يتيح سوى النموذج «${primary}»، وقد حاولنا ${MAX_ATTEMPTS + SOLO_MODEL_ATTEMPTS} مرات. أعد المحاولة بعد دقائق قليلة.`,
        )
      }
    }

    for (const model of alternatives) {
      try {
        const text = await callModel(model, options, 1)
        // نجح البديل — أبلغ التطبيق ليحفظه ويُعلم المستخدم
        window.dispatchEvent(new CustomEvent(MODEL_FALLBACK_EVENT, { detail: model }))
        return text
      } catch (inner) {
        if ((inner as Error).name === 'AbortError') throw inner
        if (!(inner instanceof TransientError)) throw inner
      }
    }

    throw new AiError(
      `${err.message} جرّبنا أيضاً ${alternatives.length ? `${alternatives.length} نموذجاً بديلاً` : 'إعادة الاتصال'} دون نجاح — أعد المحاولة بعد دقائق قليلة.`,
    )
  }
}

/** استخراج JSON من ردّ قد يحتوي على أسوار كود */
function parseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const start = cleaned.search(/[[{]/)
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
    if (start > -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T
      } catch {
        /* يسقط للخطأ بالأسفل */
      }
    }
    throw new AiError('وصل ردّ غير مفهوم من الذكاء الاصطناعي. أعد المحاولة.')
  }
}

/* ------------------------------------------------------------------ */
/* 1) قراءة الفواتير (OCR)                                             */
/* ------------------------------------------------------------------ */

export async function extractReceipt(
  blob: Blob,
  categories: Category[],
  settings: Settings,
  signal?: AbortSignal,
): Promise<OcrResult> {
  const base64 = await fileToBase64(blob)
  const catList = categories.map((c) => `${c.id} = ${c.name}`).join('\n')

  const system = `أنت مساعد متخصص في قراءة فواتير وإيصالات مواد البناء والتشطيب في مصر.
مهمتك استخراج بنود الفاتورة من الصورة بدقة عالية وإرجاعها بصيغة JSON فقط دون أي شرح.

قواعد مُلزِمة:
- اقرأ الأسماء كما هي مكتوبة بالعربية، وصحّح الأخطاء الإملائية الواضحة فقط.
- حوّل كل الأرقام العربية (٠١٢٣) إلى أرقام لاتينية (0123).
- "unitCost" هو سعر الوحدة الواحدة وليس الإجمالي. إذا كانت الفاتورة تعرض الإجمالي فقط فاقسمه على الكمية.
- إذا لم تُذكر الكمية فاعتبرها 1.
- التاريخ بصيغة YYYY-MM-DD. إذا لم يظهر تاريخ في الفاتورة اترك الحقل فارغاً.
- لا تُكرّر نفس السطر مرتين، ولا تُدرج الإجماليات أو الضريبة أو الخصم كبنود.

أعمدة الفاتورة (مهم جداً):
- "unitCost" = عمود «السعر» كما هو مكتوب أمام البند (سعر الوحدة قبل أي خصم).
- "lineTotal" = عمود «الإجمالي» أو «القيمة» المكتوب في نهاية السطر، انسخه كما هو
  ولا تحسبه بنفسك. كثير من الفواتير تطبّق خصماً على بعض البنود دون غيرها، فيكون
  الإجمالي أقل من (السعر × العدد) في تلك البنود فقط. هذا العمود هو المرجع الحقيقي
  للتكلفة. إذا لم يوجد عمود إجمالي اترك lineTotal فارغاً.

الإجماليات في أسفل الفاتورة:
- "subtotal" = مجموع البنود قبل الخصم إن ذُكر.
- "discount" = قيمة خصم إجمالي صريح على الفاتورة كلها (وليس خصم البنود المفردة).
- "total" = إجمالي الفاتورة المستحق.
- "paid" = المبلغ المدفوع فعلياً، و"due" = المتبقي في الذمة.
- تحذير: «متبقي» أو «باقي» أو «رصيد» ليس خصماً — هو مبلغ لم يُسدَّد بعد.
  لا تنقصه من الإجمالي ولا تضعه في discount.
- "categoryHint" يجب أن يكون أحد المعرّفات التالية فقط:
${catList}

أعد JSON بهذا الشكل بالضبط:
{"vendor":"اسم المحل أو المورد","date":"YYYY-MM-DD","subtotal":0,"discount":0,"total":0,"paid":0,"due":0,"currency":"ج.م","notes":"ملاحظات مختصرة","items":[{"itemName":"","unitCost":0,"quantity":1,"lineTotal":0,"unit":"قطعة","categoryHint":"cat_misc"}]}`

  const raw = await callGemini({
    settings,
    system,
    temperature: 0.1,
    json: true,
    signal,
    parts: [
      { inlineData: { mimeType: blob.type || 'image/jpeg', data: base64 } },
      { text: 'استخرج بنود هذه الفاتورة بصيغة JSON.' },
    ],
  })

  const parsed = parseJson<Partial<OcrResult>>(raw)
  const items = Array.isArray(parsed.items) ? parsed.items : []

  return {
    vendor: parsed.vendor?.toString().trim() || undefined,
    date: normalizeDate(parsed.date),
    subtotal: parsed.subtotal != null ? parseNumber(parsed.subtotal) : undefined,
    discount: parsed.discount != null ? parseNumber(parsed.discount) : undefined,
    total: parsed.total != null ? parseNumber(parsed.total) : undefined,
    paid: parsed.paid != null ? parseNumber(parsed.paid) : undefined,
    due: parsed.due != null ? parseNumber(parsed.due) : undefined,
    currency: parsed.currency?.toString().trim() || undefined,
    notes: parsed.notes?.toString().trim() || undefined,
    items: items
      .map((it) => ({
        itemName: String(it?.itemName ?? '').trim(),
        unitCost: parseNumber(it?.unitCost),
        lineTotal: it?.lineTotal != null ? parseNumber(it.lineTotal) : undefined,
        quantity: Math.max(parseNumber(it?.quantity) || 1, 0.01),
        unit: String(it?.unit ?? 'قطعة').trim() || 'قطعة',
        categoryHint: String(it?.categoryHint ?? '').trim(),
      }))
      .filter((it) => it.itemName.length > 0),
  }
}

function normalizeDate(input: unknown): string | undefined {
  if (!input) return undefined
  const s = String(input).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return undefined
}

/* ------------------------------------------------------------------ */
/* 2) مقارنة الأسعار بالسوق                                            */
/* ------------------------------------------------------------------ */

export interface MarketComparisonItem {
  itemName: string
  marketLow: number | null
  marketHigh: number | null
  verdict: MarketVerdict
  summary: string
  tips: string[]
}

export async function compareWithMarket(
  expenses: Expense[],
  categories: Category[],
  settings: Settings,
  signal?: AbortSignal,
): Promise<MarketComparisonItem[]> {
  if (!expenses.length) return []
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'غير محدد'

  const payload = expenses.map((e) => ({
    itemName: e.itemName,
    category: catName(e.categoryId),
    unit: e.unit,
    unitCost: e.unitCost,
    quantity: e.quantity,
    date: e.date,
    vendor: e.vendor ?? '',
  }))

  const system = `أنت خبير تسعير مواد بناء وتشطيبات، متخصص في السوق المصري (${settings.region}).
سيصلك بنود اشتراها المستخدم بأسعارها الفعلية بعملة ${settings.currency}.
قدّر نطاق السعر السائد في السوق لكل بند (سعر الوحدة)، ثم احكم على السعر المدفوع.

قواعد:
- خذ تاريخ الشراء في الاعتبار: الأسعار القديمة تُقارن بأسعار وقتها.
- "verdict": "good" إذا كان السعر أقل من متوسط السوق، "fair" إذا كان ضمن النطاق المعقول، "high" إذا كان أعلى بوضوح، "unknown" إذا لم تستطع التقدير.
- "summary" جملة واحدة قصيرة بالعربية المصرية المبسّطة.
- "tips" من صفر إلى ثلاث نصائح عملية للتوفير أو بدائل أرخص بنفس الجودة.
- كن صريحاً بأن التقديرات تقريبية ولا تخترع أرقاماً دقيقة وهمية؛ استخدم null عند عدم المعرفة.

أعد مصفوفة JSON فقط بهذا الشكل:
[{"itemName":"","marketLow":0,"marketHigh":0,"verdict":"fair","summary":"","tips":[""]}]`

  const raw = await callGemini({
    settings,
    system,
    temperature: 0.4,
    json: true,
    signal,
    parts: [{ text: `البنود:\n${JSON.stringify(payload, null, 2)}` }],
  })

  const parsed = parseJson<MarketComparisonItem[]>(raw)
  const arr = Array.isArray(parsed) ? parsed : []
  return arr.map((item) => ({
    itemName: String(item?.itemName ?? '').trim(),
    marketLow: item?.marketLow == null ? null : parseNumber(item.marketLow),
    marketHigh: item?.marketHigh == null ? null : parseNumber(item.marketHigh),
    verdict: (['good', 'fair', 'high', 'unknown'] as MarketVerdict[]).includes(item?.verdict)
      ? item.verdict
      : 'unknown',
    summary: String(item?.summary ?? '').trim(),
    tips: Array.isArray(item?.tips) ? item.tips.map((t) => String(t).trim()).filter(Boolean) : [],
  }))
}

/* ------------------------------------------------------------------ */
/* 3) المساعد الذكي (المحادثة)                                         */
/* ------------------------------------------------------------------ */

/** ملخّص مضغوط للمشروع يُرسل مع كل سؤال ليجيب المساعد من واقع البيانات */
export function buildProjectContext(
  expenses: Expense[],
  categories: Category[],
  settings: Settings,
): string {
  if (!expenses.length) return 'لا توجد مصاريف مسجّلة بعد.'

  const total = expenses.reduce((s, e) => s + e.unitCost * e.quantity, 0)
  const byCategory = categories
    .map((c) => {
      const items = expenses.filter((e) => e.categoryId === c.id)
      const sum = items.reduce((s, e) => s + e.unitCost * e.quantity, 0)
      return { name: c.name, sum, count: items.length, planned: c.plannedBudget ?? 0 }
    })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.sum - a.sum)

  const dates = expenses.map((e) => e.date).filter(Boolean).sort()
  const byMonth = new Map<string, number>()
  for (const e of expenses) {
    const key = e.date.slice(0, 7)
    byMonth.set(key, (byMonth.get(key) ?? 0) + e.unitCost * e.quantity)
  }

  const topItems = [...expenses]
    .sort((a, b) => b.unitCost * b.quantity - a.unitCost * a.quantity)
    .slice(0, 25)
    .map(
      (e) =>
        `- ${e.date} | ${e.itemName} | ${categories.find((c) => c.id === e.categoryId)?.name ?? '—'} | ${e.quantity} ${e.unit} × ${e.unitCost} = ${(e.unitCost * e.quantity).toFixed(2)}${e.vendor ? ` | المورد: ${e.vendor}` : ''}${e.notes ? ` | ملاحظة: ${e.notes}` : ''}`,
    )
    .join('\n')

  return `اسم المشروع: ${settings.projectName}
المنطقة: ${settings.region}
العملة: ${settings.currency}
الميزانية الكلية المخططة: ${settings.totalBudget ? formatMoney(settings.totalBudget, settings.currency) : 'غير محددة'}
إجمالي المصروف حتى الآن: ${formatMoney(total, settings.currency)}
عدد البنود المسجّلة: ${expenses.length}
فترة التنفيذ: من ${dates[0] ?? '—'} إلى ${dates[dates.length - 1] ?? '—'}

المصروف حسب البند:
${byCategory.map((c) => `- ${c.name}: ${c.sum.toFixed(2)} (${c.count} بند)${c.planned ? ` | المخطط: ${c.planned}` : ''}`).join('\n')}

المصروف حسب الشهر:
${[...byMonth.entries()].sort().map(([m, v]) => `- ${m}: ${v.toFixed(2)}`).join('\n')}

أكبر البنود:
${topItems}`
}

export async function askAssistant(
  question: string,
  history: ChatMessage[],
  context: string,
  settings: Settings,
  signal?: AbortSignal,
): Promise<string> {
  const system = `أنت "مهندس التشطيب" — مستشار هندسي ومالي ودود، متخصص في تشطيب الشقق في مصر.
تتحدث بالعربية المصرية المبسّطة والواضحة، وتجيب باختصار مفيد.

مصادرك:
1) بيانات مشروع المستخدم المرفقة بالأسفل — اعتمد عليها في أي رقم أو تاريخ.
2) خبرتك العامة في مواد البناء والتشطيب والأسعار التقريبية في السوق المصري.

قواعد:
- لا تخترع أرقاماً غير موجودة في البيانات. إذا كان السؤال عن بيانات غير مسجّلة قل ذلك بوضوح.
- عند ذكر مبالغ اكتبها بوضوح مع العملة (${settings.currency}).
- للأسئلة الفنية (خامات، مقاسات، ترتيب مراحل التنفيذ) اشرح عملياً خطوة بخطوة.
- عند اقتراح توفير، اربطه بأرقام المستخدم الفعلية.
- استخدم عناوين ونقاط قصيرة عند الحاجة، وتجنّب الإطالة.
- تاريخ اليوم: ${todayISO()}.

=== بيانات المشروع ===
${context}
=== نهاية البيانات ===`

  const recent = history.slice(-10)
  const transcript = recent.length
    ? `${recent.map((m) => `${m.role === 'user' ? 'المستخدم' : 'المساعد'}: ${m.content}`).join('\n\n')}\n\n`
    : ''

  return callGemini({
    settings,
    system,
    temperature: 0.6,
    signal,
    parts: [{ text: `${transcript}المستخدم: ${question}` }],
  })
}

/* ------------------------------------------------------------------ */
/* 4) اكتشاف النماذج المتاحة للحساب                                    */
/* ------------------------------------------------------------------ */

export interface ModelOption {
  id: string
  label: string
}

interface RawModel {
  name?: string
  displayName?: string
  description?: string
  supportedGenerationMethods?: string[]
}

async function fetchModelPage(version: string, key: string): Promise<RawModel[]> {
  const out: RawModel[] = []
  let pageToken = ''
  // الخدمة تُرجع النماذج على صفحات — نقرأها كلها
  for (let page = 0; page < 5; page++) {
    const url =
      `https://generativelanguage.googleapis.com/${version}/models` +
      `?key=${encodeURIComponent(key)}&pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    const res = await fetch(url)
    if (!res.ok) {
      if (page === 0) {
        let detail = ''
        try {
          detail = (await res.json())?.error?.message ?? ''
        } catch {
          /* تجاهل */
        }
        throw new AiError(
          res.status === 400 || res.status === 403
            ? 'المفتاح غير صالح أو غير مُفعّل لهذه الخدمة.'
            : `تعذّر جلب النماذج (${res.status})${detail ? `: ${detail}` : ''}`,
        )
      }
      break
    }
    const data = await res.json()
    out.push(...((data?.models ?? []) as RawModel[]))
    pageToken = data?.nextPageToken ?? ''
    if (!pageToken) break
  }
  return out
}

/** نماذج ليست للنصوص — تُستبعد لأنها لا تصلح لقراءة الفواتير ولا للمحادثة */
const NON_TEXT = /embedding|aqa|imagen|veo|tts|image-generation|audio|live/i

/**
 * جلب النماذج التي يسمح بها مفتاح المستخدم فعلياً.
 * نقرأ من إصداري الـ API (v1beta و v1) ونجمعهما، لأن بعض النماذج
 * تظهر في أحدهما فقط. ولا نشترط إعلان generateContent صراحةً،
 * فبعض النماذج الأحدث لا تُدرج قائمة الطرق أصلاً.
 */
export async function listModels(settings: Settings): Promise<ModelOption[]> {
  const key = settings.apiKey.trim()
  if (!key) throw new AiError('أضف مفتاح Gemini API أولاً.')
  if (!navigator.onLine) throw new AiError('أنت بدون إنترنت — جلب النماذج يحتاج اتصالاً.')

  let raw: RawModel[]
  try {
    const [beta, v1] = await Promise.allSettled([
      fetchModelPage('v1beta', key),
      fetchModelPage('v1', key),
    ])
    if (beta.status === 'rejected' && v1.status === 'rejected') throw beta.reason
    raw = [
      ...(beta.status === 'fulfilled' ? beta.value : []),
      ...(v1.status === 'fulfilled' ? v1.value : []),
    ]
  } catch (err) {
    if (err instanceof AiError) throw err
    throw new AiError('تعذّر الاتصال بالخدمة. تأكد من اتصالك بالإنترنت.')
  }

  const seen = new Set<string>()
  const options: ModelOption[] = []

  for (const m of raw) {
    const id = String(m.name ?? '').replace(/^models\//, '')
    if (!id || seen.has(id) || NON_TEXT.test(id)) continue

    const methods = m.supportedGenerationMethods
    // نقبل النموذج إذا أعلن generateContent، أو لم يُعلن أي طرق إطلاقاً
    const usable = !methods?.length || methods.includes('generateContent')
    if (!usable) continue

    seen.add(id)
    options.push({ id, label: m.displayName?.trim() || id })
  }

  return options.sort((a, b) => b.id.localeCompare(a.id, 'en'))
}

/** اختبار سريع لصلاحية المفتاح من شاشة الإعدادات */
export async function testApiKey(settings: Settings): Promise<string> {
  return callGemini({
    settings,
    system: 'أجب بكلمة واحدة فقط.',
    parts: [{ text: 'قل: تم' }],
    temperature: 0,
  })
}
