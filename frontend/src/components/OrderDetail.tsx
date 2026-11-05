import { useRef, useState } from 'react'
import { cancelOrder, fetchOrder } from '../services/api'
import { ApiError } from '../types/api'
import type { Order } from '../types/api'
import { Modal } from './Modal'

interface OrderDetailProps {
  order: Order
  onClose: () => void
  onChanged: (order: Order) => void
}

const currency = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

export function OrderDetail({ order, onClose, onChanged }: OrderDetailProps) {
  const pending = useRef(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cancel() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError(null)

    try {
      const updated = await cancelOrder(order.id)
      onChanged(updated)
      setConfirming(false)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try {
          const updated = await fetchOrder(order.id)
          onChanged(updated)
          if (updated.status === 'CANCELLED') setConfirming(false)
        } catch {
          setError(`${error.message} Could not refresh the order. Close and look it up again.`)
          return
        }
      }
      setError(error instanceof Error ? error.message : 'Could not cancel the order.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <Modal title={`Order ${order.id}`} onClose={onClose} busy={busy}>
      <dl className="order-facts">
        <dt>Customer</dt><dd>{order.customer}</dd>
        <dt>Status</dt><dd>{order.status === 'CREATED' ? 'Created' : 'Cancelled'}</dd>
        <dt>Created</dt><dd>{new Date(order.created_at).toLocaleString('en-GB')}</dd>
        {order.cancelled_at && (
          <>
            <dt>Cancelled</dt><dd>{new Date(order.cancelled_at).toLocaleString('en-GB')}</dd>
          </>
        )}
      </dl>
      <div className="table-scroll" role="region" aria-label="Order items" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">SKU</th>
              <th scope="col" className="number">Quantity</th>
              <th scope="col" className="number">Unit price</th>
              <th scope="col" className="number">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map(item => (
              <tr key={item.id}>
                <td>{item.sku}</td>
                <td className="number">{item.qty}</td>
                <td className="number">{currency.format(item.unit_price)}</td>
                <td className="number">{currency.format(item.unit_price * item.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p><strong>Total: {currency.format(order.total)}</strong></p>
      {error && <p className="error" role="alert">{error}</p>}
      {order.status === 'CREATED' && (
        confirming ? (
          <div className="cancel-confirmation">
            <p>Cancel order {order.id}? This will restore stock for all items.</p>
            <div className="form-actions">
              <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
                Keep order
              </button>
              <button type="button" className="danger" disabled={busy} onClick={cancel}>
                {busy ? 'Cancelling…' : 'Yes, cancel order'}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="danger" onClick={() => setConfirming(true)}>
            Cancel order
          </button>
        )
      )}
      <div className="form-actions">
        <button type="button" disabled={busy} onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}
