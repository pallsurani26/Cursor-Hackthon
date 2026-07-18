/**
 * Offline smoke tests for Gujarati accuracy helpers (no Groq key required).
 * Optional live extract if GROQ_API_KEY is set.
 *
 *   node scripts/smoke-gujarati.js
 */
try {
  require('dotenv').config({
    path: require('path').join(__dirname, '..', '.env'),
  });
  require('dotenv').config({
    path: require('path').join(__dirname, '..', '..', '.env'),
    override: false,
  });
} catch (_) {
  // dotenv optional for offline helper tests
}

const assert = require('assert');
const { detectLanguage, resolveLanguage } = require('../src/utils/language');
const {
  buildGujaratiExtractionHint,
} = require('../src/utils/gujaratiNormalize');
const { buildConfirmationSummary } = require('../src/utils/confirmation');
const { parseConfirmationReply } = require('../src/utils/confirmReply');
const {
  buildExtractionUserMessage,
  extractIntent,
} = require('../src/services/groq');
const {
  resolveProductName,
  enrichParsedWithGujaratiProducts,
} = require('../src/utils/gujaratiProducts');

function check(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

check('detect Gujarati script', () => {
  assert.strictEqual(
    detectLanguage("કિરણને 4 શુગર વેચ્યું કેશ @45"),
    'gu'
  );
});

check('detect romanized Gujarati', () => {
  assert.strictEqual(
    detectLanguage('Meena e 420 UPI thi udhaar bharyu'),
    'gu'
  );
  assert.strictEqual(
    detectLanguage('Patel Traders pase thi sugar 30 kilo udhaar @38'),
    'gu'
  );
});

check('detect hinglish', () => {
  assert.strictEqual(
    detectLanguage('Ramesh ko 10 Maggi becha udhaar @12'),
    'hinglish'
  );
});

check('preferred_language fallback', () => {
  assert.strictEqual(resolveLanguage('hello', 'gu'), 'gu');
});

check('normalize Gujarati sale cue', () => {
  const hint = buildGujaratiExtractionHint("કિરણને 4 શુગર વેચ્યું કેશ @45");
  assert.ok(/sold/i.test(hint), hint);
  assert.ok(/cash/i.test(hint), hint);
});

check('confirmation in Gujarati', () => {
  const msg = buildConfirmationSummary(
    {
      intent: 'transaction',
      transaction_type: 'sale',
      items: [{ name: "શુગર", quantity: 4 }],
      payments: [{ method: 'cash' }],
      party: { name: "કિરણ" },
    },
    '/ai-order',
    'gu'
  );
  assert.ok(msg.includes("સમજાયું"), msg);
  assert.ok(msg.includes("હા"), msg);
});

check('confirm replies haa / naa', () => {
  assert.strictEqual(parseConfirmationReply("હા"), 'yes');
  assert.strictEqual(parseConfirmationReply("ના"), 'no');
  assert.strictEqual(parseConfirmationReply('haan'), 'yes');
  assert.strictEqual(parseConfirmationReply('na rad karo'), 'no');
});

check('extraction user message includes language + hint', () => {
  const u = buildExtractionUserMessage(
    'Meena e 420 UPI thi udhaar bharyu',
    'gu'
  );
  assert.ok(u.includes('Language: gu'), u);
  assert.ok(u.includes('Normalized hint:'), u);
});


check('khaand / Khaand maps to Sugar', () => {
  assert.strictEqual(resolveProductName('khaand'), 'Sugar');
  assert.strictEqual(resolveProductName('Khaand'), 'Sugar');
  assert.strictEqual(resolveProductName('khand'), 'Sugar');
  assert.strictEqual(resolveProductName("ખાંડ"), 'Sugar');
});

check('enrich parsed items khaand → Sugar', () => {
  const enriched = enrichParsedWithGujaratiProducts({
    items: [{ name: 'khaand', quantity: 2, unit: 'kg' }],
  });
  assert.strictEqual(enriched.items[0].name, 'Sugar');
  assert.strictEqual(enriched.items[0].name_original, 'khaand');
});

check('hint annotates khaand as Sugar', () => {
  const hint = buildGujaratiExtractionHint('Raju ne 2 kilo khaand vechyu cash');
  assert.ok(/Sugar/i.test(hint), hint);
  assert.ok(/khaand/i.test(hint), hint);
});

(async () => {
  if (!(process.env.GROQ_API_KEY || '').trim()) {
    console.log('\n(skip live Groq extract — GROQ_API_KEY not set)');
    return;
  }

  const samples = [
    {
      text: "કિરણને 4 શુગર વેચ્યું કેશ @45",
      expectType: 'sale',
    },
    {
      text: 'Meena e 420 UPI thi udhaar bharyu',
      expectType: 'receipt',
    },
    {
      text: 'Patel Traders pase thi sugar 30 kilo udhaar @38',
      expectType: 'purchase',
    },
    {
      text: "કિરણનું બાકી કેટલું?",
      expectIntent: 'statement_query',
    },
  ];

  console.log('\nLive Groq Gujarati extracts:');
  for (const s of samples) {
    const lang = detectLanguage(s.text);
    const parsed = await extractIntent(s.text, { detectedLanguage: lang });
    const ok = s.expectIntent
      ? parsed.intent === s.expectIntent
      : parsed.transaction_type === s.expectType;
    console.log(
      ok ? 'PASS ' : 'FAIL ',
      JSON.stringify({
        text: s.text,
        lang,
        intent: parsed.intent,
        type: parsed.transaction_type,
        party: parsed.party?.name,
        confidence: parsed.confidence,
      })
    );
    if (!ok) process.exitCode = 1;
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
