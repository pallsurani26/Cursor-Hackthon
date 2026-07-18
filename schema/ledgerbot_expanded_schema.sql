-- ============================================================================
-- LedgerBot — Expanded Database Schema (Supabase / Postgres)
-- Field catalog: docs/FIELD_CATALOG.md  (194 fields across 8 core tables)
--
-- Run once against a fresh Supabase project (SQL Editor, psql, or
-- `supabase db push`). Creates tables, balance-enforcing trigger,
-- indexes, RLS, seed helper, and retrieval RPCs.
--
-- Principle: the AI never computes ledger numbers — it calls these
-- functions via supabase.rpc(...) and formats the result.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. CORE TABLES (194 fields total)
-- ============================================================================

-- 1.1 vendors (28)
create table vendors (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  business_name               text not null,
  phone                       text not null unique,
  whatsapp_wa_id              text,
  email                       text,
  preferred_language          text not null default 'auto'
    check (preferred_language in ('auto','gu','hi','en','hinglish')),
  business_type               text
    check (business_type is null or business_type in
      ('kirana','wholesale','manufacturing','services','restaurant','other')),
  gstin                       text,
  pan                         text,
  address_line1               text,
  city                        text,
  state                       text,
  pincode                     text,
  country                     text not null default 'IN',
  timezone                    text not null default 'Asia/Kolkata',
  currency_code               text not null default 'INR',
  fiscal_year_start_month     smallint not null default 4
    check (fiscal_year_start_month between 1 and 12),
  default_payment_mode        text not null default 'cash'
    check (default_payment_mode in ('cash','upi','bank','cheque','card','credit')),
  onboarding_status           text not null default 'pending'
    check (onboarding_status in ('pending','language_set','coa_seeded','active')),
  subscription_plan           text not null default 'free'
    check (subscription_plan in ('free','starter','growth')),
  subscription_status         text not null default 'trialing'
    check (subscription_status in ('trialing','active','past_due','cancelled')),
  is_active                   boolean not null default true,
  notification_prefs          jsonb not null default '{}'::jsonb,
  last_active_at              timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  deleted_at                  timestamptz
);

-- 1.2 parties (25)
create table parties (
  id                          uuid primary key default gen_random_uuid(),
  vendor_id                   uuid not null references vendors(id) on delete cascade,
  name                        text not null,
  display_name                text,
  party_code                  text,
  phone                       text,
  party_type                  text not null default 'customer'
    check (party_type in ('customer','supplier','both')),
  gstin                       text,
  address_line1               text,
  city                        text,
  state                       text,
  pincode                     text,
  credit_limit                numeric(14,2) not null default 0 check (credit_limit >= 0),
  credit_days                 integer not null default 0 check (credit_days >= 0),
  opening_balance             numeric(14,2) not null default 0,
  opening_balance_type        text not null default 'debit'
    check (opening_balance_type in ('debit','credit')),
  preferred_language          text
    check (preferred_language is null or preferred_language in ('auto','gu','hi','en','hinglish')),
  whatsapp_opt_in             boolean not null default false,
  notes                       text,
  tags                        text[] not null default '{}',
  is_active                   boolean not null default true,
  last_transacted_at          timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  deleted_at                  timestamptz,
  unique (vendor_id, lower(name))
);

-- 1.3 accounts (20)
-- Composite PK (vendor_id, id) so every vendor can own slug 'cash' / 'sales'
-- without colliding. journal_lines carries vendor_id for the FK.
create table accounts (
  vendor_id                   uuid not null references vendors(id) on delete cascade,
  id                          text not null,  -- slug within vendor: cash, sales, debtor_<party_id>
  name                        text not null,
  account_type                text not null
    check (account_type in ('asset','liability','income','expense','equity')),
  account_subtype             text,
  parent_account_id           text,
  is_party                    boolean not null default false,
  party_id                    uuid references parties(id) on delete set null,
  normal_balance              text not null
    check (normal_balance in ('debit','credit')),
  is_system                   boolean not null default false,
  is_active                   boolean not null default true,
  currency_code               text not null default 'INR',
  opening_balance             numeric(14,2) not null default 0,
  opening_balance_date        date,
  description                 text,
  sort_order                  integer not null default 0,
  tax_relevant                boolean not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  closed_at                   timestamptz,
  primary key (vendor_id, id),
  foreign key (vendor_id, parent_account_id)
    references accounts(vendor_id, id) on delete set null
);

