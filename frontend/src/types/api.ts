export type ProductFilter = 'all' | 'active' | 'inactive' | 'low_stock'

export interface Product {
  id: number
  sku: string
  name: string
  price: number
  stock: number
  is_active: boolean
  created_at: string
  last_movement_at: string | null
}

export interface ProductList {
  data: Product[]
  page: number
  limit: number
  total: number
}

export interface ErrorDetail {
  code: string
  sku?: string
  available?: number
}

export class ApiError extends Error {
  readonly status: number
  readonly detail: string | ErrorDetail | undefined

  constructor(
    status: number,
    message: string,
    detail?: string | ErrorDetail,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}
