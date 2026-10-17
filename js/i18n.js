/* Police Atelier — i18n.js : français (référence), anglais, taqbaylit (traduction
 * au mieux, à relire par des locuteurs) + affichage optionnel en tifinagh. */
(function (root) {
  const PA = root.PA = root.PA || {};
  const T = {
    fr: {
      tagline: "Fabrique de police à partir d'une image — 100 % local, libre et gratuit",
      s1: '1. Image', s2: '2. Nettoyage & segmentation', s3: 'Analyse de la structure', s4: '4. Glyphes', s5: '5. Aperçu', s6: '6. Export',
      drop: 'Déposez une image (PNG, JPG, WebP) ou cliquez pour choisir', mode: 'Mode', modeAuto: 'Automatique', modeTpl: 'Planche modèle', modeFree: 'Texte libre (alphabet dans l\'ordre)',
      alphabet: 'Ordre des caractères (texte libre)', tplLatin: 'Planche latine', tplArabic: 'Planche arabe', tplHint: 'Imprimez une planche, remplissez-la au feutre noir, photographiez-la bien à plat et à la lumière.',
      levels: 'Niveaux (noir / blanc)', thresh: 'Seuil', auto: 'auto', despeckle: 'Anti-poussière (px²)', deskew: 'Redresser l\'inclinaison', invert: 'Encre claire sur fond sombre',
      persp: 'Perspective : cliquer 4 coins', perspReset: 'Annuler la perspective', apply: 'Relancer l\'analyse', addSheet: 'Ajouter cette image à la police',
      assignHint: 'Cliquez sur une boîte pour corriger le caractère attribué.', assign: 'Caractère', ignore: 'Ignorer', ok: 'Appliquer',
      weight: 'Graisse (épaisseur de trait)', contrast: 'Contraste', slant: 'Inclinaison', xratio: 'Hauteur d\'x / capitales', serif: 'Empattements', yes: 'oui', no: 'non', units: 'unités',
      metrics: 'Métriques', traced: 'tracé', derived: 'dérivé', generated: 'généré', missing: 'manquant',
      legend: 'Tracé = issu de votre image · Dérivé = construit à partir de vos glyphes (miroir, échelle, accent) · Généré = squelette automatique, basique',
      baseline: 'Décalage ligne de base', scale: 'Échelle', lsb: 'Approche gauche', rsb: 'Approche droite', spacing: 'Espacement global', tracking: 'Interlettrage',
      family: 'Famille', style: 'Style', version: 'Version', previewText: 'Portez ce vieux whisky au juge blond qui fume. Azul fell-awen ! سلام محمد 0123456789',
      exportOTF: 'Télécharger OTF', exportWOFF: 'Télécharger WOFF', exportJSON: 'Projet JSON', importJSON: 'Ouvrir un projet', reset: 'Tout effacer',
      noImage: 'Aucune image pour l\'instant. Commencez par déposer une photo ou une planche remplie.', tplFound: 'Planche détectée', freeFound: 'Texte libre', glyphsFound: 'glyphes trouvés',
      statusBuilt: 'Police construite', valid: 'relue avec succès par opentype.js', rtl: 'sens droite→gauche détecté', notFound: 'Planche introuvable : vérifiez que les 4 marques noires sont visibles.',
      kabNote: '', fileHelp: 'Installer : Mac → double-clic puis « Installer » (Livre des polices). Windows → clic droit > Installer.'
    },
    en: {
      tagline: 'Turn an image into a font — 100% local, free and open source',
      s1: '1. Image', s2: '2. Clean-up & segmentation', s3: 'Structure analysis', s4: '4. Glyphs', s5: '5. Preview', s6: '6. Export',
      drop: 'Drop an image (PNG, JPG, WebP) or click to choose', mode: 'Mode', modeAuto: 'Automatic', modeTpl: 'Template sheet', modeFree: 'Free text (alphabet in order)',
      alphabet: 'Character order (free text)', tplLatin: 'Latin sheet', tplArabic: 'Arabic sheet', tplHint: 'Print a sheet, fill it with a black marker, photograph it flat in good light.',
      levels: 'Levels (black / white)', thresh: 'Threshold', auto: 'auto', despeckle: 'Despeckle (px²)', deskew: 'Fix skew', invert: 'Light ink on dark background',
      persp: 'Perspective: click 4 corners', perspReset: 'Undo perspective', apply: 'Re-run analysis', addSheet: 'Add this image to the font',
      assignHint: 'Click a box to fix its assigned character.', assign: 'Character', ignore: 'Ignore', ok: 'Apply',
      weight: 'Weight (stroke thickness)', contrast: 'Contrast', slant: 'Slant', xratio: 'x-height / cap height', serif: 'Serifs', yes: 'yes', no: 'no', units: 'units',
      metrics: 'Metrics', traced: 'traced', derived: 'derived', generated: 'generated', missing: 'missing',
      legend: 'Traced = from your image · Derived = built from your glyphs (mirror, scale, accent) · Generated = automatic skeleton, basic',
      baseline: 'Baseline offset', scale: 'Scale', lsb: 'Left sidebearing', rsb: 'Right sidebearing', spacing: 'Global spacing', tracking: 'Tracking',
      family: 'Family', style: 'Style', version: 'Version', previewText: 'The quick brown fox jumps over the lazy dog. سلام محمد 0123456789',
      exportOTF: 'Download OTF', exportWOFF: 'Download WOFF', exportJSON: 'Project JSON', importJSON: 'Open project', reset: 'Clear all',
      noImage: 'No image yet. Start by dropping a photo or a filled-in sheet.', tplFound: 'Template detected', freeFound: 'Free text', glyphsFound: 'glyphs found',
      statusBuilt: 'Font built', valid: 're-parsed successfully by opentype.js', rtl: 'right-to-left detected', notFound: 'Template not found: make sure the 4 black marks are visible.',
      kabNote: '', fileHelp: 'Install: Mac → double-click then “Install” (Font Book). Windows → right-click > Install.'
    },
    kab: { // Taqbaylit — tasuqqilt s wazal n tazwart, ilaq ad tettwasenqed
      tagline: 'Ssuffeɣ tasefsit seg tugna — s wudem adigan, tilelli, baṭel',
      s1: '1. Tugna', s2: '2. Asizdeg d beṭṭu', s3: 'Tasleḍt n teɣessa', s4: '4. Isekkilen', s5: '5. Taskant', s6: '6. Asifeḍ',
      drop: 'Sers tugna (PNG, JPG, WebP) neɣ sit i ufran', mode: 'Askar', modeAuto: 'S wudem awurman', modeTpl: 'Tawriqt tamudemt', modeFree: 'Aḍris ilelli (agemmay s umyizwer)',
      alphabet: 'Amyizwer n isekkilen', tplLatin: 'Tawriqt talatinit', tplArabic: 'Tawriqt taɛrabt', tplHint: 'Siggez tawriqt, aru s ustilu aberkan, ṭṭef-as tawlaft s tafat.',
      levels: 'Iswiren (aberkan / amellal)', thresh: 'Amnar', auto: 'awurman', despeckle: 'Kkes iɣebbaren', deskew: 'Seɣdel amelmal', invert: 'Asmuk afaw ɣef ugilal aberkan',
      persp: 'Tamuɣli : sit ɣef 4 teɣmar', perspReset: 'Sefsex tamuɣli', apply: 'Ales tasleḍt', addSheet: 'Rnu tugna-a ɣer tsefsit',
      assignHint: 'Sit ɣef tenkult i useɣti n usekkil.', assign: 'Asekkil', ignore: 'Zgel', ok: 'Snes',
      weight: 'Tazmert n yizirig', contrast: 'Anemgal', slant: 'Amelmal', xratio: 'Teɣzi n x / tamuqrant', serif: 'Tifeḍnin', yes: 'ih', no: 'ala', units: 'tiferdisin',
      metrics: 'Iktayen', traced: 'yettwasuneɣ', derived: 'yettwasuffeɣ', generated: 'yettwasirew', missing: 'ixuṣ',
      legend: 'Yettwasuneɣ = seg tugna-k · Yettwasuffeɣ = seg isekkilen-ik · Yettwasirew = aɣesmar awurman, d amaruz',
      baseline: 'Tasiwelt n yizirig n lsas', scale: 'Taskala', lsb: 'Tama tazelmaḍt', rsb: 'Tama tayeffust', spacing: 'Tallunt tamatut', tracking: 'Tallunt gar isekkilen',
      family: 'Tawacult', style: 'Aɣanib', version: 'Lqem', previewText: 'Azul fell-awen ! Tasefsit-iw tamaynut. سلام محمد 0123456789',
      exportOTF: 'Sader OTF', exportWOFF: 'Sader WOFF', exportJSON: 'Asenfar JSON', importJSON: 'Ldi asenfar', reset: 'Sfeḍ kullec',
      noImage: 'Ulac tugna akka tura. Bdu s users n tewlaft.', tplFound: 'Tawriqt tettwaf', freeFound: 'Aḍris ilelli', glyphsFound: 'isekkilen ttwafen',
      statusBuilt: 'Tasefsit tebna', valid: 'tettwaɣer akken iwata', rtl: 'tanila seg yefus ɣer zelmeḍ', notFound: 'Ur tettwaf ara tewriqt : 4 n tecraḍ tiberkanin ilaq ad banent.',
      kabNote: '⚑ Tasuqqilt n Teqbaylit d tirmit — Traduction kabyle « au mieux », à relire.', fileHelp: 'Sbedd : Mac → sin n tikkal sakin « Installer ». Windows → tasidt tayeffust > Installer.'
    }
  };
  // translittération latin kabyle -> tifinagh (néo-tifinagh, au mieux)
  const TIF = { a: 'ⴰ', b: 'ⴱ', c: 'ⵛ', č: 'ⵞ', d: 'ⴷ', ḍ: 'ⴹ', e: 'ⴻ', ɛ: 'ⵄ', f: 'ⴼ', g: 'ⴳ', ǧ: 'ⴵ', ɣ: 'ⵖ', h: 'ⵀ', ḥ: 'ⵃ', i: 'ⵉ', j: 'ⵊ', k: 'ⴽ', l: 'ⵍ', m: 'ⵎ', n: 'ⵏ', q: 'ⵇ', r: 'ⵔ', ṛ: 'ⵕ', s: 'ⵙ', ṣ: 'ⵚ', t: 'ⵜ', ṭ: 'ⵟ', u: 'ⵓ', w: 'ⵡ', x: 'ⵅ', y: 'ⵢ', z: 'ⵣ', ẓ: 'ⵥ', o: 'ⵓ', p: 'ⴱ', v: 'ⴼ' };
  function toTifinagh(s) { return Array.from(s).map(ch => { const l = ch.toLowerCase(); return TIF[l] || ch; }).join(''); }
  function t(lang, key, tif) { const v = (T[lang] && T[lang][key] != null) ? T[lang][key] : T.fr[key]; return lang === 'kab' && tif ? toTifinagh(v) : v; }
  Object.assign(PA, { I18N: T, t, toTifinagh });
})(typeof self !== 'undefined' ? self : globalThis);
