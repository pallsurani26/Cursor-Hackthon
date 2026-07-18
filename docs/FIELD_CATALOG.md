# LedgerBot — DBA Field Catalog (Supabase / Postgres)

**Product:** WhatsApp-based AI Business Copilot for MSMEs  
**Tables:** 8 core tables  
**Field count:** **194** (within 150–200)  
**SQL:** [`schema/ledgerbot_expanded_schema.sql`](../schema/ledgerbot_expanded_schema.sql)

**Principle:** Postgres computes balances and statements. The LLM only calls RPCs and formats results.

---

## Design rules

| Rule | Why |
|------|-----|
| Money as `numeric(14,2)` | Avoid float drift on GST / udhaar |
| Stock as `numeric(14,3)` | Support kg / litre / partial units |
| Soft deletes via `deleted_at` | WhatsApp corrections need history |
| `vendor_id` on every tenant row | RLS + service-role isolation |
| Store AI confidence, never trust it | Confirmation gate before posting |
| Idempotency on WhatsApp message ids | Retries must not double-post |

---

## Rollup — 194 fields

| Table | Fields |
|-------|-------:|
| `vendors` | 28 |
| `parties` | 25 |
| `accounts` | 20 |
| `journal_entries` | 27 |
| `journal_lines` | 15 |
| `products` | 30 |
| `stock_ledger` | 17 |
| `raw_extractions` | 32 |
| **TOTAL** | **194** |

**Multi-tenant note:** `accounts` uses composite PK `(vendor_id, id)` so every vendor can own slug `cash` / `sales`. `journal_lines.vendor_id` exists for that FK.

---

## 1. `vendors` — 28 fields

| # | Field | Type | Null | Default | Notes |
|---|-------|------|------|---------|-------|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| 2 | `name` | `text` | NO | — | Owner / primary contact |
| 3 | `business_name` | `text` | NO | — | Shop / firm trade name |
| 4 | `phone` | `text` | NO | — | E.164, UNIQUE |
| 5 | `whatsapp_wa_id` | `text` | YES | — | Meta WA ID |
| 6 | `email` | `text` | YES | — | Optional |
| 7 | `preferred_language` | `text` | NO | `'auto'` | `auto\|gu\|hi\|en\|hinglish` |
| 8 | `business_type` | `text` | YES | — | `kirana\|wholesale\|manufacturing\|services\|restaurant\|other` |
| 9 | `gstin` | `text` | YES | — | 15-char GSTIN |
| 10 | `pan` | `text` | YES | — | PAN |
| 11 | `address_line1` | `text` | YES | — | Shop address |
| 12 | `city` | `text` | YES | — | |
| 13 | `state` | `text` | YES | — | |
| 14 | `pincode` | `text` | YES | — | |
| 15 | `country` | `text` | NO | `'IN'` | ISO |
| 16 | `timezone` | `text` | NO | `'Asia/Kolkata'` | FY / entry dates |
| 17 | `currency_code` | `text` | NO | `'INR'` | ISO 4217 |
| 18 | `fiscal_year_start_month` | `smallint` | NO | `4` | India FY = April |
| 19 | `default_payment_mode` | `text` | NO | `'cash'` | `cash\|upi\|bank\|cheque\|card\|credit` |
| 20 | `onboarding_status` | `text` | NO | `'pending'` | `pending\|language_set\|coa_seeded\|active` |
| 21 | `subscription_plan` | `text` | NO | `'free'` | `free\|starter\|growth` |
| 22 | `subscription_status` | `text` | NO | `'trialing'` | `trialing\|active\|past_due\|cancelled` |
| 23 | `is_active` | `boolean` | NO | `true` | Kill-switch |
| 24 | `notification_prefs` | `jsonb` | NO | `'{}'` | Alerts config |
| 25 | `last_active_at` | `timestamptz` | YES | — | Last WA interaction |
| 26 | `created_at` | `timestamptz` | NO | `now()` | |
| 27 | `updated_at` | `timestamptz` | NO | `now()` | |
| 28 | `deleted_at` | `timestamptz` | YES | — | Soft delete |

