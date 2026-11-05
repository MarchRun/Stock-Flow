import { describe, expect, it } from 'vitest'
import { validateOrder, wholeNumber } from '../src/lib/validation'

describe('wholeNumber', () => {
  it.each(['', ' ', '-1', '1.5', '1e3', '0x10', '+1', 'NaN', 'Infinity', '2147483648', '9007199254740993'])(
    'rejects invalid price %j', value => {
      expect(wholeNumber(value)).toBeNull()
    },
  )

  it.each<[string, number]>([
    ['0', 0],
    [' 120000 ', 120000],
    ['001', 1],
    ['2147483647', 2147483647],
  ])('parses %s as %i', (value, expected) => {
    expect(wholeNumber(value)).toBe(expected)
  })

  it('allows zero for prices but not quantities or order IDs', () => {
    expect(wholeNumber('0')).toBe(0)
    expect(wholeNumber('0', 1)).toBeNull()
  })

  it.each(['1', '12', '2147483647'])('accepts positive quantity %s', value => {
    expect(wholeNumber(value, 1)).toBe(Number(value))
  })

  it.each(['', ' ', '0', '-1', '1.5', '2147483648'])(
    'rejects invalid quantity %j', value => {
      expect(wholeNumber(value, 1)).toBeNull()
    },
  )
})

describe('validateOrder', () => {
  it('requires a customer', () => {
    expect(validateOrder(' ', [{ sku: 'SHIRT', quantity: '1' }])).toMatchObject({
      valid: false, field: 'customer',
    })
  })

  it('requires at least one item', () => {
    expect(validateOrder('Test customer', [])).toMatchObject({ valid: false, field: 'items' })
  })

  it('identifies an unselected product', () => {
    expect(validateOrder('Test customer', [{ sku: ' ', quantity: '1' }])).toMatchObject({
      valid: false, field: 'sku', index: 0,
    })
  })

  it('rejects duplicate SKUs after trimming', () => {
    const items = [{ sku: 'SHIRT', quantity: '1' }, { sku: ' SHIRT ', quantity: '2' }]
    expect(validateOrder('Test customer', items)).toMatchObject({
      valid: false, field: 'sku', index: 1, sku: 'SHIRT',
    })
  })

  it.each(['0', '-2', '1.5', '', '2147483648'])('rejects invalid item quantity %j', quantity => {
    expect(validateOrder('Test customer', [{ sku: 'SHIRT', quantity }])).toMatchObject({
      valid: false, field: 'qty', index: 0, sku: 'SHIRT',
    })
  })

  it('returns a trimmed request without mutating the draft', () => {
    const items = [{ sku: ' SHIRT ', quantity: ' 2 ' }, { sku: 'CAP', quantity: '1' }]
    expect(validateOrder(' Test customer ', items)).toEqual({
      valid: true,
      input: {
        customer: 'Test customer',
        items: [{ sku: 'SHIRT', qty: 2 }, { sku: 'CAP', qty: 1 }],
      },
    })
    expect(items[0]).toEqual({ sku: ' SHIRT ', quantity: ' 2 ' })
  })
})
