const { buildGujaratiExtractionHint } = require('../utils/gujaratiNormalize');

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const EXTRACTION_MODEL = 'llama-3.3-70b-versatile';
const WHISPER_MODEL = 'whisper-large-v3';

/**
 * Extraction Agent — tuned for Gujarati script + romanized Gujarati + Hinglish.
 */
const EXTRACTION_SYSTEM_PROMPT = `You are the extraction engine for LedgerBot, a WhatsApp double-entry bookkeeping assistant for small Indian businesses (kirana stores, retailers, manufacturers) in Gujarat and India.

Your ONLY job is to classify the user's intent and extract fields that are EXPLICITLY stated in the message. Output JSON only — no markdown fences, no commentary, no prose before or after the JSON.

STRICT RULES:
- NEVER calculate, sum, subtract, or invent totals — if a total is not written, set total_amount to null.
- NEVER invent party names, products, amounts, dates, quantities, or payment splits that were not stated.
- NEVER guess missing fields — use null.
- NEVER do arithmetic. If the user says "400 cash 100 ramesh udhaar" extract those payment lines as stated; do not derive a total unless they also stated one.
- Do NOT format a human confirmation message — extraction only.
- KEEP party names and product names as the user wrote them (Gujarati/Hindi/English). Do not translate proper names.
- Numbers written in Gujarati/Hindi words should be converted to digits when clear. If unclear, null.

Classify intent as exactly one of:
- "transaction" — a sale, purchase, payment, receipt, or expense involving money and/or credit (udhaar)
- "inventory_bulk" — bulk stock / product catalog update (multiple items or stock sheet)
- "statement_query" — request for a report/statement (P&L, balance sheet, ledger, cash, party udhaar, etc.)
- "unclear" — you cannot confidently extract without guessing

JSON schema (always return all top-level keys):
{
  "intent": "transaction" | "inventory_bulk" | "statement_query" | "unclear",
  "transaction_type": "sale" | "purchase" | "payment" | "receipt" | "expense" | null,
  "items": [
    {
      "name": string | null,
      "quantity": number | null,
      "unit": string | null,
      "unit_price": number | null,
      "line_amount": number | null
    }
  ],
  "party": {
    "name": string | null,
    "role": "customer" | "supplier" | null
  },
  "payments": [
    {
      "method": "cash" | "udhaar" | "bank" | "upi" | string | null,
      "amount": number | null,
      "party_name": string | null
    }
  ],
  "total_amount": number | null,
  "date": string | null,
  "currency": "INR",
  "product_updates": [
    {
      "name": string | null,
      "stock": number | null,
      "price": number | null,
      "category": string | null
    }
  ],
  "statement": {
    "type": string | null,
    "period": string | null
  },
  "confidence": number | null,
  "notes": string | null,
  "unclear_reason": string | null
}

Set "confidence" between 0 and 1 for how sure you are about the whole extraction.
If confidence < 0.55, prefer intent "unclear" with a short unclear_reason.

=== GUJARATI / HINGLISH BOOKKEEPING LEXICON (map meaning; do not invent) ===

Gujarati script:
- કેશ (kesh) → cash
- ઉધાર (udhaar) → udhaar (credit)
- વેચ્યું / વેચ્યા → sale
- ખરીદ્યું / ખરીદ્યા → purchase
- મળ્યા / મળ્યું → receipt
- ચૂકવ્યા → payment
- ખર્ચ → expense
- બાકી → statement_query (balance)
- સ્ટોક → stock
- કિલો → kg
- લીટર → litre
- રૂપિયા → INR

Romanized Gujarati (very common on WhatsApp):
- vechyu / vechya → sale
- kharidyu / kharidya → purchase
- milya / milyu → receipt
- chukavya → payment
- bharyu (with udhaar) → receipt / settling credit
- pase thi → from (supplier/customer source)
- baaki ketlu / baaki → statement_query balance
- stock ketlo → statement_query type stock
- UPI / upi → payment method upi
- udhaar / udhar → payment method udhaar

Hinglish:
- becha / beche / diya (sale context) → sale
- kharida → purchase
- vasool / collection → receipt
- kitna udhaar / pending → statement_query
- nakad → cash

English / mixed:
- "udhaar" / "credit" → payment method udhaar with the named party
- "cash" → payment method cash
- "/ai-order" style sale lines: qty + unit + product + cash/udhaar splits
- "/ai-payment" usually settling udhaar (payment/receipt), not a new sale
- "/ai-report" → statement_query
- "/ai-stock" / "/ai-stock-bulk" → inventory_bulk when about stock levels

Party role hints:
- sale / receipt / customer udhaar → party.role = "customer"
- purchase / payment to supplier → party.role = "supplier"

If the message is ambiguous, set intent to "unclear" and explain in unclear_reason.`;

