import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createOrder, fetchActiveProducts } from '../services/api'
import { ApiError } from '../types/api'
import type { Order, Product } from '../types/api'
import { Modal } from './Modal'

interface OrderFormProps {
  onClose: () => void
  onCreated: (order: Order) => void
}

interface ItemDraft {
  id: number
  sku: string
  quantity: string
}

export function OrderForm({ onClose, onCreated }: OrderFormProps) {
  const id = useId()
  const nextID = useRef(2)
  const pending = useRef(false)
  const [customer, setCustomer] = useState('')
  const [items, setItems] = useState<ItemDraft[]>([{ id: 1, sku: '', quantity: '1' }])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedSKU, setFailedSKU] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const result = await fetchActiveProducts()
        if (active) setProducts(result)
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : 'Could not load products.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [retry])

  function changeItem(itemID: number, field: 'sku' | 'quantity', value: string) {
    setItems(current => current.map(item => item.id === itemID ? { ...item, [field]: value } : item))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    setError(null)
    setFailedSKU(null)

    if (!customer.trim()) {
      setError('Customer name is required.')
      return
    }

    const seen = new Set<string>()
    const parsed = []
    for (const item of items) {
      const sku = item.sku.trim()
      if (!sku) {
        setError('Select a product for every item.')
        return
      }
      if (seen.has(sku)) {
        setFailedSKU(sku)
        setError('Each product can only appear once in an order.')
        return
      }
      seen.add(sku)
      const qty = Number(item.quantity.trim())
      if (!/^\d+$/.test(item.quantity.trim()) || !Number.isSafeInteger(qty) ||
        qty < 1 || qty > 2147483647) {
        setFailedSKU(sku)
        setError(`Enter a whole number between 1 and 2147483647 for ${sku}.`)
        return
      }
      parsed.push({ sku, qty })
    }

    pending.current = true
    setBusy(true)
    try {
      const order = await createOrder({ customer: customer.trim(), items: parsed })
      onCreated(order)
    } catch (error) {
      if (error instanceof ApiError && typeof error.detail === 'object' &&
        error.detail.code === 'INSUFFICIENT_STOCK') {
        const sku = error.detail.sku
        setFailedSKU(sku ?? null)
        setError(`Not enough stock for ${sku ?? 'this item'}. Available quantity: ${error.detail.available ?? 0}.`)
      } else {
        setError(error instanceof Error ? error.message : 'Could not create the order.')
      }
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <Modal title="Create order" onClose={onClose} busy={busy}>
      {loading && <p role="status">Loading products…</p>}
      {!loading && loadError && (
        <div className="error" role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button>
        </div>
      )}
      {!loading && !loadError && products.length === 0 && <p>No active products available.</p>}
      {!loading && !loadError && products.length > 0 && (
        <form onSubmit={submit}>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="form-field">
            <label htmlFor={`${id}-customer`}>Customer name</label>
            <input
              id={`${id}-customer`}
              value={customer}
              disabled={busy}
              onChange={event => setCustomer(event.target.value)}
            />
          </div>
          {items.map((item, index) => (
            <fieldset
              key={item.id}
              disabled={busy}
              className={`order-item ${failedSKU === item.sku ? 'invalid' : ''}`}
            >
              <legend>Item {index + 1}{failedSKU === item.sku ? ' — check stock or quantity' : ''}</legend>
              <div className="form-field">
                <label htmlFor={`${id}-sku-${item.id}`}>Product</label>
                <select
                  id={`${id}-sku-${item.id}`}
                  value={item.sku}
                  aria-invalid={failedSKU === item.sku}
                  onChange={event => changeItem(item.id, 'sku', event.target.value)}
                >
                  <option value="">Select a product</option>
                  {products.map(product => (
                    <option key={product.id} value={product.sku}>
                      {product.sku} — {product.name} ({product.stock} in stock)
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor={`${id}-qty-${item.id}`}>Quantity</label>
                <input
                  id={`${id}-qty-${item.id}`}
                  inputMode="numeric"
                  value={item.quantity}
                  onChange={event => changeItem(item.id, 'quantity', event.target.value)}
                />
              </div>
              <button
                type="button"
                disabled={items.length === 1}
                onClick={() => setItems(current => current.filter(row => row.id !== item.id))}
              >
                Remove item {index + 1}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const itemID = nextID.current++
              setItems(current => [...current, { id: itemID, sku: '', quantity: '1' }])
            }}
          >
            Add item
          </button>
          <div className="form-actions">
            <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Creating order…' : 'Create order'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
