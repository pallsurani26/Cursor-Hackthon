-- ============================================================================
-- LedgerBot — SEED DATA for the ORIGINAL schema only
-- (vendors, parties, accounts, journal_entries, journal_lines,
--  products, stock_ledger, raw_extractions)
-- Does NOT alter schema. Run AFTER your original schema SQL.
-- ============================================================================

-- Fixed IDs for reproducible training / demos
-- vendor: Shree Kirana Store
-- parties + products + a few confirmed WhatsApp extractions + journals

begin;

-- --------------------------------------------------------------------------
-- 1. Vendor
-- --------------------------------------------------------------------------
insert into vendors (id, name, phone, preferred_language, created_at) values
  ('11111111-1111-1111-1111-111111111111', 'Raju Patel', '+919876543210', 'hinglish', '2026-07-01 09:00:00+05:30')
on conflict (phone) do nothing;

-- --------------------------------------------------------------------------
-- 2. Default COA (same as fn_seed_default_accounts)
-- --------------------------------------------------------------------------
insert into accounts (id, vendor_id, name, account_type, is_party, party_id, created_at) values
  ('cash',      '11111111-1111-1111-1111-111111111111', 'Cash',      'asset',    false, null, now()),
  ('sales',     '11111111-1111-1111-1111-111111111111', 'Sales',     'income',   false, null, now()),
  ('purchases', '11111111-1111-1111-1111-111111111111', 'Purchases', 'expense',  false, null, now()),
  ('capital',   '11111111-1111-1111-1111-111111111111', 'Capital',   'equity',   false, null, now()),
  ('drawings',  '11111111-1111-1111-1111-111111111111', 'Drawings',  'equity',   false, null, now())
on conflict (id) do nothing;

-- Opening capital
insert into journal_entries (id, vendor_id, entry_date, narration, created_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '2026-07-01', 'Opening capital', now());

insert into journal_lines (id, journal_entry_id, account_id, debit, credit) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cash', 50000.00, 0),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'capital', 0, 50000.00);

-- --------------------------------------------------------------------------
-- 3. Parties (customers + suppliers)
-- --------------------------------------------------------------------------
insert into parties (id, vendor_id, name, phone, party_type, created_at) values
  ('22222222-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Ramesh', '+919800000001', 'customer', now()),
  ('22222222-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Suresh', '+919800000002', 'customer', now()),
  ('22222222-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Meena',  '+919800000003', 'customer', now()),
  ('22222222-0004-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Kiran',  '+919800000004', 'customer', now()),
  ('22222222-0005-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Wholesale Mart', '+919800000101', 'supplier', now()),
  ('22222222-0006-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Patel Traders',  '+919800000102', 'supplier', now());

-- Party control accounts
insert into accounts (id, vendor_id, name, account_type, is_party, party_id, created_at) values
  ('debtor_22222222-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Ramesh (Receivable)', 'asset', true, '22222222-0001-0000-0000-000000000001', now()),
  ('debtor_22222222-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Suresh (Receivable)', 'asset', true, '22222222-0002-0000-0000-000000000002', now()),
  ('debtor_22222222-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Meena (Receivable)',  'asset', true, '22222222-0003-0000-0000-000000000003', now()),
  ('debtor_22222222-0004-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Kiran (Receivable)',  'asset', true, '22222222-0004-0000-0000-000000000004', now()),
  ('creditor_22222222-0005-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Wholesale Mart (Payable)', 'liability', true, '22222222-0005-0000-0000-000000000005', now()),
  ('creditor_22222222-0006-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Patel Traders (Payable)',  'liability', true, '22222222-0006-0000-0000-000000000006', now());

