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

export interface ProductInput {
  sku: string
  name: string
  price: number
  is_active: boolean
}

export interface StockInput {
  type: 'in' | 'out'
  qty: number
  note?: string
}

export interface StockResult {
  message: string
  product_id: number
  new_stock: number
}

export interface StockMovement {
  id: number
  product_id: number
  type: 'in' | 'out'
  qty: number
  note: string | null
  created_at: string
}

export interface MovementList {
  data: StockMovement[]
}

export interface ErrorDetail {
  code: string
  sku?: string
  available?: number
}

export interface OrderInput {
  customer: string
  items: { sku: string; qty: number }[]
}

export interface OrderItem {
  id: number
  order_id: number
  sku: string
  qty: number
  unit_price: number
}

export interface Order {
  id: number
  customer: string
  status: 'CREATED' | 'CANCELLED'
  total: number
  created_at: string
  cancelled_at: string | null
  items: OrderItem[]
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