const EXTRACTION_FEW_SHOTS = [
  {
    user:
      'Language: gu\nMessage: ' +
      '\u0a95\u0abf\u0ab0\u0aa3\u0aa8\u0ac7 4 \u0ab6\u0ac1\u0a97\u0ab0 \u0ab5\u0ac7\u0a9a\u0acd\u0aaf\u0ac1\u0a82 \u0a95\u0ac7\u0ab6 @45\n' +
      'Normalized hint: Kiran ne 4 sugar sold cash @45',
    assistant: {
      intent: 'transaction',
      transaction_type: 'sale',
      items: [
        {
          name: '\u0ab6\u0ac1\u0a97\u0ab0',
          quantity: 4,
          unit: 'kg',
          unit_price: 45,
          line_amount: null,
        },
      ],
      party: { name: '\u0a95\u0abf\u0ab0\u0aa3', role: 'customer' },
      payments: [{ method: 'cash', amount: null, party_name: '\u0a95\u0abf\u0ab0\u0aa3' }],
      total_amount: null,
      date: null,
      currency: 'INR',
      product_updates: [],
      statement: { type: null, period: null },
      confidence: 0.93,
      notes: null,
      unclear_reason: null,
    },
  },
  {
    user: 'Language: gu\nMessage: Meena e 420 UPI thi udhaar bharyu\nNormalized hint: Meena e 420 UPI thi udhaar paid/settled',
    assistant: {
      intent: 'transaction',
      transaction_type: 'receipt',
      items: [],
      party: { name: 'Meena', role: 'customer' },
      payments: [{ method: 'upi', amount: 420, party_name: 'Meena' }],
      total_amount: 420,
      date: null,
      currency: 'INR',
      product_updates: [],
      statement: { type: null, period: null },
      confidence: 0.94,
      notes: 'Settling prior udhaar',
      unclear_reason: null,
    },
  },
  {
    user: 'Language: gu\nMessage: Patel Traders pase thi sugar 30 kilo udhaar @38\nNormalized hint: Patel Traders from sugar 30 kg udhaar @38',
    assistant: {
      intent: 'transaction',
      transaction_type: 'purchase',
      items: [
        { name: 'sugar', quantity: 30, unit: 'kg', unit_price: 38, line_amount: null },
      ],
      party: { name: 'Patel Traders', role: 'supplier' },
      payments: [{ method: 'udhaar', amount: null, party_name: 'Patel Traders' }],
      total_amount: null,
      date: null,
      currency: 'INR',
      product_updates: [],
      statement: { type: null, period: null },
      confidence: 0.92,
      notes: null,
      unclear_reason: null,
    },
  },
  {
    user:
      'Language: gu\nMessage: ' +
      '\u0a95\u0abf\u0ab0\u0aa3\u0aa8\u0ac1\u0a82 \u0aac\u0abe\u0a95\u0ac0 \u0a95\u0ac7\u0a9f\u0ab2\u0ac1\u0a82?\n' +
      'Normalized hint: Kiran nu balance how much?',
    assistant: {
      intent: 'statement_query',
      transaction_type: null,
      items: [],
      party: { name: '\u0a95\u0abf\u0ab0\u0aa3', role: 'customer' },
      payments: [],
      total_amount: null,
      date: null,
      currency: 'INR',
      product_updates: [],
      statement: { type: 'party_ledger', period: null },
      confidence: 0.96,
      notes: null,
      unclear_reason: null,
    },
  },
  {
    user: 'Language: hinglish\nMessage: Ramesh ko 10 Maggi becha udhaar @12',
    assistant: {
      intent: 'transaction',
      transaction_type: 'sale',
      items: [
        { name: 'Maggi', quantity: 10, unit: null, unit_price: 12, line_amount: null },
      ],
      party: { name: 'Ramesh', role: 'customer' },
      payments: [{ method: 'udhaar', amount: null, party_name: 'Ramesh' }],
      total_amount: null,
      date: null,
      currency: 'INR',
      product_updates: [],
      statement: { type: null, period: null },
      confidence: 0.95,
      notes: null,
      unclear_reason: null,
    },
  },
  {
    user: 'Language: en\nMessage: 5kg sugar 400 cash 100 ramesh udhaar',
    assistant: {
      intent: 'transaction',
      transaction_type: 'sale',
      items: [
        { name: 'sugar', quantity: 5, unit: 'kg', unit_price: null, line_amount: null },
      ],
      party: { name: 'ramesh', role: 'customer' },
      payments: [
        { method: 'cash', amount: 400, party_name: null },
        { method: 'udhaar', amount: 100, party_name: 'ramesh' },
      ],
      total_amount: null,
      date: null,
      currency: 'INR',
      product_updates: [],
      statement: { type: null, period: null },
      confidence: 0.9,
      notes: null,
      unclear_reason: null,
    },
  },
];

