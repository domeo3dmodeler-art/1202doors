-- =============================================================================
-- ПОЛНЫЙ DDL СХЕМЫ БД ПРИЛОЖЕНИЯ 1002doors (PostgreSQL)
-- Источник: Prisma schema.prisma + миграции. Для аудита и интеграции PIM3.
-- Ничего не сокращено. Генерация: по текущей схеме приложения.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ENUM-типы (создавались в миграции 20250115000000, в Prisma сейчас используются TEXT)
-- -----------------------------------------------------------------------------
CREATE TYPE "UserRole" AS ENUM ('admin', 'complectator', 'executor');
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'CANCELLED');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED');
CREATE TYPE "ImportStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- -----------------------------------------------------------------------------
-- ТАБЛИЦЫ (в порядке зависимостей: без FK сначала)
-- -----------------------------------------------------------------------------

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "compilationLeadNumber" TEXT,
    "customFields" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "path" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "products_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_properties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "options" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_properties_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "category_property_assignments" (
    "id" TEXT NOT NULL,
    "catalog_category_id" TEXT NOT NULL,
    "product_property_id" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_for_calculator" BOOLEAN NOT NULL DEFAULT false,
    "is_for_export" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_property_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "import_templates" (
    "id" TEXT NOT NULL,
    "catalog_category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "required_fields" TEXT NOT NULL DEFAULT '[]',
    "calculator_fields" TEXT NOT NULL DEFAULT '[]',
    "export_fields" TEXT NOT NULL DEFAULT '[]',
    "template_config" TEXT,
    "field_mappings" TEXT,
    "validation_rules" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "constructor_configurations" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "configuration" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "constructor_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "content" TEXT NOT NULL,
    "documentData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "export_settings" (
    "id" TEXT NOT NULL,
    "catalog_category_id" TEXT NOT NULL,
    "export_type" TEXT NOT NULL,
    "fields_config" TEXT NOT NULL DEFAULT '[]',
    "display_config" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "export_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "frontend_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "catalog_category_ids" TEXT NOT NULL DEFAULT '[]',
    "display_config" TEXT NOT NULL DEFAULT '{}',
    "property_mapping" TEXT DEFAULT '[]',
    "photo_mapping" TEXT DEFAULT '{}',
    "photo_data" TEXT DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "frontend_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "constructor_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "constructor_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "catalog_category_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "series" TEXT,
    "base_price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "min_order_qty" INTEGER NOT NULL DEFAULT 1,
    "weight" DOUBLE PRECISION,
    "dimensions" TEXT NOT NULL DEFAULT '{}',
    "specifications" TEXT NOT NULL DEFAULT '{}',
    "properties_data" TEXT NOT NULL DEFAULT '{}',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt_text" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "file_size" INTEGER,
    "mime_type" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "parent_document_id" TEXT,
    "cart_session_id" TEXT,
    "client_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "valid_until" TIMESTAMP(3),
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "notes" TEXT,
    "terms" TEXT,
    "cart_data" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "total_price" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "lead_number" TEXT,
    "complectator_id" TEXT,
    "executor_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW_PLANNED',
    "project_file_url" TEXT,
    "door_dimensions" TEXT,
    "measurement_done" BOOLEAN NOT NULL DEFAULT false,
    "project_complexity" TEXT,
    "wholesale_invoices" TEXT,
    "technical_specs" TEXT,
    "verification_status" TEXT,
    "verification_notes" TEXT,
    "parent_document_id" TEXT,
    "cart_session_id" TEXT,
    "cart_data" TEXT,
    "total_amount" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "parent_document_id" TEXT,
    "cart_session_id" TEXT,
    "order_id" TEXT,
    "client_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "invoice_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3),
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "notes" TEXT,
    "cart_data" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "total_price" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_orders" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "parent_document_id" TEXT,
    "cart_session_id" TEXT,
    "executor_id" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "supplier_email" TEXT,
    "supplier_phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_date" TIMESTAMP(3),
    "notes" TEXT,
    "cart_data" TEXT,
    "total_amount" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "import_history" (
    "id" TEXT NOT NULL,
    "template_id" TEXT,
    "catalog_category_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_size" INTEGER,
    "imported_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errors" TEXT NOT NULL DEFAULT '[]',
    "import_data" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "page_elements" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "props" TEXT NOT NULL DEFAULT '{}',
    "position" TEXT NOT NULL DEFAULT '{}',
    "size" TEXT NOT NULL DEFAULT '{}',
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "pageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_elements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "property_photos" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "propertyName" TEXT NOT NULL,
    "propertyValue" TEXT NOT NULL,
    "photoPath" TEXT NOT NULL,
    "photoType" TEXT NOT NULL DEFAULT 'cover',
    "originalFilename" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_photos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_comments" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_history" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "template_data" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT,
    "document_id" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- UNIQUE ОГРАНИЧЕНИЯ
-- =============================================================================

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "product_properties_name_key" ON "product_properties"("name");
CREATE UNIQUE INDEX "category_property_assignments_catalog_category_id_product_property_id_key"
    ON "category_property_assignments"("catalog_category_id", "product_property_id");
CREATE UNIQUE INDEX "import_templates_catalog_category_id_key" ON "import_templates"("catalog_category_id");
CREATE UNIQUE INDEX "export_settings_catalog_category_id_export_type_key"
    ON "export_settings"("catalog_category_id", "export_type");
CREATE UNIQUE INDEX "frontend_categories_slug_key" ON "frontend_categories"("slug");
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE UNIQUE INDEX "quotes_number_key" ON "quotes"("number");
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");
CREATE UNIQUE INDEX "invoices_order_id_key" ON "invoices"("order_id");
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");
CREATE UNIQUE INDEX "pages_url_key" ON "pages"("url");
CREATE UNIQUE INDEX "property_photos_categoryId_propertyName_propertyValue_photoType_key"
    ON "property_photos"("categoryId", "propertyName", "propertyValue", "photoType");

-- =============================================================================
-- ИНДЕКСЫ (NON-UNIQUE)
-- =============================================================================

CREATE INDEX "clients_phone_idx" ON "clients"("phone");
CREATE INDEX "clients_firstName_lastName_idx" ON "clients"("firstName", "lastName");

CREATE INDEX "catalog_categories_parent_id_idx" ON "catalog_categories"("parent_id");
CREATE INDEX "catalog_categories_path_idx" ON "catalog_categories"("path");

CREATE INDEX "import_templates_catalog_category_id_idx" ON "import_templates"("catalog_category_id");

CREATE INDEX "products_catalog_category_id_idx" ON "products"("catalog_category_id");
CREATE INDEX "products_is_active_idx" ON "products"("is_active");
CREATE INDEX "products_created_at_idx" ON "products"("created_at");
CREATE INDEX "products_properties_data_idx" ON "products"("properties_data");
CREATE INDEX IF NOT EXISTS "idx_products_created_at" ON "products"("created_at");
CREATE INDEX IF NOT EXISTS "idx_products_properties_data" ON "products"("properties_data");
CREATE INDEX IF NOT EXISTS "idx_products_category_properties" ON "products"("catalog_category_id", "properties_data");
CREATE INDEX IF NOT EXISTS "idx_products_is_active" ON "products"("is_active");

CREATE INDEX "product_images_product_id_idx" ON "product_images"("product_id");
CREATE INDEX "product_images_is_primary_idx" ON "product_images"("is_primary");

CREATE INDEX "quotes_client_id_idx" ON "quotes"("client_id");
CREATE INDEX "quotes_status_idx" ON "quotes"("status");
CREATE INDEX "quotes_created_at_idx" ON "quotes"("created_at");
CREATE INDEX "quotes_created_by_idx" ON "quotes"("created_by");

CREATE INDEX "quote_items_quote_id_idx" ON "quote_items"("quote_id");
CREATE INDEX "quote_items_product_id_idx" ON "quote_items"("product_id");

CREATE INDEX "invoices_client_id_idx" ON "invoices"("client_id");
CREATE INDEX "invoices_status_idx" ON "invoices"("status");
CREATE INDEX "invoices_created_at_idx" ON "invoices"("created_at");
CREATE INDEX "invoices_created_by_idx" ON "invoices"("created_by");
CREATE INDEX "invoices_parent_document_id_idx" ON "invoices"("parent_document_id");
CREATE INDEX "invoices_order_id_idx" ON "invoices"("order_id");

CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");
CREATE INDEX "invoice_items_product_id_idx" ON "invoice_items"("product_id");

CREATE INDEX "supplier_orders_executor_id_idx" ON "supplier_orders"("executor_id");
CREATE INDEX "supplier_orders_status_idx" ON "supplier_orders"("status");
CREATE INDEX "supplier_orders_created_at_idx" ON "supplier_orders"("created_at");
CREATE INDEX "supplier_orders_parent_document_id_idx" ON "supplier_orders"("parent_document_id");

CREATE INDEX "import_history_template_id_idx" ON "import_history"("template_id");

CREATE INDEX "frontend_categories_slug_idx" ON "frontend_categories"("slug");

CREATE INDEX "page_elements_pageId_idx" ON "page_elements"("pageId");

CREATE INDEX "property_photos_categoryId_idx" ON "property_photos"("categoryId");
CREATE INDEX "property_photos_propertyName_idx" ON "property_photos"("propertyName");
CREATE INDEX "property_photos_propertyValue_idx" ON "property_photos"("propertyValue");
CREATE INDEX "property_photos_categoryId_propertyName_propertyValue_idx"
    ON "property_photos"("categoryId", "propertyName", "propertyValue");
CREATE INDEX "property_photos_photoType_idx" ON "property_photos"("photoType");

CREATE INDEX "document_comments_document_id_idx" ON "document_comments"("document_id");
CREATE INDEX "document_comments_user_id_idx" ON "document_comments"("user_id");
CREATE INDEX "document_comments_created_at_idx" ON "document_comments"("created_at");

CREATE INDEX "document_history_document_id_idx" ON "document_history"("document_id");
CREATE INDEX "document_history_user_id_idx" ON "document_history"("user_id");
CREATE INDEX "document_history_action_idx" ON "document_history"("action");
CREATE INDEX "document_history_created_at_idx" ON "document_history"("created_at");

CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");
CREATE INDEX "notifications_is_read_idx" ON "notifications"("is_read");
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

CREATE INDEX "orders_client_id_idx" ON "orders"("client_id");
CREATE INDEX "orders_status_idx" ON "orders"("status");
CREATE INDEX "orders_invoice_id_idx" ON "orders"("invoice_id");
CREATE INDEX "orders_executor_id_idx" ON "orders"("executor_id");
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");
CREATE INDEX "orders_parent_document_id_idx" ON "orders"("parent_document_id");
CREATE INDEX "orders_cart_session_id_idx" ON "orders"("cart_session_id");

-- =============================================================================
-- FOREIGN KEY
-- =============================================================================

ALTER TABLE "catalog_categories"
    ADD CONSTRAINT "catalog_categories_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "catalog_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "category_property_assignments"
    ADD CONSTRAINT "category_property_assignments_catalog_category_id_fkey"
    FOREIGN KEY ("catalog_category_id") REFERENCES "catalog_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_property_assignments"
    ADD CONSTRAINT "category_property_assignments_product_property_id_fkey"
    FOREIGN KEY ("product_property_id") REFERENCES "product_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "import_templates"
    ADD CONSTRAINT "import_templates_catalog_category_id_fkey"
    FOREIGN KEY ("catalog_category_id") REFERENCES "catalog_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "export_settings"
    ADD CONSTRAINT "export_settings_catalog_category_id_fkey"
    FOREIGN KEY ("catalog_category_id") REFERENCES "catalog_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "products"
    ADD CONSTRAINT "products_catalog_category_id_fkey"
    FOREIGN KEY ("catalog_category_id") REFERENCES "catalog_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_images"
    ADD CONSTRAINT "product_images_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quotes"
    ADD CONSTRAINT "quotes_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quote_items"
    ADD CONSTRAINT "quote_items_quote_id_fkey"
    FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders"
    ADD CONSTRAINT "orders_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoice_items"
    ADD CONSTRAINT "invoice_items_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders"
    ADD CONSTRAINT "orders_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "import_history"
    ADD CONSTRAINT "import_history_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "import_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "page_elements"
    ADD CONSTRAINT "page_elements_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_comments"
    ADD CONSTRAINT "document_comments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_history"
    ADD CONSTRAINT "document_history_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
