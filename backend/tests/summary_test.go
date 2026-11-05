package tests

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"stockflow/backend/internal/api"
)

func TestInventorySummary(t *testing.T) {
	pool := testDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/summary", api.GetSummary(pool))

	check := func(total, active int, value int64, low int) {
		t.Helper()
		res := httptest.NewRecorder()
		mux.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/summary", nil))
		if res.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", res.Code, res.Body.String())
		}
		var result api.InventorySummary
		if err := json.Unmarshal(res.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if result.TotalProducts != total || result.ActiveProducts != active ||
			result.StockValue != value || result.LowStockCount != low {
			t.Fatalf("Unexpected summary: %+v", result)
		}
	}

	check(0, 0, 0, 0)
	_, err := pool.Exec(ctx, `
		INSERT INTO products (sku, name, price, stock, is_active)
		VALUES
			('SUMMARY-A', 'Shirt', 100000, 20, true),
			('SUMMARY-B', 'Cap', 50000, 10, true),
			('SUMMARY-C', 'Hoodie', 250000, 0, false)
	`)
	if err != nil {
		t.Fatal(err)
	}
	check(3, 2, 2500000, 2)

	_, err = pool.Exec(ctx, "UPDATE products SET stock = 5 WHERE sku = 'SUMMARY-A'")
	if err != nil {
		t.Fatal(err)
	}
	check(3, 2, 1000000, 3)
}