function getApiKey() {
  return (process.env.GROQ_API_KEY || '').trim();
}

async function chatCompletion({ messages, model, temperature = 0 }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set');
  }

  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, temperature }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message || `Groq chat failed (${res.status})`);
  }

  return body.choices?.[0]?.message?.content?.trim() || '';
}

async function generateAiResponse(userMessage, language = 'en') {
  if (!getApiKey()) {
    return `Echo: ${userMessage}`;
  }

  const langNote =
    language === 'gu'
      ? 'Reply in simple Gujarati (or Gujarati+English mix) unless the user wrote only English.'
      : language === 'hi'
        ? 'Reply in simple Hindi (or Hinglish) unless the user wrote only English.'
        : language === 'hinglish'
          ? 'Reply in short Hinglish.'
          : 'Reply in short clear English.';

  try {
    const content = await chatCompletion({
      model: 'llama-3.1-8b-instant',
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'You are LedgerBot, a helpful and concise AI assistant on WhatsApp for small business owners in Gujarat/India. Keep responses short and clear. If the user seems to want to record a sale, payment, stock, or report, remind them to use /ai-order, /ai-stock, /ai-payment, or /ai-report. ' +
            langNote,
        },
        { role: 'user', content: userMessage },
      ],
    });
    return content || 'Sorry, I could not generate a reply.';
  } catch (err) {
    console.error('[groq] generateAiResponse error:', err.message);
    return 'Sorry, I encountered an error processing your message.';
  }
}

function stripJsonFences(text) {
  if (!text) return text;
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function buildExtractionUserMessage(rawText, detectedLanguage) {
  const lang = detectedLanguage || 'en';
  const parts = [`Language: ${lang}`, `Message: ${rawText}`];

  if (lang === 'gu' || lang === 'hinglish' || lang === 'hi') {
    const hint = buildGujaratiExtractionHint(rawText);
    if (hint) parts.push(`Normalized hint: ${hint}`);
    if (lang === 'gu') {
      parts.push(
        'Instruction: Message is Gujarati (script and/or romanized). ' +
          'Map kesh/\u0a95\u0ac7\u0ab6\to cash, udhaar/\u0a89\u0aa7\u0abe\u0ab0\to udhaar, ' +
          'vechyu/\u0ab5\u0ac7\u0a9a\u0acd\u0aaf\u0ac1\u0a82\to sale, ' +
          'kharidyu\to purchase, milya\to receipt, chukavya\to payment. Keep names as written.'
      );
    }
  }

  return parts.join('\n');
}

async function extractIntent(rawText, options = {}) {
  const detectedLanguage = options.detectedLanguage || 'en';

  const messages = [{ role: 'system', content: EXTRACTION_SYSTEM_PROMPT }];

  for (const shot of EXTRACTION_FEW_SHOTS) {
    messages.push({ role: 'user', content: shot.user });
    messages.push({
      role: 'assistant',
      content: JSON.stringify(shot.assistant),
    });
  }

  messages.push({
    role: 'user',
    content: buildExtractionUserMessage(rawText, detectedLanguage),
  });

  const content = await chatCompletion({
    model: EXTRACTION_MODEL,
    temperature: 0,
    messages,
  });

  const cleaned = stripJsonFences(content);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    const err2 = new Error(`Invalid JSON from Groq: ${err.message}`);
    err2.raw = content;
    throw err2;
  }

  if (
    parsed &&
    typeof parsed.confidence === 'number' &&
    parsed.confidence < 0.55 &&
    parsed.intent !== 'unclear'
  ) {
    parsed.unclear_reason =
      parsed.unclear_reason ||
      `Low confidence (${parsed.confidence}) — please rephrase`;
    parsed.intent = 'unclear';
  }

  return parsed;
}

