-- 10 примеров "Название модели" от разных фабрик (Поставщик)
SELECT DISTINCT ON (COALESCE(properties_data::jsonb->>'Поставщик', ''))
  COALESCE(properties_data::jsonb->>'Поставщик', '(пустой Поставщик)') AS supplier,
  properties_data::jsonb->>'Название модели' AS model_name
FROM products
WHERE is_active = true
  AND trim(COALESCE(properties_data::jsonb->>'Название модели', '')) != ''
ORDER BY COALESCE(properties_data::jsonb->>'Поставщик', ''), 2
LIMIT 10;
