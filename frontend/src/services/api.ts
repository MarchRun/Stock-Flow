import { ApiError } from '../types/api'
import type { ErrorDetail, Product, ProductFilter, ProductList, ProductInput } from '../types/api'
import type { MovementList, StockInput, StockResult } from '../types/api'
import type { Order, OrderInput } from '../types/api'
import type { InventorySummary } from '../types/api'

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

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 15000)
  const mutation = options.method !== undefined && options.method !== 'GET'

  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return await readResponse<T>(response)
  } catch (error) {
    if (controller.signal.aborted || error instanceof TypeError) {
      const reason = controller.signal.aborted
        ? 'The request timed out.'
        : 'Could not connect to the server.'
      throw new Error(mutation
        ? `${reason} The change may have been saved. Check the current records before trying again.`
        : `${reason} Please try again.`, { cause: error })
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
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

  return request<ProductList>(`/api/products?${params}`)
}

export async function createProduct(input: ProductInput): Promise<Product> {
  return request<Product>('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

}

export async function updateProduct(
  id: number,
  input: ProductInput,
): Promise<void> {
  return request<void>(`/api/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

}

export async function adjustStock(id: number, input: StockInput): Promise<StockResult> {
  return request<StockResult>(`/api/products/${id}/stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

}

export async function fetchMovements(id: number): Promise<MovementList> {
  return request<MovementList>(`/api/products/${id}/movements`)
}

export async function deleteProduct(id: number): Promise<void> {
  return request<void>(`/api/products/${id}`, {
    method: 'DELETE',
  })
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
  return request<Order>('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function fetchOrder(id: number): Promise<Order> {
  return request<Order>(`/api/orders/${id}`)
}

export async function cancelOrder(id: number): Promise<Order> {
  return request<Order>(`/api/orders/${id}/cancel`, {
    method: 'POST',
  })
}

export async function fetchSummary(): Promise<InventorySummary> {
  return request<InventorySummary>('/api/summary')
}
