/* Police Atelier — chars.js : jeux de caractères, formes positionnelles arabes,
 * mise en page des planches modèles. */
(function (root) {
  const PA = root.PA = root.PA || {};
  const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const DIGITS = '0123456789'.split('');
  const PUNCT = ['.', ',', ';', ':', '!', '?', "'", '"', '-', '(', ')', '/', '&', '@', '#', '%', '+', '=', '*', '_', '«', '»'];
  const FRENCH = ['é', 'è', 'ê', 'à', 'ç', 'ù', 'ô', 'î', 'ë', 'ï', 'û', 'œ', 'æ'];
  const KABYLE = ['č', 'ǧ', 'ḥ', 'ɛ', 'ɣ', 'ṛ', 'ṣ', 'ṭ', 'ẓ', 'ḍ'];
  // capitales composées (toujours synthétisées si absentes)
  const UPPER_EXTRA = ['É', 'È', 'Ê', 'À', 'Ç', 'Ù', 'Ô', 'Î', 'Ë', 'Ï', 'Û', 'Œ', 'Æ', 'Č', 'Ǧ', 'Ḥ', 'Ɛ', 'Ɣ', 'Ṛ', 'Ṣ', 'Ṭ', 'Ẓ', 'Ḍ'];
  const REQUIRED = [...UPPER, ...LOWER, ...DIGITS, ...PUNCT];
  const LATIN_SHEET = [...UPPER, ...LOWER, ...DIGITS, ...PUNCT, ...FRENCH, ...KABYLE];

  /* Arabe : lettre de base -> [isolée, finale, initiale, médiane] (Formes de présentation B).
   * Les lettres « à jonction droite » n'ont que isolée + finale. */
  const AR = {
    'ء': [0xFE80], 'آ': [0xFE81, 0xFE82], 'أ': [0xFE83, 0xFE84], 'ؤ': [0xFE85, 0xFE86], 'إ': [0xFE87, 0xFE88],
    'ئ': [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C], 'ا': [0xFE8D, 0xFE8E], 'ب': [0xFE8F, 0xFE90, 0xFE91, 0xFE92], 'ة': [0xFE93, 0xFE94]
  };
  const quad = (s, letters) => letters.split('').forEach((l, i) => { const b = s + 4 * i; AR[l] = [b, b + 1, b + 2, b + 3]; });
  quad(0xFE95, 'تثجحخ');
  ['د', 'ذ', 'ر', 'ز'].forEach((l, i) => AR[l] = [0xFEA9 + 2 * i, 0xFEAA + 2 * i]);
  quad(0xFEB1, 'سشصضطظعغفقكلمنه');
  AR['و'] = [0xFEED, 0xFEEE]; AR['ى'] = [0xFEEF, 0xFEF0]; quad(0xFEF1, 'ي');
  AR['لا'] = [0xFEFB, 0xFEFC]; // ligature lam-alif
  const FORMS = ['isol', 'fina', 'init', 'medi'];
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'.split(''), AR_PUNCT = ['،', '؛', '؟'];
  /** clé de glyphe d'une forme positionnelle, ex. « ب.init » */
  const arKey = (l, f) => f === 'isol' ? l : l + '.' + f;
  const ARABIC_SHEET = [];
  for (const l of Object.keys(AR)) AR[l].forEach((cp, i) => ARABIC_SHEET.push(arKey(l, FORMS[i])));
  ARABIC_SHEET.push(...AR_DIGITS, ...AR_PUNCT);
  /** caractère d'étiquette (forme de présentation) pour une clé */
  function labelOf(key) {
    const mm = /^(.+)\.(init|medi|fina)$/.exec(key), l = mm ? mm[1] : key, f = mm ? mm[2] : null;
    if (AR[l]) return String.fromCodePoint(AR[l][FORMS.indexOf(f || 'isol')]);
    return key;
  }
  const isArabicKey = k => /[\u0600-\u06FF]/.test(k);
  const hasRTL = s => /[\u0590-\u08FF\uFB50-\uFEFF]/.test(s);

  /* Géométrie des planches (pixels de la planche canonique, A4 à ~200 dpi) */
  const SHEET = { W: 1654, H: 2339, marker: 56, margin: 50, top: 190, bottom: 70 };
  function layout(kind) {
    const keys = kind === 'arabic' ? ARABIC_SHEET : LATIN_SHEET;
    const cols = kind === 'arabic' ? 11 : 9, rows = Math.ceil(keys.length / cols);
    const x0 = SHEET.margin + 20, x1 = SHEET.W - SHEET.margin - 20, y0 = SHEET.top, y1 = SHEET.H - SHEET.bottom - 30;
    const cw = (x1 - x0) / cols, ch = (y1 - y0) / rows;
    const cells = keys.map((k, i) => {
      const c = i % cols, r = (i / cols) | 0, x = x0 + c * cw, y = y0 + r * ch;
      // zone d'écriture sous la bande d'étiquette ; lignes guides
      const label = ch * 0.2, inner = { x: x + 6, y: y + label, w: cw - 12, h: ch - label - 4 };
      const base = inner.y + inner.h * 0.72, cap = inner.y + inner.h * 0.22, xh = inner.y + inner.h * 0.40;
      return { key: k, x, y, w: cw, h: ch, inner, base, cap, xh };
    });
    return { kind, cols, rows, cells, cw, ch };
  }
  Object.assign(PA, { UPPER, LOWER, DIGITS, PUNCT, FRENCH, KABYLE, UPPER_EXTRA, REQUIRED, LATIN_SHEET, AR, FORMS, AR_DIGITS, AR_PUNCT, ARABIC_SHEET, arKey, labelOf, isArabicKey, hasRTL, SHEET, layout });
  if (typeof module !== 'undefined') module.exports = PA;
})(typeof self !== 'undefined' ? self : globalThis);
