import type { AppData, Category, Expense, Receipt, SyncKind } from '../types'
import { getBlob, putBlob } from './storage'
import { SyncError, getSupabase } from './supabase'

/**
 * محرك المزامنة — يعمل بمبدأ «المحلي أولاً»:
 * التطبيق يكتب دائماً في الجهاز، والمزامنة ترفع التغييرات وتسحب تغييرات
 * الأجهزة الأخرى. عند التعارض تفوز النسخة الأحدث (updatedAt).
 */

const TABLE = 'documents'
const BUCKET = 'receipts'
/** أقصى عدد سجلات في الدفعة الواحدة حتى لا تفشل الطلبات الكبيرة */
const BATCH = 200

interface RemoteRow {
  kind: SyncKind
  id: string
  payload: Record<string, unknown>
  updated_at: string
  deleted: boolean
}

export interface SyncResult {
  pushed: number
  pulled: number
  imagesUploaded: number
  imagesDownloaded: number
  syncedAt: string
  data: AppData
}

const stamp = (value?: string): number => (value ? Date.parse(value) || 0 : 0)

/** طابع آخر تعديل لأي سجل — يُستخدم في المقارنة والترشيح */
function touchedAt(item: Expense | Category | Receipt): string {
  const anyItem = item as { updatedAt?: string; createdAt?: string }
  return anyItem.updatedAt || anyItem.createdAt || new Date(0).toISOString()
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * مزامنة كاملة في اتجاهين.
 * تُرجع نسخة جديدة من البيانات بعد الدمج — لا تعدّل المدخلة.
 */
export async function syncAll(data: AppData, userId: string): Promise<SyncResult> {
  const supabase = getSupabase(data.settings)
  const since = data.settings.lastSyncAt ?? new Date(0).toISOString()
  const startedAt = new Date().toISOString()

  /* ---------------- 1) سحب تغييرات الأجهزة الأخرى ---------------- */

  const { data: remoteRows, error: pullError } = await supabase
    .from(TABLE)
    .select('kind,id,payload,updated_at,deleted')
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })

  if (pullError) throw new SyncError(`تعذّر سحب البيانات: ${pullError.message}`)
  const remote = (remoteRows ?? []) as RemoteRow[]

  /* ---------------- 2) دمج الوارد مع المحلي ---------------- */

  const merged: AppData = {
    ...data,
    expenses: [...data.expenses],
    categories: [...data.categories],
    receipts: [...data.receipts],
    deletions: [...(data.deletions ?? [])],
  }

  const deletionKeys = new Set(merged.deletions!.map((d) => `${d.kind}:${d.id}`))
  let pulled = 0

  for (const row of remote) {
    // حذف من جهاز آخر
    if (row.deleted) {
      applyRemoteDeletion(merged, row)
      if (!deletionKeys.has(`${row.kind}:${row.id}`)) {
        merged.deletions!.push({ kind: row.kind, id: row.id, deletedAt: row.updated_at })
        deletionKeys.add(`${row.kind}:${row.id}`)
      }
      pulled++
      continue
    }

    // سجل محذوف محلياً ولم يُرفع حذفه بعد — الحذف المحلي له الأولوية
    if (deletionKeys.has(`${row.kind}:${row.id}`)) continue

    if (applyRemoteUpsert(merged, row)) pulled++
  }

  /* ---------------- 3) دفع التغييرات المحلية ---------------- */

  const outgoing: Array<{
    user_id: string
    kind: SyncKind
    id: string
    payload: unknown
    updated_at: string
    deleted: boolean
  }> = []

  for (const e of merged.expenses) {
    if (stamp(touchedAt(e)) > stamp(since)) {
      outgoing.push({ user_id: userId, kind: 'expense', id: e.id, payload: e, updated_at: touchedAt(e), deleted: false })
    }
  }
  for (const c of merged.categories) {
    if (stamp(touchedAt(c)) > stamp(since)) {
      outgoing.push({ user_id: userId, kind: 'category', id: c.id, payload: c, updated_at: touchedAt(c), deleted: false })
    }
  }
  for (const r of merged.receipts) {
    if (stamp(touchedAt(r)) > stamp(since)) {
      outgoing.push({ user_id: userId, kind: 'receipt', id: r.id, payload: r, updated_at: touchedAt(r), deleted: false })
    }
  }
  for (const d of merged.deletions!) {
    if (stamp(d.deletedAt) > stamp(since)) {
      outgoing.push({ user_id: userId, kind: d.kind, id: d.id, payload: {}, updated_at: d.deletedAt, deleted: true })
    }
  }

  // الإعدادات المشتركة فقط — المفاتيح السرية تبقى على الجهاز
  const sharedSettings = {
    projectName: merged.settings.projectName,
    currency: merged.settings.currency,
    totalBudget: merged.settings.totalBudget,
    region: merged.settings.region,
  }
  outgoing.push({
    user_id: userId,
    kind: 'settings',
    id: 'main',
    payload: sharedSettings,
    updated_at: startedAt,
    deleted: false,
  })

  for (const batch of chunk(outgoing, BATCH)) {
    const { error } = await supabase.from(TABLE).upsert(batch, { onConflict: 'user_id,kind,id' })
    if (error) throw new SyncError(`تعذّر رفع البيانات: ${error.message}`)
  }

  /* ---------------- 4) صور الفواتير ---------------- */

  let imagesUploaded = 0
  let imagesDownloaded = 0

  for (const receipt of merged.receipts) {
    const path = `${userId}/${receipt.blobKey}`
    const local = await getBlob(receipt.blobKey).catch(() => undefined)

    if (local && !receipt.uploaded) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, local, { contentType: receipt.mimeType, upsert: true })
      if (!error) {
        receipt.uploaded = true
        imagesUploaded++
      }
    } else if (!local) {
      // صورة وصلت بياناتها من جهاز آخر — نزّلها لتعمل لاحقاً بدون إنترنت
      const { data: file } = await supabase.storage.from(BUCKET).download(path)
      if (file) {
        await putBlob(receipt.blobKey, file).catch(() => undefined)
        receipt.uploaded = true
        imagesDownloaded++
      }
    }
  }

  /* ---------------- 5) تنظيف شواهد الحذف القديمة ---------------- */

  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  merged.deletions = merged.deletions!.filter((d) => stamp(d.deletedAt) > monthAgo)

  const syncedAt = new Date().toISOString()
  merged.settings = { ...merged.settings, lastSyncAt: syncedAt }

  return {
    pushed: outgoing.length,
    pulled,
    imagesUploaded,
    imagesDownloaded,
    syncedAt,
    data: merged,
  }
}

