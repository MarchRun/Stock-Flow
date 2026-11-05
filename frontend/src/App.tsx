import { useEffect, useState } from 'react'
import { fetchProducts } from './services/api'
import { ProductForm } from './components/ProductForm'
import { DeleteProduct } from './components/DeleteProduct'
import { StockAdjust } from './components/StockAdjust'
import { StockHistory } from './components/StockHistory'
import { OrderForm } from './components/OrderForm'
import { OrderDetail } from './components/OrderDetail'
import { OrderLookup } from './components/OrderLookup'
import { SummaryCards } from './components/SummaryCards'
import { IconButton } from './components/IconButton'
import type { Order, Product, ProductFilter } from './types/api'
import { formatRupiah, relativeTime } from './lib/format'
import './App.css'

function App() {
  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ProductFilter>('all')
  const [productForm, setProductForm] = useState<Product | 'new' | null>(null)
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null)
  const [stockProduct, setStockProduct] = useState<Product | null>(null)
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null)
  const [creatingOrder, setCreatingOrder] = useState(false)
  const [lookingUpOrder, setLookingUpOrder] = useState(false)
  const [orderDetail, setOrderDetail] = useState<Order | null>(null)
  const [, setClock] = useState(0)
  const limit = 10

  useEffect(() => {
    const timer = window.setInterval(() => setClock(value => value + 1), 60000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search)
      setPage(1)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const result = await fetchProducts(page, limit, query, filter)
        if (active) {
          setProducts(result.data)
          setTotal(result.total)
        }
      } catch (error) {
        if (active) {
          setError(
            error instanceof Error
              ? error.message
              : 'Could not load products.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [page, retry, query, filter])

  const pages = Math.max(1, Math.ceil(total / limit))

  return (
    <main className="container-xl py-4 py-lg-5">
      <header className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <h1 className="display-6 fw-bold mb-0">Stock Flow</h1>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline-primary" onClick={() => setLookingUpOrder(true)}>
            Find order
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setCreatingOrder(true)}>
            Create order
          </button>
        </div>
      </header>

      <SummaryCards refresh={retry} />

      <section className="card p-3 p-lg-4" aria-labelledby="products-title" aria-busy={loading}>
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
          <div>
            <h2 id="products-title" className="h5 fw-bold mb-0">Products</h2>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setProductForm('new')}>
            New product
          </button>
        </div>
        <div className="row g-3 mb-4">
          <div className="col-12 col-md-8">
          <label className="form-label" htmlFor="product-search">Search products</label>
          <input
            id="product-search"
            className="form-control"
            type="search"
            placeholder="Search by SKU or name"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          </div>
          <div className="col-12 col-md-4">
          <label className="form-label" htmlFor="product-filter">Filter products</label>
          <select
            id="product-filter"
            className="form-select"
            value={filter}
            onChange={event => {
              setFilter(event.target.value as ProductFilter)
              setPage(1)
            }}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="low_stock">Low stock</option>
          </select>
          </div>
        </div>

        {loading && <p role="status">Loading products…</p>}

        {!loading && error && (
          <div className="alert alert-danger" role="alert">
            <p>{error}</p>
            <button className="btn btn-outline-danger" onClick={() => setRetry(value => value + 1)}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <p className="text-center text-body-secondary py-5 mb-0">No products found.</p>
        )}

        {!loading && !error && products.length > 0 && (
          <>
            <p id="table-scroll-help" className="d-lg-none small text-body-secondary mb-2">
              Scroll horizontally to view all columns and actions.
            </p>
            <div
              className="table-responsive inventory-table-frame"
              role="region"
              aria-label="Products"
              aria-describedby="table-scroll-help"
              tabIndex={0}
            >
              <table className="table table-hover align-middle inventory-table mb-0">
                <thead className="table-light">
                  <tr>
                    <th scope="col">SKU</th>
                    <th scope="col">Name</th>
                    <th scope="col">Price</th>
                    <th scope="col">Stock</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last movement</th>
                    <th scope="col" className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => (
                    <tr key={product.id}>
                      <th scope="row" className="sku">{product.sku}</th>
                      <td id={`product-name-${product.id}`}>{product.name}</td>
                      <td className="number text-start">{formatRupiah(product.price)}</td>
                      <td className={`text-center ${product.stock <= 10 ? 'text-danger fw-semibold' : ''}`}>{product.stock}</td>
                      <td className="text-center">
                        <span className={`badge ${product.is_active ? 'text-bg-success' : 'text-bg-secondary'}`}>
                          {product.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="text-center" title={product.last_movement_at
                        ? new Date(product.last_movement_at).toLocaleString('en-GB')
                        : undefined}
                      >
                        {relativeTime(product.last_movement_at)}
                      </td>
                      <td className="text-center">
                        <div className="d-flex flex-nowrap justify-content-center gap-1">
                          <IconButton
                            icon="stock"
                            label="Stock"
                            contextId={`product-name-${product.id}`}
                            onClick={() => setStockProduct(product)}
                          />
                          <IconButton
                            icon="history"
                            label="History"
                            contextId={`product-name-${product.id}`}
                            onClick={() => setHistoryProduct(product)}
                          />
                          <IconButton
                            icon="edit"
                            label="Edit"
                            contextId={`product-name-${product.id}`}
                            variant="primary"
                            onClick={() => setProductForm(product)}
                          />
                          <IconButton
                            icon="delete"
                            label="Delete"
                            contextId={`product-name-${product.id}`}
                            variant="danger"
                            onClick={() => setDeleteProduct(product)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <nav className="d-flex flex-wrap justify-content-between align-items-center gap-3 mt-3" aria-label="Product pages">
              <span>Page {page} of {pages}</span>
              <div className="d-flex gap-2">
                <button
                  className="btn btn-outline-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage(value => value - 1)}
                >
                  Previous
                </button>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  disabled={page >= pages}
                  onClick={() => setPage(value => value + 1)}
                >
                  Next
                </button>
              </div>
            </nav>
          </>
        )}
      </section>
      {productForm !== null && (
        <ProductForm
          product={productForm === 'new' ? undefined : productForm}
          onClose={() => setProductForm(null)}
          onSaved={() => {
            setProductForm(null)
            setRetry(value => value + 1)
          }}
        />
      )}
      {creatingOrder && (
        <OrderForm
          onClose={() => setCreatingOrder(false)}
          onCreated={order => {
            setCreatingOrder(false)
            setOrderDetail(order)
            setRetry(value => value + 1)
          }}
        />
      )}
      {orderDetail && (
        <OrderDetail
          key={orderDetail.id}
          order={orderDetail}
          onClose={() => setOrderDetail(null)}
          onChanged={order => {
            setOrderDetail(order)
            setRetry(value => value + 1)
          }}
        />
      )}
      {lookingUpOrder && (
        <OrderLookup
          onClose={() => setLookingUpOrder(false)}
          onFound={order => {
            setLookingUpOrder(false)
            setOrderDetail(order)
          }}
        />
      )}
      {stockProduct && (
        <StockAdjust
          key={stockProduct.id}
          product={stockProduct}
          onClose={() => setStockProduct(null)}
          onSaved={() => {
            setStockProduct(null)
            setRetry(value => value + 1)
          }}
        />
      )}
      {historyProduct && (
        <StockHistory
          key={historyProduct.id}
          product={historyProduct}
          onClose={() => setHistoryProduct(null)}
        />
      )}
      {deleteProduct && (
        <DeleteProduct
          product={deleteProduct}
          onClose={() => setDeleteProduct(null)}
          onDeleted={() => {
            setDeleteProduct(null)
            setRetry(value => value + 1)
            if (products.length === 1 && page > 1) {
              setPage(value => value - 1)
            }
          }}
        />
      )}
    </main>
  )
}

export default App