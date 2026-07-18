# LedgerBot — WhatsApp AI Business Copilot (MSME)

## Training / feed data (use this)

Model training and WhatsApp feed data live here — **no schema changes required**:

| Path | What |
|------|------|
| [`data/training/`](data/training/) | JSONL for fine-tuning + `raw_extractions` feed |
| [`data/training/README.md`](data/training/README.md) | How to train / feed |
| [`data/seed/original_schema_seed.sql`](data/seed/original_schema_seed.sql) | Seed rows for your **original** schema |

```bash
# regenerate training JSONL
python3 data/training/generate_training_data.py
```

**315 labeled examples** covering sale/purchase/receipt/payment/expense, stock, udhaar queries, P&L, confirm/reject, voice, OCR — in `en` / `hi` / `gu` / `hinglish`.

## Optional schema docs (separate)

Earlier DBA catalog/SQL (optional; not required for training data):

- [`docs/FIELD_CATALOG.md`](docs/FIELD_CATALOG.md)
- [`schema/ledgerbot_expanded_schema.sql`](schema/ledgerbot_expanded_schema.sql)
