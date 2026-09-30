/**
 * Etched badges — the look of the Status popup's ONLINE and LIVE: Michroma
 * letters cut into the glass beside a small socket holding an orb. Lit, the
 * orb glows in its color, spills a little light onto the letters and its
 * halo breathes; unlit, it's a dark bead in its socket, breathing faintly.
 *
 * Plain 2D canvas (no WebGL), shared by ring.js (ONLINE's etched surface,
 * LIVE) and the EXPERIMENTING chips in index.html. Load before ring.js.
 */
(() => {
  // Light from above: a cut's upper wall sits in shadow and its lower lip
  // catches light. The etched area itself is frosted, so it reads pale.
  // Paints the orb's light pooling on the surface (when lit), the socket
  // (dark well, shadowed upper wall, lit lower lip), and the letters (dark
  // cut above, lit lip below, a frosted face faintly tinted by the orb on
  // the side nearest it).
  // o: socket center sx/sy + radius sr; text start tx, middle ty, width
  // textW; font, letter-spacing ls; the orb's color rgb ('r,g,b'); lit.
  function paintEtched(g, o) {
    const { sx, sy, sr, tx, ty, textW, text, font, ls, rgb, lit } = o;
    if (lit) {
      const spill = g.createRadialGradient(sx, sy, sr * 0.8, sx, sy, sr * 4);
      spill.addColorStop(0, `rgba(${rgb},0.16)`);
      spill.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = spill;
      g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    }
    const well = g.createRadialGradient(sx, sy - sr * 0.35, 0, sx, sy, sr);
    well.addColorStop(0, 'rgba(0,2,6,0.95)');
    well.addColorStop(1, 'rgba(10,13,20,0.75)');
    g.fillStyle = well;
    g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
    g.lineWidth = 0.9;
    g.strokeStyle = 'rgba(0,0,0,0.8)';            // shadowed upper wall
    g.beginPath(); g.arc(sx, sy, sr, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.strokeStyle = 'rgba(205,222,245,0.4)';      // lit lower lip
    g.beginPath(); g.arc(sx, sy, sr, Math.PI * 0.12, Math.PI * 0.88); g.stroke();

    g.font = font;
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const paint = (dy, stroke) => {
      let x = tx;
      for (const ch of text) {
        g.fillText(ch, x, ty + dy);
        if (stroke) g.strokeText(ch, x, ty + dy);
        x += g.measureText(ch).width + ls;
      }
    };
    g.fillStyle = 'rgba(0,0,0,0.8)';              // shadowed upper wall
    paint(-0.7);
    g.fillStyle = 'rgba(205,222,245,0.32)';       // lit lower lip
    paint(0.8);
    const face = g.createLinearGradient(sx, 0, tx + textW, 0);
    face.addColorStop(0, lit ? `rgba(${rgb},0.9)` : 'rgba(176,190,210,0.8)');
    face.addColorStop(0.35, 'rgba(184,200,222,0.86)');
    face.addColorStop(1, 'rgba(176,192,215,0.82)');
    g.fillStyle = g.strokeStyle = face;
    g.lineWidth = 0.3;
    paint(0, true);
  }

  const UNLIT_RGB = [0.59, 0.62, 0.67]; // ONLINE's offline grey

  // A whole badge drawn into host: "● TEXT" exactly like LIVE (Michroma
  // 9.5px / 0.28em, a 9px orb, 12px gap) on a canvas that overhangs host by
  // the light spill's reach, plus the orb's breathing halo (.act-halo:
  // transform/opacity only). Lit, the orb is painted to match ONLINE's 3D
  // one (its shader's shading, sampled into a radial gradient, added on top
  // like the WebGL orb); unlit, it's a dim grey bead with a faint steel
  // halo breathing on the same cycle (.act-halo.is-dim).
  // Redraw whenever lit changes; it's one small canvas.
  function etchedBadge(host, { text, rgb: col = [0.45, 0.66, 1.0], lit = true }) {
    let cv = host.querySelector('canvas');
    if (!cv) {
      cv = document.createElement('canvas');
      host.appendChild(cv);
      const halo = document.createElement('span');
      halo.className = 'act-halo';
      host.appendChild(halo);
    }
    const dotR = 4.5, gap = 12, fs = 9.5, lsp = 0.28 * fs;
    const font = `400 ${fs}px Michroma, "Share Tech Mono", sans-serif`;
    // Michroma may still be loading the first time: draw now, redraw once it's in
    if (document.fonts && !document.fonts.check(font)) {
      document.fonts.load(font).then(() => etchedBadge(host, { text, rgb: col, lit }), () => {});
    }
    const g0 = cv.getContext('2d');
    g0.font = font;
    let textW = 0;
    for (const ch of text) textW += g0.measureText(ch).width + lsp;
    const w = dotR * 2 + gap + textW, h = 14;
    const sr = dotR * 1.7, pad = Math.ceil(sr * 4) + 2, ss = Math.min(devicePixelRatio || 1, 2) * 2;
    const W = w + pad * 2, H = h + pad * 2;
    cv.width = Math.ceil(W * ss); cv.height = Math.ceil(H * ss);
    Object.assign(cv.style, { width: W + 'px', height: H + 'px', margin: `-${pad}px` });
    host.style.width = w + 'px';
    host.style.height = h + 'px';
    const g = cv.getContext('2d');
    g.setTransform(ss, 0, 0, ss, 0, 0);
    g.clearRect(0, 0, W, H);
    const rgb = col.map(v => Math.round(v * 255)).join(',');
    const sx = pad + dotR, sy = pad + h / 2;
    paintEtched(g, { sx, sy, sr, tx: pad + dotR * 2 + gap, ty: sy, textW, text, font, ls: lsp, rgb, lit });

    // the orb: lit, a small white-hot core, a clear band of its color,
    // darkening to the rim; unlit, the same bead in grey without the heat
    const orbR = dotR * 0.95; // leaves the same dark ring of socket as ONLINE's
    const grad = g.createRadialGradient(sx, sy, 0, sx, sy, orbR);
    const base = lit ? col : UNLIT_RGB;
    const tone = (white, lum) => `rgb(${base.map(v => Math.min(255, Math.round((v * (1 - white) + white) * lum * 255))).join(',')})`;
    if (lit) {
      grad.addColorStop(0, tone(0.8, 1.15));
      grad.addColorStop(0.3, tone(0.5, 1.05));
      grad.addColorStop(0.55, tone(0.12, 0.95));
      grad.addColorStop(0.8, tone(0, 0.7));
      grad.addColorStop(1, tone(0, 0.3));
    } else {
      grad.addColorStop(0, tone(0.1, 0.42));
      grad.addColorStop(0.6, tone(0, 0.26));
      grad.addColorStop(1, tone(0, 0.08));
    }
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = grad;
    g.beginPath(); g.arc(sx, sy, orbR, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';

    const halo = host.querySelector('.act-halo');
    const hd = dotR * 5; // same size as ONLINE's halo sprite
    Object.assign(halo.style, { width: hd + 'px', height: hd + 'px', left: (dotR - hd / 2) + 'px', top: (h / 2 - hd / 2) + 'px' });
    halo.style.setProperty('--halo-rgb', lit ? rgb : '140,175,220');
    halo.classList.toggle('is-dim', !lit);
  }

  window.etchedUI = { paintEtched, etchedBadge };
})();
