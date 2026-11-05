import { useEffect, useState } from 'react'
import { fetchSummary } from '../services/api'
import type { InventorySummary } from '../types/api'

interface SummaryCardsProps {
  refresh: number
}

const currency = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

export function SummaryCards({ refresh }: SummaryCardsProps) {
  const [summary, setSummary] = useState<InventorySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchSummary()
        if (active) setSummary(result)
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : 'Could not load the inventory summary.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [refresh, retry])

  return (
    <section aria-label="Inventory summary" aria-busy={loading}>
      {loading && <p role="status">Loading inventory summary…</p>}
      {!loading && error && (
        <div className="alert alert-danger" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-outline-danger" onClick={() => setRetry(value => value + 1)}>Retry summary</button>
        </div>
      )}
      {!loading && !error && summary && (
        <div className="row g-3 mb-4 summary-cards">
          <div className="col-12 col-sm-6 col-xl-3"><dl className="card card-body h-100 mb-0"><dt>Products</dt><dd>{summary.total_products}</dd></dl></div>
          <div className="col-12 col-sm-6 col-xl-3"><dl className="card card-body h-100 mb-0"><dt>Active</dt><dd>{summary.active_products}</dd></dl></div>
          <div className="col-12 col-sm-6 col-xl-3"><dl className="card card-body h-100 mb-0"><dt>Stock value</dt><dd>{currency.format(summary.stock_value)}</dd></dl></div>
          <div className="col-12 col-sm-6 col-xl-3"><dl className="card card-body h-100 mb-0"><dt>Low stock</dt><dd>{summary.low_stock_count}</dd></dl></div>
        </div>
      )}
    </section>
  )
}
