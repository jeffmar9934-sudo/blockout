/**
 * Transient notifications. Toasts auto-dismiss (store handles the timer);
 * clicking one dismisses it early.
 */

import { useStore } from '../store'
import { zh } from '../i18n/zh-CN'

export function Toasts(): JSX.Element {
  const toasts = useStore((s) => s.toasts)
  const dismissToast = useStore((s) => s.dismissToast)

  return (
    <div className="toasts" aria-label="通知">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.kind}`}
          onClick={() => dismissToast(t.id)}
        >
          {zh(t.text)}
        </div>
      ))}
    </div>
  )
}
