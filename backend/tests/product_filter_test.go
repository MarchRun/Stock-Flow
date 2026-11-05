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

func TestProductFilters(t *testing.T) {
	pool := testDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := pool.Exec(ctx, `
		INSERT INTO products (sku, name, price, stock, is_active)
		VALUES
			('FILTER-A', 'Cotton shirt', 120000, 20, true),
			('FILTER-B', 'Polo shirt', 175000, 10, true),
			('FILTER-C', 'Hoodie', 275000, 0, false)
	`)
	if err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/products", api.ListProducts(pool))

	tests := []struct {
		query string
		total int
		sku string
	}{
		{query: "filter=all", total: 3, sku: "FILTER-A"},
		{query: "filter=active", total: 2, sku: "FILTER-A"},
		{query: "filter=inactive", total: 1, sku: "FILTER-C"},
		{query: "filter=low_stock", total: 2, sku: "FILTER-B"},
		{query: "filter=active&search=POLO", total: 1, sku: "FILTER-B"},
		{query: "filter=inactive&search=POLO", total: 0},
	}

	for _, tt := range tests {
		t.Run(tt.query, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet,
				"/api/products?limit=1&"+tt.query, nil)
			res := httptest.NewRecorder()
			mux.ServeHTTP(res, req)
			if res.Code != http.StatusOK {
				t.Fatalf("Expected 200, got %d: %s", res.Code, res.Body.String())
			}

			var result api.ProductList
			if err := json.Unmarshal(res.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if result.Total != tt.total || result.Page != 1 || result.Limit != 1 {
				t.Fatalf("Unexpected pagination: %+v", result)
			}
			if tt.total == 0 {
				if result.Data == nil || len(result.Data) != 0 {
					t.Fatalf("Expected empty array: %s", res.Body.String())
				}
			} else if len(result.Data) != 1 || result.Data[0].SKU != tt.sku {
				t.Fatalf("Unexpected products: %+v", result.Data)
			}
		})
	}

	res := httptest.NewRecorder()
	mux.ServeHTTP(res, httptest.NewRequest(http.MethodGet,
		"/api/products?filter=unknown", nil))
	if res.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for invalid filter, got %d", res.Code)
	}
}
