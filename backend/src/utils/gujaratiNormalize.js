/**
 * Lightweight Gujarati / romanized-Gujarati normalization helpers.
 * Gives the LLM clearer Latin bookkeeping cues WITHOUT changing
 * the original raw_input stored in the DB.
 */

const { applyProductHints } = require('./gujaratiProducts');

const SCRIPT_REPLACEMENTS = [
  [/\u0A95\u0AC7\u0AB6/g, ' cash '],
  [/\u0A89\u0AA7\u0ABE\u0AB0/g, ' udhaar '],
  [/\u0AB5\u0AC7\u0A9A\u0ACD\u0AAF\u0AC1\u0A82|\u0AB5\u0AC7\u0A9A\u0ACD\u0AAF\u0ABE|\u0AB5\u0AC7\u0A9A\u0AC0/g, ' sold '],
  [/\u0A96\u0AB0\u0AC0\u0AA6\u0ACD\u0AAF\u0AC1\u0A82|\u0A96\u0AB0\u0AC0\u0AA6\u0ACD\u0AAF\u0ABE|\u0A96\u0AB0\u0AC0\u0AA6\u0AC0/g, ' purchased '],
  [/\u0AAE\u0AB3\u0ACD\u0AAF\u0ABE|\u0AAE\u0AB3\u0ACD\u0AAF\u0AC1\u0A82|\u0AAE\u0AB3\u0ACD\u0AAF\u0ACB/g, ' received '],
  [/\u0A9A\u0AC2\u0A95\u0AB5\u0ACD\u0AAF\u0ABE|\u0A9A\u0AC2\u0A95\u0AB5\u0ACD\u0AAF\u0AC1\u0A82|\u0A9A\u0AC1\u0A95\u0AB5\u0ACD\u0AAF\u0ABE/g, ' paid '],
  [/\u0A96\u0AB0\u0ACD\u0A9A/g, ' expense '],
  [/\u0AAC\u0ABE\u0A95\u0AC0/g, ' balance '],
  [/\u0AB8\u0ACD\u0A9F\u0ACB\u0A95/g, ' stock '],
  [/\u0A95\u0ABF\u0AB2\u0ACB/g, ' kg '],
  [/\u0AB2\u0AC0\u0A9F\u0AB0|\u0AB2\u0ABF\u0A9F\u0AB0/g, ' litre '],
  [/\u0AB0\u0AC2\u0AAA\u0ABF\u0AAF\u0ABE|\u0AB0\u0AC2\u0AAA\u0ABF\u0AAF\u0AC7/g, ' rupees '],
  [/\u0AA8\u0AAB\u0ACB|\u0AA8\u0AC1\u0A95\u0AB8\u0ABE\u0AA8/g, ' profit loss '],
  [/\u0AAC\u0ABF\u0AB2/g, ' bill '],
  [/\u0AAF\u0ABE\u0AA6\u0AC0/g, ' list '],
];

const ROMAN_REPLACEMENTS = [
  [/\bvechy[ua]\b/gi, 'sold'],
  [/\bvechya\b/gi, 'sold'],
  [/\bkharidy[ua]\b/gi, 'purchased'],
  [/\bmily[au]\b/gi, 'received'],
  [/\bchukavy[au]\b/gi, 'paid'],
  [/\bbhary[ua]\b/gi, 'paid/settled'],
  [/\bpase\s*thi\b/gi, 'from'],
  [/\bbaaki\b/gi, 'balance'],
  [/\bketl[uo]\b/gi, 'how much'],
  [/\budhaar\b/gi, 'udhaar'],
  [/\bkesh\b/gi, 'cash'],
];

function buildGujaratiExtractionHint(rawText) {
  if (!rawText) return '';

  let hint = ` ${rawText} `;
  for (const [re, rep] of SCRIPT_REPLACEMENTS) {
    hint = hint.replace(re, rep);
  }
  for (const [re, rep] of ROMAN_REPLACEMENTS) {
    hint = hint.replace(re, rep);
  }

  hint = hint.replace(/\s+/g, ' ').trim();
  // Annotate Gujarati product words: ખાંડ / khaand → (Sugar)
  hint = applyProductHints(hint);
  if (hint === rawText.trim()) return '';
  return hint;
}

module.exports = { buildGujaratiExtractionHint };
