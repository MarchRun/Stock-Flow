import { useEffect, useState } from 'react'
import { fetchMovements } from '../services/api'
import type { Product, StockMovement } from '../types/api'
import { Modal } from './Modal'

interface StockHistoryProps {
  product: Product
  onClose: () => void
}

export function StockHistory({ product, onClose }: StockHistoryProps) {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchMovements(product.id)
        if (active) setMovements(result.data)
      } catch (error) {
        if (active) {
          setError(error instanceof Error ? error.message : 'Could not load stock movements.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [product.id, retry])

  return (
    <Modal title="Stock history" onClose={onClose}>
      <p>{product.sku} — {product.name}</p>
      {loading && <p role="status">Loading movements…</p>}
      {!loading && error && (
        <div className="error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button>
        </div>
      )}
      {!loading && !error && movements.length === 0 && <p>No movements recorded.</p>}
      {!loading && !error && movements.length > 0 && (
        <div className="table-scroll" role="region" aria-label="Stock movements" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col" className="number">Quantity</th>
                <th scope="col">Note</th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(movement => (
                <tr key={movement.id}>
                  <td>{movement.type === 'in' ? 'In' : 'Out'}</td>
                  <td className="number">{movement.qty}</td>
                  <td>{movement.note || '—'}</td>
                  <td>{new Date(movement.created_at).toLocaleString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="form-actions">
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}
