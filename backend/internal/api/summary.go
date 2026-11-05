package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type InventorySummary struct {
	TotalProducts int `json:"total_products"`
	ActiveProducts int `json:"active_products"`
	StockValue int64 `json:"stock_value"`
	LowStockCount int `json:"low_stock_count"`
}

func GetSummary(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		var summary InventorySummary
		err := pool.QueryRow(ctx, `
			SELECT
				COUNT(*),
				COUNT(*) FILTER (WHERE is_active),
				COALESCE(SUM(price::bigint * stock), 0),
				COUNT(*) FILTER (WHERE stock <= 10)
			FROM products
		`).Scan(
			&summary.TotalProducts,
			&summary.ActiveProducts,
			&summary.StockValue,
			&summary.LowStockCount,
		)
		if err != nil {
			log.Printf("Could not load inventory summary: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Could not load the inventory summary.",
			})
			return
		}

		json.NewEncoder(w).Encode(summary)
	}
}
