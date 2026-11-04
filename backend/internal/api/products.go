package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Product struct {
	ID             int        `json:"id"`
	SKU            string     `json:"sku"`
	Name           string     `json:"name"`
	Price          int        `json:"price"`
	Stock          int        `json:"stock"`
	IsActive       bool       `json:"is_active"`
	CreatedAt      time.Time  `json:"created_at"`
	LastMovementAt *time.Time `json:"last_movement_at"`
}

type ProductList struct {
	Data  []Product `json:"data"`
	Page  int       `json:"page"`
	Limit int       `json:"limit"`
	Total int       `json:"total"`
}

func ListProducts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		page, err := strconv.Atoi(r.URL.Query().Get("page"))
		if err != nil || page < 1 {
			page = 1
		}

		limit, err := strconv.Atoi(r.URL.Query().Get("limit"))
		if err != nil || limit < 1 {
			limit = 10
		}
		if limit > 100 {
			limit = 100
		}

		const maxInt64 = int64(1<<63 - 1)
		if int64(page-1) > maxInt64/int64(limit) {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Page number is too large.",
			})
			return
		}

		offset := int64(page-1) * int64(limit)
		search := "%" + r.URL.Query().Get("search") + "%"

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		fail := func(err error) {
			log.Printf("Could not list products: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Could not load products.",
			})
		}

		var total int
		err = pool.QueryRow(ctx, `
			SELECT COUNT(*)
			FROM products
			WHERE sku ILIKE $1 OR name ILIKE $1
		`, search).Scan(&total)
		if err != nil {
			fail(err)
			return
		}

		rows, err := pool.Query(ctx, `
			SELECT
				p.id, p.sku, p.name, p.price, p.stock,
				p.is_active, p.created_at,
				(
					SELECT MAX(m.created_at)
					FROM stock_movements m
					WHERE m.product_id = p.id
				) AS last_movement_at
			FROM products p
			WHERE p.sku ILIKE $1 OR p.name ILIKE $1
			ORDER BY p.id
			LIMIT $2 OFFSET $3
		`, search, limit, offset)
		if err != nil {
			fail(err)
			return
		}
		defer rows.Close()

		products := make([]Product, 0)
		for rows.Next() {
			var product Product
			if err := rows.Scan(
				&product.ID,
				&product.SKU,
				&product.Name,
				&product.Price,
				&product.Stock,
				&product.IsActive,
				&product.CreatedAt,
				&product.LastMovementAt,
			); err != nil {
				fail(err)
				return
			}
			products = append(products, product)
		}

		if err := rows.Err(); err != nil {
			fail(err)
			return
		}

		json.NewEncoder(w).Encode(ProductList{
			Data:  products,
			Page:  page,
			Limit: limit,
			Total: total,
		})
	}
}
