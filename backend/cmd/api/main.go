package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"time"

	"stockflow/backend/internal/api"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file loaded; using system environment variables")
	}

	dbURL := url.URL{
		Scheme: "postgres",
		User: url.UserPassword(
			os.Getenv("DB_USER"),
			os.Getenv("DB_PASSWORD"),
		),
		Host: net.JoinHostPort(
			os.Getenv("DB_HOST"),
			os.Getenv("DB_PORT"),
		),
		Path: os.Getenv("DB_NAME"),
	}

	params := dbURL.Query()
	params.Set("sslmode", "disable")
	dbURL.RawQuery = params.Encode()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL.String())
	if err != nil {
		log.Fatalf("Could not create database pool: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("Could not connect to PostgreSQL: %v", err)
	}
	log.Println("Connected to PostgreSQL")

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", health)
	mux.HandleFunc("GET /api/products", api.ListProducts(pool))

	server := &http.Server{
		Addr:              ":8080",
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Println("API listening on http://localhost:8080")
	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	fmt.Fprint(w, "OK")
}
