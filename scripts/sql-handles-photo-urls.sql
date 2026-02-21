-- Таблица ручек и URL основного фото (категория «Ручки и завертки»).
-- Выполнить: psql $DATABASE_URL -f scripts/sql-handles-photo-urls.sql
-- или в DBeaver / другом клиенте.

SELECT
  p.sku AS "SKU",
  p.name AS "Название",
  COALESCE(
    (SELECT pi.url
     FROM product_images pi
     WHERE pi.product_id = p.id
     ORDER BY pi.is_primary DESC, pi.sort_order ASC
     LIMIT 1),
    '(нет фото)'
  ) AS "URL фото"
FROM products p
JOIN catalog_categories c ON c.id = p.catalog_category_id
WHERE c.name = 'Ручки и завертки'
  AND p.is_active = true
ORDER BY p.sku;
