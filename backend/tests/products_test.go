package tests

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
	"strconv"

	"stockflow/backend/internal/api"
)

func TestProductManagement(t *testing.T) {
	pool := testDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/products", api.CreateProduct(pool))
	mux.HandleFunc("PUT /api/products/{id}", api.UpdateProduct(pool))
	mux.HandleFunc("DELETE /api/products/{id}", api.DeleteProduct(pool))
	mux.HandleFunc("POST /api/products/{id}/stock", api.AdjustStock(pool))
	mux.HandleFunc("GET /api/products/{id}/movements", api.ProductHistory(pool))

	request := func(method, path, body string, status int) *httptest.ResponseRecorder {
		t.Helper()

		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		res := httptest.NewRecorder()
		mux.ServeHTTP(res, req)

		if res.Code != status {
			t.Fatalf("%s %s: expected %d, got %d: %s",
				method, path, status, res.Code, res.Body.String())
		}
		return res
	}

	for _, body := range []string{
		`{"name":"Shirt","price":120000}`,
		`{"sku":"TEST","price":120000}`,
		`{"sku":"TEST","name":"Shirt"}`,
		`{"sku":"TEST","name":"Shirt","price":-1}`,
		`{"sku":"TEST","name":"Shirt","price":1.5}`,
	} {
		request(http.MethodPost, "/api/products", body, http.StatusBadRequest)
	}

	var count int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM products").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("Invalid requests created %d products", count)
	}

	created := request(http.MethodPost, "/api/products",
		`{"sku":" TEST-SHIRT ","name":" Test shirt ","price":120000}`,
		http.StatusCreated)

	var product api.Product
	if err := json.Unmarshal(created.Body.Bytes(), &product); err != nil {
		t.Fatal(err)
	}
	if product.ID != 1 || product.SKU != "TEST-SHIRT" ||
		product.Name != "Test shirt" || product.Price != 120000 ||
		product.Stock != 0 || !product.IsActive ||
		product.LastMovementAt != nil {
		t.Fatalf("Unexpected product: %+v", product)
	}

	request(http.MethodPost, "/api/products",
		`{"sku":"TEST-SHIRT","name":"Duplicate shirt","price":120000}`,
		http.StatusConflict)

	updated := `{"sku":"TEST-SHIRT","name":"Updated shirt","price":125000,"is_active":false}`
	request(http.MethodPut, "/api/products/1", updated, http.StatusNoContent)
	request(http.MethodPut, "/api/products/999", updated, http.StatusNotFound)

	var name string
	var price, stock int
	var active bool
	err := pool.QueryRow(ctx, `
		SELECT name, price, stock, is_active
		FROM products WHERE id = 1
	`).Scan(&name, &price, &stock, &active)
	if err != nil {
		t.Fatal(err)
	}
	if name != "Updated shirt" || price != 125000 || stock != 0 || active {
		t.Fatalf("Update not persisted correctly")
	}

	empty := request(http.MethodGet, "/api/products/1/movements", "", http.StatusOK)
	var history struct {
		Data []api.StockMovement `json:"data"`
	}
	if err := json.Unmarshal(empty.Body.Bytes(), &history); err != nil {
		t.Fatal(err)
	}
	if history.Data == nil || len(history.Data) != 0 {
		t.Fatalf("Expected an empty array: %s", empty.Body.String())
	}

	request(http.MethodPost, "/api/products/1/stock",
		`{"type":"in","qty":5,"note":"Supplier delivery"}`, http.StatusOK)
	request(http.MethodPost, "/api/products/1/stock",
		`{"type":"out","qty":2,"note":"Damaged items removed"}`, http.StatusOK)

	result := request(http.MethodGet, "/api/products/1/movements", "", http.StatusOK)
	if err := json.Unmarshal(result.Body.Bytes(), &history); err != nil {
		t.Fatal(err)
	}
	if len(history.Data) != 2 {
		t.Fatalf("Expected 2 movements, got %d", len(history.Data))
	}

	newest, oldest := history.Data[0], history.Data[1]
	if newest.ID <= oldest.ID || newest.Type != "out" || newest.Qty != 2 ||
		oldest.Type != "in" || oldest.Qty != 5 ||
		newest.Note == nil || *newest.Note != "Damaged items removed" {
		t.Fatalf("Unexpected history: %+v", history.Data)
	}

	blocked := request(http.MethodDelete, "/api/products/1", "", http.StatusConflict)
	var conflict struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(blocked.Body.Bytes(), &conflict); err != nil {
		t.Fatal(err)
	}
	if conflict.Error.Code != "PRODUCT_HAS_HISTORY" {
		t.Fatalf("Unexpected conflict: %s", blocked.Body.String())
	}

	var movements int
	err = pool.QueryRow(ctx, `
		SELECT
			(SELECT stock FROM products WHERE id = 1),
			(SELECT COUNT(*) FROM stock_movements WHERE product_id = 1)
	`).Scan(&stock, &movements)
	if err != nil {
		t.Fatal(err)
	}
	if stock != 3 || movements != 2 {
		t.Fatalf("Rejected deletion changed stock or history")
	}

	createdCap := request(http.MethodPost, "/api/products",
		`{"sku":"TEST-CAP","name":"Test cap","price":0}`,
		http.StatusCreated)

	var cap api.Product
	if err := json.Unmarshal(createdCap.Body.Bytes(), &cap); err != nil {
		t.Fatal(err)
	}

	path := "/api/products/" + strconv.Itoa(cap.ID)
	request(http.MethodDelete, path, "", http.StatusNoContent)
	request(http.MethodDelete, path, "", http.StatusNotFound)
	request(http.MethodGet, path+"/movements", "", http.StatusNotFound)

	if err := pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM products WHERE id = $1", cap.ID,
	).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("Deleted product still exists")
	}
}
