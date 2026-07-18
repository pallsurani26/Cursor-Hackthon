#!/usr/bin/env python3
"""Generate LedgerBot WhatsApp → extraction training JSONL (original schema only)."""

from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent

SYSTEM = (
    "You are LedgerBot, an AI bookkeeping extractor for Indian MSMEs on WhatsApp. "
    "Given a vendor message (text/voice transcript/OCR), output ONLY valid JSON with keys: "
    "intent, command, detected_language, confidence_score, entities, "
    "journal_hint, stock_hint, reply_language. "
    "Never invent balances — the backend computes numbers via Postgres RPCs. "
    "Languages: gu, hi, en, hinglish. Amounts in INR. "
    "intents: record_sale, record_purchase, record_receipt, record_payment, "
    "record_expense, add_stock, stock_query, party_balance, list_dues, "
    "profit_loss, cash_balance, low_stock, correct_entry, confirm, reject, "
    "greeting, help, unknown."
)


def ex(
    raw_input: str,
    *,
    input_type: str = "text",
    detected_language: str,
    intent: str,
    command: str,
    confidence: float,
    entities: dict,
    journal_hint: dict | None = None,
    stock_hint: dict | None = None,
    notes: str = "",
) -> dict:
    assistant = {
        "intent": intent,
        "command": command,
        "detected_language": detected_language,
        "confidence_score": confidence,
        "entities": entities,
        "journal_hint": journal_hint,
        "stock_hint": stock_hint,
        "reply_language": detected_language if detected_language != "auto" else "hinglish",
    }
    user_payload = {
        "channel": "whatsapp",
        "input_type": input_type,
        "raw_input": raw_input,
        "vendor_context": {
            "business_type": "kirana",
            "currency": "INR",
            "timezone": "Asia/Kolkata",
        },
    }
    return {
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            {"role": "assistant", "content": json.dumps(assistant, ensure_ascii=False)},
        ],
        "meta": {
            "intent": intent,
            "language": detected_language,
            "input_type": input_type,
            "notes": notes,
        },
    }


def sale(party, product, qty, rate, mode, lang, text, conf=0.92):
    amount = round(qty * rate, 2)
    return ex(
        text,
        detected_language=lang,
        intent="record_sale",
        command="sale",
        confidence=conf,
        entities={
            "party_name": party,
            "product_name": product,
            "quantity": qty,
            "unit_price": rate,
            "amount": amount,
            "payment_mode": mode,
        },
        journal_hint={
            "entry_type": "sale",
            "narration": f"Sale of {product} x{qty} to {party}",
            "lines": [
                {
                    "account": "cash" if mode in ("cash", "upi") else f"debtor:{party}",
                    "debit": amount,
                    "credit": 0,
                },
                {"account": "sales", "debit": 0, "credit": amount},
            ],
            "linked_product": product,
            "quantity": qty,
        },
        stock_hint={"product_name": product, "change": -qty, "reason": "sale"},
    )


def purchase(supplier, product, qty, rate, mode, lang, text, conf=0.91):
    amount = round(qty * rate, 2)
    return ex(
        text,
        detected_language=lang,
        intent="record_purchase",
        command="purchase",
        confidence=conf,
        entities={
            "party_name": supplier,
            "product_name": product,
            "quantity": qty,
            "unit_price": rate,
            "amount": amount,
            "payment_mode": mode,
        },
        journal_hint={
            "entry_type": "purchase",
            "narration": f"Purchase of {product} x{qty} from {supplier}",
            "lines": [
                {"account": "purchases", "debit": amount, "credit": 0},
                {
                    "account": "cash" if mode in ("cash", "upi") else f"creditor:{supplier}",
                    "debit": 0,
                    "credit": amount,
                },
            ],
            "linked_product": product,
            "quantity": qty,
        },
        stock_hint={"product_name": product, "change": qty, "reason": "purchase"},
    )


def receipt(party, amount, mode, lang, text, conf=0.93):
    return ex(
        text,
        detected_language=lang,
        intent="record_receipt",
        command="receipt",
        confidence=conf,
        entities={"party_name": party, "amount": amount, "payment_mode": mode},
        journal_hint={
            "entry_type": "receipt",
            "narration": f"Received from {party}",
            "lines": [
                {"account": "cash", "debit": amount, "credit": 0},
                {"account": f"debtor:{party}", "debit": 0, "credit": amount},
            ],
        },
    )


