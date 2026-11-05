import { useEffect, useState } from 'react'
import { fetchProducts } from './services/api'
import { ProductForm } from './components/ProductForm'
import { DeleteProduct } from './components/DeleteProduct'
import { StockAdjust } from './components/StockAdjust'
import { StockHistory } from './components/StockHistory'
import type { Product, ProductFilter } from './types/api'
import './App.css'

const currency = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

function relativeTime(value: string | null): string {
  if (!value) return 'No movements'

  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 'Unknown time'

  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  const elapsed = Math.abs(seconds)
  if (elapsed < 60) return seconds < 0 ? 'In a moment' : 'Just now'

  const duration = elapsed < 3600
    ? `${Math.floor(elapsed / 60)}m`
    : elapsed < 86400
      ? `${Math.floor(elapsed / 3600)}h`
      : `${Math.floor(elapsed / 86400)}d`

  return seconds < 0 ? `In ${duration}` : `${duration} ago`
}

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
  const limit = 10

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
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Inventory and sales</p>
          <h1>StockFlow</h1>
        </div>
        <span>
          {loading || error
            ? 'Products'
            : `${total} ${total === 1 ? 'product' : 'products'}`}
        </span>
      </header>

      <section aria-labelledby="products-title" aria-busy={loading}>
        <h2 id="products-title">Products</h2>
        <button
          type="button"
          className="primary"
          onClick={() => setProductForm('new')}
        >
          New product
        </button>
        <div className="toolbar">
          <label htmlFor="product-search">Search products</label>
          <input
            id="product-search"
            type="search"
            placeholder="Search by SKU or name"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          <label htmlFor="product-filter">Filter products</label>
          <select
            id="product-filter"
            value={filter}
            onChange={event => {
              setFilter(event.target.value as ProductFilter)
              setPage(1)
            }}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="low_stock">Low stock (≤ 10)</option>
          </select>
        </div>

        {loading && <p role="status">Loading products…</p>}

        {!loading && error && (
          <div className="error" role="alert">
            <p>{error}</p>
            <button onClick={() => setRetry(value => value + 1)}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <p className="empty">No products found.</p>
        )}

        {!loading && !error && products.length > 0 && (
          <>
            <div
              className="table-scroll"
              role="region"
              aria-label="Products"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">SKU</th>
                    <th scope="col">Name</th>
                    <th scope="col" className="number">Price</th>
                    <th scope="col" className="number">Stock</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last movement</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => (
                    <tr key={product.id}>
                      <td className="sku">{product.sku}</td>
                      <td>{product.name}</td>
                      <td className="number">{currency.format(product.price)}</td>
                      <td className="number">{product.stock}</td>
                      <td>
                        <span className={`badge ${product.is_active ? 'active' : 'inactive'}`}>
                          {product.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td title={product.last_movement_at
                        ? new Date(product.last_movement_at).toLocaleString('en-GB')
                        : undefined}
                      >
                        {relativeTime(product.last_movement_at)}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            aria-label={`Adjust stock for ${product.name}`}
                            onClick={() => setStockProduct(product)}
                          >
                            Stock
                          </button>
                          <button
                            type="button"
                            aria-label={`View stock history for ${product.name}`}
                            onClick={() => setHistoryProduct(product)}
                          >
                            History
                          </button>
                          <button
                            type="button"
                            aria-label={`Edit ${product.name}`}
                            onClick={() => setProductForm(product)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${product.name}`}
                            onClick={() => setDeleteProduct(product)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <nav className="pagination" aria-label="Product pages">
              <span>Page {page} of {pages}</span>
              <div className="page-buttons">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(value => value - 1)}
                >
                  Previous
                </button>
                <button
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
            if (products.length === 1 && page > 1) {
              setPage(value => value - 1)
            } else {
              setRetry(value => value + 1)
            }
          }}
        />
      )}
    </main>
  )
}

export default App
