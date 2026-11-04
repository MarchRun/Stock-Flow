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

type StockAdjustment struct {
	Type string `json:"type"`
	Qty  int    `json:"qty"`
	Note string `json:"note"`
}

func AdjustStock(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		reply := func(status int, body interface{}) {
			w.WriteHeader(status)
			json.NewEncoder(w).Encode(body)
		}

		badRequest := func(message string) {
			reply(http.StatusBadRequest, map[string]string{
				"error": message,
			})
		}

		fail := func(err error) {
			log.Printf("Could not adjust stock: %v", err)
			reply(http.StatusInternalServerError, map[string]string{
				"error": "Could not adjust stock.",
			})
		}

		id, err := strconv.Atoi(r.PathValue("id"))
		if err != nil || id <= 0 {
			badRequest("Invalid product ID.")
			return
		}

		var input StockAdjustment
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			badRequest("Invalid request body.")
			return
		}

		if input.Type != "in" && input.Type != "out" {
			badRequest("Type must be 'in' or 'out'.")
			return
		}

		const maxStock = 1<<31 - 1
		if input.Qty <= 0 || input.Qty > maxStock {
			badRequest("Quantity must be between 1 and 2147483647.")
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		tx, err := pool.Begin(ctx)
		if err != nil {
			fail(err)
			return
		}
		defer tx.Rollback(ctx)

		var stock int
		err = tx.QueryRow(ctx, `
			SELECT stock
			FROM products
			WHERE id = $1
			FOR UPDATE
		`, id).Scan(&stock)
		if errors.Is(err, pgx.ErrNoRows) {
			reply(http.StatusNotFound, map[string]string{
				"error": "Product not found.",
			})
			return
		}
		if err != nil {
			fail(err)
			return
		}

		if input.Type == "out" {
			if input.Qty > stock {
				reply(http.StatusConflict, map[string]interface{}{
					"error": map[string]interface{}{
						"code":      "INSUFFICIENT_STOCK",
						"available": stock,
					},
				})
				return
			}
			stock -= input.Qty
		} else {
			if input.Qty > maxStock-stock {
				badRequest("Adjustment would exceed the stock limit.")
				return
			}
			stock += input.Qty
		}

		_, err = tx.Exec(ctx, `
			UPDATE products
			SET stock = $1
			WHERE id = $2
		`, stock, id)
		if err != nil {
			fail(err)
			return
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO stock_movements (product_id, type, qty, note)
			VALUES ($1, $2, $3, $4)
		`, id, input.Type, input.Qty, input.Note)
		if err != nil {
			fail(err)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			fail(err)
			return
		}

		reply(http.StatusOK, map[string]interface{}{
			"message":    "Stock updated.",
			"product_id": id,
			"new_stock":  stock,
		})
	}
}