def payment(party, amount, mode, lang, text, conf=0.92):
    return ex(
        text,
        detected_language=lang,
        intent="record_payment",
        command="payment",
        confidence=conf,
        entities={"party_name": party, "amount": amount, "payment_mode": mode},
        journal_hint={
            "entry_type": "payment",
            "narration": f"Paid to {party}",
            "lines": [
                {"account": f"creditor:{party}", "debit": amount, "credit": 0},
                {"account": "cash", "debit": 0, "credit": amount},
            ],
        },
    )


def expense(category, amount, lang, text, conf=0.9):
    return ex(
        text,
        detected_language=lang,
        intent="record_expense",
        command="expense",
        confidence=conf,
        entities={"expense_category": category, "amount": amount, "payment_mode": "cash"},
        journal_hint={
            "entry_type": "expense",
            "narration": category,
            "lines": [
                {"account": "purchases", "debit": amount, "credit": 0},
                {"account": "cash", "debit": 0, "credit": amount},
            ],
        },
    )


def build() -> list[dict]:
    rows: list[dict] = []

    sales = [
        ("Ramesh", "Maggi", 10, 12, "cash", "en", "Sold 10 Maggi to Ramesh for cash"),
        ("Ramesh", "Maggi", 10, 12, "credit", "en", "Udhaar sale 10 Maggi to Ramesh @12"),
        ("Suresh", "Rice 1kg", 5, 60, "cash", "hi", "सुरेश को 5 राइस 1kg नकद बेचे @60"),
        ("Suresh", "Rice 1kg", 5, 60, "credit", "hi", "सुरेश को उधार में 5 चावल दिए साठ रुपये किलो"),
        ("Meena", "Oil 1L", 2, 140, "upi", "hinglish", "Meena ko 2 oil diya UPI se 140 per litre"),
        ("Meena", "Oil 1L", 3, 140, "credit", "hinglish", "Meena udhaar oil 3 litre @140"),
        ("Kiran", "Sugar", 4, 45, "cash", "gu", "કિરણને 4 શુગર વેચ્યું કેશ @45"),
        ("Kiran", "Sugar", 4, 45, "credit", "gu", "કિરણને ઉધાર શુગર 4 કિલો 45 રૂપિયે"),
        ("Amit", "Parle-G", 20, 10, "cash", "en", "Cash sale: 20 Parle-G packets to Amit at 10 each"),
        ("Priya", "Tea", 1, 250, "upi", "hinglish", "Priya ne tea 1kg liya UPI 250"),
        ("Bharat", "Atta 5kg", 2, 220, "credit", "hi", "भारत जी को आटा 2 बैग उधार @220"),
        ("Jaya", "Soap", 6, 30, "cash", "gu", "જયાને 6 સાબુ કેશ વેચ્યા ત્રીસ રૂપિયા"),
        ("Raju", "Biscuits", 15, 20, "cash", "hinglish", "Raju ko biscuits 15 pkt cash @20"),
        ("Nita", "Milk", 10, 28, "credit", "hi", "नीता को 10 लीटर दूध उधार 28 रुपये लीटर"),
        ("Vijay", "Salt", 8, 20, "cash", "en", "Sold 8 salt packs to Vijay cash Rs 20"),
        ("Hema", "Dal", 3, 120, "upi", "gu", "હેમાને દાળ 3 કિલો UPI @120"),
        ("Gopal", "Namkeen", 5, 40, "credit", "hinglish", "Gopal udhaar namkeen 5 pkt 40"),
        ("Anita", "Shampoo", 2, 180, "cash", "en", "Anita bought 2 shampoo cash 180 each"),
        ("Deepak", "Eggs", 30, 6, "cash", "hi", "दीपक को 30 अंडे नकद 6 रुपये"),
        ("Pooja", "Bread", 4, 35, "upi", "hinglish", "Pooja bread 4 UPI @35"),
    ]
    for s in sales:
        rows.append(sale(*s))

    purchases = [
        ("Wholesale Mart", "Rice 1kg", 50, 48, "cash", "en", "Bought 50 Rice 1kg from Wholesale Mart cash @48"),
        ("Wholesale Mart", "Rice 1kg", 50, 48, "credit", "en", "Purchase on credit 50 Rice from Wholesale Mart @48"),
        ("Patel Traders", "Oil 1L", 20, 120, "upi", "hi", "पटेल ट्रेडर्स से 20 ऑयल खरीदा UPI @120"),
        ("Patel Traders", "Sugar", 30, 38, "credit", "gu", "Patel Traders pase thi sugar 30 kilo udhaar @38"),
        ("Shree Distributors", "Maggi", 100, 9, "cash", "hinglish", "Shree se Maggi 100 pkt purchase cash @9"),
        ("Shree Distributors", "Parle-G", 200, 8, "credit", "en", "Credit purchase 200 Parle-G from Shree @8"),
        ("Dairy Co", "Milk", 40, 24, "cash", "hi", "डेयरी से 40 लीटर दूध नकद @24"),
        ("Agro Supply", "Atta 5kg", 25, 190, "upi", "gu", "એગ્રો સપ્લાયથી આટા 25 બેગ UPI @190"),
        ("Local Mill", "Dal", 15, 95, "credit", "hinglish", "Local mill se dal 15kg udhaar @95"),
        ("Snack Hub", "Namkeen", 40, 28, "cash", "en", "Purchased 40 namkeen from Snack Hub cash 28"),
    ]
    for p in purchases:
        rows.append(purchase(*p))

    receipts = [
        ("Ramesh", 500, "cash", "en", "Ramesh paid 500 cash against udhaar"),
        ("Ramesh", 500, "upi", "hinglish", "Ramesh ne 500 UPI kiya udhaar ka"),
        ("Suresh", 300, "cash", "hi", "सुरेश ने 300 नकद उधार चुकाया"),
        ("Meena", 420, "upi", "gu", "Meena e 420 UPI thi udhaar bharyu"),
        ("Bharat", 1000, "cash", "en", "Received 1000 from Bharat"),
        ("Nita", 280, "upi", "hi", "नीता से 280 UPI मिला"),
        ("Gopal", 200, "cash", "hinglish", "Gopal se 200 cash collection"),
        ("Priya", 250, "upi", "en", "Priya settled 250 via UPI"),
        ("Kiran", 180, "cash", "gu", "કિરણ પાસેથી 180 કેશ મળ્યા"),
        ("Vijay", 160, "cash", "hinglish", "Vijay ne 160 cash diya"),
    ]
    for r in receipts:
        rows.append(receipt(*r))

    payments = [
        ("Wholesale Mart", 2000, "upi", "en", "Paid Wholesale Mart 2000 UPI"),
        ("Patel Traders", 1500, "cash", "hi", "पटेल ट्रेडर्स को 1500 नकद दिए"),
        ("Shree Distributors", 900, "upi", "gu", "શ્રી ડિસ્ટ્રિબ્યુટર્સને 900 UPI ચૂકવ્યા"),
        ("Dairy Co", 960, "cash", "hinglish", "Dairy Co ko 960 cash payment"),
        ("Agro Supply", 4750, "upi", "en", "Paid Agro Supply 4750"),
        ("Local Mill", 1425, "cash", "hi", "लोकल मिल को 1425 नकद भुगतान"),
    ]
    for pmt in payments:
        rows.append(payment(*pmt))

    expenses = [
        ("Rent", 5000, "en", "Paid shop rent 5000 cash"),
        ("Electricity", 1200, "hi", "बिजली बिल 1200 नकद दिया"),
        ("Transport", 300, "gu", "ટ્રાન્સપોર્ટ ખર્ચ 300"),
        ("Packaging", 150, "hinglish", "Packaging kharcha 150 cash"),
        ("Tea/refreshment", 80, "en", "Staff tea expense 80"),
        ("Mobile recharge", 199, "hi", "दुकान मोबाइल रिचार्ज 199"),
        ("Cleaning", 100, "gu", "દુકાન સફાઈ 100 રૂપિયા"),
        ("Misc", 50, "hinglish", "Chhota kharcha 50"),
    ]
    for e in expenses:
        rows.append(expense(*e))

    rows.extend(
        [
            ex(
                "Add stock Maggi 50 pcs bulk upload",
                detected_language="en",
                intent="add_stock",
                command="add_stock",
                confidence=0.94,
                entities={"product_name": "Maggi", "quantity": 50},
                stock_hint={"product_name": "Maggi", "change": 50, "reason": "bulk_upload"},
            ),
            ex(
                "स्टॉक सुधारो शुगर -2 करेक्शन",
                detected_language="hi",
                intent="add_stock",
                command="stock_correction",
                confidence=0.88,
                entities={"product_name": "Sugar", "quantity": -2},
                stock_hint={"product_name": "Sugar", "change": -2, "reason": "correction"},
            ),
            ex(
                "Maggi kitna stock hai?",
                detected_language="hinglish",
                intent="stock_query",
                command="stock_query",
                confidence=0.96,
                entities={"product_name": "Maggi"},
            ),
            ex(
                "चावल का स्टॉक कितना है?",
                detected_language="hi",
                intent="stock_query",
                command="stock_query",
                confidence=0.96,
                entities={"product_name": "Rice 1kg"},
            ),
            ex(
                "ઓઈલનો સ્ટોક કેટલો?",
                detected_language="gu",
                intent="stock_query",
                command="stock_query",
                confidence=0.95,
                entities={"product_name": "Oil 1L"},
            ),
            ex(
                "कौन सा सामान कम है?",
                detected_language="hi",
                intent="low_stock",
                command="low_stock",
                confidence=0.97,
                entities={},
            ),
            ex(
                "Show low stock items",
                detected_language="en",
                intent="low_stock",
                command="low_stock",
                confidence=0.98,
                entities={},
            ),
            ex(
                "Rice ka stock update karo 120 pe",
                detected_language="hinglish",
                intent="add_stock",
                command="stock_set",
                confidence=0.8,
                entities={"product_name": "Rice 1kg", "new_stock_level": 120},
                stock_hint={"product_name": "Rice 1kg", "reason": "correction", "set_level": 120},
                notes="ambiguous set vs delta — lower confidence",
            ),
            ex(
                "Voice: aaj sugar stock check karna hai",
                input_type="voice",
                detected_language="hinglish",
                intent="stock_query",
                command="stock_query",
                confidence=0.9,
                entities={"product_name": "Sugar"},
            ),
        ]
    )

    for text, lang, party in [
        ("Ramesh ka kitna udhaar hai?", "hinglish", "Ramesh"),
        ("What is balance of Suresh?", "en", "Suresh"),
        ("मीना का बकाया कितना है?", "hi", "Meena"),
        ("કિરણનું બાકી કેટલું?", "gu", "Kiran"),
        ("Show Bharat ledger", "en", "Bharat"),
        ("Gopal pending amount?", "hinglish", "Gopal"),
        ("नीता का खाता दिखाओ", "hi", "Nita"),
        ("Priya udhaar?", "hinglish", "Priya"),
    ]:
        rows.append(
            ex(
                text,
                detected_language=lang,
                intent="party_balance",
                command="party_balance",
                confidence=0.95,
                entities={"party_name": party, "rpc": "fn_party_ledger"},
            )
        )

    for text, lang in [
        ("Kaun ka udhaar pending hai?", "hinglish"),
        ("List all dues", "en"),
        ("सभी उधार दिखाओ", "hi"),
        ("Badha udhaar ni yaadi", "gu"),
        ("Today collection pending?", "en"),
    ]:
        rows.append(
            ex(
                text,
                detected_language=lang,
                intent="list_dues",
                command="list_dues",
                confidence=0.94,
                entities={"rpc": "fn_account_balances", "filter": "debtors"},
            )
        )

    for text, lang, period in [
        ("Aaj ka profit kitna?", "hinglish", "today"),
        ("This month P&L", "en", "month"),
        ("इस हफ्ते का मुनाफा", "hi", "week"),
        ("આ મહિનાનું નફો નુકસાન", "gu", "month"),
        ("Show profit and loss from 1 Jul to 18 Jul", "en", "custom"),
    ]:
        rows.append(
            ex(
                text,
                detected_language=lang,
                intent="profit_loss",
                command="profit_loss",
                confidence=0.93,
                entities={"rpc": "fn_profit_loss", "period": period},
            )
        )

    for text, lang in [
        ("Cash balance?", "en"),
        ("Kitna cash hai dukaan pe?", "hinglish"),
        ("कैश कितना बचा है?", "hi"),
        ("કેશ બેલેન્સ કેટલું?", "gu"),
    ]:
        rows.append(
            ex(
                text,
                detected_language=lang,
                intent="cash_balance",
                command="cash_balance",
                confidence=0.96,
                entities={"rpc": "fn_account_balances", "account_id": "cash"},
            )
        )

    for text, lang in [
        ("Yes confirm", "en"),
        ("OK save", "en"),
        ("हाँ सही है", "hi"),
        ("હા સાચું છે", "gu"),
        ("Haan kar do", "hinglish"),
        ("Confirm karo", "hinglish"),
    ]:
        rows.append(
            ex(
                text,
                detected_language=lang,
                intent="confirm",
                command="confirm",
                confidence=0.99,
                entities={"confirmation": True},
            )
        )

    for text, lang in [
        ("No cancel", "en"),
        ("Reject", "en"),
        ("नहीं गलत है", "hi"),
        ("ના રદ કરો", "gu"),
        ("Mat karo galat hai", "hinglish"),
        ("Cancel transaction", "en"),
    ]:
        rows.append(
            ex(
                text,
                detected_language=lang,
                intent="reject",
                command="reject",
                confidence=0.99,
                entities={"confirmation": False},
            )
        )

    rows.append(
        ex(
            "Galat entry thi — Ramesh sale 10 nahi 8 Maggi thi",
            detected_language="hinglish",
            intent="correct_entry",
            command="correct_entry",
            confidence=0.86,
            entities={
                "party_name": "Ramesh",
                "product_name": "Maggi",
                "old_quantity": 10,
                "quantity": 8,
                "unit_price": 12,
                "amount": 96,
                "payment_mode": "credit",
            },
            journal_hint={
                "entry_type": "adjustment",
                "narration": "Correction: Maggi sale Ramesh 10 to 8",
                "is_correction": True,
            },
            stock_hint={"product_name": "Maggi", "change": 2, "reason": "correction"},
        )
    )
    rows.append(
        ex(
            "पिछली एंट्री डिलीट करो सुरेश वाले चावल की",
            detected_language="hi",
            intent="correct_entry",
            command="void_entry",
            confidence=0.84,
            entities={"party_name": "Suresh", "product_name": "Rice 1kg", "action": "void"},
        )
    )

    for text, lang in [
        ("Hi", "en"),
        ("Namaste", "hi"),
        ("Kem cho", "gu"),
        ("Hello LedgerBot", "en"),
    ]:
        rows.append(
            ex(
                text,
                detected_language=lang,
                intent="greeting",
                command="greeting",
                confidence=0.99,
                entities={},
            )
        )

    for text, lang in [
        ("Help", "en"),
        ("Kaise use karu?", "hinglish"),
        ("मदद चाहिए", "hi"),
        ("મદદ", "gu"),
    ]:
        rows.append(
            ex(
                text,
                detected_language=lang,
                intent="help",
                command="help",
                confidence=0.97,
                entities={},
            )
        )

    for text, lang in [
        ("Cricket score kya hai?", "hinglish"),
        ("Weather tomorrow?", "en"),
        ("म्यूजिक चलाओ", "hi"),
    ]:
        rows.append(
            ex(
                text,
                detected_language=lang,
                intent="unknown",
                command="unknown",
                confidence=0.7,
                entities={},
                notes="out of domain",
            )
        )

    rows.extend(
        [
            ex(
                "OCR: Invoice No INV-118\nPatel Traders\nOil 1L x 12 = 1440\nSugar 10kg x 40 = 400\nTotal 1840 Due",
                input_type="image",
                detected_language="en",
                intent="record_purchase",
                command="purchase_bill",
                confidence=0.87,
                entities={
                    "party_name": "Patel Traders",
                    "invoice_number": "INV-118",
                    "amount": 1840,
                    "payment_mode": "credit",
                    "line_items": [
                        {"product_name": "Oil 1L", "quantity": 12, "unit_price": 120, "amount": 1440},
                        {"product_name": "Sugar", "quantity": 10, "unit_price": 40, "amount": 400},
                    ],
                },
                journal_hint={
                    "entry_type": "purchase",
                    "narration": "Bill INV-118 Patel Traders",
                    "total_amount": 1840,
                },
                stock_hint={"multi": True, "reason": "purchase"},
            ),
            ex(
                "OCR बिल: रामेश - मैगी 10 x 12 = 120 उधार",
                input_type="image",
                detected_language="hi",
                intent="record_sale",
                command="sale_bill",
                confidence=0.89,
                entities={
                    "party_name": "Ramesh",
                    "product_name": "Maggi",
                    "quantity": 10,
                    "unit_price": 12,
                    "amount": 120,
                    "payment_mode": "credit",
                },
                journal_hint={
                    "entry_type": "sale",
                    "narration": "Sale Maggi to Ramesh",
                    "lines": [
                        {"account": "debtor:Ramesh", "debit": 120, "credit": 0},
                        {"account": "sales", "debit": 0, "credit": 120},
                    ],
                },
                stock_hint={"product_name": "Maggi", "change": -10, "reason": "sale"},
            ),
            ex(
                "Photo bill unclear — only total 750 visible, no party name",
                input_type="image",
                detected_language="en",
                intent="unknown",
                command="needs_clarification",
                confidence=0.45,
                entities={"amount": 750, "missing": ["party_name", "line_items"]},
                notes="low confidence → ask clarifying question",
            ),
            ex(
                "Voice transcript: aaj ramesh ko bees parle g cash beche das rupaye packet",
                input_type="voice",
                detected_language="hinglish",
                intent="record_sale",
                command="sale",
                confidence=0.88,
                entities={
                    "party_name": "Ramesh",
                    "product_name": "Parle-G",
                    "quantity": 20,
                    "unit_price": 10,
                    "amount": 200,
                    "payment_mode": "cash",
                },
                journal_hint={
                    "entry_type": "sale",
                    "narration": "Sale Parle-G x20 to Ramesh",
                    "lines": [
                        {"account": "cash", "debit": 200, "credit": 0},
                        {"account": "sales", "debit": 0, "credit": 200},
                    ],
                },
                stock_hint={"product_name": "Parle-G", "change": -20, "reason": "sale"},
            ),
            ex(
                "Voice: સુરેશ પાસેથી પાંચસો રૂપિયા ઉધાર વસૂલ્યા",
                input_type="voice",
                detected_language="gu",
                intent="record_receipt",
                command="receipt",
                confidence=0.9,
                entities={"party_name": "Suresh", "amount": 500, "payment_mode": "cash"},
                journal_hint={
                    "entry_type": "receipt",
                    "lines": [
                        {"account": "cash", "debit": 500, "credit": 0},
                        {"account": "debtor:Suresh", "debit": 0, "credit": 500},
                    ],
                },
            ),
            ex(
                "Voice noisy: uhmm oil... do litre... meena... upi",
                input_type="voice",
                detected_language="hinglish",
                intent="record_sale",
                command="sale",
                confidence=0.62,
                entities={
                    "party_name": "Meena",
                    "product_name": "Oil 1L",
                    "quantity": 2,
                    "payment_mode": "upi",
                    "unit_price": None,
                    "amount": None,
                    "missing": ["unit_price"],
                },
                notes="ask price before confirm",
            ),
            ex(
                "Ramesh 500",
                detected_language="en",
                intent="unknown",
                command="needs_clarification",
                confidence=0.4,
                entities={"party_name": "Ramesh", "amount": 500, "missing": ["intent"]},
                notes="could be receipt or sale — ask",
            ),
            ex(
                "10 Maggi",
                detected_language="en",
                intent="unknown",
                command="needs_clarification",
                confidence=0.35,
                entities={
                    "product_name": "Maggi",
                    "quantity": 10,
                    "missing": ["party_name", "intent"],
                },
            ),
            ex(
                "Sale to new customer Mohan soap 3 @30 cash",
                detected_language="en",
                intent="record_sale",
                command="sale",
                confidence=0.9,
                entities={
                    "party_name": "Mohan",
                    "create_party_if_missing": True,
                    "party_type": "customer",
                    "product_name": "Soap",
                    "quantity": 3,
                    "unit_price": 30,
                    "amount": 90,
                    "payment_mode": "cash",
                },
                journal_hint={
                    "entry_type": "sale",
                    "lines": [
                        {"account": "cash", "debit": 90, "credit": 0},
                        {"account": "sales", "debit": 0, "credit": 90},
                    ],
                },
                stock_hint={"product_name": "Soap", "change": -3, "reason": "sale"},
            ),
            ex(
                "Supplier new: Krishna Foods — bought tea 10kg @200 credit",
                detected_language="en",
                intent="record_purchase",
                command="purchase",
                confidence=0.91,
                entities={
                    "party_name": "Krishna Foods",
                    "create_party_if_missing": True,
                    "party_type": "supplier",
                    "product_name": "Tea",
                    "quantity": 10,
                    "unit_price": 200,
                    "amount": 2000,
                    "payment_mode": "credit",
                },
                stock_hint={"product_name": "Tea", "change": 10, "reason": "purchase"},
            ),
            ex(
                "CSV row: product=Salt,stock=100,price=20,category=grocery",
                input_type="csv",
                detected_language="en",
                intent="add_stock",
                command="bulk_upload",
                confidence=0.95,
                entities={
                    "product_name": "Salt",
                    "quantity": 100,
                    "unit_price": 20,
                    "category": "grocery",
                },
                stock_hint={"product_name": "Salt", "change": 100, "reason": "bulk_upload"},
            ),
        ]
    )

    # Templated multilingual volume for fine-tuning
    products = [
        ("Maggi", 12),
        ("Parle-G", 10),
        ("Soap", 30),
        ("Tea", 250),
        ("Dal", 120),
        ("Salt", 20),
        ("Sugar", 45),
        ("Oil 1L", 140),
        ("Rice 1kg", 60),
        ("Bread", 35),
    ]
    customers = ["Ramesh", "Suresh", "Meena", "Kiran", "Amit", "Priya", "Jaya", "Raju"]
    suppliers = ["Wholesale Mart", "Patel Traders", "Shree Distributors", "Dairy Co", "Local Mill"]
    mode_words = ["cash", "udhaar", "UPI"]
    mode_map = {"cash": "cash", "udhaar": "credit", "UPI": "upi"}

    sale_tmpls = [
        ("en", "Sold {qty} {product} to {party} @ {rate} {mode}"),
        ("hi", "{party} को {qty} {product} बेचा @{rate} {mode}"),
        ("gu", "{party} ne {qty} {product} vechyu @{rate} {mode}"),
        ("hinglish", "{party} ko {qty} {product} becha @{rate} {mode}"),
    ]
    for i in range(40):
        party = customers[i % len(customers)]
        product, rate = products[i % len(products)]
        lang, tmpl = sale_tmpls[i % len(sale_tmpls)]
        mode_word = mode_words[i % 3]
        qty = 1 + (i % 5)
        text = tmpl.format(qty=qty, product=product, party=party, rate=rate, mode=mode_word)
        rows.append(sale(party, product, qty, rate, mode_map[mode_word], lang, text, conf=0.9))

    purchase_tmpls = [
        ("en", "Bought {qty} {product} from {party} @ {rate} {mode}"),
        ("hi", "{party} से {qty} {product} खरीदा @{rate} {mode}"),
        ("hinglish", "{party} se {qty} {product} kharida @{rate} {mode}"),
        ("gu", "{party} pase thi {qty} {product} kharidyu @{rate} {mode}"),
    ]
    for i in range(40):
        party = suppliers[i % len(suppliers)]
        product, rate = products[i % len(products)]
        cost = max(1, rate - 5)
        lang, tmpl = purchase_tmpls[i % len(purchase_tmpls)]
        mode_word = mode_words[i % 3]
        qty = 5 + (i % 10)
        text = tmpl.format(qty=qty, product=product, party=party, rate=cost, mode=mode_word)
        rows.append(purchase(party, product, qty, cost, mode_map[mode_word], lang, text, conf=0.9))

    receipt_tmpls = [
        ("en", "{party} paid {amount} {mode} against udhaar"),
        ("hi", "{party} ने {amount} {mode} उधार चुकाया"),
        ("hinglish", "{party} ne {amount} {mode} diya udhaar ka"),
        ("gu", "{party} pase thi {amount} {mode} udhaar milya"),
    ]
    for i in range(40):
        party = customers[i % len(customers)]
        amount = 100 + (i * 50) % 900
        lang, tmpl = receipt_tmpls[i % len(receipt_tmpls)]
        mode_word = ["cash", "UPI"][i % 2]
        text = tmpl.format(party=party, amount=amount, mode=mode_word)
        rows.append(receipt(party, amount, mode_map.get(mode_word, "upi"), lang, text, conf=0.92))

    payment_tmpls = [
        ("en", "Paid {party} {amount} {mode}"),
        ("hi", "{party} को {amount} {mode} दिए"),
        ("hinglish", "{party} ko {amount} {mode} payment"),
        ("gu", "{party} ne {amount} {mode} chukavya"),
    ]
    for i in range(30):
        party = suppliers[i % len(suppliers)]
        amount = 500 + (i * 250) % 4000
        lang, tmpl = payment_tmpls[i % len(payment_tmpls)]
        mode_word = ["cash", "UPI"][i % 2]
        text = tmpl.format(party=party, amount=amount, mode=mode_word)
        rows.append(payment(party, amount, mode_map.get(mode_word, "upi"), lang, text, conf=0.92))

    for i, party in enumerate(customers * 3):
        lang = ["en", "hi", "gu", "hinglish"][i % 4]
        texts = {
            "en": f"What is balance of {party}?",
            "hi": f"{party} का बकाया कितना है?",
            "gu": f"{party} nu baaki ketlu?",
            "hinglish": f"{party} ka kitna udhaar hai?",
        }
        rows.append(
            ex(
                texts[lang],
                detected_language=lang,
                intent="party_balance",
                command="party_balance",
                confidence=0.95,
                entities={"party_name": party, "rpc": "fn_party_ledger"},
            )
        )

    for i, product in enumerate([p[0] for p in products] * 2):
        lang = ["en", "hi", "gu", "hinglish"][i % 4]
        texts = {
            "en": f"Stock of {product}?",
            "hi": f"{product} का स्टॉक कितना है?",
            "gu": f"{product} no stock ketlo?",
            "hinglish": f"{product} kitna stock hai?",
        }
        rows.append(
            ex(
                texts[lang],
                detected_language=lang,
                intent="stock_query",
                command="stock_query",
                confidence=0.95,
                entities={"product_name": product},
            )
        )

    return rows