async function transcribeAudio(audioBuffer, mimeType = 'audio/ogg', options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set');
  }

  const ext = mimeType.includes('mp4')
    ? 'mp4'
    : mimeType.includes('mpeg')
      ? 'mp3'
      : mimeType.includes('wav')
        ? 'wav'
        : 'ogg';

  const form = new FormData();
  form.append(
    'file',
    new Blob([audioBuffer], { type: mimeType || 'audio/ogg' }),
    `audio.${ext}`
  );
  form.append('model', WHISPER_MODEL);
  form.append('response_format', 'text');

  const lang = String(options.language || '')
    .trim()
    .toLowerCase();

  if (lang === 'gu') {
    form.append('language', 'gu');
    form.append(
      'prompt',
      '\u0a86 \u0a91\u0aa1\u0abf\u0a93 \u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0 \u0aad\u0abe\u0ab7\u0abe\u0aae\u0abe\u0a82 \u0a9b\u0ac7. ' +
        '\u0a95\u0abf\u0ab0\u0abe\u0aa3\u0abe \u0aa6\u0ac1\u0a95\u0abe\u0aa8\u0aa8\u0abe \u0ab5\u0ac7\u0a9a\u0abe\u0aa3, \u0a89\u0aa7\u0abe\u0ab0, \u0a95\u0ac7\u0ab6, UPI, \u0a96\u0ab0\u0ac0\u0aa6\u0ac0 \u0ab5\u0abf\u0ab6\u0ac7 \u0ab5\u0abe\u0aa4 \u0aa5\u0abe\u0aaf \u0a9b\u0ac7.'
    );
  } else if (lang === 'hi') {
    form.append('language', 'hi');
    form.append(
      'prompt',
      '\u092f\u0939 \u0911\u0921\u093f\u092f\u094b \u0939\u093f\u0902\u0926\u0940 \u092e\u0947\u0902 \u0939\u0948\u0964 \u0915\u093f\u0930\u093e\u0928\u093e \u0926\u0941\u0915\u093e\u0928 \u0915\u0940 \u092c\u093f\u0915\u094d\u0930\u0940, \u0909\u0927\u093e\u0930, \u0915\u0948\u0936, UPI \u0915\u0947 \u092c\u093e\u0930\u0947 \u092e\u0947\u0902 \u092c\u093e\u0924 \u0939\u094b \u0938\u0915\u0924\u0940 \u0939\u0948\u0964'
    );
  } else {
    form.append(
      'prompt',
      '\u0a86 \u0a91\u0aa1\u0abf\u0a93 \u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0 \u0a85\u0aa5\u0ab5\u0abe \u0ab9\u0abf\u0aa8\u0acd\u0aa6\u0ac0 \u0a85\u0aa5\u0ab5\u0abe \u0a85\u0a82\u0a97\u0acd\u0ab0\u0ac7\u0a9c\u0ac0\u0aae\u0abe\u0a82 \u0ab9\u0acb\u0a88 \u0ab6\u0a95\u0ac7. Kirana sale udhaar cash UPI purchase.'
    );
  }

  const res = await fetch(GROQ_TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const text = (await res.text()).trim();
  if (!res.ok) {
    throw new Error(text || `Whisper failed (${res.status})`);
  }

  return text;
}

async function ocrImageText(imageBuffer, mimeType = 'image/jpeg', options = {}) {
  const imageB64 = Buffer.from(imageBuffer).toString('base64');
  const dataUrl = `data:${mimeType};base64,${imageB64}`;
  const lang = String(options.language || 'gu').toLowerCase();

  const langLine =
    lang === 'gu'
      ? 'Prefer Gujarati script; also keep Hindi/English if present.'
      : 'Text may be Gujarati, Hindi, or English.';

  return chatCompletion({
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          {
            type: 'text',
            text:
              `${langLine} ` +
              'This image may contain handwritten chits, invoices, or stock sheets. ' +
              'Extract ALL text exactly as it appears, preserving Unicode Gujarati characters. ' +
              'Do not translate. Do not summarize. ' +
              'Output ONLY the extracted text. If no text is found, say exactly: No text found.',
          },
        ],
      },
    ],
  });
}

async function analyzeImage(imageBuffer, caption = '', mimeType = 'image/jpeg') {
  const imageB64 = Buffer.from(imageBuffer).toString('base64');
  const dataUrl = `data:${mimeType};base64,${imageB64}`;
  const prompt = caption || 'Describe this image in detail.';

  const content = await chatCompletion({
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  return `🖼️ ${content}`;
}

async function summarizeDocument(fileTypeLabel, displayText) {
  try {
    return await chatCompletion({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content:
            'You are a document analyst. Summarize the key information from this document in 3-5 bullet points. Preserve Gujarati/Hindi names and amounts.',
        },
        {
          role: 'user',
          content: `Summarize this ${fileTypeLabel} document:\n\n${displayText}`,
        },
      ],
    });
  } catch (_) {
    return '(Summary unavailable)';
  }
}

module.exports = {
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_FEW_SHOTS,
  extractIntent,
  transcribeAudio,
  generateAiResponse,
  ocrImageText,
  analyzeImage,
  summarizeDocument,
  buildExtractionUserMessage,
};
