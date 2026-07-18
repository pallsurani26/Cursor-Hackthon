/**
 * Language detection for LedgerBot WhatsApp messages.
 *
 * Priority:
 * 1. Gujarati Unicode script (U+0A80–U+0AFF) → 'gu'
 * 2. Devanagari (U+0900–U+097F) → 'hi'
 * 3. Romanized Gujarati heuristics → 'gu'
 * 4. Hinglish / Indian bookkeeping slang in Latin → 'hinglish'
 * 5. Otherwise → 'en'
 */

const GUJARATI_ROMAN_RE =
  /\b(vechy[ua]|vechya|kharidy[ua]|kharidyu|milya|milyu|bharyu|bhary[ua]|chukavy[ua]|chukavya|pase\s*thi|baaki|ketl[uo]|ketlu|kem\s*cho|majama|udhaar\s*bharyu|sacho|sachu|rad\s*karo|dukaan|rupiya|rupiyaa|kil[o]|litr[e]?)\b/i;

const HINGLISH_RE =
  /\b(udhaar|udhar|nakad|nakad|kitna|becha|bech[ea]|kharida|diya|liya|baaki|baki|paisa|rupaye|duk[aá]n|aaj|kal|haan|mat\s*karo)\b/i;

function detectLanguage(text) {
  if (!text || typeof text !== 'string') return 'en';

  let guChars = 0;
  let hiChars = 0;
  let latinLetters = 0;

  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code >= 0x0a80 && code <= 0x0aff) guChars += 1;
    else if (code >= 0x0900 && code <= 0x097f) hiChars += 1;
    else if (
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
    ) {
      latinLetters += 1;
    }
  }

  // Clear script majority
  if (guChars > 0 && guChars >= hiChars) return 'gu';
  if (hiChars > 0 && hiChars > guChars) return 'hi';

  const normalized = text.toLowerCase();

  // Romanized Gujarati (Latin letters but GU morphology / lexicon)
  if (latinLetters > 0 && GUJARATI_ROMAN_RE.test(normalized)) {
    return 'gu';
  }

  if (latinLetters > 0 && HINGLISH_RE.test(normalized)) {
    return 'hinglish';
  }

  return 'en';
}

/**
 * Prefer vendor preference when message language is ambiguous (en).
 */
function resolveLanguage(text, preferredLanguage) {
  const detected = detectLanguage(text);
  if (detected !== 'en') return detected;

  const pref = String(preferredLanguage || '')
    .trim()
    .toLowerCase();
  if (pref === 'gu' || pref === 'hi' || pref === 'hinglish' || pref === 'en') {
    return pref;
  }
  return detected;
}

module.exports = { detectLanguage, resolveLanguage };
