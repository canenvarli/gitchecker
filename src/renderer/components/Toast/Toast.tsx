import { createPortal } from 'react-dom'
import type { Toast as ToastItem } from '../../hooks/useToast'
import { colors } from '../../theme/colors'

interface ToastContainerProps {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return createPortal(
    <div style={{ position: 'fixed', bottom: '40px', right: '16px', zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'none' }}>
      {toasts.map((toast) => (
        <ToastItemComponent key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  )
}

function ToastItemComponent({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const borderColor = toast.type === 'error' ? colors.status.D
    : toast.type === 'success' ? colors.status.A
    : colors.accent

  return (
    <div
      style={{ pointerEvents: 'all', display: 'flex', alignItems: 'flex-start', gap: '10px',
        padding: '10px 14px', backgroundColor: colors.bg.secondary, border: `1px solid ${borderColor}44`,
        borderLeft: `3px solid ${borderColor}`, borderRadius: '8px', maxWidth: '340px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)', fontSize: '13px', color: colors.text.primary,
        lineHeight: '1.4' }}
    >
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer',
          color: colors.text.muted, fontSize: '16px', lineHeight: 1, padding: 0, flexShrink: 0 }}
      >
        ×
      </button>
    </div>
  )
}
