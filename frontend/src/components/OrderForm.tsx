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
  const [invalidID, setInvalidID] = useState<string | null>(null)

  useEffect(() => {
    if (invalidID && !busy) document.getElementById(invalidID)?.focus()
  }, [invalidID, busy])

  function reject(message: string, fieldID: string) {
    setError(message)
    setInvalidID(fieldID)
  }

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
    setInvalidID(null)

    if (!customer.trim()) {
      reject('Customer name is required.', `${id}-customer`)
      return
    }

    const seen = new Set<string>()
    const parsed = []
    for (const item of items) {
      const sku = item.sku.trim()
      if (!sku) {
        reject('Select a product for every item.', `${id}-sku-${item.id}`)
        return
      }
      if (seen.has(sku)) {
        setFailedSKU(sku)
        reject('Each product can only appear once in an order.', `${id}-sku-${item.id}`)
        return
      }
      seen.add(sku)
      const qty = Number(item.quantity.trim())
      if (!/^\d+$/.test(item.quantity.trim()) || !Number.isSafeInteger(qty) ||
        qty < 1 || qty > 2147483647) {
        setFailedSKU(sku)
        reject(`Enter a whole number between 1 and 2147483647 for ${sku}.`, `${id}-qty-${item.id}`)
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
        const failedItem = items.find(item => item.sku === sku)
        if (failedItem) setInvalidID(`${id}-qty-${failedItem.id}`)
      } else {
        setError(error instanceof Error ? error.message : 'Could not create the order.')
      }
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Create order"
      size="lg"
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onClose}>Cancel</button>
          {!loading && !loadError && products.length > 0 && (
            <button type="submit" form={`${id}-form`} className="btn btn-primary" disabled={busy}>
              {busy ? 'Creating order…' : 'Create order'}
            </button>
          )}
        </>
      )}
    >
      {loading && <p role="status">Loading products…</p>}
      {!loading && loadError && (
        <div className="alert alert-danger" role="alert">
          <p>{loadError}</p>
          <button type="button" className="btn btn-outline-danger" onClick={() => setRetry(value => value + 1)}>Retry</button>
        </div>
      )}
      {!loading && !loadError && products.length === 0 && <p>No active products available.</p>}
      {!loading && !loadError && products.length > 0 && (
        <form id={`${id}-form`} onSubmit={submit}>
          {error && <p id={`${id}-error`} className="alert alert-danger" role="alert">{error}</p>}
          <div className="mb-3">
            <label className="form-label" htmlFor={`${id}-customer`}>Customer name (required)</label>
            <input
              id={`${id}-customer`}
              aria-required="true"
              aria-invalid={invalidID === `${id}-customer`}
              aria-describedby={invalidID === `${id}-customer` ? `${id}-error` : undefined}
              className="form-control"
              value={customer}
              disabled={busy}
              onChange={event => setCustomer(event.target.value)}
            />
          </div>
          {items.map((item, index) => (
            <fieldset
              key={item.id}
              disabled={busy}
              className={`border rounded p-3 mb-3 ${failedSKU === item.sku ? 'border-danger' : ''}`}
            >
              <legend className="float-none w-auto px-1 fs-6">Item {index + 1}{failedSKU === item.sku ? ' — check stock or quantity' : ''}</legend>
              <div className="row g-3">
                <div className="col-12 col-sm-9">
                  <label className="form-label" htmlFor={`${id}-sku-${item.id}`}>Product (required)</label>
                  <select
                    id={`${id}-sku-${item.id}`}
                    aria-required="true"
                    className={`form-select ${failedSKU === item.sku ? 'is-invalid' : ''}`}
                    value={item.sku}
                    aria-invalid={failedSKU === item.sku || invalidID === `${id}-sku-${item.id}`}
                    aria-describedby={failedSKU === item.sku || invalidID === `${id}-sku-${item.id}` ? `${id}-error` : undefined}
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
                <div className="col-12 col-sm-3">
                  <label className="form-label" htmlFor={`${id}-qty-${item.id}`}>Quantity (required)</label>
                  <input
                    id={`${id}-qty-${item.id}`}
                    aria-required="true"
                    aria-invalid={invalidID === `${id}-qty-${item.id}`}
                    aria-describedby={invalidID === `${id}-qty-${item.id}` ? `${id}-error` : undefined}
                    className="form-control"
                    inputMode="numeric"
                    value={item.quantity}
                    onChange={event => changeItem(item.id, 'quantity', event.target.value)}
                  />
                </div>
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm mt-3"
                  onClick={() => setItems(current => current.filter(row => row.id !== item.id))}
                >
                  Remove item {index + 1}
                </button>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            disabled={busy}
            className="btn btn-outline-primary"
            onClick={() => {
              const itemID = nextID.current++
              setItems(current => [...current, { id: itemID, sku: '', quantity: '1' }])
            }}
          >
            Add item
          </button>
        </form>
      )}
    </Modal>
  )
}
