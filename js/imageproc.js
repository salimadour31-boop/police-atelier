/* Police Atelier — imageproc.js
 * Traitement d'image pur JS (navigateur + Node) : niveaux de gris, niveaux,
 * seuillage d'Otsu, nettoyage des poussières, redressement (deskew) et
 * correction de perspective par homographie.
 * Format interne : {w, h, data: Uint8Array}  (gris 0..255, ou binaire 0/1). */
(function (root) {
  const PA = root.PA = root.PA || {};

  /** RGBA (ImageData) -> gris */
  function toGray(rgba, w, h) {
    const d = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < d.length; i++, j += 4) {
      const a = rgba[j + 3] / 255; // fond transparent = blanc
      const g = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
      d[i] = Math.round(g * a + 255 * (1 - a));
    }
    return { w, h, data: d };
  }

  /** Niveaux : noir/blanc (0..255) étirés linéairement */
  function levels(img, black, white) {
    const d = new Uint8Array(img.data.length), r = Math.max(1, white - black);
    for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(255, Math.round((img.data[i] - black) * 255 / r)));
    return { w: img.w, h: img.h, data: d };
  }

  /** Seuil d'Otsu sur l'histogramme */
  function otsu(img) {
    const hist = new Float64Array(256);
    for (const v of img.data) hist[v]++;
    const n = img.data.length; let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, t = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      const wF = n - wB; if (!wF) break;
      sB += i * hist[i];
      const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2;
      if (v > best) { best = v; t = i; }
    }
    return t;
  }

  /** Binarise : encre (sombre) = 1. invert=true pour encre claire sur fond sombre */
  function threshold(img, t, invert) {
    const d = new Uint8Array(img.data.length);
    for (let i = 0; i < d.length; i++) d[i] = invert ? (img.data[i] > t ? 1 : 0) : (img.data[i] <= t ? 1 : 0);
    return { w: img.w, h: img.h, data: d };
  }

  /** Détection automatique encre claire/fond sombre : bords majoritairement sombres */
  function looksInverted(img) {
    let s = 0, n = 0; const { w, h, data } = img;
    for (let x = 0; x < w; x++) { s += data[x] + data[(h - 1) * w + x]; n += 2; }
    for (let y = 0; y < h; y++) { s += data[y * w] + data[y * w + w - 1]; n += 2; }
    return s / n < 110;
  }

  /** Supprime les composantes plus petites que minArea (poussières) */
  function despeckle(bin, minArea) {
    if (minArea <= 0) return bin;
    const comps = PA.components(bin);
    const d = new Uint8Array(bin.data);
    for (const c of comps) if (c.area < minArea) for (const p of c.pixels) d[p] = 0;
    return { w: bin.w, h: bin.h, data: d };
  }

  /** Rotation (bilinéaire pour gris, plus proche voisin pour binaire) autour du centre */
  function rotate(img, deg, fill) {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const { w, h, data } = img, d = new Uint8Array(w * h), cx = w / 2, cy = h / 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const sx = Math.round(c * dx + s * dy + cx), sy = Math.round(-s * dx + c * dy + cy);
      d[y * w + x] = (sx >= 0 && sy >= 0 && sx < w && sy < h) ? data[sy * w + sx] : fill;
    }
    return { w, h, data: d };
  }

  /** Estimation de l'inclinaison (maximise la variance du profil horizontal) ; corriger avec rotate(img, -angle) */
  function estimateSkew(bin, range = 10, step = 0.5) {
    // sous-échantillonnage des pixels d'encre pour la vitesse
    const pts = []; const { w, h, data } = bin;
    for (let i = 0; i < data.length; i++) if (data[i]) pts.push(i);
    const stride = Math.max(1, Math.floor(pts.length / 40000));
    let best = 0, bestScore = -1;
    for (let a = -range; a <= range + 1e-9; a += step) {
      const r = a * Math.PI / 180, s = Math.sin(r), c = Math.cos(r);
      const prof = new Float64Array(h * 2 + 10);
      for (let k = 0; k < pts.length; k += stride) {
        const x = pts[k] % w, y = (pts[k] / w) | 0;
        const yy = Math.round(-s * (x - w / 2) + c * (y - h / 2) + h);
        if (yy >= 0 && yy < prof.length) prof[yy]++;
      }
      let sc = 0; for (const v of prof) sc += v * v;
      if (sc > bestScore) { bestScore = sc; best = a; }
    }
    return best;
  }

  /** Homographie 4 points : renvoie H (3x3) envoyant src[i] -> dst[i] */
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    // élimination de Gauss
    const n = 8;
    for (let i = 0; i < n; i++) {
      let m = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[m][i])) m = k;
      [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
      for (let k = i + 1; k < n; k++) {
        const f = A[k][i] / A[i][i];
        for (let j = i; j < n; j++) A[k][j] -= f * A[i][j]; b[k] -= f * b[i];
      }
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
    return [...x, 1];
  }

  /** Redresse un quadrilatère (coins TL,TR,BR,BL dans l'image) vers un rectangle W×H */
  function warpPerspective(img, corners, W, H, fill = 255) {
    const Hm = homography([[0, 0], [W, 0], [W, H], [0, H]], corners); // dst->src
    const d = new Uint8Array(W * H), { w, h, data } = img;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const z = Hm[6] * x + Hm[7] * y + Hm[8];
      const sx = (Hm[0] * x + Hm[1] * y + Hm[2]) / z, sy = (Hm[3] * x + Hm[4] * y + Hm[5]) / z;
      const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
      if (ix < 0 || iy < 0 || ix + 1 >= w || iy + 1 >= h) { d[y * W + x] = fill; continue; }
      const p = iy * w + ix;
      d[y * W + x] = Math.round(data[p] * (1 - fx) * (1 - fy) + data[p + 1] * fx * (1 - fy) + data[p + w] * (1 - fx) * fy + data[p + w + 1] * fx * fy);
    }
    return { w: W, h: H, data: d };
  }

  /** Réduction si l'image est trop grande (moyenne de boîte) */
  function downscale(img, maxSide) {
    const f = Math.max(img.w, img.h) / maxSide; if (f <= 1) return img;
    const W = Math.round(img.w / f), H = Math.round(img.h / f), d = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let yy = Math.floor(y * f); yy < Math.min(img.h, Math.floor((y + 1) * f)); yy++)
        for (let xx = Math.floor(x * f); xx < Math.min(img.w, Math.floor((x + 1) * f)); xx++) { s += img.data[yy * img.w + xx]; n++; }
      d[y * W + x] = n ? s / n : 255;
    }
    return { w: W, h: H, data: d };
  }

  Object.assign(PA, { toGray, levels, otsu, threshold, looksInverted, despeckle, rotate, estimateSkew, homography, warpPerspective, downscale });
  if (typeof module !== 'undefined') module.exports = PA;
})(typeof self !== 'undefined' ? self : globalThis);
