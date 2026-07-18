/**
 * Gujarati kirana product lexicon.
 * Maps vendor words (ખાંડ / khaand) → canonical product names (Sugar).
 */

const GUJARATI_PRODUCTS = [
  { canonical: "Sugar", aliases: ["ખાંડ", "khaand", "khand", "khaand", "khandh", "sakkar", "શક્કર"] },
  { canonical: "Rice", aliases: ["ચોખા", "chokha", "chawal", "rice", "ભાત"] },
  { canonical: "Wheat flour", aliases: ["આટો", "aato", "atta", "aata", "wheat flour"] },
  { canonical: "Oil", aliases: ["તેલ", "tel", "oil", "તેલ"] },
  { canonical: "Milk", aliases: ["દૂધ", "doodh", "dudh", "milk"] },
  { canonical: "Tea", aliases: ["ચા", "cha", "chai", "tea"] },
  { canonical: "Salt", aliases: ["મઠુ", "mithu", "namak", "salt"] },
  { canonical: "Dal", aliases: ["દાળ", "daal", "dal", "દાલ"] },
  { canonical: "Ghee", aliases: ["ઘી", "ghee", "ghi"] },
  { canonical: "Butter", aliases: ["માખણ", "makhan", "butter"] },
  { canonical: "Potato", aliases: ["બટાટા", "batata", "aloo", "potato"] },
  { canonical: "Onion", aliases: ["ડુંગળી", "dungli", "pyaz", "onion", "kanda"] },
  { canonical: "Tomato", aliases: ["ટમેટા", "tameta", "tamatar", "tomato"] },
  { canonical: "Chilli", aliases: ["મરચુ", "marchu", "mirchi", "chilli", "chili"] },
  { canonical: "Turmeric", aliases: ["હળદર", "haldar", "haldi", "turmeric"] },
  { canonical: "Cumin", aliases: ["જીરુ", "jeeru", "jeera", "cumin"] },
  { canonical: "Soap", aliases: ["સાબુ", "saabu", "sabun", "soap"] },
  { canonical: "Biscuits", aliases: ["બિસ્કીટ", "biscuit", "biscuits"] },
  { canonical: "Bread", aliases: ["બ્રેડ", "bread", "pav"] },
  { canonical: "Eggs", aliases: ["ઇડા", "inda", "anda", "eggs", "egg"] },
  { canonical: "Maggi", aliases: ["maggi", "મેગી"] },
  { canonical: "Parle-G", aliases: ["parle-g", "parleg", "parle g"] },
  { canonical: "Namkeen", aliases: ["namkeen", "farsan", "ફરસાણ"] },
  { canonical: "Shampoo", aliases: ["shampoo", "શેમ્પૂ"] },
];

const ALIAS_TO_CANONICAL = new Map();
for (const row of GUJARATI_PRODUCTS) {
  const canon = row.canonical;
  ALIAS_TO_CANONICAL.set(normalizeKey(canon), canon);
  for (const a of row.aliases) {
    ALIAS_TO_CANONICAL.set(normalizeKey(a), canon);
  }
}

function normalizeKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\u200b\u200c\u200d]/g, '')
    .replace(/\s+/g, ' ');
}

/** Resolve a spoken/typed product token to canonical English catalog name. */
function resolveProductName(rawName) {
  if (!rawName) return null;
  const key = normalizeKey(rawName);
  if (ALIAS_TO_CANONICAL.has(key)) return ALIAS_TO_CANONICAL.get(key);
  // partial: raw contains alias as whole word
  for (const [alias, canon] of ALIAS_TO_CANONICAL.entries()) {
    if (alias.length < 2) continue;
    if (key === alias) return canon;
    // allow 'khaand 1kg' style
    if (key.startsWith(alias + ' ') || key.endsWith(' ' + alias)) return canon;
  }
  return null;
}

/**
 * Enrich llm_parsed items/product_updates with canonical names.
 * Keeps original vendor wording in name_original.
 */
function enrichParsedWithGujaratiProducts(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const out = { ...parsed };
  if (Array.isArray(out.items)) {
    out.items = out.items.map((item) => {
      if (!item || !item.name) return item;
      const canonical = resolveProductName(item.name);
      if (!canonical) return item;
      return {
        ...item,
        name_original: item.name_original || item.name,
        name: canonical,
      };
    });
  }
  if (Array.isArray(out.product_updates)) {
    out.product_updates = out.product_updates.map((p) => {
      if (!p || !p.name) return p;
      const canonical = resolveProductName(p.name);
      if (!canonical) return p;
      return {
        ...p,
        name_original: p.name_original || p.name,
        name: canonical,
      };
    });
  }
  return out;
}

/** Add product alias cues into the extraction hint string. */
function applyProductHints(text) {
  if (!text) return text;
  let out = ` ${text} `;
  // Longer aliases first; dedupe exact alias keys
  const seen = new Set();
  const pairs = [];
  for (const row of GUJARATI_PRODUCTS) {
    for (const a of row.aliases) {
      const key = normalizeKey(a);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      pairs.push([a, row.canonical]);
    }
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  for (const [alias, canon] of pairs) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Do not re-annotate if already "alias (Canonical)"
    const re = new RegExp(
      `(${escaped})(?!\\s*\\(${canon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\))`,
      'gi'
    );
    out = out.replace(re, `$1 (${canon})`);
  }
  return out.replace(/\s+/g, ' ').trim();
}

function productLexiconForPrompt() {
  return GUJARATI_PRODUCTS.map(
    (r) => `- ${r.aliases.slice(0, 4).join(' / ')} → product "${r.canonical}"`
  ).join('\n');
}

module.exports = {
  GUJARATI_PRODUCTS,
  resolveProductName,
  enrichParsedWithGujaratiProducts,
  applyProductHints,
  productLexiconForPrompt,
};
