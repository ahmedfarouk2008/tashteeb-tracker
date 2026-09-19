import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppData,
  Tombstone,
  Category,
  ChatMessage,
  Expense,
  MarketInsight,
  Receipt,
  Settings,
} from './types'
import { createInitialData } from './lib/defaults'
import {
  base64ToBlob,
  clearBlobs,
  deleteBlob,
  fileToBase64,
  getBlob,
  loadData,
  migrate,
  putBlob,
  saveData,
} from './lib/storage'
import { fingerprintOf } from './lib/dedupe'
import { MODEL_FALLBACK_EVENT } from './lib/ai'
import { currentUser, isSyncConfigured, resetSupabase } from './lib/supabase'
import { deleteRemoteImage, syncAll } from './lib/sync'
import { uid } from './lib/utils'

export type Toast = { id: string; text: string; tone: 'success' | 'error' | 'info' }

interface Store {
  data: AppData
  settings: Settings
  categories: Category[]
  expenses: Expense[]
  receipts: Receipt[]
  chat: ChatMessage[]
  insights: MarketInsight[]

  updateSettings: (patch: Partial<Settings>) => void

  addExpense: (input: NewExpense) => Expense
  addExpenses: (inputs: NewExpense[]) => Expense[]
  updateExpense: (id: string, patch: Partial<NewExpense>) => void
  deleteExpense: (id: string) => void

  addCategory: (input: Omit<Category, 'id' | 'createdAt'>) => Category
  updateCategory: (id: string, patch: Partial<Category>) => void
  deleteCategory: (id: string, moveToId: string) => void

  addReceipt: (file: File, blob: Blob, meta?: Partial<Receipt>) => Promise<Receipt>
  updateReceipt: (id: string, patch: Partial<Receipt>) => void
  deleteReceipt: (id: string, detachExpenses: boolean) => Promise<void>

  appendChat: (message: Omit<ChatMessage, 'id' | 'createdAt'>) => ChatMessage
  removeChat: (id: string) => void
  clearChat: () => void

  saveInsights: (items: MarketInsight[]) => void
  clearInsights: () => void

  /* ---------------- المزامنة السحابية ---------------- */
  syncUser: SyncUser | null
  syncState: SyncState
  refreshSyncUser: () => Promise<void>
  runSync: (silent?: boolean) => Promise<void>

  exportBackup: (includeImages: boolean) => Promise<string>
  importData: (raw: string) => Promise<void>
  resetAll: () => Promise<void>

