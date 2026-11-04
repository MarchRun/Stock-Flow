package tests

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"stockflow/backend/internal/api"
)

func TestCreateOrder(t *testing.T) {
	tests := []struct {
		name string
		body string
		status int
		stockA int
		stockB int
		orders int
		items int
		movements int
	}{
		{
			name: "success",
			body: `{"customer":"Test customer","items":[{"sku":"TEST-A","qty":2},{"sku":"TEST-B","qty":1}]}`,
			status: http.StatusCreated,
			stockA: 8, stockB: 0,
			orders: 1, items: 2, movements: 2,
		},
		{
			name: "insufficient stock writes nothing",
			body: `{"customer":"Test customer","items":[{"sku":"TEST-A","qty":2},{"sku":"TEST-B","qty":2}]}`,
			status: http.StatusConflict,
			stockA: 10, stockB: 1,
		},
		{
			name: "unknown SKU",
			body: `{"customer":"Test customer","items":[{"sku":"TEST-A","qty":1},{"sku":"UNKNOWN","qty":1}]}`,
			status: http.StatusBadRequest,
			stockA: 10, stockB: 1,
		},
		{
			name: "duplicate SKU",
			body: `{"customer":"Test customer","items":[{"sku":"TEST-A","qty":1},{"sku":"TEST-A","qty":1}]}`,
			status: http.StatusBadRequest,
			stockA: 10, stockB: 1,
		},
		{
			name: "zero quantity",
			body: `{"customer":"Test customer","items":[{"sku":"TEST-A","qty":0}]}`,
			status: http.StatusBadRequest,
			stockA: 10, stockB: 1,
		},
		{
			name: "empty items",
			body: `{"customer":"Test customer","items":[]}`,
			status: http.StatusBadRequest,
			stockA: 10, stockB: 1,
		},
		{
			name: "empty customer",
			body: `{"customer":" ","items":[{"sku":"TEST-A","qty":1}]}`,
			status: http.StatusBadRequest,
			stockA: 10, stockB: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pool := testDB(t)
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			_, err := pool.Exec(ctx, `
				INSERT INTO products (sku, name, price, stock)
				VALUES
					('TEST-A', 'Test shirt', 120000, 10),
					('TEST-B', 'Test cap', 85000, 1)
			`)
			if err != nil {
				t.Fatal(err)
			}

			mux := http.NewServeMux()
			mux.HandleFunc("POST /api/orders", api.CreateOrder(pool))

			req := httptest.NewRequest(
				http.MethodPost,
				"/api/orders",
				strings.NewReader(tt.body),
			)
			req.Header.Set("Content-Type", "application/json")
			res := httptest.NewRecorder()
			mux.ServeHTTP(res, req)

			if res.Code != tt.status {
				t.Fatalf("Expected %d, got %d: %s",
					tt.status, res.Code, res.Body.String())
			}

			var stockA, stockB, orders, items, movements int
			err = pool.QueryRow(ctx, `
				SELECT
					(SELECT stock FROM products WHERE sku = 'TEST-A'),
					(SELECT stock FROM products WHERE sku = 'TEST-B'),
					(SELECT COUNT(*) FROM sales_orders),
					(SELECT COUNT(*) FROM sales_order_items),
					(SELECT COUNT(*) FROM stock_movements)
			`).Scan(&stockA, &stockB, &orders, &items, &movements)
			if err != nil {
				t.Fatal(err)
			}

			if stockA != tt.stockA || stockB != tt.stockB ||
				orders != tt.orders || items != tt.items ||
				movements != tt.movements {
				t.Fatalf(
					"Unexpected state: stockA=%d stockB=%d orders=%d items=%d movements=%d",
					stockA, stockB, orders, items, movements,
				)
			}

			if tt.status == http.StatusCreated {
				var order api.Order
				if err := json.Unmarshal(res.Body.Bytes(), &order); err != nil {
					t.Fatal(err)
				}
				if order.Total != 325000 || order.Status != "CREATED" ||
					len(order.Items) != 2 {
					t.Fatalf("Unexpected order: %+v", order)
				}

				prices := map[string]int{
					"TEST-A": 120000,
					"TEST-B": 85000,
				}
				for _, item := range order.Items {
					price, exists := prices[item.SKU]
					if !exists || item.UnitPrice != price {
						t.Fatalf("Unexpected item: %+v", item)
					}
				}
			}

			if tt.status == http.StatusConflict {
				var response struct {
					Error struct {
						Code string `json:"code"`
						SKU string `json:"sku"`
						Available int `json:"available"`
					} `json:"error"`
				}
				if err := json.Unmarshal(res.Body.Bytes(), &response); err != nil {
					t.Fatal(err)
				}
				if response.Error.Code != "INSUFFICIENT_STOCK" ||
					response.Error.SKU != "TEST-B" ||
					response.Error.Available != 1 {
					t.Fatalf("Unexpected conflict: %s", res.Body.String())
				}
			}
		})
	}
}

func TestCreateOrderConcurrency(t *testing.T) {
	pool := testDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_, err := pool.Exec(ctx, `
		INSERT INTO products (sku, name, price, stock)
		VALUES ('TEST-LAST', 'Last shirt', 120000, 1)
	`)
	if err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/orders", api.CreateOrder(pool))

	const workers = 5
	start := make(chan struct{})
	results := make(chan *httptest.ResponseRecorder, workers)

	for i := 0; i < workers; i++ {
		go func() {
			<-start

			req := httptest.NewRequest(
				http.MethodPost,
				"/api/orders",
				strings.NewReader(
					`{"customer":"Test customer","items":[{"sku":"TEST-LAST","qty":1}]}`,
				),
			)
			req.Header.Set("Content-Type", "application/json")

			res := httptest.NewRecorder()
			mux.ServeHTTP(res, req)
			results <- res
		}()
	}

	close(start)

	var created, conflicts int
	for i := 0; i < workers; i++ {
		res := <-results
		switch res.Code {
		case http.StatusCreated:
			created++
		case http.StatusConflict:
			conflicts++
		default:
			t.Errorf("Unexpected status %d: %s", res.Code, res.Body.String())
		}
	}

	if created != 1 || conflicts != workers-1 {
		t.Fatalf(
			"Expected 1 created and %d conflicts, got %d created and %d conflicts",
			workers-1, created, conflicts,
		)
	}

	var stock, orders, items, movements int
	err = pool.QueryRow(ctx, `
		SELECT
			(SELECT stock FROM products WHERE sku = 'TEST-LAST'),
			(SELECT COUNT(*) FROM sales_orders),
			(SELECT COUNT(*) FROM sales_order_items),
			(SELECT COUNT(*) FROM stock_movements)
	`).Scan(&stock, &orders, &items, &movements)
	if err != nil {
		t.Fatal(err)
	}

	if stock != 0 || orders != 1 || items != 1 || movements != 1 {
		t.Fatalf(
			"Unexpected state: stock=%d orders=%d items=%d movements=%d",
			stock, orders, items, movements,
		)
	}
}