---

## 2. `parties` — 25 fields

| # | Field | Type | Null | Default | Notes |
|---|-------|------|------|---------|-------|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| 2 | `vendor_id` | `uuid` | NO | — | FK → vendors |
| 3 | `name` | `text` | NO | — | UNIQUE `(vendor_id, lower(name))` |
| 4 | `display_name` | `text` | YES | — | WhatsApp nickname |
| 5 | `party_code` | `text` | YES | — | Voice shortcut code |
| 6 | `phone` | `text` | YES | — | Primary mobile |
| 7 | `party_type` | `text` | NO | `'customer'` | `customer\|supplier\|both` |
| 8 | `gstin` | `text` | YES | — | B2B GSTIN |
| 9 | `address_line1` | `text` | YES | — | |
| 10 | `city` | `text` | YES | — | |
| 11 | `state` | `text` | YES | — | |
| 12 | `pincode` | `text` | YES | — | |
| 13 | `credit_limit` | `numeric(14,2)` | NO | `0` | Max udhaar |
| 14 | `credit_days` | `integer` | NO | `0` | Net-N |
| 15 | `opening_balance` | `numeric(14,2)` | NO | `0` | Migrated books |
| 16 | `opening_balance_type` | `text` | NO | `'debit'` | `debit\|credit` |
| 17 | `preferred_language` | `text` | YES | — | Reminder language |
| 18 | `whatsapp_opt_in` | `boolean` | NO | `false` | Collection OK? |
| 19 | `notes` | `text` | YES | — | |
| 20 | `tags` | `text[]` | NO | `'{}'` | `{vip,wholesale}` |
| 21 | `is_active` | `boolean` | NO | `true` | |
| 22 | `last_transacted_at` | `timestamptz` | YES | — | |
| 23 | `created_at` | `timestamptz` | NO | `now()` | |
| 24 | `updated_at` | `timestamptz` | NO | `now()` | |
| 25 | `deleted_at` | `timestamptz` | YES | — | Soft delete |

---

## 3. `accounts` — 20 fields

Composite PK: `(vendor_id, id)` — slug `cash` is per-vendor, not global.

| # | Field | Type | Null | Default | Notes |
|---|-------|------|------|---------|-------|
| 1 | `vendor_id` | `uuid` | NO | — | FK → vendors; PK part 1 |
| 2 | `id` | `text` | NO | — | Slug within vendor; PK part 2 |
| 3 | `name` | `text` | NO | — | Display name |
| 4 | `account_type` | `text` | NO | — | `asset\|liability\|income\|expense\|equity` |
| 5 | `account_subtype` | `text` | YES | — | `cash\|bank\|debtor\|creditor\|sales`… |
| 6 | `parent_account_id` | `text` | YES | — | FK → accounts |
| 7 | `is_party` | `boolean` | NO | `false` | Party sub-ledger |
| 8 | `party_id` | `uuid` | YES | — | FK → parties |
| 9 | `normal_balance` | `text` | NO | — | `debit\|credit` |
| 10 | `is_system` | `boolean` | NO | `false` | Seeded COA |
| 11 | `is_active` | `boolean` | NO | `true` | |
| 12 | `currency_code` | `text` | NO | `'INR'` | |
| 13 | `opening_balance` | `numeric(14,2)` | NO | `0` | |
| 14 | `opening_balance_date` | `date` | YES | — | |
| 15 | `description` | `text` | YES | — | |
| 16 | `sort_order` | `integer` | NO | `0` | Statement order |
| 17 | `tax_relevant` | `boolean` | NO | `false` | GST reports |
| 18 | `created_at` | `timestamptz` | NO | `now()` | |
| 19 | `updated_at` | `timestamptz` | NO | `now()` | |
| 20 | `closed_at` | `timestamptz` | YES | — | Archive |

