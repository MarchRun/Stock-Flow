import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { fetchOrder } from '../services/api'
import type { Order } from '../types/api'
import { Modal } from './Modal'

interface OrderLookupProps {
  onClose: () => void
  onFound: (order: Order) => void
}

export function OrderLookup({ onClose, onFound }: OrderLookupProps) {
  const id = useId()
  const pending = useRef(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    setError(null)

    const number = Number(value.trim())
    if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(number) ||
      number < 1 || number > 2147483647) {
      setError('Enter a whole number between 1 and 2147483647 for the order ID.')
      return
    }

    pending.current = true
    setBusy(true)
    try {
      onFound(await fetchOrder(number))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load the order.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <Modal title="Look up an order" onClose={onClose} busy={busy}>
      <form onSubmit={submit}>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-field">
          <label htmlFor={id}>Order ID</label>
          <input
            id={id}
            inputMode="numeric"
            value={value}
            disabled={busy}
            onChange={event => setValue(event.target.value)}
          />
        </div>
        <div className="form-actions">
          <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Loading…' : error ? 'Retry lookup' : 'Find order'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
