# Stock Flow

A simple web application for managing inventory and sales orders. It allows you to create, edit, and search products while automatically tracking all stock movements in real time. Sales directly deduct available inventory, and any cancelled orders automatically restore the stock counts back to their original levels.

## Technology Stack

- Go: Backend API
- PostgreSQL: Database
- pgx: Database connection
- React: User interface
- TypeScript: Type checking
- Vite: Development and build tool
- Bootstrap: Styling and layout
- React-Bootstrap: UI components
- Vitest: Frontend testing

## Requirements

- Go: 1.25.1 or newer.
- Node.js: 22.12 or newer compatible with Vite 8.
- npm: Included with Node.js.
- Docker: With Docker Compose v2.

## Default Ports:

- PostgreSQL: 5433.
- Backend: 8080.
- Frontend: 5173.

## Getting Started

The commands below use PowerShell. Start in the repository root.

### Database

Create the local configuration:

```powershell
Copy-Item .env.example .env
```

Set the database credentials in `.env`, then start PostgreSQL:

```powershell
docker compose up -d db
docker compose ps
```

Wait until the database is healthy. Check the logs if necessary:

```powershell
docker compose logs db
```

On a new, empty volume, PostgreSQL applies the schema and seed automatically. The seed contains 12 clothing products and two sample orders.

Initialisation scripts only run on an empty volume. Editing the seed or changing credentials in `.env` does not update an existing database.

Do not run `docker compose down -v` unless you intend to delete the database volume.

### Backend

Open a terminal in the repository root:

```powershell
Copy-Item backend/.env.example backend/.env
```

Ensure the credentials match the root `.env`, then run:

```powershell
cd backend
go mod download
go run ./cmd/api
```

Check the server:

```powershell
curl.exe -i http://localhost:8080/health
```

A successful response returns `200 OK`. Database connectivity is checked during startup; the health endpoint checks the HTTP server.

### Frontend

Open another terminal in the repository root:

```powershell
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173.

Keep the backend and frontend terminals running. The Vite development proxy forwards `/api` requests to http://localhost:8080.

## Features

- Product creation, editing and deletion
- Debounced search by SKU or name
- Pagination and active, inactive and low-stock filters
- Stock adjustments with movement history
- Sales orders with server-calculated prices and totals
- Order lookup and cancellation
- Inventory summary cards refreshed after changes

Products with movement history cannot be deleted. An insufficient stock response includes the available quantity and is displayed in the frontend.

## Testing

### Backend

Integration tests use a separate database named `stockflow_rebuild_test`.

Create the database once, from the repository root:

```powershell
docker compose exec db psql -U stockflow -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE stockflow_rebuild_test;"
```

Apply the schema without seed data:

```powershell
Get-Content backend/migrations/schema.sql -Raw |
  docker compose exec -T db psql -U stockflow -d stockflow_rebuild_test -v ON_ERROR_STOP=1
```

If the database and tables already exist, skip these setup commands. Replace `stockflow` after `-U` if you configured a different PostgreSQL user.

Run the checks from `backend`:

```powershell
go test -count=1 -v ./...
go vet ./...
go build -o bin/api.exe ./cmd/api
```

Tests clear the application tables in the test database. Do not store other work there or run multiple test processes against it simultaneously.

Coverage includes insufficient stock, successful stock movements, order atomicity, concurrent orders, cancellation, product management, filters and inventory summaries.

Concurrency tests pass under the ordinary test runner. The race detector has not been verified in this environment.

### Frontend

From `frontend`:

```powershell
npm test
npm run lint
npm run build
```

Vitest covers numeric validation, order validation, rupiah formatting and relative timestamps.

For watch mode:

```powershell
npm run test:watch
```

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | HTTP health check |
| GET | `/api/products` | Search, filter and paginate products |
| POST | `/api/products` | Create a product |
| PUT | `/api/products/{id}` | Update a product |
| DELETE | `/api/products/{id}` | Delete a product without history |
| POST | `/api/products/{id}/stock` | Adjust stock |
| GET | `/api/products/{id}/movements` | Read stock history |
| POST | `/api/orders` | Create an order |
| GET | `/api/orders/{id}` | Read an order |
| POST | `/api/orders/{id}/cancel` | Cancel an order |
| GET | `/api/summary` | Read inventory totals |

### Examples

Use `curl.exe` in PowerShell to avoid its `curl` alias.

List products:

```powershell
curl.exe -i "http://localhost:8080/api/products?search=shirt&page=1&limit=10"
```

Filter low-stock products:

```powershell
curl.exe -i "http://localhost:8080/api/products?filter=low_stock"
```

Create a product:

```powershell
'{"sku":"DEMO-SHIRT","name":"Demo shirt","price":100000,"is_active":true}' |
  curl.exe -i -X POST "http://localhost:8080/api/products" `
    -H "Content-Type: application/json" --data-binary "@-"
```

Use the returned product ID in place of `123`:

```powershell
$productId = 123
```

Add stock:

```powershell
'{"type":"in","qty":10,"note":"Demo delivery"}' |
  curl.exe -i -X POST "http://localhost:8080/api/products/$productId/stock" `
    -H "Content-Type: application/json" --data-binary "@-"
```

Read its movement history:

```powershell
curl.exe -i "http://localhost:8080/api/products/$productId/movements"
```

Create an order:

```powershell
'{"customer":"Demo customer","items":[{"sku":"DEMO-SHIRT","qty":2}]}' |
  curl.exe -i -X POST "http://localhost:8080/api/orders" `
    -H "Content-Type: application/json" --data-binary "@-"
```

Use the returned order ID in place of `123`:

```powershell
$orderId = 123
```

Read and cancel the order:

```powershell
curl.exe -i "http://localhost:8080/api/orders/$orderId"

curl.exe -i -X POST "http://localhost:8080/api/orders/$orderId/cancel"
```

These examples change application data. Repeating a successful create-order request creates another order.

### Stock Conflicts

An adjustment exceeding available stock returns `409`:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "available": 5
  }
}
```

For an order, the error also identifies the SKU:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "sku": "CL-POLO",
    "available": 5
  }
}
```

## Design Decisions

Prices use integer IDR, with order totals calculated by the backend. Stock changes and movements share a transaction, while row locks prevent overdrawing. Cancellation restores stock once, and movement history is preserved.

The latest movement provides `last_movement_at`, and low stock means 10 units or fewer. Summaries cover all products, regardless of filters. Frontend requests and errors are handled by one API client.

## Possible Improvements

- Add user authentication.
- Improve the mobile layout and make stock history easier to browse.

## Development Time

Approximately 16 hours, including implementation, testing and UI adjustments.