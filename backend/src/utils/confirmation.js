/**
 * Build a plain-language WhatsApp confirmation from extracted JSON.
 * Deterministic — no second LLM call. Supports Gujarati / Hindi / Hinglish.
 */

function buildConfirmationSummary(parsed, command, language = 'en') {
  const lang = normalizeLang(language);
  if (!parsed || typeof parsed !== 'object') {
    return t(lang, 'parse_fail');
  }

  if (parsed.intent === 'unclear') {
    const reason = parsed.unclear_reason
      ? ` (${parsed.unclear_reason})`
      : '';
    return t(lang, 'unclear', { reason });
  }

  if (parsed.intent === 'statement_query') {
    const type = parsed.statement?.type || 'statement';
    const period = parsed.statement?.period || t(lang, 'period_default');
    const party = parsed.party?.name ? ` — ${parsed.party.name}` : '';
    return t(lang, 'statement', { type, period, party });
  }

  if (parsed.intent === 'inventory_bulk') {
    const updates = Array.isArray(parsed.product_updates)
      ? parsed.product_updates.filter((p) => p?.name)
      : [];
    if (updates.length === 0) {
      return t(lang, 'inventory_empty');
    }
    const lines = updates
      .slice(0, 8)
      .map((p) => {
        const bits = [p.name];
        if (p.stock != null) bits.push(`stock ${p.stock}`);
        if (p.price != null) bits.push(`₹${p.price}`);
        return bits.join(', ');
      })
      .join('; ');
    const more =
      updates.length > 8 ? ` (+${updates.length - 8} more)` : '';
    return t(lang, 'inventory', { lines: `${lines}${more}` });
  }

  const typeLabel = formatTxnType(parsed.transaction_type, command, lang);
  const itemParts = (parsed.items || [])
    .filter((i) => i?.name)
    .map((i) => {
      const qty =
        i.quantity != null
          ? `${i.quantity}${i.unit ? i.unit : ''}`
          : null;
      // Show Gujarati original too: Sugar (ખાંડ)
      let label = i.name;
      if (
        i.name_original &&
        String(i.name_original).toLowerCase() !== String(i.name).toLowerCase()
      ) {
        label = `${i.name} (${i.name_original})`;
      }
      return [qty, label].filter(Boolean).join(' ');
    });

  const paymentParts = (parsed.payments || [])
    .filter((p) => p && (p.amount != null || p.method))
    .map((p) => {
      const amt = p.amount != null ? `₹${p.amount}` : null;
      const method = p.method || 'payment';
      const party = p.party_name || parsed.party?.name;
      if (String(method).toLowerCase() === 'udhaar' && party) {
        return [amt, t(lang, 'credit_to'), party].filter(Boolean).join(' ');
      }
      return [amt, method].filter(Boolean).join(' ');
    });

  const chunks = [];
  if (itemParts.length) {
    chunks.push(
      `${typeLabel} ${t(lang, 'of')} ${itemParts.join(', ')}${
        parsed.total_amount != null ? `, ₹${parsed.total_amount} total` : ''
      }`
    );
  } else if (parsed.total_amount != null) {
    chunks.push(`${typeLabel} ₹${parsed.total_amount}`);
  } else {
    chunks.push(typeLabel);
  }

  if (paymentParts.length) {
    chunks.push(paymentParts.join(' + '));
  } else if (parsed.party?.name) {
    chunks.push(`${t(lang, 'party')} ${parsed.party.name}`);
  }

  return t(lang, 'got_it', { body: chunks.join(', ') });
}

function normalizeLang(language) {
  const l = String(language || 'en').toLowerCase();
  if (l === 'gu' || l === 'hi' || l === 'hinglish') return l;
  return 'en';
}

function t(lang, key, vars = {}) {
  const table = STRINGS[lang] || STRINGS.en;
  const en = STRINGS.en;
  let s = table[key] || en[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(v == null ? '' : String(v));
  }
  return s;
}

