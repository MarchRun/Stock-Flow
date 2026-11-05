import type { OrderInput } from '../types/api'

export function wholeNumber(value: string, minimum = 0): number | null {
  const trimmed = value.trim()
  const number = Number(trimmed)
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(number) ||
    number < minimum || number > 2147483647) return null
  return number
}

interface ItemDraft {
  sku: string
  quantity: string
}

type OrderValidation =
  | { valid: true; input: OrderInput }
  | {
    valid: false
    message: string
    field: 'customer' | 'items' | 'sku' | 'qty'
    index?: number
    sku?: string
  }

export function validateOrder(customer: string, items: readonly ItemDraft[]): OrderValidation {
  if (!customer.trim()) {
    return { valid: false, message: 'Customer name is required.', field: 'customer' }
  }
  if (items.length === 0) {
    return { valid: false, message: 'Add at least one item.', field: 'items' }
  }

  const seen = new Set<string>()
  const parsed: OrderInput['items'] = []
  for (const [index, item] of items.entries()) {
    const sku = item.sku.trim()
    if (!sku) {
      return { valid: false, message: 'Select a product for every item.', field: 'sku', index }
    }
    if (seen.has(sku)) {
      return {
        valid: false,
        message: 'Each product can only appear once in an order.',
        field: 'sku', index, sku,
      }
    }
    seen.add(sku)

    const qty = wholeNumber(item.quantity, 1)
    if (qty === null) {
      return {
        valid: false,
        message: `Enter a whole number between 1 and 2147483647 for ${sku}.`,
        field: 'qty', index, sku,
      }
    }
    parsed.push({ sku, qty })
  }

  return { valid: true, input: { customer: customer.trim(), items: parsed } }
}
