package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type OrderInput struct {
	Customer string           `json:"customer"`
	Items    []OrderLineInput `json:"items"`
}

type OrderLineInput struct {
	SKU string `json:"sku"`
	Qty int    `json:"qty"`
}

type Order struct {
	ID          int         `json:"id"`
	Customer    string      `json:"customer"`
	Status      string      `json:"status"`
	Total       int         `json:"total"`
	CreatedAt   time.Time   `json:"created_at"`
	CancelledAt *time.Time  `json:"cancelled_at"`
	Items       []OrderItem `json:"items"`
}

type OrderItem struct {
	ID        int    `json:"id"`
	OrderID   int    `json:"order_id"`
	SKU       string `json:"sku"`
	Qty       int    `json:"qty"`
	UnitPrice int    `json:"unit_price"`
}

func CreateOrder(pool *pgxpool.Pool) http.HandlerFunc {
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
			log.Printf("Could not create order: %v", err)
			reply(http.StatusInternalServerError, map[string]string{
				"error": "Could not create the order.",
			})
		}

		var input OrderInput
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			badRequest("Invalid request body.")
			return
		}

		input.Customer = strings.TrimSpace(input.Customer)
		if input.Customer == "" {
			badRequest("Customer name is required.")
			return
		}
		if len(input.Items) == 0 {
			badRequest("Add at least one item.")
			return
		}

		const maxInteger = 1<<31 - 1
		seen := make(map[string]bool)
		skus := make([]string, 0, len(input.Items))

		for i := range input.Items {
			item := &input.Items[i]
			item.SKU = strings.TrimSpace(item.SKU)

			if item.SKU == "" {
				badRequest("Each item needs a SKU.")
				return
			}
			if item.Qty <= 0 || item.Qty > maxInteger {
				badRequest("Quantity must be between 1 and 2147483647.")
				return
			}
			if seen[item.SKU] {
				badRequest("Duplicate SKU: " + item.SKU)
				return
			}

			seen[item.SKU] = true
			skus = append(skus, item.SKU)
		}

		sort.Strings(skus)

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		tx, err := pool.Begin(ctx)
		if err != nil {
			fail(err)
			return
		}
		defer tx.Rollback(ctx)

		type orderProduct struct {
			ID    int
			Price int
			Stock int
		}

		products := make(map[string]orderProduct)
		for _, sku := range skus {
			var product orderProduct
			err := tx.QueryRow(ctx, `
				SELECT id, price, stock
				FROM products
				WHERE sku = $1
				FOR UPDATE
			`, sku).Scan(&product.ID, &product.Price, &product.Stock)
			if errors.Is(err, pgx.ErrNoRows) {
				badRequest("Unknown SKU: " + sku)
				return
			}
			if err != nil {
				fail(err)
				return
			}
			products[sku] = product
		}

		var total int64
		for _, item := range input.Items {
			product := products[item.SKU]

			if product.Stock < item.Qty {
				reply(http.StatusConflict, map[string]interface{}{
					"error": map[string]interface{}{
						"code":      "INSUFFICIENT_STOCK",
						"sku":       item.SKU,
						"available": product.Stock,
					},
				})
				return
			}

			subtotal := int64(product.Price) * int64(item.Qty)
			if subtotal > int64(maxInteger)-total {
				badRequest("Order total exceeds the supported limit.")
				return
			}
			total += subtotal
		}

		order := Order{
			Customer: input.Customer,
			Total:    int(total),
			Items:    make([]OrderItem, 0, len(input.Items)),
		}

		err = tx.QueryRow(ctx, `
			INSERT INTO sales_orders (customer, total)
			VALUES ($1, $2)
			RETURNING id, status, created_at, cancelled_at
		`, order.Customer, order.Total).Scan(
			&order.ID,
			&order.Status,
			&order.CreatedAt,
			&order.CancelledAt,
		)
		if err != nil {
			fail(err)
			return
		}

		for _, item := range input.Items {
			product := products[item.SKU]
			line := OrderItem{
				OrderID:   order.ID,
				SKU:       item.SKU,
				Qty:       item.Qty,
				UnitPrice: product.Price,
			}

			err := tx.QueryRow(ctx, `
				INSERT INTO sales_order_items (order_id, sku, qty, unit_price)
				VALUES ($1, $2, $3, $4)
				RETURNING id
			`, line.OrderID, line.SKU, line.Qty, line.UnitPrice).Scan(&line.ID)
			if err != nil {
				fail(err)
				return
			}

			_, err = tx.Exec(ctx, `
				UPDATE products
				SET stock = stock - $1
				WHERE id = $2
			`, item.Qty, product.ID)
			if err != nil {
				fail(err)
				return
			}

			_, err = tx.Exec(ctx, `
				INSERT INTO stock_movements (product_id, type, qty, note)
				VALUES ($1, 'out', $2, $3)
			`, product.ID, item.Qty, fmt.Sprintf("Sales order %d", order.ID))
			if err != nil {
				fail(err)
				return
			}

			order.Items = append(order.Items, line)
		}

		if err := tx.Commit(ctx); err != nil {
			fail(err)
			return
		}

		reply(http.StatusCreated, order)
	}
}
