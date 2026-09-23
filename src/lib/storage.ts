import type { AppData } from '../types'
import { CURRENT_VERSION, DEFAULT_SETTINGS, createInitialData } from './defaults'

const STORAGE_KEY = 'tashteeb:data:v1'
const DB_NAME = 'tashteeb-files'
const DB_STORE = 'receipts'

/* ------------------------------------------------------------------ */
/* بيانات التطبيق — localStorage                                       */
/* ------------------------------------------------------------------ */

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createInitialData()
    const parsed = JSON.parse(raw) as Partial<AppData>
    return migrate(parsed)
  } catch (err) {
    console.error('تعذّر تحميل البيانات المحفوظة:', err)
    return createInitialData()
  }
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (err) {
    console.error('تعذّر حفظ البيانات:', err)
    throw new Error('مساحة التخزين ممتلئة — احذف بعض الفواتير القديمة أو صدّر نسخة احتياطية.')
  }
}

/** أسماء نماذج قديمة لم تعد متاحة — تُستبدل بالنموذج الافتراضي الحالي */
const RETIRED_MODELS = /^gemini-(1\.|2\.)/

/** توحيد شكل البيانات القادمة من نسخة أقدم أو ملف استيراد */
export function migrate(input: Partial<AppData>): AppData {
  const base = createInitialData()
  const settings = { ...DEFAULT_SETTINGS, ...(input.settings ?? {}) }
  if (RETIRED_MODELS.test(settings.model)) settings.model = DEFAULT_SETTINGS.model

  return {
    version: CURRENT_VERSION,
    settings,
    categories: input.categories?.length ? input.categories : base.categories,
    expenses: input.expenses ?? [],
    receipts: input.receipts ?? [],
    chat: input.chat ?? [],
    insights: input.insights ?? [],
    // التركيبات القديمة لا تحتوي مموّلين — نزرع الافتراضيين مرة واحدة
    funders: input.funders?.length ? input.funders : base.funders,
  }
}

/* ------------------------------------------------------------------ */
/* صور الفواتير — IndexedDB                                            */
/* ------------------------------------------------------------------ */

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('تعذّر فتح قاعدة بيانات الصور'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, mode)
    const req = fn(tx.objectStore(DB_STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('خطأ في قاعدة بيانات الصور'))
    tx.oncomplete = () => db.close()
  })
}

/** شكل التخزين: بايتات فعلية لا كائن Blob */
interface StoredImage {
  data: ArrayBuffer
  type: string
}

/**
 * نخزّن **بايتات** الصورة لا كائن Blob/File.
 * تخزين File مباشرة في IndexedDB يحفظ إشارة إلى ملف في نظام التشغيل؛
 * وعلى iOS يُفرَّغ هذا الملف بعد إعادة تشغيل التطبيق فتصبح الصورة
 * بحجم صفر — وهو سبب فشل رفعها برسالة «No content provided».
 */
export async function putBlob(key: string, blob: Blob): Promise<void> {
  const data = await blob.arrayBuffer()
  if (!data.byteLength) throw new Error('الصورة فارغة — تعذّرت قراءة محتواها.')
  const record: StoredImage = { data, type: blob.type || 'image/jpeg' }
  await withStore('readwrite', (s) => s.put(record, key) as IDBRequest<IDBValidKey>)
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  const stored = await withStore<StoredImage | Blob | undefined>('readonly', (s) => s.get(key))
  if (!stored) return undefined

  // صور قديمة مخزّنة بالشكل السابق (Blob مباشر)
  if (stored instanceof Blob) return stored.size > 0 ? stored : undefined

  const record = stored as StoredImage
  if (!record.data?.byteLength) return undefined
  return new Blob([record.data], { type: record.type || 'image/jpeg' })
}

export async function deleteBlob(key: string): Promise<void> {
  await withStore('readwrite', (s) => s.delete(key) as unknown as IDBRequest<undefined>)
}

export async function clearBlobs(): Promise<void> {
  await withStore('readwrite', (s) => s.clear() as unknown as IDBRequest<undefined>)
}

/* ------------------------------------------------------------------ */
/* أدوات الملفات                                                       */
/* ------------------------------------------------------------------ */

/** تحويل base64 إلى Blob — يُستخدم عند استعادة نسخة احتياطية تحتوي صوراً */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

/** قراءة ملف كـ base64 (بدون البادئة) لإرساله إلى واجهة الذكاء الاصطناعي */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('تعذّر قراءة الملف'))
    reader.readAsDataURL(file)
  })
}

/**
 * تصغير الصورة قبل التخزين والإرسال — يقلل استهلاك المساحة
 * ويسرّع تحليل الفاتورة دون فقدان وضوح النص.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  /**
   * أي مسار خروج يجب أن يُرجع بايتات مقروءة الآن، لا إشارة إلى ملف
   * قد يختفي لاحقاً (سلوك iOS مع File المخزَّن في IndexedDB).
   */
  const materialize = async (): Promise<Blob> =>
    new Blob([await file.arrayBuffer()], { type: file.type || 'image/jpeg' })

  if (!file.type.startsWith('image/')) return materialize()
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 900_000) {
      bitmap.close()
      return materialize()
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return materialize()
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', quality),
    )
    return blob ?? materialize()
  } catch {
    return materialize()
  }
}
