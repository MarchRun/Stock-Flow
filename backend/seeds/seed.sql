\set ON_ERROR_STOP on

BEGIN;

INSERT INTO products (sku, name, price, stock, is_active) VALUES
('CL-TSHIRT', 'Cotton T-shirt', 120000, 10, true),
('CL-POLO', 'Polo shirt', 175000, 5, true),
('CL-DENIM', 'Denim jacket', 450000, 20, true),
('CL-RAIN', 'Rain jacket', 300000, 8, true),
('CL-HOODIE', 'Hoodie', 275000, 0, false),
('CL-JUMPER', 'Jumper', 250000, 50, true),
('CL-JEANS', 'Jeans', 350000, 30, true),
('CL-SHORTS', 'Shorts', 150000, 12, true),
('CL-CHINOS', 'Chinos', 325000, 3, true),
('CL-SOCKS', 'Socks', 35000, 15, true),
('CL-CAP', 'Cap', 85000, 0, true),
('CL-BEANIE', 'Beanie', 75000, 100, true);

INSERT INTO stock_movements (product_id, type, qty, note) VALUES
(1, 'in', 11, 'Opening stock count'),
(2, 'in', 7, 'Opening stock count'),
(3, 'in', 22, 'Opening stock count'),
(4, 'in', 10, 'Opening stock count'),
(6, 'in', 30, 'Opening stock count'),
(7, 'in', 30, 'Opening stock count'),
(8, 'in', 12, 'Opening stock count'),
(9, 'in', 4, 'Opening stock count'),
(10, 'in', 15, 'Opening stock count'),
(12, 'in', 60, 'Opening stock count');

INSERT INTO stock_movements (product_id, type, qty, note) VALUES
(6, 'in', 20, 'Supplier delivery'),
(12, 'in', 40, 'Winter stock delivery'),
(4, 'out', 2, 'Damaged zips found during inspection'),
(9, 'out', 1, 'Torn seam found during stock check');

INSERT INTO sales_orders (customer, status, total) VALUES
('Oak Street Clothing', 'CREATED', 1020000),
('Riverside Clothing', 'CREATED', 350000);

INSERT INTO sales_order_items (order_id, sku, qty, unit_price) VALUES
(1, 'CL-TSHIRT', 1, 120000),
(1, 'CL-DENIM', 2, 450000),
(2, 'CL-POLO', 2, 175000);

INSERT INTO stock_movements (product_id, type, qty, note) VALUES
(1, 'out', 1, 'Sales order 1'),
(3, 'out', 2, 'Sales order 1'),
(2, 'out', 2, 'Sales order 2');

COMMIT;