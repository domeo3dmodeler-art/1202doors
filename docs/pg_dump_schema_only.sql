--
-- PostgreSQL database dump
--

-- Dumped from database version 15.14
-- Dumped by pg_dump version 15.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: catalog_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_categories (
    id text NOT NULL,
    name text NOT NULL,
    parent_id text,
    level integer DEFAULT 0 NOT NULL,
    path text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    products_count integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: category_property_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_property_assignments (
    id text NOT NULL,
    catalog_category_id text NOT NULL,
    product_property_id text NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    is_for_calculator boolean DEFAULT false NOT NULL,
    is_for_export boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id text NOT NULL,
    "firstName" text NOT NULL,
    "lastName" text NOT NULL,
    "middleName" text,
    phone text NOT NULL,
    address text NOT NULL,
    "objectId" text NOT NULL,
    "compilationLeadNumber" text,
    "customFields" text DEFAULT '{}'::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: constructor_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.constructor_configs (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    config text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: constructor_configurations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.constructor_configurations (
    id text NOT NULL,
    "categoryId" text NOT NULL,
    name text NOT NULL,
    configuration text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: document_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_comments (
    id text NOT NULL,
    document_id text NOT NULL,
    user_id text NOT NULL,
    text text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: document_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_history (
    id text NOT NULL,
    document_id text NOT NULL,
    user_id text NOT NULL,
    action text NOT NULL,
    old_value text,
    new_value text,
    details text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id text NOT NULL,
    "clientId" text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    content text NOT NULL,
    "documentData" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: export_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_settings (
    id text NOT NULL,
    catalog_category_id text NOT NULL,
    export_type text NOT NULL,
    fields_config text DEFAULT '[]'::text NOT NULL,
    display_config text DEFAULT '{}'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: frontend_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.frontend_categories (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    icon text,
    catalog_category_ids text DEFAULT '[]'::text NOT NULL,
    display_config text DEFAULT '{}'::text NOT NULL,
    property_mapping text DEFAULT '[]'::text,
    photo_mapping text DEFAULT '{}'::text,
    photo_data text DEFAULT '{}'::text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: import_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_history (
    id text NOT NULL,
    template_id text,
    catalog_category_id text NOT NULL,
    filename text NOT NULL,
    file_size integer,
    imported_count integer DEFAULT 0 NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    errors text DEFAULT '[]'::text NOT NULL,
    import_data text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: import_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_templates (
    id text NOT NULL,
    catalog_category_id text NOT NULL,
    name text NOT NULL,
    description text,
    required_fields text DEFAULT '[]'::text NOT NULL,
    calculator_fields text DEFAULT '[]'::text NOT NULL,
    export_fields text DEFAULT '[]'::text NOT NULL,
    template_config text,
    field_mappings text,
    validation_rules text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_items (
    id text NOT NULL,
    invoice_id text NOT NULL,
    product_id text NOT NULL,
    quantity integer NOT NULL,
    unit_price double precision NOT NULL,
    total_price double precision NOT NULL,
    notes text
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id text NOT NULL,
    number text NOT NULL,
    parent_document_id text,
    cart_session_id text,
    order_id text,
    client_id text NOT NULL,
    created_by text NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    invoice_date timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    due_date timestamp(3) without time zone,
    subtotal double precision DEFAULT 0 NOT NULL,
    tax_amount double precision DEFAULT 0 NOT NULL,
    total_amount double precision DEFAULT 0 NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    notes text,
    cart_data text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    user_id text NOT NULL,
    client_id text,
    document_id text,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id text NOT NULL,
    number text NOT NULL,
    client_id text NOT NULL,
    invoice_id text,
    lead_number text,
    complectator_id text,
    executor_id text,
    status text DEFAULT 'NEW_PLANNED'::text NOT NULL,
    project_file_url text,
    door_dimensions text,
    measurement_done boolean DEFAULT false NOT NULL,
    project_complexity text,
    wholesale_invoices text,
    technical_specs text,
    verification_status text,
    verification_notes text,
    parent_document_id text,
    cart_session_id text,
    cart_data text,
    total_amount double precision,
    notes text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: page_elements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_elements (
    id text NOT NULL,
    type text NOT NULL,
    props text DEFAULT '{}'::text NOT NULL,
    "position" text DEFAULT '{}'::text NOT NULL,
    size text DEFAULT '{}'::text NOT NULL,
    "zIndex" integer DEFAULT 0 NOT NULL,
    "parentId" text,
    "pageId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pages (
    id text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    url text NOT NULL,
    "isPublished" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: product_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_images (
    id text NOT NULL,
    product_id text NOT NULL,
    filename text NOT NULL,
    original_name text NOT NULL,
    url text NOT NULL,
    alt_text text,
    width integer,
    height integer,
    file_size integer,
    mime_type text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: product_properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_properties (
    id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    description text,
    options text,
    is_required boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id text NOT NULL,
    catalog_category_id text NOT NULL,
    sku text NOT NULL,
    name text NOT NULL,
    description text,
    brand text,
    model text,
    series text,
    base_price double precision NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    stock_quantity integer DEFAULT 0 NOT NULL,
    min_order_qty integer DEFAULT 1 NOT NULL,
    weight double precision,
    dimensions text DEFAULT '{}'::text NOT NULL,
    specifications text DEFAULT '{}'::text NOT NULL,
    properties_data text DEFAULT '{}'::text NOT NULL,
    tags text DEFAULT '[]'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: property_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_photos (
    id text NOT NULL,
    "categoryId" text NOT NULL,
    "propertyName" text NOT NULL,
    "propertyValue" text NOT NULL,
    "photoPath" text NOT NULL,
    "photoType" text DEFAULT 'cover'::text NOT NULL,
    "originalFilename" text,
    "fileSize" integer,
    "mimeType" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: quote_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quote_items (
    id text NOT NULL,
    quote_id text NOT NULL,
    product_id text NOT NULL,
    quantity integer NOT NULL,
    unit_price double precision NOT NULL,
    total_price double precision NOT NULL,
    notes text
);


--
-- Name: quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotes (
    id text NOT NULL,
    number text NOT NULL,
    parent_document_id text,
    cart_session_id text,
    client_id text NOT NULL,
    created_by text NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    valid_until timestamp(3) without time zone,
    subtotal double precision DEFAULT 0 NOT NULL,
    tax_amount double precision DEFAULT 0 NOT NULL,
    total_amount double precision DEFAULT 0 NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    notes text,
    terms text,
    cart_data text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: supplier_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_orders (
    id text NOT NULL,
    number text,
    parent_document_id text,
    cart_session_id text,
    executor_id text NOT NULL,
    supplier_name text NOT NULL,
    supplier_email text,
    supplier_phone text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    order_date timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expected_date timestamp(3) without time zone,
    notes text,
    cart_data text,
    total_amount double precision,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id text NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    description text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    middle_name text,
    role text DEFAULT 'admin'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: catalog_categories catalog_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_categories
    ADD CONSTRAINT catalog_categories_pkey PRIMARY KEY (id);


--
-- Name: category_property_assignments category_property_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_property_assignments
    ADD CONSTRAINT category_property_assignments_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: constructor_configs constructor_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.constructor_configs
    ADD CONSTRAINT constructor_configs_pkey PRIMARY KEY (id);


--
-- Name: constructor_configurations constructor_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.constructor_configurations
    ADD CONSTRAINT constructor_configurations_pkey PRIMARY KEY (id);


--
-- Name: document_comments document_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_comments
    ADD CONSTRAINT document_comments_pkey PRIMARY KEY (id);


--
-- Name: document_history document_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_history
    ADD CONSTRAINT document_history_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: export_settings export_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_settings
    ADD CONSTRAINT export_settings_pkey PRIMARY KEY (id);


--
-- Name: frontend_categories frontend_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.frontend_categories
    ADD CONSTRAINT frontend_categories_pkey PRIMARY KEY (id);


--
-- Name: import_history import_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_history
    ADD CONSTRAINT import_history_pkey PRIMARY KEY (id);


--
-- Name: import_templates import_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_templates
    ADD CONSTRAINT import_templates_pkey PRIMARY KEY (id);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: page_elements page_elements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_elements
    ADD CONSTRAINT page_elements_pkey PRIMARY KEY (id);


--
-- Name: pages pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_pkey PRIMARY KEY (id);


--
-- Name: product_images product_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_pkey PRIMARY KEY (id);


--
-- Name: product_properties product_properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_properties
    ADD CONSTRAINT product_properties_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: property_photos property_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_photos
    ADD CONSTRAINT property_photos_pkey PRIMARY KEY (id);


--
-- Name: quote_items quote_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_items
    ADD CONSTRAINT quote_items_pkey PRIMARY KEY (id);


--
-- Name: quotes quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);


--
-- Name: supplier_orders supplier_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_orders
    ADD CONSTRAINT supplier_orders_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: catalog_categories_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_categories_parent_id_idx ON public.catalog_categories USING btree (parent_id);


--
-- Name: catalog_categories_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_categories_path_idx ON public.catalog_categories USING btree (path);


--
-- Name: category_property_assignments_catalog_category_id_product_p_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX category_property_assignments_catalog_category_id_product_p_key ON public.category_property_assignments USING btree (catalog_category_id, product_property_id);


--
-- Name: clients_firstName_lastName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "clients_firstName_lastName_idx" ON public.clients USING btree ("firstName", "lastName");


--
-- Name: clients_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clients_phone_idx ON public.clients USING btree (phone);


--
-- Name: document_comments_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_comments_created_at_idx ON public.document_comments USING btree (created_at);


--
-- Name: document_comments_document_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_comments_document_id_idx ON public.document_comments USING btree (document_id);


--
-- Name: document_comments_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_comments_user_id_idx ON public.document_comments USING btree (user_id);


--
-- Name: document_history_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_history_action_idx ON public.document_history USING btree (action);


--
-- Name: document_history_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_history_created_at_idx ON public.document_history USING btree (created_at);


--
-- Name: document_history_document_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_history_document_id_idx ON public.document_history USING btree (document_id);


--
-- Name: document_history_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_history_user_id_idx ON public.document_history USING btree (user_id);


--
-- Name: export_settings_catalog_category_id_export_type_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX export_settings_catalog_category_id_export_type_key ON public.export_settings USING btree (catalog_category_id, export_type);


--
-- Name: frontend_categories_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX frontend_categories_slug_idx ON public.frontend_categories USING btree (slug);


--
-- Name: frontend_categories_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX frontend_categories_slug_key ON public.frontend_categories USING btree (slug);


--
-- Name: import_history_template_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX import_history_template_id_idx ON public.import_history USING btree (template_id);


--
-- Name: import_templates_catalog_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX import_templates_catalog_category_id_idx ON public.import_templates USING btree (catalog_category_id);


--
-- Name: import_templates_catalog_category_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX import_templates_catalog_category_id_key ON public.import_templates USING btree (catalog_category_id);


--
-- Name: invoice_items_invoice_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_items_invoice_id_idx ON public.invoice_items USING btree (invoice_id);


--
-- Name: invoice_items_product_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_items_product_id_idx ON public.invoice_items USING btree (product_id);


--
-- Name: invoices_client_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_client_id_idx ON public.invoices USING btree (client_id);


--
-- Name: invoices_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_created_at_idx ON public.invoices USING btree (created_at);


--
-- Name: invoices_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_created_by_idx ON public.invoices USING btree (created_by);


--
-- Name: invoices_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invoices_number_key ON public.invoices USING btree (number);


--
-- Name: invoices_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_order_id_idx ON public.invoices USING btree (order_id);


--
-- Name: invoices_order_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invoices_order_id_key ON public.invoices USING btree (order_id);


--
-- Name: invoices_parent_document_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_parent_document_id_idx ON public.invoices USING btree (parent_document_id);


--
-- Name: invoices_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_status_idx ON public.invoices USING btree (status);


--
-- Name: notifications_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_created_at_idx ON public.notifications USING btree (created_at);


--
-- Name: notifications_is_read_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_is_read_idx ON public.notifications USING btree (is_read);


--
-- Name: notifications_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_id_idx ON public.notifications USING btree (user_id);


--
-- Name: orders_cart_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_cart_session_id_idx ON public.orders USING btree (cart_session_id);


--
-- Name: orders_client_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_client_id_idx ON public.orders USING btree (client_id);


--
-- Name: orders_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at);


--
-- Name: orders_executor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_executor_id_idx ON public.orders USING btree (executor_id);


--
-- Name: orders_invoice_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_invoice_id_idx ON public.orders USING btree (invoice_id);


--
-- Name: orders_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_number_key ON public.orders USING btree (number);


--
-- Name: orders_parent_document_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_parent_document_id_idx ON public.orders USING btree (parent_document_id);


--
-- Name: orders_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_status_idx ON public.orders USING btree (status);


--
-- Name: pages_url_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pages_url_key ON public.pages USING btree (url);


--
-- Name: product_images_is_primary_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_images_is_primary_idx ON public.product_images USING btree (is_primary);


--
-- Name: product_images_product_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_images_product_id_idx ON public.product_images USING btree (product_id);


--
-- Name: product_properties_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_properties_name_key ON public.product_properties USING btree (name);


--
-- Name: products_catalog_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_catalog_category_id_idx ON public.products USING btree (catalog_category_id);


--
-- Name: products_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_created_at_idx ON public.products USING btree (created_at);


--
-- Name: products_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_is_active_idx ON public.products USING btree (is_active);


--
-- Name: products_properties_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_properties_data_idx ON public.products USING btree (properties_data);


--
-- Name: products_sku_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX products_sku_key ON public.products USING btree (sku);


--
-- Name: property_photos_categoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "property_photos_categoryId_idx" ON public.property_photos USING btree ("categoryId");


--
-- Name: property_photos_categoryId_propertyName_propertyValue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "property_photos_categoryId_propertyName_propertyValue_idx" ON public.property_photos USING btree ("categoryId", "propertyName", "propertyValue");


--
-- Name: property_photos_categoryId_propertyName_propertyValue_photo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "property_photos_categoryId_propertyName_propertyValue_photo_key" ON public.property_photos USING btree ("categoryId", "propertyName", "propertyValue", "photoType");


--
-- Name: property_photos_photoType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "property_photos_photoType_idx" ON public.property_photos USING btree ("photoType");


--
-- Name: property_photos_propertyName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "property_photos_propertyName_idx" ON public.property_photos USING btree ("propertyName");


--
-- Name: property_photos_propertyValue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "property_photos_propertyValue_idx" ON public.property_photos USING btree ("propertyValue");


--
-- Name: quote_items_product_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quote_items_product_id_idx ON public.quote_items USING btree (product_id);


--
-- Name: quote_items_quote_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quote_items_quote_id_idx ON public.quote_items USING btree (quote_id);


--
-- Name: quotes_client_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotes_client_id_idx ON public.quotes USING btree (client_id);


--
-- Name: quotes_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotes_created_at_idx ON public.quotes USING btree (created_at);


--
-- Name: quotes_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotes_created_by_idx ON public.quotes USING btree (created_by);


--
-- Name: quotes_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX quotes_number_key ON public.quotes USING btree (number);


--
-- Name: quotes_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotes_status_idx ON public.quotes USING btree (status);


--
-- Name: supplier_orders_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_orders_created_at_idx ON public.supplier_orders USING btree (created_at);


--
-- Name: supplier_orders_executor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_orders_executor_id_idx ON public.supplier_orders USING btree (executor_id);


--
-- Name: supplier_orders_parent_document_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_orders_parent_document_id_idx ON public.supplier_orders USING btree (parent_document_id);


--
-- Name: supplier_orders_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_orders_status_idx ON public.supplier_orders USING btree (status);


--
-- Name: system_settings_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX system_settings_key_key ON public.system_settings USING btree (key);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: catalog_categories catalog_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_categories
    ADD CONSTRAINT catalog_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.catalog_categories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: category_property_assignments category_property_assignments_catalog_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_property_assignments
    ADD CONSTRAINT category_property_assignments_catalog_category_id_fkey FOREIGN KEY (catalog_category_id) REFERENCES public.catalog_categories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: category_property_assignments category_property_assignments_product_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_property_assignments
    ADD CONSTRAINT category_property_assignments_product_property_id_fkey FOREIGN KEY (product_property_id) REFERENCES public.product_properties(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_comments document_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_comments
    ADD CONSTRAINT document_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_history document_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_history
    ADD CONSTRAINT document_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: documents documents_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: export_settings export_settings_catalog_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_settings
    ADD CONSTRAINT export_settings_catalog_category_id_fkey FOREIGN KEY (catalog_category_id) REFERENCES public.catalog_categories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: import_history import_history_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_history
    ADD CONSTRAINT import_history_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.import_templates(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: import_templates import_templates_catalog_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_templates
    ADD CONSTRAINT import_templates_catalog_category_id_fkey FOREIGN KEY (catalog_category_id) REFERENCES public.catalog_categories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: invoice_items invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: invoices invoices_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: invoices invoices_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: notifications notifications_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: orders orders_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: page_elements page_elements_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_elements
    ADD CONSTRAINT "page_elements_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.pages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_images product_images_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: products products_catalog_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_catalog_category_id_fkey FOREIGN KEY (catalog_category_id) REFERENCES public.catalog_categories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: quote_items quote_items_quote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_items
    ADD CONSTRAINT quote_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: quotes quotes_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict rts0DUCemo7HpyW8Z3pkpkIUCPoBwdOTOFxxJ6pZJGaUU1jeYVZEaCPwpd7NwXa