-- 1.4 journal_entries (27)
create table journal_entries (
  id                          uuid primary key default gen_random_uuid(),
  vendor_id                   uuid not null references vendors(id) on delete cascade,
  entry_number                text,
  entry_date                  date not null,
  entry_type                  text not null default 'general'
    check (entry_type in
      ('sale','purchase','receipt','payment','expense','transfer','adjustment','general')),
  narration                   text not null default '',
  party_id                    uuid references parties(id) on delete set null,
  payment_mode                text
    check (payment_mode is null or payment_mode in
      ('cash','upi','bank','cheque','card','credit')),
  reference_number            text,
  invoice_number              text,
  linked_product_id           text,
  quantity                    numeric(14,3),
  total_amount                numeric(14,2) not null default 0 check (total_amount >= 0),
  tax_amount                  numeric(14,2) not null default 0 check (tax_amount >= 0),
  currency_code               text not null default 'INR',
  status                      text not null default 'posted'
    check (status in ('draft','posted','voided')),
  source_extraction_id        uuid,  -- FK added after raw_extractions exists
  created_by_source           text not null default 'whatsapp_ai'
    check (created_by_source in ('whatsapp_ai','web','import','system')),
  confirmed_via               text
    check (confirmed_via is null or confirmed_via in ('whatsapp','web','auto')),
  is_reversal                 boolean not null default false,
  reverses_entry_id           uuid references journal_entries(id) on delete set null,
  voided_at                   timestamptz,
  void_reason                 text,
  posted_at                   timestamptz,
  attachment_url              text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- 1.5 journal_lines (15) — vendor_id added for composite FK to accounts
create table journal_lines (
  id                          uuid primary key default gen_random_uuid(),
  journal_entry_id            uuid not null references journal_entries(id) on delete cascade,
  vendor_id                   uuid not null references vendors(id) on delete cascade,
  account_id                  text not null,
  debit                       numeric(14,2) not null default 0 check (debit >= 0),
  credit                      numeric(14,2) not null default 0 check (credit >= 0),
  line_narration              text,
  party_id                    uuid references parties(id) on delete set null,
  product_id                  text,  -- FK added after products exists
  quantity                    numeric(14,3),
  unit_price                  numeric(14,2),
  tax_rate                    numeric(5,2),
  tax_amount                  numeric(14,2) not null default 0 check (tax_amount >= 0),
  line_order                  integer not null default 1,
  created_at                  timestamptz not null default now(),
  check (not (debit > 0 and credit > 0)),
  foreign key (vendor_id, account_id)
    references accounts(vendor_id, id)
);

-- 1.6 products (30)
create table products (
  id                          text primary key,  -- external product code, e.g. "101"
  vendor_id                   uuid not null references vendors(id) on delete cascade,
  product_name                text not null,
  sku                         text,
  barcode                     text,
  hsn_sac_code                text,
  category                    text,
  unit_of_measure             text not null default 'pcs',
  stock                       numeric(14,3) not null default 0,
  price                       numeric(14,2) not null default 0 check (price >= 0),
  cost_price                  numeric(14,2) not null default 0 check (cost_price >= 0),
  mrp                         numeric(14,2) check (mrp is null or mrp >= 0),
  gst_rate                    numeric(5,2) not null default 0 check (gst_rate >= 0),
  tax_inclusive               boolean not null default true,
  supplier                    text,
  supplier_party_id           uuid references parties(id) on delete set null,
  low_stock_threshold         numeric(14,3) not null default 5,
  reorder_quantity            numeric(14,3),
  warehouse_location          text,
  aliases                     text[] not null default '{}',
  is_active                   boolean not null default true,
  is_service                  boolean not null default false,
  track_inventory             boolean not null default true,
  batch_tracking_enabled      boolean not null default false,
  expiry_tracking_enabled     boolean not null default false,
  last_purchase_price         numeric(14,2),
  last_sale_price             numeric(14,2),
  created_at                  timestamptz not null default now(),
  last_updated                timestamptz not null default now(),
  deleted_at                  timestamptz
);

-- late FK: journal_lines.product_id → products
alter table journal_lines
  add constraint journal_lines_product_id_fkey
  foreign key (product_id) references products(id) on delete set null;

-- late FK: journal_entries.linked_product_id → products
alter table journal_entries
  add constraint journal_entries_linked_product_id_fkey
  foreign key (linked_product_id) references products(id) on delete set null;

-- 1.7 stock_ledger (17)
create table stock_ledger (
  id                          uuid primary key default gen_random_uuid(),
  vendor_id                   uuid not null references vendors(id) on delete cascade,
  product_id                  text not null references products(id) on delete cascade,
  change                      numeric(14,3) not null,
  previous_stock_level        numeric(14,3) not null,
  new_stock_level             numeric(14,3) not null,
  reason                      text not null
    check (reason in
      ('sale','purchase','bulk_upload','correction','return','damage','transfer')),
  movement_type               text not null
    check (movement_type in ('in','out','adjust')),
  unit_cost                   numeric(14,2),
  batch_number                text,
  expiry_date                 date,
  party_id                    uuid references parties(id) on delete set null,
  journal_entry_id            uuid references journal_entries(id) on delete set null,
  source_extraction_id        uuid,  -- FK after raw_extractions
  reference_number            text,
  created_by_source           text not null default 'whatsapp_ai'
    check (created_by_source in ('whatsapp_ai','web','import','system')),
  created_at                  timestamptz not null default now()
);

-- 1.8 raw_extractions (32)
create table raw_extractions (
  id                          uuid primary key default gen_random_uuid(),
  vendor_id                   uuid not null references vendors(id) on delete cascade,
  channel                     text not null default 'whatsapp'
    check (channel in ('whatsapp','web','api','csv_import')),
  input_type                  text not null
    check (input_type in ('text','voice','image','csv')),
  raw_input                   text,
  media_url                   text,
  media_mime_type             text,
  whatsapp_message_id         text,
  whatsapp_from               text,
  command                     text,
  intent                      text,
  intent_confidence           numeric(5,4) check (intent_confidence is null or (intent_confidence >= 0 and intent_confidence <= 1)),
  llm_parsed                  jsonb,
  entities                    jsonb,
  detected_language           text,
  transcription_text          text,
  transcription_confidence    numeric(5,4) check (transcription_confidence is null or (transcription_confidence >= 0 and transcription_confidence <= 1)),
  ocr_text                    text,
  ocr_confidence              numeric(5,4) check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 1)),
  confidence_score            numeric(5,4) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  status                      text not null default 'pending_confirmation'
    check (status in ('pending_confirmation','confirmed','rejected','auto_expired','failed')),
  requires_human_review       boolean not null default false,
  rejection_reason            text,
  model_name                  text,
  reply_text                  text,
  idempotency_key             text,
  expires_at                  timestamptz,
  confirmed_at                timestamptz,
  processed_at                timestamptz,
  error_message               text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (vendor_id, whatsapp_message_id),
  unique (vendor_id, idempotency_key)
);

