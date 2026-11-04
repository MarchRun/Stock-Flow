package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ProductInput struct {
	SKU string `json:"sku"`
	Name string `json:"name"`
	Price *int `json:"price"`
	IsActive *bool `json:"is_active"`
}

func readProduct(w http.ResponseWriter, r *http.Request) (ProductInput, bool) {
	var input ProductInput
	message := ""

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		message = "Invalid request body."
	} else {
		input.SKU = strings.TrimSpace(input.SKU)
		input.Name = strings.TrimSpace(input.Name)

		switch {
		case input.SKU == "":
			message = "SKU is required."
		case input.Name == "":
			message = "Product name is required."
		case input.Price == nil:
			message = "Price is required."
		case *input.Price < 0 || *input.Price > 2147483647:
			message = "Price must be between 0 and 2147483647."
		}
	}

	if message != "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": message})
		return input, false
	}

	return input, true
}

func CreateProduct(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		input, valid := readProduct(w, r)
		if !valid {
			return
		}

		active := true
		if input.IsActive != nil {
			active = *input.IsActive
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		var product Product
		err := pool.QueryRow(ctx, `
			INSERT INTO products (sku, name, price, is_active)
			VALUES ($1, $2, $3, $4)
			RETURNING id, sku, name, price, stock, is_active, created_at
		`, input.SKU, input.Name, *input.Price, active).Scan(
			&product.ID,
			&product.SKU,
			&product.Name,
			&product.Price,
			&product.Stock,
			&product.IsActive,
			&product.CreatedAt,
		)
		if err != nil {
			productError(w, err)
			return
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(product)
	}
}

func UpdateProduct(pool *pgxpool.Pool) http.HandlerFunc {
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

		input, valid := readProduct(w, r)
		if !valid {
			return
		}

		if input.IsActive == nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Active status is required.",
			})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		result, err := pool.Exec(ctx, `
			UPDATE products
			SET sku = $1, name = $2, price = $3, is_active = $4
			WHERE id = $5
		`, input.SKU, input.Name, *input.Price, *input.IsActive, id)
		if err != nil {
			productError(w, err)
			return
		}

		if result.RowsAffected() == 0 {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Product not found.",
			})
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func productError(w http.ResponseWriter, err error) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Another product already uses this SKU.",
			})
			return
		case "23503":
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "This product is referenced by existing records.",
			})
			return
		}
	}

	log.Printf("Could not save product: %v", err)
	w.WriteHeader(http.StatusInternalServerError)
	json.NewEncoder(w).Encode(map[string]string{
		"error": "Could not save the product.",
	})
}