---

## 4. `journal_entries` — 27 fields

| # | Field | Type | Null | Default | Notes |
|---|-------|------|------|---------|-------|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| 2 | `vendor_id` | `uuid` | NO | — | FK → vendors |
| 3 | `entry_number` | `text` | YES | — | Voucher no. |
| 4 | `entry_date` | `date` | NO | — | Business date |
| 5 | `entry_type` | `text` | NO | `'general'` | `sale\|purchase\|receipt\|payment\|expense\|transfer\|adjustment\|general` |
| 6 | `narration` | `text` | NO | `''` | |
| 7 | `party_id` | `uuid` | YES | — | Counterparty |
| 8 | `payment_mode` | `text` | YES | — | `cash\|upi\|bank\|cheque\|card\|credit` |
| 9 | `reference_number` | `text` | YES | — | UTR / cheque |
| 10 | `invoice_number` | `text` | YES | — | Bill id |
| 11 | `linked_product_id` | `text` | YES | — | Single-SKU shortcut |
| 12 | `quantity` | `numeric(14,3)` | YES | — | Header qty |
| 13 | `total_amount` | `numeric(14,2)` | NO | `0` | Voucher amount |
| 14 | `tax_amount` | `numeric(14,2)` | NO | `0` | Header GST |
| 15 | `currency_code` | `text` | NO | `'INR'` | |
| 16 | `status` | `text` | NO | `'posted'` | `draft\|posted\|voided` |
| 17 | `source_extraction_id` | `uuid` | YES | — | FK → raw_extractions |
| 18 | `created_by_source` | `text` | NO | `'whatsapp_ai'` | `whatsapp_ai\|web\|import\|system` |
| 19 | `confirmed_via` | `text` | YES | — | `whatsapp\|web\|auto` |
| 20 | `is_reversal` | `boolean` | NO | `false` | |
| 21 | `reverses_entry_id` | `uuid` | YES | — | FK self |
| 22 | `voided_at` | `timestamptz` | YES | — | |
| 23 | `void_reason` | `text` | YES | — | |
| 24 | `posted_at` | `timestamptz` | YES | — | |
| 25 | `attachment_url` | `text` | YES | — | Bill photo |
| 26 | `created_at` | `timestamptz` | NO | `now()` | |
| 27 | `updated_at` | `timestamptz` | NO | `now()` | |

---

## 5. `journal_lines` — 15 fields

| # | Field | Type | Null | Default | Notes |
|---|-------|------|------|---------|-------|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| 2 | `journal_entry_id` | `uuid` | NO | — | FK CASCADE |
| 3 | `vendor_id` | `uuid` | NO | — | FK → vendors; part of accounts FK |
| 4 | `account_id` | `text` | NO | — | FK `(vendor_id, account_id)` → accounts |
| 5 | `debit` | `numeric(14,2)` | NO | `0` | `>= 0` |
| 6 | `credit` | `numeric(14,2)` | NO | `0` | `>= 0` |
| 7 | `line_narration` | `text` | YES | — | |
| 8 | `party_id` | `uuid` | YES | — | |
| 9 | `product_id` | `text` | YES | — | |
| 10 | `quantity` | `numeric(14,3)` | YES | — | |
| 11 | `unit_price` | `numeric(14,2)` | YES | — | |
| 12 | `tax_rate` | `numeric(5,2)` | YES | — | 5 / 12 / 18 |
| 13 | `tax_amount` | `numeric(14,2)` | NO | `0` | |
| 14 | `line_order` | `integer` | NO | `1` | |
| 15 | `created_at` | `timestamptz` | NO | `now()` | |

Deferred trigger `trg_check_journal_balance` enforces Σ debit = Σ credit per entry.

---

## 6. `products` — 30 fields

