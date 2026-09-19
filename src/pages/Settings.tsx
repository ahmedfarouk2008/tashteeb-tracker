import { useRef, useState } from 'react'
import { useStore } from '../store'
import { AiError, listModels, testApiKey, type ModelOption } from '../lib/ai'
import {
  downloadFile,
  formatBytes,
  formatDate,
  formatNumber,
  parseNumber,
  todayISO,
} from '../lib/utils'
import { ConfirmDialog, Spinner } from '../components/ui'
import {
  IconAlert,
  IconCheck,
  IconDownload,
  IconRefresh,
  IconSparkles,
  IconUpload,
} from '../components/Icons'

/**
 * قائمة مبدئية فقط — أسماء النماذج تتغيّر مع الوقت،
 * لذا يستطيع المستخدم جلب النماذج المتاحة لحسابه فعلياً بزر واحد.
 */
const FALLBACK_MODELS: ModelOption[] = [
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash — سريع ومتوازن (موصى به)' },
  { id: 'gemini-3.6-pro', label: 'Gemini 3.6 Pro — أدق في الفواتير المعقّدة' },
]

export default function SettingsPage() {
  const { settings, updateSettings, data, expenses, receipts, exportBackup, importData, resetAll, notify } =
    useStore()

  const [testing, setTesting] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_MODELS)
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelsMessage, setModelsMessage] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const runTest = async () => {
    setTesting('loading')
    setTestMessage('')
    try {
      await testApiKey(settings)
      setTesting('ok')
      setTestMessage('المفتاح يعمل بنجاح.')
    } catch (err) {
      setTesting('fail')
      setTestMessage(err instanceof AiError ? err.message : 'فشل الاختبار.')
    }
  }

  const fetchModels = async () => {
    setLoadingModels(true)
    setModelsMessage('')
    try {
      const found = await listModels(settings)
      if (!found.length) {
        setModelsMessage('لم تُرجع الخدمة أي نموذج متاح لهذا المفتاح.')
        return
      }
      setModels(found)
      setModelsMessage(`تم العثور على ${formatNumber(found.length)} نموذج متاح.`)
      // إذا كان النموذج المحفوظ غير موجود في القائمة، اختر الأنسب تلقائياً
      if (!found.some((m) => m.id === settings.model)) {
        const preferred =
          found.find((m) => /flash/i.test(m.id) && !/lite|thinking|preview|exp/i.test(m.id)) ??
          found[0]
        updateSettings({ model: preferred.id })
        setModelsMessage(
          `تم العثور على ${formatNumber(found.length)} نموذج، وتم اختيار «${preferred.id}» تلقائياً.`,
        )
      }
    } catch (err) {
      setModelsMessage(err instanceof AiError ? err.message : 'تعذّر جلب النماذج.')
    } finally {
      setLoadingModels(false)
    }
  }

  const runExport = async (includeImages: boolean) => {
    setExporting(true)
    try {
      const json = await exportBackup(includeImages)
      downloadFile(json, `نسخة-احتياطية-${todayISO()}.json`)
      updateSettings({ lastBackupAt: new Date().toISOString() })
      notify('تم تصدير النسخة الاحتياطية')
    } catch (err) {
      notify((err as Error).message || 'تعذّر تصدير النسخة', 'error')
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async (file: File) => {
    setImporting(true)
    try {
      await importData(await file.text())
    } catch (err) {
      notify((err as Error).message || 'تعذّر استيراد الملف', 'error')
    } finally {
      setImporting(false)
    }
  }

  const storageSize = new Blob([JSON.stringify(data)]).size
  const receiptsSize = receipts.reduce((s, r) => s + r.size, 0)

  return (
    <div className="space-y-4">
      {/* ------------------------------ المشروع ------------------------------ */}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-extrabold">بيانات المشروع</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="s-name">اسم المشروع</label>
            <input
              id="s-name"
              className="field"
              value={settings.projectName}
              onChange={(e) => updateSettings({ projectName: e.target.value })}
              placeholder="تشطيب الشقة"
            />
          </div>
          <div>
            <label className="label" htmlFor="s-currency">العملة</label>
            <input
              id="s-currency"
              className="field"
              value={settings.currency}
              onChange={(e) => updateSettings({ currency: e.target.value })}
              placeholder="ج.م"
            />
          </div>
          <div>
            <label className="label" htmlFor="s-budget">الميزانية الكلية</label>
            <input
              id="s-budget"
              className="field tnum"
              inputMode="decimal"
              value={settings.totalBudget || ''}
              onChange={(e) => updateSettings({ totalBudget: parseNumber(e.target.value) })}
              placeholder="0"
            />
            <p className="mt-1.5 text-[11px] font-semibold text-ink-400">
              اتركها فارغة لاستخدام مجموع ميزانيات البنود.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="s-region">المنطقة (لمقارنة الأسعار)</label>
            <input
              id="s-region"
              className="field"
              value={settings.region}
              onChange={(e) => updateSettings({ region: e.target.value })}
              placeholder="مصر — القاهرة الكبرى"
            />
          </div>
        </div>
      </section>

      {/* --------------------------- الذكاء الاصطناعي --------------------------- */}
      <section className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-brand-600 dark:text-brand-400">
            <IconSparkles width={18} height={18} />
          </span>
          <h2 className="text-sm font-extrabold">إعدادات الذكاء الاصطناعي</h2>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="s-key">مفتاح Gemini API</label>
            <div className="flex gap-2">
              <input
                id="s-key"
                type={showKey ? 'text' : 'password'}
                className="field flex-1 font-mono text-xs"
                value={settings.apiKey}
                onChange={(e) => {
                  updateSettings({ apiKey: e.target.value.trim() })
                  setTesting('idle')
                }}
                placeholder="AIza..."
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="btn-ghost shrink-0"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? 'إخفاء' : 'إظهار'}
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-6 font-semibold text-ink-400">
              المفتاح يُحفظ على جهازك فقط داخل متصفحك، ولا يُرسل لأي خادم غير خدمة Google.
              احصل على مفتاح مجاني من{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="font-extrabold text-brand-600 underline dark:text-brand-400"
              >
                Google AI Studio
              </a>
              .
            </p>
          </div>

          <div>
            <label className="label" htmlFor="s-model">النموذج</label>
            <div className="flex gap-2">
              <input
                id="s-model"
                className="field flex-1 font-mono text-xs"
                list="model-options"
                value={settings.model}
                onChange={(e) => {
                  updateSettings({ model: e.target.value.trim() })
                  setTesting('idle')
                }}
                placeholder="gemini-3.6-flash"
                spellCheck={false}
              />
              <button
                type="button"
                className="btn-ghost shrink-0"
                onClick={fetchModels}
                disabled={loadingModels || !settings.apiKey}
              >
                {loadingModels ? <Spinner /> : <IconRefresh width={16} height={16} />}
                جلب المتاح
              </button>
            </div>
            <datalist id="model-options">
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </datalist>
            <p className="mt-1.5 text-[11px] font-semibold leading-6 text-ink-400">
              {modelsMessage || 'اضغط «جلب المتاح» لعرض النماذج المسموح بها لمفتاحك، أو اكتب اسم النموذج يدوياً.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-outline"
              onClick={runTest}
              disabled={testing === 'loading' || !settings.apiKey}
            >
              {testing === 'loading' ? <Spinner /> : <IconCheck width={16} height={16} />}
              اختبار الاتصال
            </button>
            {testing !== 'idle' && testing !== 'loading' && (
              <span
                className={`flex items-center gap-1.5 text-xs font-bold ${
                  testing === 'ok'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {testing === 'ok' ? <IconCheck width={15} height={15} /> : <IconAlert width={15} height={15} />}
                {testMessage}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------- المظهر ------------------------------- */}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-extrabold">المظهر</h2>
        <div className="flex gap-2">
          {(['light', 'dark'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => updateSettings({ theme: t })}
              className={
                settings.theme === t
                  ? 'btn-primary flex-1'
                  : 'btn-outline flex-1'
              }
            >
              {t === 'light' ? '☀️ فاتح' : '🌙 داكن'}
            </button>
          ))}
        </div>
      </section>

      {/* ------------------------------ البيانات ------------------------------ */}
      <section className="card p-5">
        <h2 className="mb-1 text-sm font-extrabold">البيانات والنسخ الاحتياطي</h2>
        <p className="tnum mb-4 text-xs text-ink-500 dark:text-ink-400">
          {formatNumber(expenses.length)} مصروف · {formatNumber(receipts.length)} فاتورة ·{' '}
          {formatBytes(storageSize)} بيانات + {formatBytes(receiptsSize)} صور
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => void runExport(true)}
            disabled={exporting}
          >
            {exporting ? <Spinner /> : <IconDownload width={16} height={16} />}
            نسخة كاملة (مع الصور)
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => void runExport(false)}
            disabled={exporting}
          >
            <IconDownload width={16} height={16} /> نسخة خفيفة (بدون صور)
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => importRef.current?.click()}
            disabled={importing}
          >
            {importing ? <Spinner /> : <IconUpload width={16} height={16} />}
            استيراد نسخة
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void handleImport(f)
            }}
          />
          <button type="button" className="btn-danger ms-auto" onClick={() => setResetOpen(true)}>
            مسح كل البيانات
          </button>
        </div>

        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-[11px] font-bold leading-6 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <IconAlert width={15} height={15} />
          <span>
            البيانات محفوظة داخل متصفح هذا الجهاز فقط. مسح بيانات المتصفح — أو عدم فتح التطبيق
            لمدة أسبوعين على iPhone — قد يحذفها. صدّر «نسخة كاملة» بانتظام واحتفظ بها.
            {settings.lastBackupAt && (
              <span className="mt-1 block font-semibold opacity-80">
                آخر نسخة احتياطية: {formatDate(settings.lastBackupAt.slice(0, 10))}
              </span>
            )}
          </span>
        </p>
      </section>

      <ConfirmDialog
        open={resetOpen}
        title="مسح كل البيانات"
        message="سيتم حذف جميع المصاريف والفواتير والمحادثات نهائياً وإعادة البنود لوضعها الأساسي. لا يمكن التراجع — صدّر نسخة احتياطية أولاً."
        confirmLabel="مسح نهائي"
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          void resetAll()
          setResetOpen(false)
          notify('تم مسح كل البيانات', 'info')
        }}
      />
    </div>
  )
}
