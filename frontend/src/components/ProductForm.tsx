import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Product } from '../types/api'
import { createProduct, updateProduct } from '../services/api'
import { Modal } from './Modal'
import { wholeNumber } from '../lib/validation'

interface ProductFormProps {
  product?: Product
  onClose: () => void
  onSaved: () => void
}

export function ProductForm({
  product,
  onClose,
  onSaved,
}: ProductFormProps) {
  const id = useId()
  const pending = useRef(false)
  const [sku, setSku] = useState(product?.sku ?? '')
  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState(product ? String(product.price) : '')
  const [active, setActive] = useState(product?.is_active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<string | null>(null)

  function reject(message: string, field: string) {
    setError(message)
    setInvalid(field)
    document.getElementById(`${id}-${field}`)?.focus()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    setError(null)
    setInvalid(null)

    if (!sku.trim() || !name.trim()) {
      reject('SKU and product name are required.', !sku.trim() ? 'sku' : 'name')
      return
    }

    const amount = wholeNumber(price)
    if (amount === null) {
      reject('Enter a whole number between 0 and 2147483647 for the price.', 'price')
      return
    }

    pending.current = true
    setBusy(true)

    try {
      const input = {
        sku: sku.trim(),
        name: name.trim(),
        price: amount,
        is_active: active,
      }

      if (product) {
        await updateProduct(product.id, input)
      } else {
        await createProduct(input)
      }

      onSaved()
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not save the product.',
      )
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <Modal
      title={product ? 'Edit product' : 'New product'}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" form={`${id}-form`} className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : product ? 'Save changes' : 'Create product'}
          </button>
        </>
      )}
    >
      <form id={`${id}-form`} onSubmit={submit}>
        {error && <p id={`${id}-error`} className="alert alert-danger" role="alert">{error}</p>}

        <div className="mb-3">
          <label className="form-label" htmlFor={`${id}-sku`}>SKU (required)</label>
          <input
            id={`${id}-sku`}
            aria-required="true"
            aria-invalid={invalid === 'sku'}
            aria-describedby={invalid === 'sku' ? `${id}-error` : undefined}
            className="form-control"
            value={sku}
            onChange={event => setSku(event.target.value)}
            disabled={busy}
          />
        </div>

        <div className="mb-3">
          <label className="form-label" htmlFor={`${id}-name`}>Product name (required)</label>
          <input
            id={`${id}-name`}
            aria-required="true"
            aria-invalid={invalid === 'name'}
            aria-describedby={invalid === 'name' ? `${id}-error` : undefined}
            className="form-control"
            value={name}
            onChange={event => setName(event.target.value)}
            disabled={busy}
          />
        </div>

        <div className="mb-3">
          <label className="form-label" htmlFor={`${id}-price`}>Price (IDR, required)</label>
          <input
            id={`${id}-price`}
            aria-required="true"
            aria-invalid={invalid === 'price'}
            className="form-control"
            type="text"
            inputMode="numeric"
            value={price}
            onChange={event => setPrice(event.target.value)}
            disabled={busy}
            aria-describedby={`${id}-price-help${invalid === 'price' ? ` ${id}-error` : ''}`}
          />
          <div id={`${id}-price-help`} className="form-text">Whole rupiah amounts only.</div>
        </div>

        <label className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            checked={active}
            onChange={event => setActive(event.target.checked)}
            disabled={busy}
          />
          <span className="form-check-label">Active</span>
        </label>

      </form>
    </Modal>
  )
}
