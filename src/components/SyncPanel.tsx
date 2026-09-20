import { useState } from 'react'
import { useStore } from '../store'
import {
  appUrl,
  isSyncConfigured,
  normalizeProjectUrl,
  resendConfirmation,
  signIn,
  signOut,
  signUp,
  supabaseConfig,
  validateProjectUrl,
} from '../lib/supabase'
import { formatDate } from '../lib/utils'
import { Badge, Spinner } from './ui'
import { IconAlert, IconCheck, IconLink, IconRefresh } from '../components/Icons'

/** لوحة المزامنة السحابية داخل شاشة الإعدادات */
export default function SyncPanel() {
  const { settings, updateSettings, syncUser, syncState, refreshSyncUser, runSync, notify } =
    useStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showConfig, setShowConfig] = useState(false)

  const configured = isSyncConfigured(settings)
  const effectiveUrl = supabaseConfig(settings).url
  const urlProblem = settings.supabaseUrl ? validateProjectUrl(effectiveUrl) : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('أدخل البريد وكلمة المرور.')
      return
    }

    setBusy(true)
    try {
      if (mode === 'signup') {
        const user = await signUp(settings, email.trim(), password)
        if (user && !user.confirmed_at && !user.email_confirmed_at) {
          notify('أُنشئ الحساب — افتح بريدك وأكّد التسجيل ثم سجّل الدخول.', 'info')
          setMode('signin')
        } else {
          await refreshSyncUser()
          notify('تم إنشاء الحساب وتسجيل الدخول')
        }
      } else {
        await signIn(settings, email.trim(), password)
        await refreshSyncUser()
        notify('تم تسجيل الدخول — جارٍ المزامنة')
      }
      setPassword('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    setBusy(true)
    try {
      await signOut(settings)
      await refreshSyncUser()
      notify('تم تسجيل الخروج — بياناتك تبقى على هذا الجهاز.', 'info')
    } catch (err) {
      notify((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-brand-600 dark:text-brand-400">
          <IconLink width={18} height={18} />
        </span>
        <h2 className="text-sm font-extrabold">المزامنة بين الأجهزة</h2>
        {syncUser && (
          <Badge tone="ok" className="ms-auto">
            <IconCheck width={12} height={12} /> مفعّلة
          </Badge>
        )}
      </div>

      {/* ------------------ إعداد المشروع ------------------ */}
      {(!configured || showConfig) && (
        <div className="mb-4 space-y-3 rounded-2xl bg-ink-50 p-4 dark:bg-ink-950">
          <p className="text-xs font-bold leading-6 text-ink-600 dark:text-ink-300">
            أنشئ مشروعاً مجانياً على{' '}
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="font-extrabold text-brand-600 underline dark:text-brand-400"
            >
              Supabase
            </a>
            ، ثم انسخ الرابط والمفتاح العام من: Project Settings ← API.
          </p>
          <div>
            <label className="label" htmlFor="sb-url">
              رابط المشروع (Project URL)
            </label>
            <input
              id="sb-url"
              className="field font-mono text-xs"
              dir="ltr"
              value={settings.supabaseUrl ?? ''}
              onChange={(e) => updateSettings({ supabaseUrl: e.target.value.trim() })}
              onBlur={(e) => {
                // تصحيح تلقائي: رابط لوحة التحكم أو معرّف المشروع → رابط الـ API
                const fixed = normalizeProjectUrl(e.target.value)
                if (fixed && fixed !== e.target.value) updateSettings({ supabaseUrl: fixed })
              }}
              placeholder="https://xxxxx.supabase.co"
              spellCheck={false}
            />
            {urlProblem ? (
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-bold leading-6 text-rose-600 dark:text-rose-400">
                <IconAlert width={13} height={13} /> {urlProblem}
              </p>
            ) : (
              effectiveUrl && (
                <p
                  dir="ltr"
                  className="mt-1.5 flex items-center gap-1.5 text-start text-[11px] font-bold text-emerald-600 dark:text-emerald-400"
                >
                  <IconCheck width={13} height={13} /> {effectiveUrl}
                </p>
              )
            )}
          </div>
          <div>
            <label className="label" htmlFor="sb-key">
              المفتاح العام (anon public)
            </label>
            <input
              id="sb-key"
              className="field font-mono text-xs"
              dir="ltr"
              value={settings.supabaseAnonKey ?? ''}
              onChange={(e) => updateSettings({ supabaseAnonKey: e.target.value.trim() })}
              placeholder="eyJhbGciOi..."
              spellCheck={false}
            />
          </div>
          <p className="flex items-start gap-2 text-[11px] font-semibold leading-6 text-ink-400">
            <IconAlert width={14} height={14} />
            هذا المفتاح «عام» بطبيعته ولا يكشف بياناتك — الحماية من سياسات RLS التي
            يُنشئها ملف الإعداد، وتمنع أي مستخدم من رؤية بيانات غيره.
          </p>

          {/* بدون ضبط هذا العنوان تعود روابط تأكيد البريد إلى localhost:3000 */}
          <div className="rounded-xl bg-amber-50 px-3.5 py-3 dark:bg-amber-500/10">
            <p className="text-[11px] font-bold leading-6 text-amber-800 dark:text-amber-200">
              مهم: في Supabase ← Authentication ← URL Configuration، اضبط
              <span className="font-mono"> Site URL </span>
              وأضف نفس العنوان في
              <span className="font-mono"> Redirect URLs </span>:
            </p>
            <code
              dir="ltr"
              className="mt-1.5 block select-all rounded-lg bg-white px-2 py-1.5 text-start text-[11px] font-bold text-ink-700 dark:bg-ink-900 dark:text-ink-200"
            >
              {appUrl()}
            </code>
          </div>
          {configured && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                setShowConfig(false)
                void refreshSyncUser()
              }}
            >
              حفظ وإخفاء
            </button>
          )}
        </div>
      )}

      {/* ------------------ تسجيل الدخول ------------------ */}
      {configured && !syncUser && (
        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-2">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setError('')
                }}
                className={mode === m ? 'btn-primary btn-sm flex-1' : 'btn-outline btn-sm flex-1'}
              >
                {m === 'signin' ? 'تسجيل الدخول' : 'حساب جديد'}
              </button>
            ))}
          </div>

          <div>
            <label className="label" htmlFor="sync-email">
              البريد الإلكتروني
            </label>
            <input
              id="sync-email"
              type="email"
              className="field"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="label" htmlFor="sync-password">
              كلمة المرور
            </label>
            <input
              id="sync-password"
              type="password"
              className="field"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="٦ أحرف على الأقل"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-bold leading-6 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              <p>{error}</p>
              {error.includes('تفعّل بريدك') && (
                <button
                  type="button"
                  className="mt-1.5 underline"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await resendConfirmation(settings, email.trim())
                      notify('أُرسلت رسالة تأكيد جديدة — افتحها من بريدك.')
                    } catch (err) {
                      setError((err as Error).message)
                    }
                  }}
                >
                  إعادة إرسال رسالة التأكيد
                </button>
              )}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy && <Spinner />}
            {mode === 'signin' ? 'دخول ومزامنة' : 'إنشاء الحساب'}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 text-[11px] font-semibold leading-6 text-ink-400">
              استخدم نفس الحساب على الموبايل واللابتوب لتظهر بياناتك في الاثنين.
            </p>
            {/* لا بد من طريقة للرجوع لبيانات المشروع لو كان الرابط خاطئاً */}
            <button
              type="button"
              className="shrink-0 text-[11px] font-extrabold text-brand-600 underline dark:text-brand-400"
              onClick={() => setShowConfig((v) => !v)}
            >
              {showConfig ? 'إخفاء بيانات المشروع' : 'تعديل بيانات المشروع'}
            </button>
          </div>
        </form>
      )}

      {/* ------------------ الحالة بعد الدخول ------------------ */}
      {syncUser && (
        <div className="space-y-3">
          <div className="rounded-2xl bg-ink-50 p-4 dark:bg-ink-950">
            <p className="text-xs font-bold text-ink-500 dark:text-ink-400">الحساب</p>
            <p dir="ltr" className="mt-0.5 text-start text-sm font-extrabold">
              {syncUser.email}
            </p>

            <div className="mt-3 flex items-center gap-2 text-xs font-bold">
              {syncState.status === 'syncing' && (
                <span className="flex items-center gap-2 text-brand-600 dark:text-brand-300">
                  <Spinner /> جارٍ المزامنة...
                </span>
              )}
              {syncState.status === 'ok' && (
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <IconCheck width={14} height={14} /> {syncState.summary}
                </span>
              )}
              {syncState.status === 'error' && (
                <span className="flex items-start gap-1.5 text-rose-600 dark:text-rose-400">
                  <IconAlert width={14} height={14} /> {syncState.message}
                </span>
              )}
              {syncState.status === 'idle' && settings.lastSyncAt && (
                <span className="text-ink-400">
                  آخر مزامنة: {formatDate(settings.lastSyncAt.slice(0, 10))}
                </span>
              )}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              checked={settings.autoSync !== false}
              onChange={(e) => updateSettings({ autoSync: e.target.checked })}
            />
            مزامنة تلقائية بعد كل تعديل
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void runSync(false)}
              disabled={syncState.status === 'syncing'}
            >
              {syncState.status === 'syncing' ? <Spinner /> : <IconRefresh width={16} height={16} />}
              مزامنة الآن
            </button>
            <button
              type="button"
              className="btn-outline"
              title="يتجاهل المؤشرات ويعيد مطابقة كل البيانات — استخدمه لو اختلفت الأجهزة"
              onClick={() => void runSync(false, true)}
              disabled={syncState.status === 'syncing'}
            >
              مزامنة كاملة
            </button>
            <button type="button" className="btn-outline" onClick={() => setShowConfig((v) => !v)}>
              بيانات المشروع
            </button>
            <button type="button" className="btn-ghost ms-auto" onClick={logout} disabled={busy}>
              تسجيل الخروج
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
