import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { AiError, askAssistant, buildProjectContext, onAiProgress, type AiProgress } from '../lib/ai'
import { cx } from '../lib/utils'
import { Spinner } from '../components/ui'
import {
  IconAlert,
  IconChat,
  IconRefresh,
  IconSend,
  IconSparkles,
  IconTrash,
} from '../components/Icons'

const SUGGESTIONS = [
  'ما هو ملخص مصاريفي حتى الآن وأين ذهب أكبر مبلغ؟',
  'كم استغرقت مرحلة السباكة وكم تكلفت؟',
  'أين يمكنني توفير المال في المراحل القادمة؟',
  'ما ترتيب مراحل التشطيب الصحيح وما الذي تبقّى لي؟',
  'اقترح بدائل أرخص بنفس الجودة للبنود الأعلى تكلفة عندي',
  'قارن مصروف كل شهر واشرح سبب الارتفاع',
]

export default function Assistant() {
  const { chat, expenses, categories, settings, appendChat, removeChat, clearChat } = useStore()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  /** آخر سؤال أُرسل — يُستخدم في زر «إعادة المحاولة» بعد فشل عابر */
  const [lastQuestion, setLastQuestion] = useState('')
  const [progress, setProgress] = useState<AiProgress | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const context = useMemo(
    () => buildProjectContext(expenses, categories, settings),
    [expenses, categories, settings],
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chat.length, loading])

  useEffect(() => () => abortRef.current?.abort(), [])

  /* عرض تقدّم إعادة المحاولة بدل انتظار صامت */
  useEffect(() => onAiProgress(setProgress), [])

  const send = async (question: string, echoUser = true) => {
    const text = question.trim()
    if (!text || loading) return

    setInput('')
    setLastQuestion(text)
    if (echoUser) appendChat({ role: 'user', content: text })
    setProgress(null)
    setLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const answer = await askAssistant(text, chat, context, settings, controller.signal)
      appendChat({ role: 'assistant', content: answer })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      appendChat({
        role: 'assistant',
        content: err instanceof AiError ? err.message : 'حدث خطأ غير متوقع. أعد المحاولة.',
        isError: true,
      })
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  /** إعادة إرسال آخر سؤال بعد حذف فقاعة الخطأ */
  const retry = (errorId: string) => {
    if (!lastQuestion) return
    removeChat(errorId)
    void send(lastQuestion, false)
  }

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[520px] flex-col lg:h-[calc(100vh-11rem)]">
      <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 dark:border-ink-800">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <IconSparkles width={18} height={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-extrabold">مهندس التشطيب</h2>
            <p className="text-[11px] font-semibold text-ink-400">
              يجيب من واقع بياناتك المسجّلة وخبرته في السوق المصري
            </p>
          </div>
          {chat.length > 0 && (
            <button
              type="button"
              onClick={clearChat}
              className="rounded-lg p-2 text-ink-400 transition hover:bg-ink-100 hover:text-rose-600 dark:hover:bg-ink-800"
              aria-label="مسح المحادثة"
            >
              <IconTrash width={17} height={17} />
            </button>
          )}
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {chat.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10">
                <IconChat width={26} height={26} />
              </span>
              <div>
                <h3 className="text-base font-extrabold">اسألني عن مشروعك</h3>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-6 text-ink-500 dark:text-ink-400">
                  أعرف كل مصاريفك المسجّلة وتواريخها وتصنيفاتها، وأقدر أساعدك في التكلفة والتوفير
                  والنصائح الفنية للتشطيب.
                </p>
              </div>
              <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-start text-xs font-bold leading-6 transition hover:border-brand-400 hover:bg-brand-50 dark:border-ink-700 dark:bg-ink-900 dark:hover:border-brand-500 dark:hover:bg-brand-500/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
              {!expenses.length && (
                <p className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                  <IconAlert width={15} height={15} /> سجّل بعض المصاريف أولاً للحصول على إجابات دقيقة.
                </p>
              )}
            </div>
          )}

          {chat.map((m) => (
            <div
              key={m.id}
              className={cx('flex', m.role === 'user' ? 'justify-start' : 'justify-end')}
            >
              <div
                className={cx(
                  'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7 animate-fade-up sm:max-w-[75%]',
                  m.role === 'user'
                    ? 'bg-brand-600 text-white'
                    : m.isError
                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
                      : 'bg-ink-100 text-ink-800 dark:bg-ink-800 dark:text-ink-100',
                )}
              >
                {m.role === 'assistant' ? <RichText text={m.content} /> : m.content}
                {m.isError && lastQuestion && (
                  <button
                    type="button"
                    onClick={() => retry(m.id)}
                    disabled={loading}
                    className="mt-2.5 flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-extrabold text-white transition hover:bg-rose-700 disabled:opacity-50"
                  >
                    <IconRefresh width={14} height={14} /> إعادة المحاولة
                  </button>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-end">
              <div className="flex items-center gap-2 rounded-2xl bg-ink-100 px-4 py-3 text-xs font-bold text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                <Spinner />
                {progress
                  ? `الخدمة مزدحمة — إعادة المحاولة ${progress.attempt}/${progress.max} بعد ${progress.waitSeconds} ثانية...`
                  : 'جارٍ التفكير...'}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
          className="flex items-end gap-2 border-t border-ink-100 px-3 py-3 dark:border-ink-800"
        >
          <textarea
            className="field max-h-32 min-h-[46px] flex-1 resize-none py-3"
            placeholder="اكتب سؤالك هنا..."
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(input)
              }
            }}
            aria-label="سؤالك"
          />
          <button
            type="submit"
            className="btn-primary h-[46px] w-[46px] shrink-0 p-0"
            disabled={loading || !input.trim()}
            aria-label="إرسال"
          >
            {loading ? <Spinner /> : <IconSend width={19} height={19} />}
          </button>
        </form>
      </div>
    </div>
  )
}

/** عرض مبسّط لتنسيق الرد: عناوين، نقاط، ونص عريض */
function RichText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} className="h-1.5" />

        if (/^#{1,6}\s/.test(trimmed)) {
          return (
            <p key={i} className="pt-1 text-sm font-extrabold">
              {inline(trimmed.replace(/^#{1,6}\s/, ''))}
            </p>
          )
        }
        if (/^([-*•]|\d+[.)])\s/.test(trimmed)) {
          return (
            <p key={i} className="flex gap-2 ps-1">
              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
              <span>{inline(trimmed.replace(/^([-*•]|\d+[.)])\s/, ''))}</span>
            </p>
          )
        }
        return <p key={i}>{inline(trimmed)}</p>
      })}
    </div>
  )
}

function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <strong key={i} className="font-extrabold">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  )
}
