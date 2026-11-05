import { ApiError } from '../types/api'
import type { ErrorDetail, Product, ProductFilter, ProductList, ProductInput } from '../types/api'
import type { MovementList, StockInput, StockResult } from '../types/api'
import type { Order, OrderInput } from '../types/api'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = 'Could not complete the request.'
    let detail: string | ErrorDetail | undefined
    let body: unknown

    try {
      body = await response.json()
    } catch {
      body = null
    }

    if (isRecord(body)) {
      const error = body.error

      if (typeof error === 'string') {
        message = error
        detail = error
      } else if (isRecord(error) && typeof error.code === 'string') {
        detail = {
          code: error.code,
          sku: typeof error.sku === 'string' ? error.sku : undefined,
          available: typeof error.available === 'number'
            ? error.available
            : undefined,
        }

        switch (detail.code) {
          case 'INSUFFICIENT_STOCK':
            message = 'Not enough stock.'
            break
          case 'PRODUCT_HAS_HISTORY':
            message = 'This product has stock movement history and cannot be deleted.'
            break
        }
      }
    }

    throw new ApiError(response.status, message, detail)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export async function fetchProducts(
  page = 1,
  limit = 10,
  search = '',
  filter: ProductFilter = 'all',
): Promise<ProductList> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    search,
    filter,
  })

  const response = await fetch(`/api/products?${params}`)
  return readResponse<ProductList>(response)
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const response = await fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  return readResponse<Product>(response)
}

export async function updateProduct(
  id: number,
  input: ProductInput,
): Promise<void> {
  const response = await fetch(`/api/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  return readResponse<void>(response)
}

export async function adjustStock(id: number, input: StockInput): Promise<StockResult> {
  const response = await fetch(`/api/products/${id}/stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  return readResponse<StockResult>(response)
}

export async function fetchMovements(id: number): Promise<MovementList> {
  const response = await fetch(`/api/products/${id}/movements`)
  return readResponse<MovementList>(response)
}

export async function deleteProduct(id: number): Promise<void> {
  const response = await fetch(`/api/products/${id}`, {
    method: 'DELETE',
  })
  return readResponse<void>(response)
}

export async function fetchActiveProducts(): Promise<Product[]> {
  const products: Product[] = []
  let page = 1

  while (true) {
    const result = await fetchProducts(page, 100, '', 'active')
    products.push(...result.data)
    if (products.length >= result.total || result.data.length === 0) return products
    page++
  }
}

export async function createOrder(input: OrderInput): Promise<Order> {
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readResponse<Order>(response)
}

export async function fetchOrder(id: number): Promise<Order> {
  const response = await fetch(`/api/orders/${id}`)
  return readResponse<Order>(response)
}

export async function cancelOrder(id: number): Promise<Order> {
  const response = await fetch(`/api/orders/${id}/cancel`, {
    method: 'POST',
  })
  return readResponse<Order>(response)
}