alter table journal_entries
  add constraint journal_entries_source_extraction_id_fkey
  foreign key (source_extraction_id) references raw_extractions(id) on delete set null;

alter table stock_ledger
  add constraint stock_ledger_source_extraction_id_fkey
  foreign key (source_extraction_id) references raw_extractions(id) on delete set null;

-- ============================================================================
-- 2. THE CORE INTEGRITY GUARANTEE — enforced by the database
-- Deferred so it checks at end-of-transaction after ALL lines are inserted.
-- ============================================================================

create or replace function check_journal_balance() returns trigger as $$
declare
  v_entry_id uuid;
  v_total_debit numeric;
  v_total_credit numeric;
  v_status text;
begin
  v_entry_id := coalesce(new.journal_entry_id, old.journal_entry_id);

  select status into v_status
    from journal_entries
   where id = v_entry_id;

  -- Draft entries may be unbalanced while the AI is assembling lines.
  if v_status = 'draft' then
    return null;
  end if;

  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into v_total_debit, v_total_credit
    from journal_lines
   where journal_entry_id = v_entry_id;

  if v_total_debit <> v_total_credit then
    raise exception
      'Journal entry % is not balanced: total_debit=%, total_credit=%',
      v_entry_id, v_total_debit, v_total_credit;
  end if;

  return null;
end;
$$ language plpgsql;

create constraint trigger trg_check_journal_balance
after insert or update or delete on journal_lines
deferrable initially deferred
for each row execute function check_journal_balance();

