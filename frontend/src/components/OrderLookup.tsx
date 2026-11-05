import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { fetchOrder } from '../services/api'
import { ApiError } from '../types/api'
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
  const [invalid, setInvalid] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    setError(null)
    setInvalid(false)

    const number = Number(value.trim())
    if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(number) ||
      number < 1 || number > 2147483647) {
      setError('Enter a whole number between 1 and 2147483647 for the order ID.')
      setInvalid(true)
      document.getElementById(id)?.focus()
      return
    }

    pending.current = true
    setBusy(true)
    try {
      onFound(await fetchOrder(number))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load the order.')
      setInvalid(error instanceof ApiError && error.status === 404)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Find order"
      size="sm"
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" form={`${id}-form`} className="btn btn-primary" disabled={busy}>
            {busy ? 'Loading…' : error ? 'Retry lookup' : 'Find order'}
          </button>
        </>
      )}
    >
      <form id={`${id}-form`} onSubmit={submit}>
        {error && <p id={`${id}-error`} className="alert alert-danger" role="alert">{error}</p>}
        <div className="mb-3">
          <label className="form-label" htmlFor={id}>Order ID (required)</label>
          <input
            id={id}
            aria-required="true"
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            className="form-control"
            inputMode="numeric"
            value={value}
            disabled={busy}
            onChange={event => setValue(event.target.value)}
          />
        </div>
      </form>
    </Modal>
  )
}
