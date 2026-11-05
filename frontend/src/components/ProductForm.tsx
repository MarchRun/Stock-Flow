import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Product } from '../types/api'
import { createProduct, updateProduct } from '../services/api'
import { Modal } from './Modal'

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    setError(null)

    if (!sku.trim() || !name.trim()) {
      setError('SKU and product name are required.')
      return
    }

    const amount = Number(price.trim())
    if (
      !/^\d+$/.test(price.trim()) ||
      !Number.isSafeInteger(amount) ||
      amount < 0 ||
      amount > 2147483647
    ) {
      setError('Enter a whole number between 0 and 2147483647 for the price.')
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
    >
      <form onSubmit={submit}>
        {error && <p className="error" role="alert">{error}</p>}

        <div className="form-field">
          <label htmlFor={`${id}-sku`}>SKU</label>
          <input
            id={`${id}-sku`}
            value={sku}
            onChange={event => setSku(event.target.value)}
            disabled={busy}
          />
        </div>

        <div className="form-field">
          <label htmlFor={`${id}-name`}>Product name</label>
          <input
            id={`${id}-name`}
            value={name}
            onChange={event => setName(event.target.value)}
            disabled={busy}
          />
        </div>

        <div className="form-field">
          <label htmlFor={`${id}-price`}>Price (IDR)</label>
          <input
            id={`${id}-price`}
            type="text"
            inputMode="numeric"
            value={price}
            onChange={event => setPrice(event.target.value)}
            disabled={busy}
          />
        </div>

        <label>
          <input
            type="checkbox"
            checked={active}
            onChange={event => setActive(event.target.checked)}
            disabled={busy}
          />
          {' '}Active
        </label>

        <div className="form-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : product ? 'Save changes' : 'Create product'}
          </button>
        </div>
      </form>
    </Modal>
  )
}