-- ============================================================================
-- 3. updated_at helper
-- ============================================================================

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_vendors_updated_at
  before update on vendors
  for each row execute function set_updated_at();

create trigger trg_parties_updated_at
  before update on parties
  for each row execute function set_updated_at();

create trigger trg_accounts_updated_at
  before update on accounts
  for each row execute function set_updated_at();

create trigger trg_journal_entries_updated_at
  before update on journal_entries
  for each row execute function set_updated_at();

create trigger trg_raw_extractions_updated_at
  before update on raw_extractions
  for each row execute function set_updated_at();

-- products uses last_updated instead of updated_at
create or replace function set_products_last_updated() returns trigger as $$
begin
  new.last_updated := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_products_last_updated
  before update on products
  for each row execute function set_products_last_updated();
-- ============================================================================
-- 4. INDEXES
-- ============================================================================

create index idx_vendors_whatsapp_wa_id on vendors(whatsapp_wa_id) where whatsapp_wa_id is not null;
create index idx_vendors_active on vendors(is_active) where deleted_at is null;

create index idx_parties_vendor_phone on parties(vendor_id, phone);
create index idx_parties_vendor_type on parties(vendor_id, party_type) where deleted_at is null;
create index idx_parties_vendor_active on parties(vendor_id) where is_active and deleted_at is null;

create index idx_accounts_vendor on accounts(vendor_id);
create index idx_accounts_party on accounts(party_id) where party_id is not null;
create index idx_accounts_type on accounts(vendor_id, account_type) where is_active;

create index idx_journal_entries_vendor_date on journal_entries(vendor_id, entry_date);
create index idx_journal_entries_vendor_party on journal_entries(vendor_id, party_id);
create index idx_journal_entries_vendor_status on journal_entries(vendor_id, status);
create index idx_journal_entries_source on journal_entries(source_extraction_id)
  where source_extraction_id is not null;
create index idx_journal_entries_type on journal_entries(vendor_id, entry_type, entry_date);

create index idx_journal_lines_entry on journal_lines(journal_entry_id);
create index idx_journal_lines_account on journal_lines(vendor_id, account_id);
create index idx_journal_lines_product on journal_lines(product_id) where product_id is not null;
create index idx_journal_lines_party on journal_lines(party_id) where party_id is not null;

create index idx_products_vendor on products(vendor_id) where deleted_at is null;
create index idx_products_vendor_name on products(vendor_id, lower(product_name));
create index idx_products_low_stock on products(vendor_id)
  where track_inventory and stock <= low_stock_threshold and deleted_at is null;
create index idx_products_barcode on products(vendor_id, barcode) where barcode is not null;

create index idx_stock_ledger_product on stock_ledger(product_id, created_at desc);
create index idx_stock_ledger_vendor on stock_ledger(vendor_id, created_at desc);
create index idx_stock_ledger_journal on stock_ledger(journal_entry_id)
  where journal_entry_id is not null;

create index idx_raw_extractions_vendor_status on raw_extractions(vendor_id, status);
create index idx_raw_extractions_vendor_created on raw_extractions(vendor_id, created_at desc);
create index idx_raw_extractions_pending_expiry on raw_extractions(expires_at)
  where status = 'pending_confirmation';

-- ============================================================================
-- 5. ROW LEVEL SECURITY (vendor-scoped isolation)
-- Backend WhatsApp path uses SERVICE ROLE (bypasses RLS).
-- These policies matter for per-vendor logged-in frontend sessions.
-- ============================================================================

alter table vendors enable row level security;
alter table parties enable row level security;
alter table accounts enable row level security;
alter table journal_entries enable row level security;
alter table journal_lines enable row level security;
alter table products enable row level security;
alter table stock_ledger enable row level security;
alter table raw_extractions enable row level security;

create policy vendor_isolation_vendors on vendors
  using (id = auth.uid());

create policy vendor_isolation_parties on parties
  using (vendor_id = auth.uid());

create policy vendor_isolation_accounts on accounts
  using (vendor_id = auth.uid());

create policy vendor_isolation_journal_entries on journal_entries
  using (vendor_id = auth.uid());

create policy vendor_isolation_journal_lines on journal_lines
  using (vendor_id = auth.uid());

