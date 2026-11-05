# Stock Flow

A small inventory and sales application built with Go, PostgreSQL and React.

Products can be created, edited, searched and filtered. Stock changes are recorded in a movement history. A sales order reduces stock, and cancelling the order returns the quantities sold.

## Technology stack

- Go: Backend API.
- PostgreSQL: Database.
- pgx: Database connection.
- React: User interface.
- TypeScript: Type checking.
- Vite: Development and build tool.
- Bootstrap: Styling and layout.
- React-Bootstrap: UI components.
- Vitest: Frontend testing.

## Requirements

- Go: 1.25.1 or newer.
- Node.js: 22.12 or newer.
- npm: Included with Node.js.
- Docker: With Docker Compose v2.

### Ports

- PostgreSQL: 5433.
- Backend: 8080.
- Frontend: 5173.

## Running locally

The commands below use PowerShell and start in the repository root.

### 1. Database

```powershell
Copy-Item .env.example .env
docker compose up -d db
docker compose ps
```

Wait until the container is healthy. On an empty volume, PostgreSQL applies the schema and seed automatically. The seed contains 12 clothing products and two sample orders.

The seed only runs once. Editing the SQL files or the credentials does not update an existing database.

### 2. Backend

```powershell
Copy-Item backend/.env.example backend/.env
cd backend
go mod download
go run ./cmd/api
```

The credentials in `backend/.env` must match the root `.env`. To check the server:

```powershell
curl.exe -i http://localhost:8080/health
```

### 3. Frontend

Open a second terminal and run:

```powershell
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. During development, Vite forwards `/api` requests to the backend on port 8080.

## Tests

### Backend

Integration tests use a separate database called `stockflow_rebuild_test`. Create it once from the repository root:

```powershell
docker compose exec db psql -U stockflow -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE stockflow_rebuild_test;"

Get-Content backend/migrations/schema.sql -Raw |
  docker compose exec -T db psql -U stockflow -d stockflow_rebuild_test -v ON_ERROR_STOP=1
```

Then from `backend`:

```powershell
go test -count=1 -v ./...
go vet ./...
go build -o bin/api.exe ./cmd/api
```

The tests clear the tables in the test database, so do not keep other data there. They cover stock adjustments, order creation, insufficient stock, concurrent orders, cancellation, product changes, filters and summaries.

Concurrency is tested through the database. The race detector has not been verified on this machine.

### Frontend

From `frontend`:

```powershell
npm test
npm run lint
npm run build
```

Vitest covers input validation, rupiah formatting and relative timestamps.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Health check |
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

Use `curl.exe` in PowerShell to avoid the `curl` alias.

List and search products:

```powershell
curl.exe -i "http://localhost:8080/api/products?search=shirt&page=1&limit=10"
curl.exe -i "http://localhost:8080/api/products?filter=low_stock"
```

Create a product:

```powershell
'{"sku":"DEMO-SHIRT","name":"Demo shirt","price":100000,"is_active":true}' |
  curl.exe -i -X POST "http://localhost:8080/api/products" `
    -H "Content-Type: application/json" --data-binary "@-"
```

Set the returned ID and add stock:

```powershell
$productId = 123

'{"type":"in","qty":10,"note":"Demo delivery"}' |
  curl.exe -i -X POST "http://localhost:8080/api/products/$productId/stock" `
    -H "Content-Type: application/json" --data-binary "@-"
```

Create an order, then read or cancel it:

```powershell
'{"customer":"Demo customer","items":[{"sku":"DEMO-SHIRT","qty":2}]}' |
  curl.exe -i -X POST "http://localhost:8080/api/orders" `
    -H "Content-Type: application/json" --data-binary "@-"

$orderId = 123
curl.exe -i "http://localhost:8080/api/orders/$orderId"
curl.exe -i -X POST "http://localhost:8080/api/orders/$orderId/cancel"
```

If stock is insufficient, the API returns `409` with the available quantity:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "sku": "CL-POLO",
    "available": 5
  }
}
```

These requests change data. Running the order example twice creates two separate orders.

## Design decisions

Prices are stored as integer IDR, and the backend calculates order totals from the current product price. Stock changes and movement records are saved in one transaction, with row locks preventing two requests from overdrawing the same product.

Cancelling an order restores its stock once. A second cancellation returns `409` and changes nothing. Movement history is kept, so a product with movements cannot be deleted.

`last_movement_at` comes from the latest stock movement. Low stock means 10 units or fewer. Summary cards cover all products, regardless of the current filters.

The frontend sends every request through one API client, which also parses error responses for display.

## What I would improve

- Add user authentication.
- Improve the mobile layout and make stock history easier to browse.

## Time spent

Approximately 16 hours, including implementation, testing and UI adjustments.