def main() -> None:
    rows = build()
    out_all = OUT / "whatsapp_extractions.jsonl"
    out_train = OUT / "train.jsonl"
    out_val = OUT / "val.jsonl"
    intent_path = OUT / "intents.jsonl"
    sft_path = OUT / "sft_extractions.jsonl"

    with out_all.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    split = int(len(rows) * 0.9)
    with out_train.open("w", encoding="utf-8") as f:
        for r in rows[:split]:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with out_val.open("w", encoding="utf-8") as f:
        for r in rows[split:]:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    with intent_path.open("w", encoding="utf-8") as f:
        for r in rows:
            user = json.loads(r["messages"][1]["content"])
            asst = json.loads(r["messages"][2]["content"])
            f.write(
                json.dumps(
                    {
                        "text": user["raw_input"],
                        "input_type": user["input_type"],
                        "language": asst["detected_language"],
                        "intent": asst["intent"],
                        "command": asst["command"],
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )

    with sft_path.open("w", encoding="utf-8") as f:
        for r in rows:
            user = json.loads(r["messages"][1]["content"])
            asst = json.loads(r["messages"][2]["content"])
            f.write(
                json.dumps(
                    {
                        "instruction": "Extract bookkeeping intent and entities for LedgerBot.",
                        "input": user["raw_input"],
                        "input_type": user["input_type"],
                        "output": {
                            "intent": asst["intent"],
                            "command": asst["command"],
                            "detected_language": asst["detected_language"],
                            "confidence_score": asst["confidence_score"],
                            "entities": asst["entities"],
                            "journal_hint": asst["journal_hint"],
                            "stock_hint": asst["stock_hint"],
                        },
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )

    print(f"Wrote {len(rows)} examples")
    for p in (out_all, out_train, out_val, intent_path, sft_path):
        print(f"  {p.name}: {sum(1 for _ in p.open())} lines")


if __name__ == "__main__":
    main()
