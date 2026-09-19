import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/utils'
import { IconAlert, IconCheck, IconClose, IconInfo } from './Icons'
import { useStore } from '../store'

/* ------------------------------- Modal ------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const width = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  }[size]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink-900/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-pop animate-pop-in',
          'dark:bg-ink-900 sm:rounded-3xl',
          width,
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
          <div>
            <h2 className="text-base font-extrabold sm:text-lg">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
          >
            <IconClose />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-3 dark:border-ink-800 dark:bg-ink-950/40">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ---------------------------- ConfirmDialog --------------------------- */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'تأكيد',
  danger = true,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button
            type="button"
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {message && <p className="text-sm leading-7 text-ink-600 dark:text-ink-300">{message}</p>}
      {children}
    </Modal>
  )
}

/* ------------------------------ Toasts ------------------------------- */

export function Toasts() {
  const { toasts, dismissToast } = useStore()
  if (!toasts.length) return null

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-start sm:ps-6">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismissToast(t.id)}
          className={cx(
            'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl px-4 py-3 text-start text-sm font-semibold shadow-pop animate-fade-up',
            t.tone === 'success' && 'bg-emerald-600 text-white',
            t.tone === 'error' && 'bg-rose-600 text-white',
            t.tone === 'info' && 'bg-ink-900 text-white dark:bg-ink-700',
          )}
        >
          <span className="mt-0.5 shrink-0">
            {t.tone === 'success' ? <IconCheck /> : t.tone === 'error' ? <IconAlert /> : <IconInfo />}
          </span>
          <span className="leading-6">{t.text}</span>
        </button>
      ))}
    </div>,
    document.body,
  )
}

/* ---------------------------- EmptyState ----------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink-200 px-6 py-14 text-center dark:border-ink-700">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400 dark:bg-ink-800">
        {icon}
      </div>
      <h3 className="text-base font-extrabold">{title}</h3>
      {description && (
        <p className="max-w-md text-sm leading-7 text-ink-500 dark:text-ink-400">{description}</p>
      )}
      {action}
    </div>
  )
}

/* ------------------------------ Spinner ------------------------------ */

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      aria-hidden
    />
  )
}

/* ----------------------------- Progress ------------------------------ */

export function ProgressBar({
  value,
  tone = 'brand',
}: {
  /** نسبة من 0 إلى 1 (قد تتجاوز 1 عند تخطي الميزانية) */
  value: number
  tone?: 'brand' | 'warn' | 'danger' | 'ok'
}) {
  const pct = Math.max(0, Math.min(value, 1)) * 100
  const over = value > 1
  const color = {
    brand: 'bg-brand-600',
    ok: 'bg-emerald-500',
    warn: 'bg-amber-500',
    danger: 'bg-rose-500',
  }[over ? 'danger' : tone]

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
      <div className={cx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

/* ------------------------------ Tooltip-ish badge --------------------- */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info'
  className?: string
}) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
    ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    warn: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    danger: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    info: 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
  }
  return <span className={cx('chip', tones[tone], className)}>{children}</span>
}

/* --------------------------- useObjectUrl ---------------------------- */

/** ينشئ رابط عرض مؤقت لصورة محفوظة في IndexedDB ويحرره تلقائياً */
export function useObjectUrl(loader: () => Promise<Blob | undefined>, deps: unknown[]) {
  const [url, setUrl] = useState<string | null>(null)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    let revoked = false
    let current: string | null = null
    loaderRef
      .current()
      .then((blob) => {
        if (!blob || revoked) return
        current = URL.createObjectURL(blob)
        setUrl(current)
      })
      .catch(() => setUrl(null))
    return () => {
      revoked = true
      if (current) URL.revokeObjectURL(current)
      setUrl(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return url
}
