import { useEffect, useRef } from 'react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import './Modal.css'

interface ModalProps {
  title: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
}

export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    dialog.showModal()

    return () => {
      dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={event => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <header className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {children}
    </dialog>
  )
}