| # | Field | Type | Null | Default | Notes |
|---|-------|------|------|---------|-------|
| 1 | `id` | `text` | NO | — | Product code PK |
| 2 | `vendor_id` | `uuid` | NO | — | FK → vendors |
| 3 | `product_name` | `text` | NO | — | |
| 4 | `sku` | `text` | YES | — | |
| 5 | `barcode` | `text` | YES | — | |
| 6 | `hsn_sac_code` | `text` | YES | — | GST |
| 7 | `category` | `text` | YES | — | |
| 8 | `unit_of_measure` | `text` | NO | `'pcs'` | `pcs\|kg\|ltr\|box\|m` |
| 9 | `stock` | `numeric(14,3)` | NO | `0` | On-hand |
| 10 | `price` | `numeric(14,2)` | NO | `0` | Selling price |
| 11 | `cost_price` | `numeric(14,2)` | NO | `0` | |
| 12 | `mrp` | `numeric(14,2)` | YES | — | |
| 13 | `gst_rate` | `numeric(5,2)` | NO | `0` | |
| 14 | `tax_inclusive` | `boolean` | NO | `true` | |
| 15 | `supplier` | `text` | YES | — | Free-text |
| 16 | `supplier_party_id` | `uuid` | YES | — | FK → parties |
| 17 | `low_stock_threshold` | `numeric(14,3)` | NO | `5` | |
| 18 | `reorder_quantity` | `numeric(14,3)` | YES | — | |
| 19 | `warehouse_location` | `text` | YES | — | |
| 20 | `aliases` | `text[]` | NO | `'{}'` | Voice/OCR variants |
| 21 | `is_active` | `boolean` | NO | `true` | |
| 22 | `is_service` | `boolean` | NO | `false` | |
| 23 | `track_inventory` | `boolean` | NO | `true` | |
| 24 | `batch_tracking_enabled` | `boolean` | NO | `false` | |
| 25 | `expiry_tracking_enabled` | `boolean` | NO | `false` | |
| 26 | `last_purchase_price` | `numeric(14,2)` | YES | — | |
| 27 | `last_sale_price` | `numeric(14,2)` | YES | — | |
| 28 | `created_at` | `timestamptz` | NO | `now()` | |
| 29 | `last_updated` | `timestamptz` | NO | `now()` | |
| 30 | `deleted_at` | `timestamptz` | YES | — | Soft delete |

---

## 7. `stock_ledger` — 17 fields

| # | Field | Type | Null | Default | Notes |
|---|-------|------|------|---------|-------|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| 2 | `vendor_id` | `uuid` | NO | — | FK → vendors |
| 3 | `product_id` | `text` | NO | — | FK → products |
| 4 | `change` | `numeric(14,3)` | NO | — | Signed delta |
| 5 | `previous_stock_level` | `numeric(14,3)` | NO | — | |
| 6 | `new_stock_level` | `numeric(14,3)` | NO | — | |
| 7 | `reason` | `text` | NO | — | `sale\|purchase\|bulk_upload\|correction\|return\|damage\|transfer` |
| 8 | `movement_type` | `text` | NO | — | `in\|out\|adjust` |
| 9 | `unit_cost` | `numeric(14,2)` | YES | — | |
| 10 | `batch_number` | `text` | YES | — | |
| 11 | `expiry_date` | `date` | YES | — | |
| 12 | `party_id` | `uuid` | YES | — | |
| 13 | `journal_entry_id` | `uuid` | YES | — | |
| 14 | `source_extraction_id` | `uuid` | YES | — | |
| 15 | `reference_number` | `text` | YES | — | |
| 16 | `created_by_source` | `text` | NO | `'whatsapp_ai'` | |
| 17 | `created_at` | `timestamptz` | NO | `now()` | |

---

## 8. `raw_extractions` — 32 fields

