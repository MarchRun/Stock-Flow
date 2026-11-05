const currency = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

export function formatRupiah(amount: number): string {
  return currency.format(amount)
}

export function relativeTime(value: string | null, now = Date.now()): string {
  if (!value) return 'No movements'

  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 'Unknown time'

  const seconds = Math.floor((now - timestamp) / 1000)
  const elapsed = Math.abs(seconds)
  if (elapsed < 60) return seconds < 0 ? 'In a moment' : 'Just now'

  const duration = elapsed < 3600
    ? `${Math.floor(elapsed / 60)}m`
    : elapsed < 86400
      ? `${Math.floor(elapsed / 3600)}h`
      : `${Math.floor(elapsed / 86400)}d`

  return seconds < 0 ? `In ${duration}` : `${duration} ago`
}
