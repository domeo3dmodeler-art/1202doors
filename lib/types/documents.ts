// lib/types/documents.ts
// Типы для документов и их элементов

export type DocumentType = 'quote' | 'invoice' | 'order' | 'supplier_order';

export type OrderStatus =
  | 'DRAFT'
  | 'SENT'
  | 'PAID'       // legacy / альтернатива NEW_PLANNED для «счет оплачен»
  | 'NEW_PLANNED'
  | 'UNDER_REVIEW'
  | 'AWAITING_MEASUREMENT'
  | 'AWAITING_INVOICE'
  | 'READY_FOR_PRODUCTION'
  | 'COMPLETED'
  | 'RETURNED_TO_COMPLECTATION'
  | 'CANCELLED';

export type SupplierOrderStatus = 
  | 'PENDING'
  | 'ORDERED'
  | 'RECEIVED_FROM_SUPPLIER'
  | 'COMPLETED'
  | 'CANCELLED';

export interface DocumentItem {
  id?: string;
  productId?: string;
  product_id?: string;
  type: 'door' | 'handle' | 'hardware' | string;
  name?: string;
  model?: string;
  qty?: number;
  quantity?: number;
  unitPrice?: number;
  price?: number;
  unit_price?: number;
  width?: number;
  height?: number;
  color?: string;
  finish?: string;
  style?: string;
  sku_1c?: string;
  handleId?: string;
  handleName?: string;
  hardwareKitId?: string;
  hardwareKitName?: string;
  hardware?: string;
}

export interface CreateDocumentRequest {
  type: DocumentType;
  parent_document_id?: string | null;
  cart_session_id?: string | null;
  client_id: string;
  items: DocumentItem[];
  total_amount: number;
  subtotal?: number;
  tax_amount?: number;
  notes?: string;
  prevent_duplicates?: boolean;
  created_by?: string;
}

export interface CreateDocumentResponse {
  id: string;
  type: DocumentType;
  number: string;
  parent_document_id?: string | null;
  cart_session_id?: string | null;
  client_id: string;
  total_amount: number;
  created_at: Date;
  isNew: boolean;
}

export interface DocumentMetadata {
  id: string;
  number: string;
  type: DocumentType;
  parent_document_id?: string | null;
  cart_session_id?: string | null;
  client_id: string;
  total_amount: number;
  created_at: Date;
}