/** تطبيق سجل وارد: يُضاف أو يستبدل الأقدم منه فقط */
function applyRemoteUpsert(data: AppData, row: RemoteRow): boolean {
  const remoteStamp = stamp(row.updated_at)

  if (row.kind === 'expense') {
    const incoming = row.payload as unknown as Expense
    const index = data.expenses.findIndex((e) => e.id === row.id)
    if (index === -1) {
      data.expenses.unshift(incoming)
      return true
    }
    if (stamp(touchedAt(data.expenses[index])) < remoteStamp) {
      data.expenses[index] = incoming
      return true
    }
    return false
  }

  if (row.kind === 'category') {
    const incoming = row.payload as unknown as Category
    const index = data.categories.findIndex((c) => c.id === row.id)
    if (index === -1) {
      data.categories.push(incoming)
      return true
    }
    if (stamp(touchedAt(data.categories[index])) < remoteStamp) {
      data.categories[index] = incoming
      return true
    }
    return false
  }

  if (row.kind === 'receipt') {
    const incoming = row.payload as unknown as Receipt
    const index = data.receipts.findIndex((r) => r.id === row.id)
    if (index === -1) {
      data.receipts.unshift(incoming)
      return true
    }
    if (stamp(touchedAt(data.receipts[index])) < remoteStamp) {
      data.receipts[index] = { ...incoming, uploaded: data.receipts[index].uploaded }
      return true
    }
    return false
  }

  if (row.kind === 'settings') {
    const shared = row.payload as Partial<AppData['settings']>
    data.settings = {
      ...data.settings,
      projectName: shared.projectName ?? data.settings.projectName,
      currency: shared.currency ?? data.settings.currency,
      totalBudget: shared.totalBudget ?? data.settings.totalBudget,
      region: shared.region ?? data.settings.region,
    }
    return true
  }

  return false
}

function applyRemoteDeletion(data: AppData, row: RemoteRow) {
  if (row.kind === 'expense') {
    data.expenses = data.expenses.filter((e) => e.id !== row.id)
    data.insights = data.insights.filter((i) => i.expenseId !== row.id)
  } else if (row.kind === 'category') {
    data.categories = data.categories.filter((c) => c.id !== row.id)
  } else if (row.kind === 'receipt') {
    data.receipts = data.receipts.filter((r) => r.id !== row.id)
    data.expenses = data.expenses.map((e) =>
      e.receiptId === row.id ? { ...e, receiptId: undefined } : e,
    )
  }
}

/** جلب صورة فاتورة من السحابة عند غيابها محلياً (عرض كسول) */
export async function fetchRemoteImage(
  data: AppData,
  userId: string,
  blobKey: string,
): Promise<Blob | undefined> {
  try {
    const supabase = getSupabase(data.settings)
    const { data: file } = await supabase.storage.from(BUCKET).download(`${userId}/${blobKey}`)
    if (file) {
      await putBlob(blobKey, file).catch(() => undefined)
      return file
    }
  } catch {
    /* بدون إنترنت أو بدون صلاحية — تُعرض بطاقة بلا صورة */
  }
  return undefined
}

/** حذف صورة من السحابة عند حذف الفاتورة */
export async function deleteRemoteImage(
  data: AppData,
  userId: string,
  blobKey: string,
): Promise<void> {
  try {
    const supabase = getSupabase(data.settings)
    await supabase.storage.from(BUCKET).remove([`${userId}/${blobKey}`])
  } catch {
    /* تُحذف لاحقاً أو تبقى بلا ضرر */
  }
}
