import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * شبكة أمان أخيرة: أي خطأ غير متوقع في الواجهة يعرض شاشة مفهومة
 * مع إمكانية تنزيل نسخة احتياطية قبل أي إجراء — حتى لا يفقد المستخدم بياناته.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('خطأ غير متوقع في الواجهة:', error, info.componentStack)
  }

  private downloadBackup = () => {
    try {
      const raw = localStorage.getItem('tashteeb:data:v1') ?? '{}'
      const blob = new Blob([raw], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `نسخة-احتياطية-طارئة-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('تعذّر تصدير البيانات.')
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 dark:bg-ink-950">
        <div className="card w-full max-w-md p-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-2xl dark:bg-rose-500/15">
            ⚠️
          </div>
          <h1 className="text-lg font-extrabold">حدث خطأ غير متوقع</h1>
          <p className="mt-2 text-sm leading-7 text-ink-500 dark:text-ink-400">
            بياناتك ما زالت محفوظة على جهازك. نزّل نسخة احتياطية أولاً ثم أعد تحميل الصفحة.
          </p>

          <div className="mt-5 flex flex-col gap-2">
            <button type="button" className="btn-outline" onClick={this.downloadBackup}>
              تنزيل نسخة احتياطية
            </button>
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              إعادة تحميل التطبيق
            </button>
          </div>

          <details className="mt-4 text-start">
            <summary className="cursor-pointer text-xs font-bold text-ink-400">
              تفاصيل تقنية
            </summary>
            <pre
              dir="ltr"
              className="mt-2 max-h-40 overflow-auto rounded-xl bg-ink-100 p-3 text-[11px] leading-5 text-ink-600 dark:bg-ink-950 dark:text-ink-300"
            >
              {this.state.error.message}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}
