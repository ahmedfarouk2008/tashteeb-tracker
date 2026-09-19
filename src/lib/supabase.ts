import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { Settings } from '../types'

/**
 * عميل Supabase يُنشأ عند الحاجة فقط.
 * الإعدادات تأتي من متغيرات البيئة عند البناء، أو مما يُدخله
 * المستخدم في شاشة الإعدادات — فلا حاجة لإعادة بناء التطبيق.
 *
 * المفتاح العام (anon) مصمَّم ليكون داخل المتصفح؛ الحماية الحقيقية
 * من سياسات أمان الصفوف (RLS) على الخادم.
 */

const ENV_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
const ENV_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''

export class SyncError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SyncError'
  }
}

export function supabaseConfig(settings: Settings): { url: string; key: string } {
  return {
    url: (settings.supabaseUrl || ENV_URL).trim().replace(/\/+$/, ''),
    key: (settings.supabaseAnonKey || ENV_KEY).trim(),
  }
}

export function isSyncConfigured(settings: Settings): boolean {
  const { url, key } = supabaseConfig(settings)
  return Boolean(url && key)
}

let cached: { url: string; key: string; client: SupabaseClient } | null = null

export function getSupabase(settings: Settings): SupabaseClient {
  const { url, key } = supabaseConfig(settings)
  if (!url || !key) {
    throw new SyncError('لم تُضبط بيانات المزامنة. افتح «الإعدادات» وأضف رابط المشروع والمفتاح العام.')
  }
  if (cached && cached.url === url && cached.key === key) return cached.client

  const client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'tashteeb:auth',
    },
  })
  cached = { url, key, client }
  return client
}

/** إعادة ضبط العميل عند تغيير بيانات المشروع */
export function resetSupabase() {
  cached = null
}

/* ------------------------------------------------------------------ */
/* المصادقة                                                            */
/* ------------------------------------------------------------------ */

/** ترجمة رسائل Supabase الإنجليزية إلى عربية مفهومة */
export function translateAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'البريد أو كلمة المرور غير صحيحة.'
  if (m.includes('user already registered')) return 'هذا البريد مسجّل بالفعل — سجّل الدخول بدل إنشاء حساب.'
  if (m.includes('password should be at least')) return 'كلمة المرور قصيرة — استخدم ٦ أحرف على الأقل.'
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'صيغة البريد غير صحيحة.'
  if (m.includes('email not confirmed')) return 'لم تُفعّل بريدك بعد — افتح رسالة التأكيد في بريدك أولاً.'
  if (m.includes('rate limit') || m.includes('too many')) return 'محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة.'
  if (m.includes('failed to fetch')) return 'تعذّر الاتصال بالخادم — تأكد من الرابط ومن اتصالك بالإنترنت.'
  return message
}

export async function signUp(settings: Settings, email: string, password: string): Promise<User | null> {
  const { data, error } = await getSupabase(settings).auth.signUp({ email, password })
  if (error) throw new SyncError(translateAuthError(error.message))
  return data.user
}

export async function signIn(settings: Settings, email: string, password: string): Promise<User> {
  const { data, error } = await getSupabase(settings).auth.signInWithPassword({ email, password })
  if (error) throw new SyncError(translateAuthError(error.message))
  return data.user
}

export async function signOut(settings: Settings): Promise<void> {
  const { error } = await getSupabase(settings).auth.signOut()
  if (error) throw new SyncError(translateAuthError(error.message))
}

export async function currentUser(settings: Settings): Promise<User | null> {
  if (!isSyncConfigured(settings)) return null
  try {
    const { data } = await getSupabase(settings).auth.getSession()
    return data.session?.user ?? null
  } catch {
    return null
  }
}
