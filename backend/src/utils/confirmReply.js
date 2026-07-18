/**
 * Detect YES / NO confirmation replies for a pending extraction.
 * Supports English, Hinglish, Hindi, and Gujarati (script + romanized).
 * @returns {'yes' | 'no' | null}
 */
function parseConfirmationReply(text) {
  if (!text || typeof text !== 'string') return null;

  let t = text
    .trim()
    .toLowerCase()
    .replace(/[!.,?]+$/g, '')
    .trim();

  t = t.replace(/\s+/g, ' ');

  const yes = new Set([
    'yes', 'y', 'yeah', 'yep', 'confirm', 'confirmed', 'ok', 'okay',
    'haan', 'haa', 'ha', 'han',
    'haa sacho', 'ha sacho', 'sacho', 'sachu', 'sachi che', 'ha sachi che',
    'kar do', 'haan kar do', 'confirm karo', 'save', 'ok save',
    '\u0ab9\u0abe', // GU haa
    '\u0939\u093e\u0902', // HI haan
    '\u0ab9\u0abe \u0ab8\u0abe\u0a9a\u0ac1\u0a82 \u0a9b\u0ac7',
    '\u0ab8\u0abe\u0a9a\u0ac1\u0a82',
    '\u0ab8\u0abe\u0a9a\u0ac1\u0a82 \u0a9b\u0ac7',
  ]);

  const no = new Set([
    'no', 'n', 'nope', 'cancel', 'cancelled', 'canceled', 'reject', 'nah', 'na',
    'mat karo', 'mat karo galat hai', 'galat hai', 'rad karo', 'na rad karo',
    'cancel transaction',
    '\u0aa8\u0abe', // GU na
    '\u0928\u0939\u0940\u0902', // HI nahin
    '\u0928\u0939\u0940',
    '\u0aa8\u0abe \u0ab0\u0aa6 \u0a95\u0ab0\u0acb',
    '\u0ab0\u0aa6',
    '\u0ab0\u0aa6 \u0a95\u0ab0\u0acb',
  ]);

  if (yes.has(t)) return 'yes';
  if (no.has(t)) return 'no';

  if (/^(yes|haan|haa|ha|\u0ab9\u0abe|\u0939\u093e\u0902)\b/.test(t)) return 'yes';
  if (/^(no|na|nah|\u0aa8\u0abe|\u0928\u0939\u0940\u0902|\u0928\u0939\u0940)\b/.test(t)) return 'no';

  return null;
}

module.exports = { parseConfirmationReply };
