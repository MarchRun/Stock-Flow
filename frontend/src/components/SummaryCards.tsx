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
        <div className="error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRetry(value => value + 1)}>Retry summary</button>
        </div>
      )}
      {!loading && !error && summary && (
        <dl className="summary-cards">
          <div><dt>Total products</dt><dd>{summary.total_products}</dd></div>
          <div><dt>Active products</dt><dd>{summary.active_products}</dd></div>
          <div><dt>Total stock value</dt><dd>{currency.format(summary.stock_value)}</dd></div>
          <div><dt>Low-stock products</dt><dd>{summary.low_stock_count}</dd></div>
        </dl>
      )}
    </section>
  )
}