-- --------------------------------------------------------------------------
-- 4. Products
-- --------------------------------------------------------------------------
insert into products (id, vendor_id, product_name, category, stock, price, supplier, low_stock_threshold, last_updated) values
  ('101', '11111111-1111-1111-1111-111111111111', 'Maggi',     'noodles',  80,  12.00, 'Shree Distributors', 10, now()),
  ('102', '11111111-1111-1111-1111-111111111111', 'Rice 1kg',  'grocery', 120,  60.00, 'Wholesale Mart',     20, now()),
  ('103', '11111111-1111-1111-1111-111111111111', 'Oil 1L',    'grocery',  40, 140.00, 'Patel Traders',      8,  now()),
  ('104', '11111111-1111-1111-1111-111111111111', 'Sugar',     'grocery',  55,  45.00, 'Patel Traders',      10, now()),
  ('105', '11111111-1111-1111-1111-111111111111', 'Parle-G',   'snacks',  150,  10.00, 'Shree Distributors', 20, now()),
  ('106', '11111111-1111-1111-1111-111111111111', 'Tea',       'grocery',  25, 250.00, 'Krishna Foods',      5,  now()),
  ('107', '11111111-1111-1111-1111-111111111111', 'Soap',      'personal', 60,  30.00, 'Local',              10, now()),
  ('108', '11111111-1111-1111-1111-111111111111', 'Salt',      'grocery',   4,  20.00, 'Local',              8,  now());  -- low stock

