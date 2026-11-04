package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func GetOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		id, err := strconv.Atoi(r.PathValue("id"))
		if err != nil || id <= 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Invalid order ID.",
			})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		var order Order
		err = pool.QueryRow(ctx, `
			SELECT id, customer, status, total, created_at, cancelled_at
			FROM sales_orders
			WHERE id = $1
		`, id).Scan(
			&order.ID, &order.Customer, &order.Status,
			&order.Total, &order.CreatedAt, &order.CancelledAt,
		)
		if errors.Is(err, pgx.ErrNoRows) {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Order not found.",
			})
			return
		}
		if err != nil {
			orderError(w, err)
			return
		}

		rows, err := pool.Query(ctx, `
			SELECT id, order_id, sku, qty, unit_price
			FROM sales_order_items
			WHERE order_id = $1
			ORDER BY id
		`, id)
		if err != nil {
			orderError(w, err)
			return
		}

		order.Items, err = readOrderItems(rows)
		if err != nil {
			orderError(w, err)
			return
		}

		json.NewEncoder(w).Encode(order)
	}
}

func CancelOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		id, err := strconv.Atoi(r.PathValue("id"))
		if err != nil || id <= 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Invalid order ID.",
			})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		tx, err := pool.Begin(ctx)
		if err != nil {
			orderError(w, err)
			return
		}
		defer tx.Rollback(ctx)

		var order Order
		err = tx.QueryRow(ctx, `
			SELECT id, customer, status, total, created_at, cancelled_at
			FROM sales_orders
			WHERE id = $1
			FOR UPDATE
		`, id).Scan(
			&order.ID, &order.Customer, &order.Status,
			&order.Total, &order.CreatedAt, &order.CancelledAt,
		)
		if errors.Is(err, pgx.ErrNoRows) {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Order not found.",
			})
			return
		}
		if err != nil {
			orderError(w, err)
			return
		}

		if order.Status == "CANCELLED" {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "This order has already been cancelled.",
			})
			return
		}

		// Use the same SKU lock order as order creation.
		rows, err := tx.Query(ctx, `
			SELECT id, order_id, sku, qty, unit_price
			FROM sales_order_items
			WHERE order_id = $1
			ORDER BY sku COLLATE "C"
		`, id)
		if err != nil {
			orderError(w, err)
			return
		}

		order.Items, err = readOrderItems(rows)
		if err != nil {
			orderError(w, err)
			return
		}

		for _, item := range order.Items {
			var productID, stock int
			err := tx.QueryRow(ctx, `
				SELECT id, stock
				FROM products
				WHERE sku = $1
				FOR UPDATE
			`, item.SKU).Scan(&productID, &stock)
			if err != nil {
				orderError(w, err)
				return
			}

			const maxStock = 1<<31 - 1
			if item.Qty > maxStock-stock {
				w.WriteHeader(http.StatusConflict)
				json.NewEncoder(w).Encode(map[string]string{
					"error": "Restoring stock would exceed the stock limit.",
				})
				return
			}

			_, err = tx.Exec(ctx, `
				UPDATE products
				SET stock = stock + $1
				WHERE id = $2
			`, item.Qty, productID)
			if err != nil {
				orderError(w, err)
				return
			}

			_, err = tx.Exec(ctx, `
				INSERT INTO stock_movements (product_id, type, qty, note)
				VALUES ($1, 'in', $2, $3)
			`, productID, item.Qty, fmt.Sprintf("Cancellation of order %d", id))
			if err != nil {
				orderError(w, err)
				return
			}
		}

		err = tx.QueryRow(ctx, `
			UPDATE sales_orders
			SET status = 'CANCELLED', cancelled_at = now()
			WHERE id = $1
			RETURNING cancelled_at
		`, id).Scan(&order.CancelledAt)
		if err != nil {
			orderError(w, err)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			orderError(w, err)
			return
		}

		order.Status = "CANCELLED"
		json.NewEncoder(w).Encode(order)
	}
}

func readOrderItems(rows pgx.Rows) ([]OrderItem, error) {
	defer rows.Close()

	items := make([]OrderItem, 0)
	for rows.Next() {
		var item OrderItem
		if err := rows.Scan(
			&item.ID, &item.OrderID, &item.SKU,
			&item.Qty, &item.UnitPrice,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func orderError(w http.ResponseWriter, err error) {
	log.Printf("Could not process order: %v", err)
	w.WriteHeader(http.StatusInternalServerError)
	json.NewEncoder(w).Encode(map[string]string{
		"error": "Could not process the order.",
	})
}
