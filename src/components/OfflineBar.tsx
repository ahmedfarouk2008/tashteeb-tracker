import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { IconAlert, IconCheck, IconRefresh } from './Icons'

/** مراقبة حالة الاتصال — الأحداث وحدها لا تكفي عند تغيّر الشبكة فجأة */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

/**
 * شريط علوي يوضّح حالة العمل بدون إنترنت، وإشعار توفّر نسخة جديدة.
 * التحديث لا يُطبَّق تلقائياً حتى لا تُعاد تحميل الصفحة أثناء إدخال بيانات.
 */
export default function OfflineBar() {
  const online = useOnline()
  const [readyShown, setReadyShown] = useState(false)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // فحص دوري لوجود نسخة أحدث (كل ساعة) دون إزعاج المستخدم
      if (registration) {
        setInterval(() => void registration.update().catch(() => undefined), 60 * 60 * 1000)
      }
    },
  })

  /* رسالة «جاهز للعمل بدون إنترنت» تظهر مرة واحدة ثم تختفي */
  useEffect(() => {
    if (!offlineReady) return
    setReadyShown(true)
    const timer = window.setTimeout(() => {
      setReadyShown(false)
      setOfflineReady(false)
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [offlineReady, setOfflineReady])

  if (needRefresh) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 bg-brand-600 px-4 py-2 text-xs font-bold text-white">
        <span>تتوفّر نسخة محدَّثة من التطبيق.</span>
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1 font-extrabold transition hover:bg-white/30"
        >
          <IconRefresh width={14} height={14} /> تحديث الآن
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="opacity-75 underline"
        >
          لاحقاً
        </button>
      </div>
    )
  }

  if (!online) {
    return (
      <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-xs font-bold text-amber-950">
        <IconAlert width={15} height={15} />
        أنت بدون إنترنت — التسجيل والتقارير تعمل كالمعتاد، والمزايا الذكية ستعود عند الاتصال.
      </div>
    )
  }

  if (readyShown) {
    return (
      <div className="flex items-center justify-center gap-2 bg-emerald-600 px-4 py-2 text-xs font-bold text-white">
        <IconCheck width={15} height={15} />
        التطبيق جاهز الآن للعمل بدون إنترنت.
      </div>
    )
  }

  return null
}
