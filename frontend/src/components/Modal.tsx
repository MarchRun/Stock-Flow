import { useId } from 'react'
import type { ReactNode } from 'react'
import BootstrapModal from 'react-bootstrap/Modal'
import CloseButton from 'react-bootstrap/CloseButton'
import './Modal.css'

interface ModalProps {
  title: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
  size?: 'sm' | 'lg' | 'xl'
  footer?: ReactNode
}

export function Modal({
  title,
  children,
  onClose,
  busy = false,
  size,
  footer,
}: ModalProps) {
  const titleId = useId()

  return (
    <BootstrapModal
      show
      centered
      scrollable
      size={size}
      backdrop="static"
      keyboard={!busy}
      onHide={() => {
        if (!busy) onClose()
      }}
      aria-labelledby={titleId}
      aria-busy={busy}
    >
      <BootstrapModal.Header>
        <BootstrapModal.Title as="h2" id={titleId} className="fs-5">{title}</BootstrapModal.Title>
        <CloseButton
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        />
      </BootstrapModal.Header>
      <BootstrapModal.Body>{children}</BootstrapModal.Body>
      {footer && <BootstrapModal.Footer>{footer}</BootstrapModal.Footer>}
    </BootstrapModal>
  )
}
