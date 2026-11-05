import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { adjustStock } from '../services/api'
import { ApiError } from '../types/api'
import type { Product, StockInput } from '../types/api'
import { Modal } from './Modal'

interface StockAdjustProps {
  product: Product
  onClose: () => void
  onSaved: () => void
}

export function StockAdjust({ product, onClose, onSaved }: StockAdjustProps) {
  const id = useId()
  const pending = useRef(false)
  const [direction, setDirection] = useState<StockInput['type']>('in')
  const [quantity, setQuantity] = useState('1')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    setError(null)

    const qty = Number(quantity.trim())
    if (!/^\d+$/.test(quantity.trim()) || !Number.isSafeInteger(qty) ||
      qty < 1 || qty > 2147483647) {
      setError('Enter a whole number between 1 and 2147483647 for the quantity.')
      return
    }

    pending.current = true
    setBusy(true)
    try {
      await adjustStock(product.id, {
        type: direction,
        qty,
        note: note.trim() || undefined,
      })
      onSaved()
    } catch (error) {
      if (error instanceof ApiError && typeof error.detail === 'object' &&
        error.detail.code === 'INSUFFICIENT_STOCK') {
        setError(`Not enough stock. Available quantity: ${error.detail.available ?? product.stock}.`)
      } else {
        setError(error instanceof Error ? error.message : 'Could not adjust stock.')
      }
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <Modal title="Adjust stock" busy={busy} onClose={onClose}>
      <p>{product.sku} — {product.name}</p>
      <p>Stock when opened: {product.stock}</p>
      <form onSubmit={submit}>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-field">
          <label htmlFor={`${id}-direction`}>Adjustment type</label>
          <select
            id={`${id}-direction`}
            value={direction}
            disabled={busy}
            onChange={event => setDirection(event.target.value as StockInput['type'])}
          >
            <option value="in">Add stock</option>
            <option value="out">Remove stock</option>
          </select>
        </div>
        <div className="form-field">
          <label htmlFor={`${id}-quantity`}>Quantity</label>
          <input
            id={`${id}-quantity`}
            type="text"
            inputMode="numeric"
            value={quantity}
            disabled={busy}
            onChange={event => setQuantity(event.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor={`${id}-note`}>Note (optional)</label>
          <textarea
            id={`${id}-note`}
            value={note}
            disabled={busy}
            onChange={event => setNote(event.target.value)}
          />
        </div>
        <div className="form-actions">
          <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save adjustment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
