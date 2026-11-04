package tests

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"stockflow/backend/internal/api"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func testDB(t *testing.T) *pgxpool.Pool {
	t.Helper()

	if err := godotenv.Load("../.env"); err != nil {
		t.Log("No .env file loaded; using system environment variables")
	}

	dbURL := url.URL{
		Scheme: "postgres",
		User: url.UserPassword(
			os.Getenv("DB_USER"),
			os.Getenv("DB_PASSWORD"),
		),
		Host: net.JoinHostPort(
			os.Getenv("DB_HOST"),
			os.Getenv("DB_PORT"),
		),
		Path: "stockflow_rebuild_test",
	}

	params := dbURL.Query()
	params.Set("sslmode", "disable")
	dbURL.RawQuery = params.Encode()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	var name string
	if err := pool.QueryRow(ctx, "SELECT current_database()").Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "stockflow_rebuild_test" {
		t.Fatalf("Refusing to clear database %q", name)
	}

	_, err = pool.Exec(ctx, `
		TRUNCATE sales_order_items, sales_orders,
			stock_movements, products RESTART IDENTITY
	`)
	if err != nil {
		t.Fatal(err)
	}

	return pool
}

func TestAdjustStock(t *testing.T) {
	tests := []struct {
		name string
		qty int
		status int
		stock int
		movements int
	}{
		{
			name: "successful withdrawal",
			qty: 3,
			status: http.StatusOK,
			stock: 7,
			movements: 1,
		},
		{
			name: "insufficient stock writes nothing",
			qty: 11,
			status: http.StatusConflict,
			stock: 10,
			movements: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pool := testDB(t)

			ctx, cancel := context.WithTimeout(
				context.Background(),
				10*time.Second,
			)
			defer cancel()

			var id int
			err := pool.QueryRow(ctx, `
				INSERT INTO products (sku, name, price, stock)
				VALUES ('TEST-SHIRT', 'Test shirt', 120000, 10)
				RETURNING id
			`).Scan(&id)
			if err != nil {
				t.Fatal(err)
			}

			mux := http.NewServeMux()
			mux.HandleFunc(
				"POST /api/products/{id}/stock",
				api.AdjustStock(pool),
			)

			body := fmt.Sprintf(
				`{"type":"out","qty":%d,"note":"Test withdrawal"}`,
				tt.qty,
			)
			req := httptest.NewRequest(
				http.MethodPost,
				fmt.Sprintf("/api/products/%d/stock", id),
				strings.NewReader(body),
			)
			req.Header.Set("Content-Type", "application/json")
			res := httptest.NewRecorder()

			mux.ServeHTTP(res, req)

			if res.Code != tt.status {
				t.Fatalf(
					"Expected status %d, got %d: %s",
					tt.status, res.Code, res.Body.String(),
				)
			}

			var stock int
			err = pool.QueryRow(ctx,
				"SELECT stock FROM products WHERE id = $1",
				id,
			).Scan(&stock)
			if err != nil {
				t.Fatal(err)
			}
			if stock != tt.stock {
				t.Fatalf("Expected stock %d, got %d", tt.stock, stock)
			}

			var count int
			err = pool.QueryRow(ctx,
				"SELECT COUNT(*) FROM stock_movements",
			).Scan(&count)
			if err != nil {
				t.Fatal(err)
			}
			if count != tt.movements {
				t.Fatalf(
					"Expected %d movements, got %d",
					tt.movements, count,
				)
			}

			if tt.status == http.StatusConflict {
				var response struct {
					Error struct {
						Code string `json:"code"`
						Available int `json:"available"`
					} `json:"error"`
				}

				if err := json.Unmarshal(res.Body.Bytes(), &response); err != nil {
					t.Fatal(err)
				}
				if response.Error.Code != "INSUFFICIENT_STOCK" ||
					response.Error.Available != 10 {
					t.Fatalf("Unexpected error response: %s", res.Body.String())
				}
				return
			}

			var productID, qty int
			var movementType, note string
			err = pool.QueryRow(ctx, `
				SELECT product_id, type, qty, note
				FROM stock_movements
			`).Scan(&productID, &movementType, &qty, &note)
			if err != nil {
				t.Fatal(err)
			}

			if productID != id || movementType != "out" ||
				qty != tt.qty || note != "Test withdrawal" {
				t.Fatalf(
					"Unexpected movement: product=%d type=%s qty=%d note=%q",
					productID, movementType, qty, note,
				)
			}
		})
	}
}
