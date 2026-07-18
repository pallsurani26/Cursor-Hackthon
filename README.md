# LedgerBot — WhatsApp AI Business Copilot (MSME)

Supabase / Postgres schema for a WhatsApp-based AI business copilot for MSMEs (ledger, udhaar, stock, voice/OCR intake).

## Docs

- **Field catalog (194 fields):** [`docs/FIELD_CATALOG.md`](docs/FIELD_CATALOG.md)
- **Runnable SQL schema:** [`schema/ledgerbot_expanded_schema.sql`](schema/ledgerbot_expanded_schema.sql)

## Tables

| Table | Fields | Role |
|-------|-------:|------|
| `vendors` | 28 | MSME shop + WhatsApp identity |
| `parties` | 25 | Customers / suppliers (udhaar) |
| `accounts` | 20 | Chart of accounts (composite PK) |
| `journal_entries` | 27 | Double-entry headers |
| `journal_lines` | 15 | Debit / credit legs |
| `products` | 30 | SKU + stock master |
| `stock_ledger` | 17 | Immutable stock movements |
| `raw_extractions` | 32 | WhatsApp / LLM intake pipeline |
| **Total** | **194** | |

## Apply

Run `schema/ledgerbot_expanded_schema.sql` once in the Supabase SQL Editor (or `psql` / `supabase db push`) against a fresh project.

The AI must call retrieval RPCs (`fn_account_balances`, `fn_profit_loss`, `fn_party_ledger`, etc.) — it must not compute ledger numbers itself.