create policy vendor_isolation_products on products
  using (vendor_id = auth.uid());

create policy vendor_isolation_stock_ledger on stock_ledger
  using (vendor_id = auth.uid());

create policy vendor_isolation_raw_extractions on raw_extractions
  using (vendor_id = auth.uid());

-- ============================================================================
-- 6. RETRIEVAL FUNCTIONS — AI/backend calls these; never compute in the LLM
-- ============================================================================

-- 6.1 Current balance of every account
create or replace function fn_account_balances(p_vendor_id uuid)
returns table (
  account_id text,
  account_name text,
  account_type text,
  balance numeric
) language sql stable as $$
  select a.id, a.name, a.account_type,
         case when a.account_type in ('liability','income','equity')
              then coalesce(sum(jl.credit - jl.debit), 0)
              else coalesce(sum(jl.debit - jl.credit), 0)
         end as balance
    from accounts a
    left join journal_lines jl
      on jl.account_id = a.id
     and jl.vendor_id = a.vendor_id
    left join journal_entries je on je.id = jl.journal_entry_id
                                 and je.status = 'posted'
   where a.vendor_id = p_vendor_id
     and a.is_active
   group by a.id, a.name, a.account_type;
$$;

-- 6.2 Profit & Loss for a date range
create or replace function fn_profit_loss(p_vendor_id uuid, p_start date, p_end date)
returns table (
  section text,
  amount numeric
) language sql stable as $$
  select
    case
      when a.account_type = 'income' then 'income'
      when a.account_type = 'expense' then 'expense'
    end as section,
    sum(case when a.account_type = 'income'
             then jl.credit - jl.debit
             else jl.debit - jl.credit end) as amount
    from journal_lines jl
    join journal_entries je on je.id = jl.journal_entry_id
    join accounts a on a.id = jl.account_id
   where je.vendor_id = p_vendor_id
     and je.status = 'posted'
     and je.entry_date between p_start and p_end
     and a.account_type in ('income','expense')
   group by a.account_type;
$$;

-- 6.3 Balance Sheet as of a date
create or replace function fn_balance_sheet(p_vendor_id uuid, p_as_of date)
returns table (
  assets numeric,
  liabilities numeric,
  equity numeric,
  balanced boolean
) language plpgsql stable as $$
declare
  v_assets numeric;
  v_liabilities numeric;
  v_equity numeric;
begin
  select coalesce(sum(jl.debit - jl.credit), 0) into v_assets
    from journal_lines jl
    join journal_entries je on je.id = jl.journal_entry_id
    join accounts a on a.id = jl.account_id
   where je.vendor_id = p_vendor_id and je.status = 'posted'
     and je.entry_date <= p_as_of
     and a.account_type = 'asset';

  select coalesce(sum(jl.credit - jl.debit), 0) into v_liabilities
    from journal_lines jl
    join journal_entries je on je.id = jl.journal_entry_id
    join accounts a on a.id = jl.account_id
   where je.vendor_id = p_vendor_id and je.status = 'posted'
     and je.entry_date <= p_as_of
     and a.account_type = 'liability';

  select coalesce(sum(jl.credit - jl.debit), 0) into v_equity
    from journal_lines jl
    join journal_entries je on je.id = jl.journal_entry_id
    join accounts a on a.id = jl.account_id
   where je.vendor_id = p_vendor_id and je.status = 'posted'
     and je.entry_date <= p_as_of
     and a.account_type = 'equity';

  return query
    select v_assets, v_liabilities, v_equity,
           (v_assets = v_liabilities + v_equity);
end;
$$;

-- 6.4 Cash flow
create or replace function fn_cash_flow(p_vendor_id uuid, p_start date, p_end date)
returns table (
  entry_date date,
  narration text,
  amount numeric,
  direction text,
  offsetting_account_type text
) language sql stable as $$
  select je.entry_date, je.narration,
         (jl.debit - jl.credit) as amount,
         case when jl.debit > 0 then 'inflow' else 'outflow' end,
         other.account_type
    from journal_lines jl
    join journal_entries je on je.id = jl.journal_entry_id
    join journal_lines other_line on other_line.journal_entry_id = je.id
                                  and other_line.id <> jl.id
    join accounts other on other.id = other_line.account_id
   where je.vendor_id = p_vendor_id
     and jl.vendor_id = p_vendor_id
     and je.status = 'posted'
     and jl.account_id = 'cash'
     and je.entry_date between p_start and p_end
   order by je.entry_date;
