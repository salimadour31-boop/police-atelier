/* Police Atelier — template.js : dessin des planches modèles (latine / arabe)
 * et export PNG / PDF (PDF minimal écrit à la main, image JPEG intégrée). */
(function (root) {
  const PA = root.PA = root.PA || {};

  /** Dessine une planche sur un contexte 2D de taille SHEET. fill : {font} pour pré-remplir (tests) */
  function drawTemplate(ctx, kind, fill) {
    const S = PA.SHEET, L = PA.layout(kind);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S.W, S.H);
    ctx.fillStyle = '#000';
    for (const [x, y] of [[S.margin, S.margin], [S.W - S.margin - S.marker, S.margin], [S.W - S.margin - S.marker, S.H - S.margin - S.marker], [S.margin, S.H - S.margin - S.marker]]) ctx.fillRect(x, y, S.marker, S.marker);
    if (kind === 'arabic') ctx.fillRect(S.W / 2 - 28, S.margin, 56, S.marker); // repère d'identification
    ctx.fillStyle = '#c4c4c4'; ctx.font = '600 30px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(kind === 'arabic' ? 'Police Atelier — planche arabe / Arabic sheet' : 'Police Atelier — planche latine / Latin sheet', S.margin + S.marker + 30, S.margin + 26);
    ctx.font = '22px sans-serif';
    ctx.fillText('Écrivez au feutre noir dans les cases, sur la ligne de base. Gardez les marques noires visibles.', S.margin + S.marker + 30, S.margin + 60);
    ctx.fillText('Write with a black marker on the baseline. Keep the black corner marks visible.', S.margin + S.marker + 30, S.margin + 88);
    for (const c of L.cells) {
      ctx.strokeStyle = '#cfcfcf'; ctx.lineWidth = 2; ctx.strokeRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4);
      ctx.strokeStyle = '#e3e3e3'; ctx.lineWidth = 1.5;
      for (const y of [c.cap, c.xh]) { ctx.setLineDash([6, 6]); line(ctx, c.inner.x, y, c.inner.x + c.inner.w, y); }
      ctx.setLineDash([]); ctx.strokeStyle = '#d6d6d6'; line(ctx, c.inner.x, c.base, c.inner.x + c.inner.w, c.base);
      ctx.fillStyle = '#b8b8b8'; ctx.font = `${Math.round(c.h * 0.13)}px sans-serif`; ctx.textAlign = 'left';
      ctx.fillText(PA.labelOf(c.key), c.x + 8, c.y + c.h * 0.15);
      if (fill) { // pré-remplissage avec une police (uniquement pour les tests)
        ctx.fillStyle = '#000'; const px = (c.base - c.cap) / (fill.capRatio || 0.73);
        ctx.font = `${px}px "${fill.font}"`; ctx.textAlign = 'center';
        ctx.fillText(PA.labelOf(c.key), c.inner.x + c.inner.w / 2, c.base);
      }
    }
  }
  const line = (ctx, x0, y0, x1, y1) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };

  /** PDF A4 contenant une image JPEG (Uint8Array) pleine page */
  function jpegToPDF(jpeg, wpx, hpx) {
    const W = 595.28, H = 841.89, enc = s => new TextEncoder().encode(s);
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
      null, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
    const parts = [enc('%PDF-1.4\n')], offs = []; let len = parts[0].length;
    objs.forEach((o, i) => {
      offs.push(len); let b;
      if (o === null) {
        const head = enc(`${i + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${wpx} /Height ${hpx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
        const tail = enc('\nendstream\nendobj\n'); b = new Uint8Array(head.length + jpeg.length + tail.length); b.set(head); b.set(jpeg, head.length); b.set(tail, head.length + jpeg.length);
      } else b = enc(`${i + 1} 0 obj\n${o}\nendobj\n`);
      parts.push(b); len += b.length;
    });
    let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF`;
    parts.push(enc(xref));
    return new Blob(parts, { type: 'application/pdf' });
  }
  Object.assign(PA, { drawTemplate, jpegToPDF });
})(typeof self !== 'undefined' ? self : globalThis);