| # | Field | Type | Null | Default | Notes |
|---|-------|------|------|---------|-------|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| 2 | `vendor_id` | `uuid` | NO | — | FK → vendors |
| 3 | `channel` | `text` | NO | `'whatsapp'` | `whatsapp\|web\|api\|csv_import` |
| 4 | `input_type` | `text` | NO | — | `text\|voice\|image\|csv` |
| 5 | `raw_input` | `text` | YES | — | Text / caption |
| 6 | `media_url` | `text` | YES | — | |
| 7 | `media_mime_type` | `text` | YES | — | |
| 8 | `whatsapp_message_id` | `text` | YES | — | Unique w/ vendor |
| 9 | `whatsapp_from` | `text` | YES | — | |
| 10 | `command` | `text` | YES | — | |
| 11 | `intent` | `text` | YES | — | `record_sale\|add_stock\|party_balance\|pnl`… |
| 12 | `intent_confidence` | `numeric(5,4)` | YES | — | 0–1 |
| 13 | `llm_parsed` | `jsonb` | YES | — | Structured payload |
| 14 | `entities` | `jsonb` | YES | — | party / sku / amounts |
| 15 | `detected_language` | `text` | YES | — | |
| 16 | `transcription_text` | `text` | YES | — | STT |
| 17 | `transcription_confidence` | `numeric(5,4)` | YES | — | |
| 18 | `ocr_text` | `text` | YES | — | Bill OCR |
| 19 | `ocr_confidence` | `numeric(5,4)` | YES | — | |
| 20 | `confidence_score` | `numeric(5,4)` | YES | — | Overall |
| 21 | `status` | `text` | NO | `'pending_confirmation'` | `pending_confirmation\|confirmed\|rejected\|auto_expired\|failed` |
| 22 | `requires_human_review` | `boolean` | NO | `false` | |
| 23 | `rejection_reason` | `text` | YES | — | |
| 24 | `model_name` | `text` | YES | — | |
| 25 | `reply_text` | `text` | YES | — | Last bot reply |
| 26 | `idempotency_key` | `text` | YES | — | Unique w/ vendor |
| 27 | `expires_at` | `timestamptz` | YES | — | Pending TTL |
| 28 | `confirmed_at` | `timestamptz` | YES | — | |
| 29 | `processed_at` | `timestamptz` | YES | — | Posted to books |
| 30 | `error_message` | `text` | YES | — | |
| 31 | `created_at` | `timestamptz` | NO | `now()` | |
| 32 | `updated_at` | `timestamptz` | NO | `now()` | |

---

## Indexes (priority)

1. `vendors(phone)`, `vendors(whatsapp_wa_id)`
2. `parties(vendor_id, phone)`, `parties(vendor_id, party_type)`
3. `journal_entries(vendor_id, entry_date)`, `(vendor_id, party_id)`, `(vendor_id, status)`, `(source_extraction_id)`
4. `journal_lines(account_id)`, `(product_id)` where not null
5. `products(vendor_id)`, `lower(product_name)`, low-stock partial index
6. `stock_ledger(product_id, created_at desc)`, `(vendor_id, created_at desc)`
7. `raw_extractions(vendor_id, status)`, unique `(vendor_id, whatsapp_message_id)`, unique `(vendor_id, idempotency_key)`

---

## Integrity reminders

1. Keep deferred `trg_check_journal_balance` — never remove.
2. Post journals only after `raw_extractions.status = 'confirmed'`.
3. On party create: insert `debtor_<party_id>` / `creditor_<party_id>` accounts.
4. Update `products.stock` in the **same transaction** as `stock_ledger` insert.
5. WhatsApp backend uses **service role**; RLS is for future vendor-login UI.

---

## Phase-2 backlog (not in the 194)

| Candidate | Table | When |
|-----------|-------|------|
| `udyam_registration_no`, `ai_settings` | vendors | Compliance / tuning |
| `alternate_phone`, `email`, `pan` | parties | Richer CRM |
| `bank_account_last4`, `ifsc`, `upi_id` | accounts | Bank reconciliation |
| `prompt_tokens`, `latency_ms`, `session_id` | raw_extractions | Cost + multi-turn |
| `reserved_stock`, `average_cost` | products | Advanced inventory |