insert into stock_ledger (id, vendor_id, product_id, change, reason, new_stock_level, created_at) values
  ('cccccccc-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '101', 100, 'bulk_upload', 100, '2026-07-01 10:00:00+05:30'),
  ('cccccccc-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '102', 150, 'bulk_upload', 150, '2026-07-01 10:00:00+05:30'),
  ('cccccccc-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '103',  50, 'bulk_upload',  50, '2026-07-01 10:00:00+05:30'),
  ('cccccccc-0004-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '104',  70, 'bulk_upload',  70, '2026-07-01 10:00:00+05:30'),
  ('cccccccc-0005-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '105', 200, 'bulk_upload', 200, '2026-07-01 10:00:00+05:30'),
  ('cccccccc-0006-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', '106',  30, 'bulk_upload',  30, '2026-07-01 10:00:00+05:30'),
  ('cccccccc-0007-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', '107',  80, 'bulk_upload',  80, '2026-07-01 10:00:00+05:30'),
  ('cccccccc-0008-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', '108',  20, 'bulk_upload',  20, '2026-07-01 10:00:00+05:30');

-- --------------------------------------------------------------------------
-- 5. Raw extractions (WhatsApp training feed shape → llm_parsed)
-- --------------------------------------------------------------------------
insert into raw_extractions (
  id, vendor_id, channel, input_type, raw_input, media_url, command,
  llm_parsed, detected_language, status, confirmed_at, created_at
) values
-- confirmed cash sale
(
  'dddddddd-0001-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'whatsapp', 'text',
  'Sold 10 Maggi to Ramesh for cash',
  null, 'sale',
  '{"intent":"record_sale","party_name":"Ramesh","product_name":"Maggi","product_id":"101","quantity":10,"unit_price":12,"amount":120,"payment_mode":"cash"}'::jsonb,
  'en', 'confirmed', '2026-07-10 11:05:00+05:30', '2026-07-10 11:00:00+05:30'
),
-- confirmed udhaar sale
(
  'dddddddd-0002-0000-0000-000000000002',
  '11111111-1111-1111-1111-111111111111',
  'whatsapp', 'text',
  'Meena udhaar oil 3 litre @140',
  null, 'sale',
  '{"intent":"record_sale","party_name":"Meena","product_name":"Oil 1L","product_id":"103","quantity":3,"unit_price":140,"amount":420,"payment_mode":"credit"}'::jsonb,
  'hinglish', 'confirmed', '2026-07-11 16:10:00+05:30', '2026-07-11 16:00:00+05:30'
),
-- confirmed purchase credit
(
  'dddddddd-0003-0000-0000-000000000003',
  '11111111-1111-1111-1111-111111111111',
  'whatsapp', 'text',
  'Purchase on credit 50 Rice from Wholesale Mart @48',
  null, 'purchase',
  '{"intent":"record_purchase","party_name":"Wholesale Mart","product_name":"Rice 1kg","product_id":"102","quantity":50,"unit_price":48,"amount":2400,"payment_mode":"credit"}'::jsonb,
  'en', 'confirmed', '2026-07-08 10:20:00+05:30', '2026-07-08 10:15:00+05:30'
),
-- confirmed receipt
(
  'dddddddd-0004-0000-0000-000000000004',
  '11111111-1111-1111-1111-111111111111',
  'whatsapp', 'text',
  'Ramesh ne 500 UPI kiya udhaar ka',
  null, 'receipt',
  '{"intent":"record_receipt","party_name":"Ramesh","amount":500,"payment_mode":"upi"}'::jsonb,
  'hinglish', 'confirmed', '2026-07-12 18:05:00+05:30', '2026-07-12 18:00:00+05:30'
),
-- pending confirmation (for model eval)
(
  'dddddddd-0005-0000-0000-000000000005',
  '11111111-1111-1111-1111-111111111111',
  'whatsapp', 'voice',
  'Voice: Suresh ko 5 chawal udhaar diye saath rupaye kilo',
  'https://example.com/media/voice1.ogg', 'sale',
  '{"intent":"record_sale","party_name":"Suresh","product_name":"Rice 1kg","product_id":"102","quantity":5,"unit_price":60,"amount":300,"payment_mode":"credit","confidence_score":0.86}'::jsonb,
  'hinglish', 'pending_confirmation', null, '2026-07-18 09:30:00+05:30'
),
-- rejected
(
  'dddddddd-0006-0000-0000-000000000006',
  '11111111-1111-1111-1111-111111111111',
  'whatsapp', 'text',
  'Ramesh 500',
  null, 'unknown',
  '{"intent":"unknown","party_name":"Ramesh","amount":500,"missing":["intent"],"confidence_score":0.4}'::jsonb,
  'en', 'rejected', null, '2026-07-15 14:00:00+05:30'
),
-- image OCR purchase
(
  'dddddddd-0007-0000-0000-000000000007',
  '11111111-1111-1111-1111-111111111111',
  'whatsapp', 'image',
  'OCR: Invoice INV-118 Patel Traders Oil 1L x12=1440 Sugar 10kg x40=400 Total 1840 Due',
  'https://example.com/media/bill118.jpg', 'purchase_bill',
  '{"intent":"record_purchase","party_name":"Patel Traders","invoice_number":"INV-118","amount":1840,"payment_mode":"credit","line_items":[{"product_name":"Oil 1L","quantity":12,"unit_price":120,"amount":1440},{"product_name":"Sugar","quantity":10,"unit_price":40,"amount":400}]}'::jsonb,
  'en', 'confirmed', '2026-07-09 12:00:00+05:30', '2026-07-09 11:50:00+05:30'
),
-- query (no journal)
(
  'dddddddd-0008-0000-0000-000000000008',
  '11111111-1111-1111-1111-111111111111',
  'whatsapp', 'text',
  'Ramesh ka kitna udhaar hai?',
  null, 'party_balance',
  '{"intent":"party_balance","party_name":"Ramesh","rpc":"fn_party_ledger"}'::jsonb,
  'hinglish', 'confirmed', '2026-07-13 10:00:00+05:30', '2026-07-13 10:00:00+05:30'
);

-- --------------------------------------------------------------------------
-- 6. Journal entries linked to confirmed extractions
-- --------------------------------------------------------------------------

-- Sale Maggi cash 120
insert into journal_entries (id, vendor_id, entry_date, narration, source_extraction_id, linked_product_id, quantity, created_at) values
  ('aaaaaaaa-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '2026-07-10', 'Sale of Maggi x10 to Ramesh (cash)',
   'dddddddd-0001-0000-0000-000000000001', '101', 10, '2026-07-10 11:05:00+05:30');
insert into journal_lines (journal_entry_id, account_id, debit, credit) values
  ('aaaaaaaa-0001-0000-0000-000000000001', 'cash', 120, 0),
  ('aaaaaaaa-0001-0000-0000-000000000001', 'sales', 0, 120);
insert into stock_ledger (vendor_id, product_id, change, reason, source_extraction_id, new_stock_level, created_at) values
  ('11111111-1111-1111-1111-111111111111', '101', -10, 'sale', 'dddddddd-0001-0000-0000-000000000001', 90, '2026-07-10 11:05:00+05:30');
update products set stock = 80, last_updated = now() where id = '101';  -- net after later moves in narrative

-- Udhaar oil Meena 420
insert into journal_entries (id, vendor_id, entry_date, narration, source_extraction_id, linked_product_id, quantity, created_at) values
  ('aaaaaaaa-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '2026-07-11', 'Sale of Oil 1L x3 to Meena (udhaar)',
   'dddddddd-0002-0000-0000-000000000002', '103', 3, '2026-07-11 16:10:00+05:30');
insert into journal_lines (journal_entry_id, account_id, debit, credit) values
  ('aaaaaaaa-0002-0000-0000-000000000002', 'debtor_22222222-0003-0000-0000-000000000003', 420, 0),
  ('aaaaaaaa-0002-0000-0000-000000000002', 'sales', 0, 420);
insert into stock_ledger (vendor_id, product_id, change, reason, source_extraction_id, new_stock_level, created_at) values
  ('11111111-1111-1111-1111-111111111111', '103', -3, 'sale', 'dddddddd-0002-0000-0000-000000000002', 47, '2026-07-11 16:10:00+05:30');

-- Purchase rice credit 2400
insert into journal_entries (id, vendor_id, entry_date, narration, source_extraction_id, linked_product_id, quantity, created_at) values
  ('aaaaaaaa-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   '2026-07-08', 'Purchase Rice 1kg x50 from Wholesale Mart',
   'dddddddd-0003-0000-0000-000000000003', '102', 50, '2026-07-08 10:20:00+05:30');
insert into journal_lines (journal_entry_id, account_id, debit, credit) values
  ('aaaaaaaa-0003-0000-0000-000000000003', 'purchases', 2400, 0),
  ('aaaaaaaa-0003-0000-0000-000000000003', 'creditor_22222222-0005-0000-0000-000000000005', 0, 2400);
insert into stock_ledger (vendor_id, product_id, change, reason, source_extraction_id, new_stock_level, created_at) values
  ('11111111-1111-1111-1111-111111111111', '102', 50, 'purchase', 'dddddddd-0003-0000-0000-000000000003', 200, '2026-07-08 10:20:00+05:30');

-- Receipt from Ramesh 500 (after an earlier udhaar sale for training continuity)
insert into journal_entries (id, vendor_id, entry_date, narration, source_extraction_id, created_at) values
  ('aaaaaaaa-0004-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   '2026-07-09', 'Udhaar sale Maggi x20 to Ramesh',
   null, '2026-07-09 15:00:00+05:30');
insert into journal_lines (journal_entry_id, account_id, debit, credit) values
  ('aaaaaaaa-0004-0000-0000-000000000004', 'debtor_22222222-0001-0000-0000-000000000001', 240, 0),
  ('aaaaaaaa-0004-0000-0000-000000000004', 'sales', 0, 240);

insert into journal_entries (id, vendor_id, entry_date, narration, source_extraction_id, created_at) values
  ('aaaaaaaa-0005-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   '2026-07-12', 'Received from Ramesh (UPI)',
   'dddddddd-0004-0000-0000-000000000004', '2026-07-12 18:05:00+05:30');
insert into journal_lines (journal_entry_id, account_id, debit, credit) values
  ('aaaaaaaa-0005-0000-0000-000000000005', 'cash', 500, 0),
  ('aaaaaaaa-0005-0000-0000-000000000005', 'debtor_22222222-0001-0000-0000-000000000001', 0, 500);

-- Patel Traders bill (simplified single purchase total)
insert into journal_entries (id, vendor_id, entry_date, narration, source_extraction_id, created_at) values
  ('aaaaaaaa-0006-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
   '2026-07-09', 'Bill INV-118 Patel Traders',
   'dddddddd-0007-0000-0000-000000000007', '2026-07-09 12:00:00+05:30');
insert into journal_lines (journal_entry_id, account_id, debit, credit) values
  ('aaaaaaaa-0006-0000-0000-000000000006', 'purchases', 1840, 0),
  ('aaaaaaaa-0006-0000-0000-000000000006', 'creditor_22222222-0006-0000-0000-000000000006', 0, 1840);
insert into stock_ledger (vendor_id, product_id, change, reason, source_extraction_id, new_stock_level, created_at) values
  ('11111111-1111-1111-1111-111111111111', '103', 12, 'purchase', 'dddddddd-0007-0000-0000-000000000007', 59, '2026-07-09 12:00:00+05:30'),
  ('11111111-1111-1111-1111-111111111111', '104', 10, 'purchase', 'dddddddd-0007-0000-0000-000000000007', 80, '2026-07-09 12:00:00+05:30');

-- Align product stock to catalog values used by training context
update products set stock = 80  where id = '101';
update products set stock = 120 where id = '102';
update products set stock = 40  where id = '103';
update products set stock = 55  where id = '104';
update products set stock = 4   where id = '108';

commit;