const STRINGS = {
  en: {
    parse_fail: 'I could not understand that. Please rephrase and try again.',
    unclear:
      'I could not clearly understand that{reason}. Please rephrase using /ai-order, /ai-stock, /ai-payment, or /ai-report.',
    period_default: 'the requested period',
    statement:
      'Got it: {type} for {period}{party}. Reply YES to confirm or NO to cancel.',
    inventory_empty:
      'Got it: inventory update. Reply YES to confirm or NO to cancel.',
    inventory:
      'Got it: stock update — {lines}. Reply YES to confirm or NO to cancel.',
    credit_to: 'credit to',
    of: 'of',
    party: 'party',
    got_it: 'Got it: {body}. Reply YES to confirm or NO to cancel.',
    sale: 'Sale',
    purchase: 'Purchase',
    payment: 'Payment',
    receipt: 'Receipt',
    expense: 'Expense',
    entry: 'Entry',
  },
  gu: {
    parse_fail: "સમજાયું નહીં. કૃપા કરીને ફરી લખો.",
    unclear: "સ્પષ્ટ સમજાયું નહીં{reason}. /ai-order, /ai-stock, /ai-payment અથવા /ai-report વાપરીને ફરી લખો.",
    period_default: "માગેલ સમય",
    statement: "સમજાયું: {type} — {period}{party}. કન્ફર્મ માટે હા, રદ માટે ના લખો.",
    inventory_empty: "સમજાયું: સ્ટોક અપડેટ. કન્ફર્મ માટે હા, રદ માટે ના લખો.",
    inventory: "સમજાયું: સ્ટોક અપડેટ — {lines}. કન્ફર્મ માટે હા, રદ માટે ના લખો.",
    credit_to: "ઉધાર",
    of: "—",
    party: "પાર્ટી",
    got_it: "સમજાયું: {body}. કન્ફર્મ માટે હા, રદ માટે ના લખો.",
    sale: "વેચાણ",
    purchase: "ખરીદી",
    payment: "ચુકવણી",
    receipt: "વસૂલાત",
    expense: "ખર્ચ",
    entry: "એન્ટ્રી",
  },
  hi: {
    parse_fail: "समझ नहीं आया। कृपया दोबारा लिखें।",
    unclear: "स्पष्ट नहीं समझा{reason}. /ai-order, /ai-stock, /ai-payment या /ai-report से फिर लिखें।",
    period_default: "माँगी गई अवधि",
    statement: "समझ गया: {type} — {period}{party}. कन्फर्म के लिए हाँ, रद्द के लिए ना लिखें।",
    inventory_empty: "समझ गया: स्टॉक अपडेट. कन्फर्म के लिए हाँ, रद्द के लिए ना लिखें।",
    inventory: "समझ गया: स्टॉक अपडेट — {lines}. कन्फर्म के लिए हाँ, रद्द के लिए ना लिखें।",
    credit_to: "उधार",
    of: "—",
    party: "पार्टी",
    got_it: "समझ गया: {body}. कन्फर्म के लिए हाँ, रद्द के लिए ना लिखें।",
    sale: "बिक्री",
    purchase: "खरीद",
    payment: "भुगतान",
    receipt: "वसूली",
    expense: "खर्च",
    entry: "एंट्री",
  },
  hinglish: {
    parse_fail: 'Samajh nahi aaya. Please dubara likho.',
    unclear:
      'Clear nahi samjha{reason}. /ai-order, /ai-stock, /ai-payment ya /ai-report se dubara likho.',
    period_default: 'requested period',
    statement:
      'Samajh gaya: {type} — {period}{party}. Confirm ke liye HAAN, cancel ke liye NA likho.',
    inventory_empty:
      'Samajh gaya: stock update. Confirm ke liye HAAN, cancel ke liye NA likho.',
    inventory:
      'Samajh gaya: stock update — {lines}. Confirm ke liye HAAN, cancel ke liye NA likho.',
    credit_to: 'udhaar',
    of: 'of',
    party: 'party',
    got_it:
      'Samajh gaya: {body}. Confirm ke liye HAAN, cancel ke liye NA likho.',
    sale: 'Sale',
    purchase: 'Purchase',
    payment: 'Payment',
    receipt: 'Receipt',
    expense: 'Expense',
    entry: 'Entry',
  },
};

function formatTxnType(transactionType, command, lang = 'en') {
  if (transactionType === 'sale') return t(lang, 'sale');
  if (transactionType === 'purchase') return t(lang, 'purchase');
  if (transactionType === 'payment') return t(lang, 'payment');
  if (transactionType === 'receipt') return t(lang, 'receipt');
  if (transactionType === 'expense') return t(lang, 'expense');
  if (command === '/ai-payment') return t(lang, 'payment');
  if (command === '/ai-order') return t(lang, 'sale');
  return t(lang, 'entry');
}

module.exports = { buildConfirmationSummary };
