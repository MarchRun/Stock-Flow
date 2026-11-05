import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { adjustStock } from '../services/api'
import { ApiError } from '../types/api'
import type { Product, StockInput } from '../types/api'
import { Modal } from './Modal'
import { wholeNumber } from '../lib/validation'

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
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (invalid && !busy) document.getElementById(`${id}-quantity`)?.focus()
  }, [invalid, busy, id])

  function reject(message: string) {
    setError(message)
    setInvalid(true)
    document.getElementById(`${id}-quantity`)?.focus()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    setError(null)
    setInvalid(false)

    const qty = wholeNumber(quantity, 1)
    if (qty === null) {
      reject('Enter a whole number between 1 and 2147483647 for the quantity.')
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
        reject(`Not enough stock. Available quantity: ${error.detail.available ?? product.stock}.`)
      } else {
        setError(error instanceof Error ? error.message : 'Could not adjust stock.')
      }
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Adjust stock"
      busy={busy}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" form={`${id}-form`} className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save adjustment'}
          </button>
        </>
      )}
    >
      <div className="bg-body-tertiary rounded p-3 mb-3">
        <p className="fw-semibold mb-1">{product.name}</p>
        <p className="text-body-secondary small mb-0">{product.sku} · Stock at opening: {product.stock}</p>
      </div>
      <form id={`${id}-form`} onSubmit={submit}>
        {error && <p id={`${id}-error`} className="alert alert-danger" role="alert">{error}</p>}
        <div className="row g-3">
        <div className="col-12 col-sm-7 mb-3">
          <label className="form-label" htmlFor={`${id}-direction`}>Adjustment type</label>
          <select
            id={`${id}-direction`}
            className="form-select"
            value={direction}
            disabled={busy}
            onChange={event => setDirection(event.target.value as StockInput['type'])}
          >
            <option value="in">Add stock</option>
            <option value="out">Remove stock</option>
          </select>
        </div>
        <div className="col-12 col-sm-5 mb-3">
          <label className="form-label" htmlFor={`${id}-quantity`}>Quantity (required)</label>
          <input
            id={`${id}-quantity`}
            aria-required="true"
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            className="form-control"
            type="text"
            inputMode="numeric"
            value={quantity}
            disabled={busy}
            onChange={event => setQuantity(event.target.value)}
          />
        </div>
        </div>
        <div className="mb-3">
          <label className="form-label" htmlFor={`${id}-note`}>Note (optional)</label>
          <textarea
            id={`${id}-note`}
            className="form-control"
            rows={3}
            value={note}
            disabled={busy}
            onChange={event => setNote(event.target.value)}
          />
        </div>
      </form>
    </Modal>
  )
}
