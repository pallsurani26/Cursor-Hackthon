# LedgerBot — Model Training / Feed Data

**Schema is untouched.** These files are training + feed data only, shaped for your original tables (especially `raw_extractions.llm_parsed`).

## Files

| File | Rows | Use |
|------|-----:|-----|
| `whatsapp_extractions.jsonl` | 315 | Chat-style SFT (system/user/assistant) |
| `train.jsonl` / `val.jsonl` | 283 / 32 | 90/10 split of above |
| `sft_extractions.jsonl` | 315 | Instruction → JSON extraction |
| `intents.jsonl` | 315 | Intent classifier (`text` → `intent`) |
| `raw_extractions_feed.jsonl` | 315 | Ready to map into `raw_extractions` columns |
| `generate_training_data.py` | — | Regenerates all JSONL files |

DB seed (original columns only): [`../seed/original_schema_seed.sql`](../seed/original_schema_seed.sql)

## What the model learns

Input: WhatsApp `text` / `voice` transcript / `image` OCR / `csv`  
Output JSON:

```json
{
  "intent": "record_sale",
  "command": "sale",
  "detected_language": "hinglish",
  "confidence_score": 0.92,
  "entities": {
    "party_name": "Ramesh",
    "product_name": "Maggi",
    "quantity": 10,
    "unit_price": 12,
    "amount": 120,
    "payment_mode": "cash"
  },
  "journal_hint": { "...": "suggested lines — backend posts after confirm" },
  "stock_hint": { "product_name": "Maggi", "change": -10, "reason": "sale" }
}
```

**Rule baked into labels:** model extracts + suggests; Postgres RPCs compute balances. Never invent udhaar totals.

## Intents covered

`record_sale`, `record_purchase`, `record_receipt`, `record_payment`, `record_expense`,  
`add_stock`, `stock_query`, `low_stock`, `party_balance`, `list_dues`,  
`profit_loss`, `cash_balance`, `correct_entry`, `confirm`, `reject`,  
`greeting`, `help`, `unknown`

Languages: `en`, `hi`, `gu`, `hinglish`  
Channels: text, voice, image OCR, csv

## How to fine-tune (example)

OpenAI-style / chat SFT:

```bash
# use train.jsonl + val.jsonl
# each line: {"messages":[{"role":"system"...},{"role":"user"...},{"role":"assistant"...}]}
```

Alpaca / instruction SFT:

```bash
# use sft_extractions.jsonl
# fields: instruction, input, output
```

Intent-only classifier:

```bash
# use intents.jsonl
# fields: text, intent
```

## How to feed the app (not train)

1. Run your **original** schema SQL on Supabase.
2. Run `data/seed/original_schema_seed.sql` for demo books.
3. For live WhatsApp: write each message into `raw_extractions` using fields from `raw_extractions_feed.jsonl` (`raw_input`, `command`, `llm_parsed`, `detected_language`, `status`).
4. On user **confirm**, backend posts `journal_entries` / `journal_lines` / `stock_ledger` from `llm_parsed.journal_hint` + `stock_hint`.

## Regenerate

```bash
python3 data/training/generate_training_data.py
```
