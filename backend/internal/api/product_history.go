package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type StockMovement struct {
	ID int `json:"id"`
	ProductID int `json:"product_id"`
	Type string `json:"type"`
	Qty int `json:"qty"`
	Note *string `json:"note"`
	CreatedAt time.Time `json:"created_at"`
}

func DeleteProduct(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		id, err := strconv.Atoi(r.PathValue("id"))
		if err != nil || id <= 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Invalid product ID.",
			})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		tx, err := pool.Begin(ctx)
		if err != nil {
			productHistoryError(w, err)
			return
		}
		defer tx.Rollback(ctx)

		var productID int
		err = tx.QueryRow(ctx, `
			SELECT id
			FROM products
			WHERE id = $1
			FOR UPDATE
		`, id).Scan(&productID)
		if errors.Is(err, pgx.ErrNoRows) {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Product not found.",
			})
			return
		}
		if err != nil {
			productHistoryError(w, err)
			return
		}

		var hasHistory bool
		err = tx.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM stock_movements WHERE product_id = $1
			)
		`, id).Scan(&hasHistory)
		if err != nil {
			productHistoryError(w, err)
			return
		}

		if hasHistory {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error": map[string]string{
					"code": "PRODUCT_HAS_HISTORY",
				},
			})
			return
		}

		_, err = tx.Exec(ctx, "DELETE FROM products WHERE id = $1", id)
		if err != nil {
			productError(w, err)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			productHistoryError(w, err)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func ProductHistory(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		id, err := strconv.Atoi(r.PathValue("id"))
		if err != nil || id <= 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Invalid product ID.",
			})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		var exists bool
		err = pool.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM products WHERE id = $1)
		`, id).Scan(&exists)
		if err != nil {
			productHistoryError(w, err)
			return
		}
		if !exists {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Product not found.",
			})
			return
		}

		rows, err := pool.Query(ctx, `
			SELECT id, product_id, type, qty, note, created_at
			FROM stock_movements
			WHERE product_id = $1
			ORDER BY created_at DESC, id DESC
		`, id)
		if err != nil {
			productHistoryError(w, err)
			return
		}
		defer rows.Close()

		movements := make([]StockMovement, 0)
		for rows.Next() {
			var movement StockMovement
			err := rows.Scan(
				&movement.ID,
				&movement.ProductID,
				&movement.Type,
				&movement.Qty,
				&movement.Note,
				&movement.CreatedAt,
			)
			if err != nil {
				productHistoryError(w, err)
				return
			}
			movements = append(movements, movement)
		}

		if err := rows.Err(); err != nil {
			productHistoryError(w, err)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": movements,
		})
	}
}

func productHistoryError(w http.ResponseWriter, err error) {
	log.Printf("Could not process product history: %v", err)
	w.WriteHeader(http.StatusInternalServerError)
	json.NewEncoder(w).Encode(map[string]string{
		"error": "Could not process the request.",
	})
}