$$;

-- 6.5 Single account ledger
create or replace function fn_ledger_account(
  p_vendor_id uuid, p_account_id text, p_start date, p_end date
)
returns table (
  entry_date date,
  narration text,
  debit numeric,
  credit numeric
) language sql stable as $$
  select je.entry_date, je.narration, jl.debit, jl.credit
    from journal_lines jl
    join journal_entries je on je.id = jl.journal_entry_id
   where je.vendor_id = p_vendor_id
     and je.status = 'posted'
     and jl.account_id = p_account_id
     and je.entry_date between p_start and p_end
   order by je.entry_date;
$$;

-- 6.6 Accounting Equation wrapper
create or replace function fn_accounting_equation(p_vendor_id uuid, p_as_of date)
returns table (
  assets numeric,
  liabilities numeric,
  equity numeric,
  balanced boolean
) language sql stable as $$
  select * from fn_balance_sheet(p_vendor_id, p_as_of);
$$;

-- 6.7 Party (udhaar) ledger
create or replace function fn_party_ledger(p_vendor_id uuid, p_account_id text)
returns table (
  billed numeric,
  paid numeric,
  pending numeric
) language sql stable as $$
  select
    coalesce(sum(jl.debit), 0) as billed,
    coalesce(sum(jl.credit), 0) as paid,
    coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0) as pending
    from journal_lines jl
    join journal_entries je on je.id = jl.journal_entry_id
   where je.vendor_id = p_vendor_id
     and je.status = 'posted'
     and jl.account_id = p_account_id;
$$;

-- 6.8 Low stock list (WhatsApp “kya kam hai?”)
create or replace function fn_low_stock(p_vendor_id uuid)
returns table (
  product_id text,
  product_name text,
  stock numeric,
  low_stock_threshold numeric,
  unit_of_measure text
) language sql stable as $$
  select p.id, p.product_name, p.stock, p.low_stock_threshold, p.unit_of_measure
    from products p
   where p.vendor_id = p_vendor_id
     and p.track_inventory
     and p.is_active
     and p.deleted_at is null
     and p.stock <= p.low_stock_threshold
   order by p.stock asc;
$$;

-- ============================================================================
-- 7. SEED: default chart-of-accounts for every new vendor
-- ============================================================================

create or replace function fn_seed_default_accounts(p_vendor_id uuid)
returns void language sql as $$
  insert into accounts (
    id, vendor_id, name, account_type, account_subtype,
    normal_balance, is_system, is_active, sort_order
  ) values
    ('cash',      p_vendor_id, 'Cash',      'asset',     'cash',     'debit',  true, true, 10),
    ('bank',      p_vendor_id, 'Bank',      'asset',     'bank',     'debit',  true, true, 20),
    ('sales',     p_vendor_id, 'Sales',     'income',    'sales',    'credit', true, true, 30),
    ('purchases', p_vendor_id, 'Purchases', 'expense',   'cogs',     'debit',  true, true, 40),
    ('expenses',  p_vendor_id, 'Expenses',  'expense',   'opex',     'debit',  true, true, 50),
    ('capital',   p_vendor_id, 'Capital',   'equity',    'capital',  'credit', true, true, 60),
    ('drawings',  p_vendor_id, 'Drawings',  'equity',    'drawings', 'debit',  true, true, 70)
  on conflict (id) do nothing;
$$;

-- Helper: create debtor/creditor accounts when a party is created
create or replace function fn_seed_party_accounts(p_vendor_id uuid, p_party_id uuid, p_party_name text)
returns void language plpgsql as $$
begin
  insert into accounts (
    id, vendor_id, name, account_type, account_subtype,
    is_party, party_id, normal_balance, is_system, sort_order
  ) values
    (
      'debtor_' || p_party_id::text,
      p_vendor_id,
      p_party_name || ' (Receivable)',
      'asset', 'debtor', true, p_party_id, 'debit', true, 100
    ),
    (
      'creditor_' || p_party_id::text,
      p_vendor_id,
      p_party_name || ' (Payable)',
      'liability', 'creditor', true, p_party_id, 'credit', true, 110
    )
  on conflict (id) do nothing;
end;
$$;