  toasts: Toast[]
  notify: (text: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
}

export interface SyncUser {
  id: string
  email: string
}

export type SyncState =
  | { status: 'idle'; message?: string }
  | { status: 'syncing' }
  | { status: 'ok'; at: string; summary: string }
  | { status: 'error'; message: string }

export type NewExpense = Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'fingerprint'>

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData())
  const [toasts, setToasts] = useState<Toast[]>([])
  const [syncUser, setSyncUser] = useState<SyncUser | null>(null)
  const [syncState, setSyncState] = useState<SyncState>({ status: 'idle' })
  const firstRun = useRef(true)
  const syncing = useRef(false)
  const syncTimer = useRef<number | null>(null)

  /* حفظ تلقائي عند أي تغيير */
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    try {
      saveData(data)
    } catch (err) {
      notify((err as Error).message, 'error')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  /* عند تحويل الذكاء الاصطناعي تلقائياً لنموذج بديل: احفظه وأبلغ المستخدم */
  useEffect(() => {
    const onFallback = (e: Event) => {
      const model = (e as CustomEvent<string>).detail
      if (!model) return
      setData((d) =>
        d.settings.model === model ? d : { ...d, settings: { ...d.settings, model } },
      )
      notify(`النموذج السابق كان مزدحماً — تم التحويل تلقائياً إلى «${model}».`, 'info')
    }
    window.addEventListener(MODEL_FALLBACK_EVENT, onFallback)
    return () => window.removeEventListener(MODEL_FALLBACK_EVENT, onFallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* تطبيق السمة على الجذر */
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', data.settings.theme === 'dark')
    root.style.colorScheme = data.settings.theme
  }, [data.settings.theme])

  const notify = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = uid('t')
    setToasts((prev) => [...prev, { id, text, tone }])
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  /* ---------------- الإعدادات ---------------- */

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }))
  }, [])

  /* ---------------- المصاريف ---------------- */

  const buildExpense = (input: NewExpense): Expense => {
    const now = new Date().toISOString()
    return {
      ...input,
      id: uid('exp'),
      fingerprint: fingerprintOf(input),
      createdAt: now,
      updatedAt: now,
    }
  }

  const addExpense = useCallback((input: NewExpense) => {
    const expense = buildExpense(input)
    setData((d) => ({ ...d, expenses: [expense, ...d.expenses] }))
    return expense
  }, [])

  const addExpenses = useCallback((inputs: NewExpense[]) => {
    const created = inputs.map(buildExpense)
    setData((d) => ({ ...d, expenses: [...created, ...d.expenses] }))
    return created
  }, [])

  const updateExpense = useCallback((id: string, patch: Partial<NewExpense>) => {
    setData((d) => ({
      ...d,
      expenses: d.expenses.map((e) => {
        if (e.id !== id) return e
        const next = { ...e, ...patch, updatedAt: new Date().toISOString() }
        next.fingerprint = fingerprintOf(next)
        return next
      }),
    }))
  }, [])

  /** تسجيل شاهدة حذف حتى ينتقل الحذف إلى بقية الأجهزة */
  const tombstone = (kind: Tombstone['kind'], id: string): Tombstone => ({
    kind,
    id,
    deletedAt: new Date().toISOString(),
  })

  const deleteExpense = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      expenses: d.expenses.filter((e) => e.id !== id),
      insights: d.insights.filter((i) => i.expenseId !== id),
      deletions: [...(d.deletions ?? []), tombstone('expense', id)],
    }))
  }, [])

  /* ---------------- البنود/التصنيفات ---------------- */

  const addCategory = useCallback((input: Omit<Category, 'id' | 'createdAt'>) => {
    const now = new Date().toISOString()
    const category: Category = { ...input, id: uid('cat'), createdAt: now, updatedAt: now }
    setData((d) => ({ ...d, categories: [...d.categories, category] }))
    return category
  }, [])

  const updateCategory = useCallback((id: string, patch: Partial<Category>) => {
    setData((d) => ({
      ...d,
      categories: d.categories.map((c) =>
        c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c,
      ),
    }))
  }, [])

  /** الحذف ينقل كل المصاريف المرتبطة إلى تصنيف آخر حتى لا تضيع */
  const deleteCategory = useCallback((id: string, moveToId: string) => {
    setData((d) => ({
      ...d,
      categories: d.categories.filter((c) => c.id !== id),
      expenses: d.expenses.map((e) =>
        e.categoryId === id
          ? { ...e, categoryId: moveToId, updatedAt: new Date().toISOString() }
          : e,
      ),
      deletions: [...(d.deletions ?? []), tombstone('category', id)],
    }))
  }, [])

  /* ---------------- الفواتير ---------------- */

  const addReceipt = useCallback(async (file: File, blob: Blob, meta: Partial<Receipt> = {}) => {
    const blobKey = uid('blob')
    await putBlob(blobKey, blob)
    const receipt: Receipt = {
      id: uid('rcp'),
      fileName: file.name || 'فاتورة',
      mimeType: blob.type || file.type || 'image/jpeg',
      size: blob.size,
      blobKey,
      imported: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...meta,
    }
    setData((d) => ({ ...d, receipts: [receipt, ...d.receipts] }))
    return receipt
  }, [])

  const updateReceipt = useCallback((id: string, patch: Partial<Receipt>) => {
    setData((d) => ({
      ...d,
      receipts: d.receipts.map((r) =>
        r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r,
      ),
    }))
  }, [])

  const deleteReceipt = useCallback(
    async (id: string, detachExpenses: boolean) => {
      const receipt = data.receipts.find((r) => r.id === id)
      if (receipt) {
        await deleteBlob(receipt.blobKey).catch(() => undefined)
        if (syncUser) await deleteRemoteImage(data, syncUser.id, receipt.blobKey)
      }
      const now = new Date().toISOString()
      setData((d) => {
        const removed = detachExpenses ? [] : d.expenses.filter((e) => e.receiptId === id)
        return {
          ...d,
          receipts: d.receipts.filter((r) => r.id !== id),
          expenses: detachExpenses
            ? d.expenses.map((e) =>
                e.receiptId === id ? { ...e, receiptId: undefined, updatedAt: now } : e,
              )
            : d.expenses.filter((e) => e.receiptId !== id),
          deletions: [
            ...(d.deletions ?? []),
            tombstone('receipt', id),
            ...removed.map((e) => tombstone('expense', e.id)),
          ],
        }
      })
    },
    [data, syncUser],
  )

  /* ---------------- المحادثة والتحليلات ---------------- */

  /** سقف تاريخ المحادثة — يمنع تضخّم مساحة التخزين مع طول الاستخدام */
  const CHAT_LIMIT = 120

  const appendChat = useCallback((message: Omit<ChatMessage, 'id' | 'createdAt'>) => {
    const full: ChatMessage = { ...message, id: uid('msg'), createdAt: new Date().toISOString() }
    setData((d) => ({ ...d, chat: [...d.chat, full].slice(-CHAT_LIMIT) }))
    return full
  }, [])

  const removeChat = useCallback((id: string) => {
    setData((d) => ({ ...d, chat: d.chat.filter((m) => m.id !== id) }))
  }, [])

  const clearChat = useCallback(() => setData((d) => ({ ...d, chat: [] })), [])

  const saveInsights = useCallback((items: MarketInsight[]) => {
    setData((d) => {
      const replaced = new Set(items.map((i) => i.expenseId))
      return { ...d, insights: [...items, ...d.insights.filter((i) => !replaced.has(i.expenseId))] }
    })
  }, [])

  const clearInsights = useCallback(() => setData((d) => ({ ...d, insights: [] })), [])

  /* ---------------- استيراد / تصفير ---------------- */

  /* ---------------- المزامنة السحابية ---------------- */

  const refreshSyncUser = useCallback(async () => {
    resetSupabase()
    if (!isSyncConfigured(data.settings)) {
      setSyncUser(null)
      return
    }
    const user = await currentUser(data.settings)
    setSyncUser(user ? { id: user.id, email: user.email ?? '' } : null)
  }, [data.settings])

  /** مزامنة في اتجاهين. silent = لا تُظهر تنبيهات (المزامنة التلقائية) */
  const runSync = useCallback(
    async (silent = false) => {
      if (syncing.current) return
      if (!syncUser) {
        if (!silent) notify('سجّل الدخول للمزامنة أولاً من «الإعدادات».', 'error')
        return
      }
      if (!navigator.onLine) {
        if (!silent) notify('لا يوجد اتصال — ستتم المزامنة تلقائياً عند عودته.', 'info')
        return
      }

      syncing.current = true
      setSyncState({ status: 'syncing' })
      try {
        const result = await syncAll(data, syncUser.id)
        // نحافظ على المفاتيح المحلية الحالية حتى لا تُستبدل بنسخة قديمة
        setData((current) => ({
          ...result.data,
          chat: current.chat,
          insights: current.insights,
          settings: {
            ...result.data.settings,
            apiKey: current.settings.apiKey,
            model: current.settings.model,
            theme: current.settings.theme,
            supabaseUrl: current.settings.supabaseUrl,
            supabaseAnonKey: current.settings.supabaseAnonKey,
            autoSync: current.settings.autoSync,
          },
        }))

        const parts: string[] = []
        if (result.pulled) parts.push(`وصل ${result.pulled} تغيير`)
        if (result.imagesDownloaded) parts.push(`${result.imagesDownloaded} صورة`)
        const summary = parts.length ? parts.join(' و') : 'كل شيء محدَّث'
        setSyncState({ status: 'ok', at: result.syncedAt, summary })
        if (!silent && (result.pulled || result.imagesDownloaded)) notify(`تمت المزامنة — ${summary}`)
        else if (!silent) notify('تمت المزامنة — كل شيء محدَّث')
      } catch (err) {
        const message = (err as Error).message || 'تعذّرت المزامنة.'
        setSyncState({ status: 'error', message })
        if (!silent) notify(message, 'error')
      } finally {
        syncing.current = false
      }
    },
    [data, syncUser, notify],
  )

  /**
   * نسخة احتياطية كاملة. صور الفواتير محفوظة في IndexedDB ولا تدخل JSON
   * تلقائياً، لذا نضمّنها هنا (base64) حتى لا تضيع عند الاستعادة.
   */
  const exportBackup = useCallback(
    async (includeImages: boolean) => {
      const images: Record<string, { mimeType: string; data: string }> = {}
      if (includeImages) {
        for (const r of data.receipts) {
          try {
            const blob = await getBlob(r.blobKey)
            if (blob) {
              images[r.blobKey] = {
                mimeType: blob.type || r.mimeType,
                data: await fileToBase64(blob),
              }
            }
          } catch {
            /* صورة مفقودة — نتخطاها بدل إفشال النسخة كلها */
          }
        }
      }
      return JSON.stringify({ ...data, images }, null, 2)
    },
    [data],
  )

  const importData = useCallback(
    async (raw: string) => {
      const parsed = JSON.parse(raw) as Partial<AppData> & {
        images?: Record<string, { mimeType: string; data: string }>
      }
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.expenses)) {
        throw new Error('الملف غير صالح — تأكد أنه نسخة احتياطية من نفس التطبيق.')
      }

      const next = migrate(parsed)
      const images = parsed.images ?? {}

      // الصور القديمة تُمسح أولاً حتى لا تتراكم نسخ يتيمة في IndexedDB
      await clearBlobs().catch(() => undefined)
      let restored = 0
      for (const [key, img] of Object.entries(images)) {
        try {
          await putBlob(key, base64ToBlob(img.data, img.mimeType))
          restored++
        } catch {
          /* تجاهل الصورة التالفة */
        }
      }

      // الفواتير التي لم تصلنا صورها تُستبعد لئلا تظهر بطاقات فارغة
      const missing = next.receipts.filter((r) => !images[r.blobKey])
      if (missing.length) {
        const missingIds = new Set(missing.map((r) => r.id))
        next.receipts = next.receipts.filter((r) => !missingIds.has(r.id))
        next.expenses = next.expenses.map((e) =>
          e.receiptId && missingIds.has(e.receiptId) ? { ...e, receiptId: undefined } : e,
        )
      }

      setData((current) => {
        next.settings.apiKey = next.settings.apiKey || current.settings.apiKey
        return next
      })

      notify(
        restored
          ? `تم الاستيراد: ${next.expenses.length} مصروف و${restored} صورة فاتورة.`
          : `تم استيراد ${next.expenses.length} مصروف.${missing.length ? ' النسخة لم تتضمّن صور الفواتير.' : ''}`,
      )
    },
    [notify],
  )

  const resetAll = useCallback(async () => {
    for (const r of data.receipts) await deleteBlob(r.blobKey).catch(() => undefined)
    const fresh = createInitialData()
    fresh.settings = { ...fresh.settings, apiKey: data.settings.apiKey }
    setData(fresh)
  }, [data.receipts, data.settings.apiKey])

  /* استعادة جلسة المستخدم عند الإقلاع */
  useEffect(() => {
    void refreshSyncUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.settings.supabaseUrl, data.settings.supabaseAnonKey])

  /* مزامنة أولى بعد تسجيل الدخول أو فتح التطبيق */
  useEffect(() => {
    if (!syncUser) return
    void runSync(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncUser?.id])

  /* مزامنة تلقائية بعد توقف التعديلات (تجميع التغييرات في دفعة واحدة) */
  useEffect(() => {
    if (!syncUser || data.settings.autoSync === false) return
    if (syncTimer.current) window.clearTimeout(syncTimer.current)
    syncTimer.current = window.setTimeout(() => void runSync(true), 8000)
    return () => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.expenses, data.categories, data.receipts, syncUser?.id])

  /* مزامنة عند عودة الاتصال */
  useEffect(() => {
    if (!syncUser) return
    const onOnline = () => void runSync(true)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncUser?.id])

  const value = useMemo<Store>(
    () => ({
      data,
      settings: data.settings,
      categories: data.categories,
      expenses: data.expenses,
      receipts: data.receipts,
      chat: data.chat,
      insights: data.insights,
      updateSettings,
      addExpense,
      addExpenses,
      updateExpense,
      deleteExpense,
      addCategory,
      updateCategory,
      deleteCategory,
      addReceipt,
      updateReceipt,
      deleteReceipt,
      appendChat,
      removeChat,
      clearChat,
      saveInsights,
      clearInsights,
      syncUser,
      syncState,
      refreshSyncUser,
      runSync,
      exportBackup,
      importData,
      resetAll,
      toasts,
      notify,
      dismissToast,
    }),
    [
      data,
      updateSettings,
      addExpense,
      addExpenses,
      updateExpense,
      deleteExpense,
      addCategory,
      updateCategory,
      deleteCategory,
      addReceipt,
      updateReceipt,
      deleteReceipt,
      appendChat,
      removeChat,
      clearChat,
      saveInsights,
      clearInsights,
      syncUser,
      syncState,
      refreshSyncUser,
      runSync,
      exportBackup,
      importData,
      resetAll,
      toasts,
      notify,
      dismissToast,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore يجب أن يُستخدم داخل StoreProvider')
  return ctx
}
