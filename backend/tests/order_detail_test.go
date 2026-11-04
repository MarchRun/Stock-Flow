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

func TestOrderDetailAndCancellation(t *testing.T) {
	pool := testDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_, err := pool.Exec(ctx, `
		INSERT INTO products (sku, name, price, stock)
		VALUES ('TEST-SHIRT', 'Test shirt', 120000, 10)
	`)
	if err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/orders", api.CreateOrder(pool))
	mux.HandleFunc("GET /api/orders/{id}", api.GetOrder(pool))
	mux.HandleFunc("POST /api/orders/{id}/cancel", api.CancelOrder(pool))

	request := func(method, path, body string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		res := httptest.NewRecorder()
		mux.ServeHTTP(res, req)
		return res
	}

	created := request(http.MethodPost, "/api/orders",
		`{"customer":"Test customer","items":[{"sku":"TEST-SHIRT","qty":2}]}`)
	if created.Code != http.StatusCreated {
		t.Fatalf("Create: %d %s", created.Code, created.Body.String())
	}

	detail := request(http.MethodGet, "/api/orders/1", "")
	if detail.Code != http.StatusOK {
		t.Fatalf("Detail: %d %s", detail.Code, detail.Body.String())
	}

	var order api.Order
	if err := json.Unmarshal(detail.Body.Bytes(), &order); err != nil {
		t.Fatal(err)
	}
	if order.ID != 1 || order.Status != "CREATED" ||
		order.Total != 240000 || len(order.Items) != 1 {
		t.Fatalf("Unexpected order: %+v", order)
	}
	if order.Items[0].SKU != "TEST-SHIRT" ||
		order.Items[0].Qty != 2 || order.Items[0].UnitPrice != 120000 {
		t.Fatalf("Unexpected item: %+v", order.Items[0])
	}

	start := make(chan struct{})
	results := make(chan *httptest.ResponseRecorder, 2)
	for i := 0; i < 2; i++ {
		go func() {
			<-start
			req := httptest.NewRequest(
				http.MethodPost, "/api/orders/1/cancel", nil,
			)
			res := httptest.NewRecorder()
			mux.ServeHTTP(res, req)
			results <- res
		}()
	}
	close(start)

	var cancelled, conflicts int
	for i := 0; i < 2; i++ {
		res := <-results
		switch res.Code {
		case http.StatusOK:
			cancelled++
			var result api.Order
			if err := json.Unmarshal(res.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if result.Status != "CANCELLED" || result.CancelledAt == nil {
				t.Fatalf("Unexpected cancellation: %+v", result)
			}
		case http.StatusConflict:
			conflicts++
		default:
			t.Fatalf("Cancel: %d %s", res.Code, res.Body.String())
		}
	}
	if cancelled != 1 || conflicts != 1 {
		t.Fatalf("Expected one cancellation and one conflict")
	}

	var stock, count int
	err = pool.QueryRow(ctx, `
		SELECT
			(SELECT stock FROM products WHERE sku = 'TEST-SHIRT'),
			(SELECT COUNT(*) FROM stock_movements)
	`).Scan(&stock, &count)
	if err != nil {
		t.Fatal(err)
	}
	if stock != 10 || count != 2 {
		t.Fatalf("Expected stock 10 and 2 movements, got %d and %d", stock, count)
	}

	detail = request(http.MethodGet, "/api/orders/1", "")
	if detail.Code != http.StatusOK {
		t.Fatalf("Detail after cancellation: %d", detail.Code)
	}
	if err := json.Unmarshal(detail.Body.Bytes(), &order); err != nil {
		t.Fatal(err)
	}
	if order.Status != "CANCELLED" || order.CancelledAt == nil {
		t.Fatalf("Cancellation not persisted: %+v", order)
	}

	for _, method := range []string{http.MethodGet, http.MethodPost} {
		path := "/api/orders/999"
		if method == http.MethodPost {
			path += "/cancel"
		}
		res := request(method, path, "")
		if res.Code != http.StatusNotFound {
			t.Fatalf("Expected 404 for %s %s, got %d", method, path, res.Code)
		}
	}
}
