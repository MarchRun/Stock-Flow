import { useRef, useState } from 'react'
import { deleteProduct } from '../services/api'
import type { Product } from '../types/api'
import { Modal } from './Modal'

interface DeleteProductProps {
  product: Product
  onClose: () => void
  onDeleted: () => void
}

export function DeleteProduct({ product, onClose, onDeleted }: DeleteProductProps) {
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError(null)

    try {
      await deleteProduct(product.id)
      onDeleted()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not delete the product.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Delete product"
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={confirm}>
            {busy ? 'Deleting…' : 'Delete product'}
          </button>
        </>
      )}
    >
      <p>Delete <strong>{product.name}</strong> ({product.sku})? This cannot be undone.</p>
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
    </Modal>
  )
}
