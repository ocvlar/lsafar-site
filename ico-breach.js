/**
 * iCO Core Breach: the Status popup's hidden easter egg.
 *
 * Click the Status iCO six times in a row (each within 1.1 s of the last).
 * Clicks 3 to 5 crack the glass and make the core tremble. The sixth shatters
 * it: slow motion, then the blast throws the shards out, plasma spreads
 * through the popup, one shard flies at the viewer and cracks the screen
 * itself (the panel leaks ink and loses pixel lines), the backlight overloads,
 * the power cuts, and ECHO OS reboots: the BIOS rebuild heals the glass, the
 * splash plays, and the iCO flies back together.
 *
 * Built in lab/ico-breach (its "Screen fracture" aftermath). ico.js is not
 * touched: from the third click this draws its own copy of the iCO (the same
 * shaders, cut into shards) where the real one is, which is only hidden, and
 * it mirrors ico.js's spin so the swap in and back out is seamless. ring.js
 * lends three hooks: window.icoRing.log / hold / capture.
 *
 * Cost while unused: a few listeners and a frame callback that checks a flag.
 * The WebGL layer is built on the first iCO click inside the popup, its
 * shaders compiled in the background without blocking the page (see warm),
 * and it is thrown away when the popup closes.
 *
 * The layer is transparent over the live page (premultiplied alpha): it adds
 * light, paints, and darkens what is behind it, so the popup's real glass
 * panel and the page under it stay as they are.
 */
(() => {
  'use strict';
  if (typeof THREE === 'undefined' || typeof NOISE === 'undefined') return;   // NOISE: ico.js's noise GLSL
  const modal = document.getElementById('ver-modal');
  const box = document.getElementById('ver-modal-box');
  const mount = document.getElementById('ico-mount');
  if (!modal || !box || !mount) return;

  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const ring = () => window.icoRing;
  const icoCanvas = () => mount.querySelector('canvas');

  // ── ico.js's spin, mirrored ────────────────────────────────────────────
  // ico.js keeps its rotation to itself; this replays its exact timing (the
  // same frame timestamps, 60 fps cap and pause flag), so the copy here always
  // stands at the angle the real iCO is at.
  const SPIN = 0.24, RX = 0.28;
  let mirrorRy = 0.4, mLastTs = 0, mLastFrame = 0;
  function mirror(ts) {
    requestAnimationFrame(mirror);
    if (window.__icoPaused) { mLastTs = 0; return; }
    if (ts - mLastFrame < 1000 / 60 - 2) return;
    mLastFrame = ts;
    const s = ts * 0.001, dt = mLastTs ? s - mLastTs : 0.016;
    mLastTs = s;
    mirrorRy += SPIN * dt;
  }
  requestAnimationFrame(mirror);

  /* ───────────────────────── sound (synthesised; the site's audio context) ───────────────────────── */
  const A = { ctx: null, master: null, buf: null, hum: null, bus: null };
  function ac() {
    if (!A.ctx) {
      A.ctx = typeof _actx !== 'undefined' ? _actx : null;   // index.html's shared context
      if (!A.ctx) return null;
      A.master = A.ctx.createGain(); A.master.gain.value = 0.6;
      A.master.connect(A.ctx.destination);
      const len = A.ctx.sampleRate * 2, b = A.ctx.createBuffer(1, len, A.ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      A.buf = b;
    }
    if (A.ctx.state === 'suspended') A.ctx.resume();
    return A.ctx;
  }
  function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function tone(type, f0, f1, t, dur, peak, dest, a = 0.005) {
    const c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, a, peak, dur); o.connect(g); g.connect(dest || A.master); o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(t, dur, peak, o = {}) {
    const c = A.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = A.buf; s.loop = true;
    f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f0 || 1000, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur); f.Q.value = o.q || 0.8;
    env(g, t, o.a || 0.004, peak, dur); s.connect(f); f.connect(g); g.connect(o.dest || A.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  // one piece of glass: a struck plate rings at inharmonic partials, each dying
  // faster than the last, with a click of noise on contact; panned for width
  function tink(t, f, peak, dest, decay = 0.25) {
    const c = A.ctx; let out = dest || A.master;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8; p.connect(out); out = p; }
    for (const [m, g] of [[1, 1], [2.76, 0.45], [5.4, 0.2]]) tone('sine', f * m, null, t, decay / Math.sqrt(m), peak * g, out, 0.001);
    hiss(t, 0.012, peak * 0.7, { type: 'highpass', f0: 6000, dest: out });
  }
  const SFX = {
    // every click on the Status iCO (index.html leaves its usual click sound
    // out): only glass, a light tick on the pane for clicks 1 and 2, then a
    // struck pane that rings louder and cracks harder with each click
    tap(level) {
      if (!ac()) return; const t = A.ctx.currentTime, k = Math.max(0, level - 2);
      // levels: peaks ~0.22 at the first click (the site's old iCO click peaks
      // at 0.18), rising to ~0.37 by the fifth
      tink(t, 2200 + Math.random() * 1400, 0.22 + k * 0.05, null, 0.3 + k * 0.1);
      hiss(t, 0.05, 0.12 + k * 0.05, { type: 'highpass', f0: 3200 });
      // the crack running a little further each time
      for (let i = 0; i < k * 4; i++) hiss(t + 0.01 + Math.random() * 0.06 * k, 0.005, 0.1 + Math.random() * 0.1 * k, { type: 'highpass', f0: 3500 + Math.random() * 3500 });
    },
    hum(level) {
      if (!ac()) return; const c = A.ctx, t = c.currentTime;
      if (!A.hum) {
        const g = c.createGain(), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 170;
        g.gain.value = 0.0001; f.connect(g); g.connect(A.master);
        const os = [55, 55.7, 110.4].map(fr => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(); return o; });
        A.hum = { g, os };
      }
      A.hum.g.gain.cancelScheduledValues(t); A.hum.g.gain.setTargetAtTime(level >= 5 ? 0.075 : 0.04, t, 0.15);
    },
    humOff(fast) {
      if (!A.hum) return; const h = A.hum, t = A.ctx.currentTime; A.hum = null;
      h.g.gain.cancelScheduledValues(t); h.g.gain.setTargetAtTime(0.0001, t, fast ? 0.03 : 0.25);
      h.os.forEach(o => o.stop(t + (fast ? 0.3 : 1.5)));
    },
    breach() {
      if (!ac()) return; const c = A.ctx, t = c.currentTime;
      const bus = c.createGain(); bus.connect(A.master); A.bus = bus;
      // impact
      hiss(t, 0.2, 0.8, { type: 'highpass', f0: 2200, dest: bus });
      hiss(t, 0.55, 0.4, { f0: 4200, f1: 800, dest: bus });
      tone('sine', 120, 28, t, 1.4, 0.9, bus, 0.003);
      // glass, real-time then slowed
      for (let i = 0; i < 26; i++) {
        const slow = i >= 9, tt = t + (slow ? 0.13 + Math.random() * 1.1 : Math.random() * 0.12);
        tink(tt, (1800 + Math.random() * 3000) * (slow ? 0.5 : 1), slow ? 0.018 : 0.045, bus, slow ? 0.6 + Math.random() * 0.6 : 0.2 + Math.random() * 0.25);
      }
      // the held breath before release: a reversed swell
      hiss(t + 0.15, 1.15, 0.26, { type: 'lowpass', f0: 160, f1: 1100, a: 1.05, dest: bus });
      tone('sine', 36, 48, t + 0.15, 1.15, 0.3, bus, 1.0);
      setTimeout(() => SFX.breachLate(bus, t), 250);
    },
    breachLate(bus, t) {
      if (A.bus !== bus) return;
      const r = t + T_RELEASE;
      // the blast: a sharp crack, a low boom with a long rumbling tail, the plasma rush
      hiss(r, 0.03, 0.7, { type: 'highpass', f0: 1800, dest: bus });
      hiss(r, 1.9, 0.9, { type: 'lowpass', f0: 1400, f1: 90, q: 0.5, a: 0.006, dest: bus });
      hiss(r, 1.0, 0.5, { f0: 300, f1: 5200, q: 0.7, a: 0.015, dest: bus });
      tone('sine', 85, 24, r, 1.3, 0.85, bus, 0.004);
      // debris: fragments ringing as they scatter, dense at first, then thinning out
      for (let i = 0; i < 34; i++) {
        const k = Math.pow(Math.random(), 1.8);
        tink(r + 0.06 + k * 2.6, 1800 + Math.random() * 3200, 0.05 * (1 - k * 0.7), bus, 0.12 + Math.random() * 0.2);
      }
      // corruption: a stepping noise bed
      for (let x = r; x < t + T_CUT; x += 0.09) hiss(x, 0.09, 0.03 + 0.09 * (x - r) / 3.55, { f0: 400 + Math.random() * 5000, q: 2, dest: bus });
      // a shard strikes the screen: a hard crack and a dull knock on the glass,
      // the crunch, the crack running out, loose bits, then the glass creaking
      const ti = t + T_IMPACT;
      hiss(ti, 0.02, 0.95, { type: 'highpass', f0: 1500, dest: bus });
      tone('sine', 150, 55, ti, 0.18, 0.6, bus, 0.002);
      hiss(ti, 0.3, 0.45, { f0: 2600, q: 0.9, dest: bus });
      for (let i = 0; i < 22; i++) hiss(ti + Math.pow(Math.random(), 2) * 0.12, 0.006, 0.3 * Math.random(), { type: 'highpass', f0: 3000 + Math.random() * 4000, dest: bus });
      for (let i = 0; i < 8; i++) tink(ti + 0.02 + Math.random() * 0.4, 2500 + Math.random() * 2500, 0.03, bus, 0.15);
      for (let i = 0; i < 10; i++) hiss(ti + 0.5 + Math.random() * 2.4, 0.05 + Math.random() * 0.08, 0.06, { f0: 900 + Math.random() * 900, q: 6, dest: bus });
      // the plasmoid: a rushing whoosh in flight, a wet sizzling splat, a crackle as it burns
      hiss(r, T_IMPACT - T_RELEASE, 0.3, { f0: 500, f1: 1800, q: 0.8, a: 0.2, dest: bus });
      hiss(ti, 0.5, 0.35, { type: 'lowpass', f0: 900, f1: 200, dest: bus });
      hiss(ti, 1.2, 0.18, { type: 'highpass', f0: 4000, dest: bus });
      for (let i = 0; i < 26; i++) hiss(ti + 0.2 + Math.random() * (T_CUT - T_IMPACT - 0.2), 0.006, 0.05 + Math.random() * 0.07, { type: 'highpass', f0: 3000 + Math.random() * 3000, dest: bus });
      // the backlight overloading in a burst of electrical crackle, then the power cut
      const o = t + T_CUT - T_OVERLOAD;
      hiss(o, T_OVERLOAD, 0.22, { f0: 3000, q: 1.5, a: 0.05, dest: bus });
      for (let i = 0; i < 30; i++) hiss(o + Math.random() * T_OVERLOAD, 0.005 + Math.random() * 0.008, 0.1 + Math.random() * 0.25, { type: 'highpass', f0: 2500 + Math.random() * 4000, dest: bus });
      hiss(t + T_CUT, 0.07, 0.45, { type: 'highpass', f0: 900, dest: bus });
      tone('sine', 60, 40, t + T_CUT + 0.01, 0.25, 0.4, bus, 0.002);
      bus.gain.setValueAtTime(1, t + T_CUT + 0.35); bus.gain.linearRampToValueAtTime(0, t + T_CUT + 0.45);
    },
    cut() { if (A.bus) { const t = A.ctx.currentTime; A.bus.gain.cancelScheduledValues(t); A.bus.gain.setTargetAtTime(0, t, 0.03); A.bus = null; } },
    beep() { if (!ac()) return; tone('square', 1000, null, A.ctx.currentTime, 0.16, 0.06, null, 0.002); },
    tick() { if (!A.ctx) return; hiss(A.ctx.currentTime, 0.014, 0.05, { type: 'highpass', f0: 4200 }); },
    reform(total) {
      if (!A.ctx) return; const t = A.ctx.currentTime;
      hiss(t, total, 0.16, { f0: 500, f1: 7000, q: 1.1, a: total * 0.92 });
      for (let i = 0; i < 18; i++) { const k = Math.pow(Math.random(), 0.5); tone('sine', 2400 + Math.random() * 4800, null, t + k * total, 0.12, 0.012 + k * 0.02, null, 0.002); }
    },
    snap() {
      if (!A.ctx) return; const t = A.ctx.currentTime;
      hiss(t, 0.03, 0.2, { type: 'highpass', f0: 2500 });
      tone('sine', 72, 40, t, 0.4, 0.3);
      tone('sine', 1318.5, null, t + 0.01, 1.8, 0.06, null, 0.004);
      tone('sine', 1975.5, null, t + 0.03, 2.2, 0.04, null, 0.004);
    },
  };

  /* ───────────────────────── shaders ───────────────────────── */
  // plasma: ico.js's, plus uWild (the core tearing loose) and uFade
  const plasmaVert = NOISE + `uniform float uT,uWild;varying vec3 vPos,vN,vV;void main(){vPos=position;
    vec3 p=position*(1.+uWild*0.42*snz(position*2.3+vec3(0.,uT*0.9,0.)));
    vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(p,1.);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`;
  const plasmaFrag = NOISE + `uniform float uT;uniform float uPulse,uFade;uniform vec3 uCD,uCM,uCB;varying vec3 vPos,vN,vV;void main(){vec3 p=vPos*0.65;vec3 q=vec3(fbm(p+vec3(0.,uT*.05,0.)),fbm(p+vec3(5.2,1.3,2.8)+uT*.05),fbm(p+vec3(2.2,8.4,.5)-uT*.02));float d=fbm(p+2.*q);float t=(d+.4)*.8;float alpha=smoothstep(0.05,.7,t);float side=smoothstep(-0.08,0.08,vPos.y+q.x*0.15);vec3 mainCol=mix(uCM,uCB,side);vec3 col=mix(uCD,mainCol,smoothstep(0.05,.5,t));col=mix(col,mainCol*1.15,smoothstep(.5,.8,t));col=mix(col,vec3(1.),smoothstep(.85,1.,t));float f=dot(normalize(vN),normalize(vV));float boost=1.0+uPulse*0.9;col*=boost;col=mix(col,vec3(0.85,0.92,1.0),uPulse*0.30);float aBoost=1.0+uPulse*0.45;gl_FragColor=vec4(col*2.4,alpha*(.05+.95*(f+1.)*.5)*aBoost*uFade);}`;

  // glass: ico.js's, plus: refraction offsets scaled by uK (this canvas isn't
  // ico.js's 220px one), per-edge crack seams (aO = which edges are the
  // icosahedron's own), shard thickness faces hidden while intact (uSolid),
  // the exposed core lighting the shards (uCoreI, 0 at rest), and uSq (see render)
  const glassVert = `
    attribute vec3 aBC; attribute vec3 aO; attribute float aPart; attribute vec3 aCen;
    uniform vec3 uImpact; uniform float uCrack;
    varying vec3 vN, vP, vBC, vO; varying float vPart, vReveal;
    void main(){
      vN = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vP = mv.xyz; vBC = aBC; vO = aO; vPart = aPart;
      float dist = distance(aCen, uImpact);
      vReveal = smoothstep(dist - 0.4, dist, uCrack * 2.4);
      gl_Position = projectionMatrix * mv;
    }`;
  const glassFrag = `
    uniform float t;
    uniform float uPulse, uSolid, uCrack, uCoreI, uSq;
    uniform vec3 uCoreV;
    uniform sampler2D bgTex;
    uniform vec2 res, uK;
    varying vec3 vN, vP, vBC, vO; varying float vPart, vReveal;
    float fresnelSchlick(float cosTheta, float f0){ return f0 + (1.0 - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0); }
    float ggx(float NdH, float rough){ float a2 = rough * rough; float d = NdH * NdH * (a2 - 1.0) + 1.0; return a2 / (3.14159 * d * d + 0.0001); }
    float specHighlight(vec3 N, vec3 V, vec3 L, float rough){ vec3 H = normalize(L + V); return ggx(max(dot(N, H), 0.0), rough) * max(dot(N, L), 0.0); }
    void main(){
      if (vPart > 0.5 && uSolid < 0.5) discard;
      vec3 N = gl_FrontFacing ? vN : -vN;
      vec3 V = normalize(-vP);
      float NdV = max(dot(N, V), 0.001);
      vec3 dw = fwidth(vBC);
      vec3 e  = 1.0 - smoothstep(vec3(0.0), dw * 1.8, vBC);
      vec3 ec = 1.0 - smoothstep(vec3(0.0), dw * 1.3, vBC);
      float edgeO = max(max(e.x * vO.x, e.y * vO.y), e.z * vO.z);
      float crack = max(max(ec.x * (1.0 - vO.x), ec.y * (1.0 - vO.y)), ec.z * (1.0 - vO.z)) * vReveal;
      float edge = max(edgeO, crack * 0.7);
      float fresnel = fresnelSchlick(NdV, 0.04);
      vec2 uv = gl_FragCoord.xy / res;
      float dispBoost = 1.0 + uPulse * 1.8;
      vec3 refDirR = refract(-V, N, 1.0 / (1.47 - uPulse * 0.05));
      vec3 refDirG = refract(-V, N, 1.0 / 1.50);
      vec3 refDirB = refract(-V, N, 1.0 / (1.53 + uPulse * 0.05));
      vec3 reflDir = reflect(-V, N);
      if(length(refDirR) < 0.001) refDirR = reflDir;
      if(length(refDirG) < 0.001) refDirG = reflDir;
      if(length(refDirB) < 0.001) refDirB = reflDir;
      float refrScale = 0.20 + edge * 0.06;
      vec2 uvR = clamp(uv + refDirR.xy * refrScale * 1.04 * dispBoost * uK, 0.01, 0.99);
      vec2 uvG = clamp(uv + refDirG.xy * refrScale * uK, 0.01, 0.99);
      vec2 uvB = clamp(uv + refDirB.xy * refrScale * 0.96 * dispBoost * uK, 0.01, 0.99);
      vec3 refracted = vec3(texture2D(bgTex, uvR).r, texture2D(bgTex, uvG).g, texture2D(bgTex, uvB).b);
      vec3 reflected = texture2D(bgTex, clamp(uv + reflDir.xy * 0.14 * uK, 0.01, 0.99)).rgb;
      float caustic = pow(max(dot(refDirG, vec3(0.0, 0.0, -1.0)), 0.0), 4.0) * 1.5;
      caustic *= 0.8 + 0.2 * sin(t * 2.0 + dot(N, vec3(1.7, 2.3, 0.5)) * 6.0);
      vec3 L1 = normalize(vec3(-0.5, 0.85, 0.6));
      vec3 L2 = normalize(vec3(0.8, 0.3, -0.5));
      vec3 L3 = normalize(vec3(0.0, -0.7, 0.7));
      float rough = 0.018;
      float totalSpec = specHighlight(N, V, L1, rough) * 0.55 + specHighlight(N, V, L2, rough) * 0.30 + specHighlight(N, V, L3, rough) * 0.20;
      float rim = pow(1.0 - NdV, 3.5);
      vec3 rimCol = vec3(0.55, 0.58, 0.82) * rim * (0.40 + uPulse * 0.55);
      rimCol += vec3(0.80, 0.88, 1.05) * pow(1.0 - NdV, 2.2) * uPulse * 0.30;
      float bevelSpec = edge * (0.3 + 0.5 * pow(max(dot(reflect(-L1, N), V), 0.0), 16.0));
      vec3 bevelCol = vec3(0.65, 0.70, 0.88) * bevelSpec * 0.45;
      vec3 col; float alpha;
      if(gl_FrontFacing){
        vec3 interior = refracted * (1.2 + caustic * 0.5);
        vec3 intRefl = reflected * fresnel * 0.45;
        vec3 reflCol = vec3(0.60, 0.65, 0.85) * fresnel * 0.28;
        vec3 specCol = vec3(0.80, 0.82, 0.95) * totalSpec;
        vec3 causticCol = refracted * caustic * 0.35;
        col = interior * (1.0 - fresnel * 0.5) + intRefl + reflCol + specCol + rimCol + bevelCol + causticCol;
        col += vec3(0.05, 0.08, 0.14) * rim * 0.3;
        alpha = mix(0.32, 0.85, fresnel) + totalSpec * 0.5 + edge * 0.35 + caustic * 0.1;
        alpha = clamp(alpha, 0.22, 0.97);
      } else {
        float iFresnel = pow(1.0 - NdV, 1.8);
        vec3 backRef = refract(-V, N, 1.5);
        if(length(backRef) < 0.001) backRef = reflDir;
        vec3 backRefracted = vec3(
          texture2D(bgTex, clamp(uv + backRef.xy * 0.12 * 1.03 * uK, 0.01, 0.99)).r,
          texture2D(bgTex, clamp(uv + backRef.xy * 0.12 * uK, 0.01, 0.99)).g,
          texture2D(bgTex, clamp(uv + backRef.xy * 0.12 * 0.97 * uK, 0.01, 0.99)).b);
        vec3 backRefl = texture2D(bgTex, clamp(uv + reflDir.xy * 0.10 * uK, 0.01, 0.99)).rgb;
        vec3 internalTint = vec3(0.10, 0.30, 0.48) * (1.0 - iFresnel) * 0.35;
        col = backRefracted * 0.65 + backRefl * iFresnel * 0.3 + internalTint + rimCol * 0.4 + bevelCol * 0.5;
        col += vec3(0.7, 0.85, 1.0) * specHighlight(N, V, L1, 0.05) * 0.15;
        alpha = mix(0.18, 0.60, iFresnel) + edge * 0.25;
        alpha = clamp(alpha, 0.12, 0.72);
      }
      // fracture seams: thin ice-white light leaking from the core
      col += vec3(0.78, 0.9, 1.0) * crack * (0.85 + uPulse * 1.6);
      alpha = max(alpha, crack * 0.9);
      // after the break: the exposed core lights the flying shards
      if (uCoreI > 0.0) {
        vec3 Lc = uCoreV - vP; float dc = length(Lc); Lc /= dc;
        float att = uCoreI / (1.0 + dc * dc * 0.35);
        float glint = specHighlight(N, V, Lc, 0.12) * 0.05;
        float through = pow(max(dot(-V, Lc), 0.0), 6.0) * (1.0 - fresnel);
        col += vec3(0.72, 0.86, 1.0) * att * (glint + through * 0.3 + edge * 0.6 + 0.03);
        alpha = max(alpha, clamp(att * (glint * 0.6 + edge * 0.5), 0.0, 0.95));
      }
      gl_FragColor = vec4(col * mix(1.0, alpha, uSq), alpha);
    }`;

  // Debris motion, shared by the shards (JS) and the dust (GLSL): each impulse
  // is a hard kick bled off by air drag, leaving a slow drift.
  const KICK1 = [2.4, 0.06], KICK2 = [0.9, 0.22];
  const kick = (x, [k, v]) => x <= 0 ? 0 : (1 - Math.exp(-k * x)) / k + v * x;
  const dustVert = `
    attribute vec3 aDir; attribute vec4 aPar;   // speed, wave (0 crack, 1 blast), size, seed
    uniform float uTau, uTauR, uPx; uniform vec3 uCam, uGrav;
    varying float vA, vSeed;
    float kick(float x, float k, float v){ return x <= 0. ? 0. : (1. - exp(-k * x)) / k + v * x; }
    void main(){
      float blast = aPar.y;
      float x = uTau - blast * uTauR;
      vec3 dir = normalize(aDir + uCam * 0.4);
      float d = blast > 0.5 ? 2.6 * kick(x, ${KICK2[0].toFixed(2)}, ${KICK2[1].toFixed(2)}) : 1.3 * kick(x, ${KICK1[0].toFixed(2)}, ${KICK1[1].toFixed(2)});
      vec3 p = position + dir * aPar.x * d + uGrav * 0.1 * max(x, 0.) * max(x, 0.);
      vec4 mv = modelViewMatrix * vec4(p, 1.);
      gl_Position = projectionMatrix * mv;
      float z = max(-mv.z, 0.05);
      gl_PointSize = min(aPar.z * 0.07 * uPx / z, 40.);
      vA = step(0., x) * exp(-max(x, 0.) * 0.3) * smoothstep(0.6, 1.4, z);
      vSeed = aPar.w;
    }`;
  const dustFrag = `
    uniform float uT, uI;
    varying float vA, vSeed;
    void main(){
      vec2 q = gl_PointCoord * 2. - 1.; float r = dot(q, q);
      if (r > 1. || vA < 0.002) discard;
      float tw = pow(0.5 + 0.5 * sin(uT * (7. + vSeed * 16.) + vSeed * 40.), 8.);
      float dot0 = exp(-r * 9.);
      float star = (exp(-abs(q.x) * 16.) + exp(-abs(q.y) * 16.)) * tw * (1. - r);
      float b = (dot0 * (0.25 + 0.9 * tw) + star * 0.55) * vA * (0.45 + uI * 0.4);
      gl_FragColor = vec4(vec3(0.78, 0.9, 1.0) * b, b);
    }`;

  const H21 = `float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`;
  // The cracked cover glass: the corruption pass draws it, and so does the
  // glass-only pane over the BIOS. P: position from the impact in screen-height
  // units. run: 0..1 the cracks spreading; creep: stress cracks extending
  // later; heal: 0..1 the reboot pulling the cracks back in, one after another.
  // Loop counts the compiler can't see: on Windows (ANGLE → Direct3D) the
  // driver unrolls every fixed-count loop, which made the big passes take
  // seconds to compile, and Firefox can only compile on the page's own
  // thread (no KHR_parallel_shader_compile): the boot text froze. With LZ, a
  // uniform nothing sets (so 0), the loops run exactly as before but stay
  // loops. WebGL 2 only (WebGL 1 needs constant bounds): see loopy().
  // The bigger cost was the simplex noise (snz): the driver pastes its whole
  // body into every call, dozens of them, so the corruption pass took ~4.8 s
  // to compile. In these two passes snz reads a baked noise texture instead
  // (noise3D: tileable gradient noise, scaled to snz's spread): one lookup
  // per call, the same soft organic shapes; the pass compiles in under 1 s.
  const LOOPY = `uniform int uLZ;
#define LZ uLZ
uniform highp sampler3D uNz;
`, FLAT = `#define LZ 0
`;
  const BAKED = `float snz(vec3 v){ return (texture(uNz, v * 0.125).r - 0.5) * 6.0; }
  float snzFull(vec3 v){`;
  const loopy = (src, gl2) => gl2
    ? LOOPY + src.replace('for(int i=0;i<3;i++)', 'for(int i=0;i<3+LZ;i++)').replace('float snz(vec3 v){', BAKED)
    : FLAT + src;
  // 64³ texels, 8 per unit, repeating every 8 units in each axis
  let noiseTex = null;
  function noise3D() {
    if (noiseTex) return noiseTex;
    const N = 64, PER = 8, S = N / PER, rnd = mulberry32(5), GR = new Float32Array(PER * PER * PER * 3);
    for (let i = 0; i < PER * PER * PER; i++) {
      let x, y, z, d;
      do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; d = x * x + y * y + z * z; } while (d > 1 || d < 0.01);
      d = Math.sqrt(d); GR[i * 3] = x / d; GR[i * 3 + 1] = y / d; GR[i * 3 + 2] = z / d;
    }
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10), data = new Uint8Array(N * N * N);
    const SPREAD = 3.71;   // snz's spread over this noise's
    let o = 0;
    for (let tz = 0; tz < N; tz++) for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
      const x = (tx + 0.5) / S, y = (ty + 0.5) / S, z = (tz + 0.5) / S;
      const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), fx = x - X, fy = y - Y, fz = z - Z;
      const u = fade(fx), v = fade(fy), w = fade(fz);
      let r = 0;
      for (let c = 0; c < 8; c++) {
        const cx = c & 1, cy = (c >> 1) & 1, cz = (c >> 2) & 1, g = (((X + cx) & 7) + ((Y + cy) & 7) * 8 + ((Z + cz) & 7) * 64) * 3;
        r += (GR[g] * (fx - cx) + GR[g + 1] * (fy - cy) + GR[g + 2] * (fz - cz)) * (cx ? u : 1 - u) * (cy ? v : 1 - v) * (cz ? w : 1 - w);
      }
      data[o++] = Math.max(0, Math.min(255, Math.round((r * SPREAD / 6 + 0.5) * 255)));
    }
    noiseTex = new THREE.DataTexture3D(data, N, N, N);
    noiseTex.format = THREE.RedFormat; noiseTex.type = THREE.UnsignedByteType;
    noiseTex.minFilter = noiseTex.magFilter = THREE.LinearFilter;
    noiseTex.wrapS = noiseTex.wrapT = noiseTex.wrapR = THREE.RepeatWrapping;
    noiseTex.unpackAlignment = 1; noiseTex.needsUpdate = true;
    return noiseTex;
  }
  const CRACK_GLSL = `
    struct Glass { float d; float ringN; float si; float crush; float frag; vec2 vi; float w; float ca; };
    Glass glassCracks(vec2 P, float run, float creep, float heal) {
      // (the shader's costliest part: skipped wherever it can't show)
      if (run <= 0.0) { Glass z; z.d = 1e3; z.ringN = 0.0; z.si = 0.0; z.crush = 0.0; z.frag = 0.0; z.vi = vec2(0.0); z.w = 1.0; z.ca = 0.0; return z; }
      Glass g;
      float r = length(P), ang = atan(P.y, P.x);
      const float NR = 11.0;
      g.si = floor((ang + 3.14159265) / 6.2831853 * NR);
      g.d = 1e3; g.w = 1.0; g.ca = 0.0;
      float aLo = 0.0, aHi = 0.0, rLo = 0.0, rHi = 0.0;
      for (int j = 0; j < 2 + LZ; j++) {
        float ci = mod(g.si + float(j), NR);
        // radial: mostly straight, a few kinks
        float wob = snz(vec3(r * 3.0, ci * 7.1, 0.0)) * 0.14 + snz(vec3(r * 16.0, ci * 3.3, 1.0)) * 0.02;
        float a0 = (ci + 0.3 * (h21(vec2(ci, 3.0)) - 0.5) + wob) / NR * 6.2831853 - 3.14159265;
        // healing: each crack's turn comes at its own point of the rebuild,
        // the turns spread evenly (a golden-ratio shuffle) across the count
        float back = 1.0 - smoothstep(0.0, 1.0, clamp(heal * 1.15 * NR - fract(ci * 0.618034 + 0.1) * NR, 0.0, 1.0));
        float reach = ((0.25 + 0.75 * h21(vec2(ci, 9.1))) * run + 0.6 * creep * step(0.6, h21(vec2(ci, 5.5)))) * back;
        if (j == 0) { aLo = a0; rLo = reach; } else { aHi = a0; rHi = reach; }
        // a real crack edge is jagged at every scale, and it thins to a hairline at its tip
        // (the jagged edge only matters right at the line)
        float sda = mod(ang - a0 + 3.14159265, 6.2831853) - 3.14159265, off = sda * r;
        float jit = abs(off) < 0.004 ? snz(vec3(r * 90.0, ci * 5.3, 4.0)) * 0.0011 + snz(vec3(r * 260.0, ci * 2.1, 6.0)) * 0.0004 : 0.0;
        float dr = abs(off + jit) + step(reach, r) * 1e3;
        if (dr < g.d) { g.d = dr; g.ca = a0; g.w = (0.6 + 0.9 * h21(vec2(ci, 12.7))) * mix(1.0, 0.3, clamp(r / max(reach, 1e-3), 0.0, 1.0)); }
        // a fork partway out, splitting off at a shallow angle (worked out
        // only near it: it starts at rf, runs at most 0.2, strays at most ~0.07)
        float rf = 0.1 + 0.25 * h21(vec2(ci, 4.4));
        if (rf < reach && r > rf - 0.01 && r < rf + 0.22 && abs(off) < 0.09) {
          float side = h21(vec2(ci, 6.6)) > 0.5 ? 1.0 : -1.0;
          vec2 rd = vec2(cos(a0), sin(a0));
          vec2 D = vec2(rd.x * 0.94 - rd.y * 0.34 * side, rd.x * 0.34 * side + rd.y * 0.94);
          vec2 BP = P - rd * rf; float tB = dot(BP, D);
          float lenB = (0.06 + 0.14 * h21(vec2(ci, 8.8))) * run * back;
          if (tB > 0.0 && tB < lenB) {
            float dB = abs(BP.x * D.y - BP.y * D.x + snz(vec3(tB * 120.0, ci, 8.0)) * 0.0008);
            if (dB < g.d) { g.d = dB; g.ca = atan(D.y, D.x); g.w = 0.55 * mix(1.0, 0.3, tB / max(lenB, 1e-3)); }
          }
        }
      }
      // the web: straight chords from one radial crack to the next, dense near
      // the impact, sparser and more often missing further out
      g.ringN = 0.0;
      float ac = (g.si + 0.5) / NR * 6.2831853 - 3.14159265;
      vec2 uLo = vec2(cos(aLo), sin(aLo)), uHi = vec2(cos(aHi), sin(aHi));
      float rc = dot(P, vec2(cos(ac), sin(ac))), rMin = min(rLo, rHi);
      for (int k = 0; k < 5 + LZ; k++) {
        float rr = 0.035 * pow(1.85, float(k)) * (0.7 + 0.6 * h21(vec2(g.si, float(k))));
        g.ringN += step(rr * cos(3.14159265 / NR), rc);
        // (a chord lies within ~0.08 rr inside its ring: skip it unless it could be the nearest crack)
        if (rr >= 0.5 * run || rr >= rMin || abs(r - rr) - rr * 0.08 > g.d) continue;
        if (h21(vec2(g.si, float(k) + 20.0)) <= 0.3 + 0.1 * float(k)) continue;
        vec2 Q0 = rr * uLo, Q1 = rr * uHi;
        vec2 pa = P - Q0, ba = Q1 - Q0;
        float tq = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        float sd = length(pa - ba * tq) + snz(vec3(tq * 30.0, g.si, float(k) + 11.0)) * 0.0007;
        if (abs(sd) < g.d) { g.d = abs(sd); g.ca = atan(ba.y, ba.x); g.w = 0.45 + 0.4 * h21(vec2(g.si, float(k) + 30.0)); }
      }
      // the crush: where the shard struck, the glass is powder and tiny fragments
      g.crush = smoothstep(0.05, 0.012, r) * run * (1.0 - smoothstep(0.75, 1.0, heal));
      vec2 vp = P * 110.0, vf = fract(vp);
      g.vi = floor(vp);
      g.frag = 0.0;
      if (r < 0.13) {   // the fragments only show in the crush and around the hole
        float m1 = 8.0, m2 = 8.0;
        for (int y = -1; y <= 1 + LZ; y++) for (int x = -1; x <= 1 + LZ; x++) {
          vec2 o = vec2(float(x), float(y));
          float dd = length(o + vec2(h21(g.vi + o), h21(g.vi + o + 19.1)) - vf);
          if (dd < m1) { m2 = m1; m1 = dd; } else if (dd < m2) m2 = dd;
        }
        g.frag = 1.0 - smoothstep(0.0, 0.08, m2 - m1);
      }
      return g;
    }
    // a crack as glass shows it: a thin line catching the light (line), its
    // brightness varying along the length (vis), and a dark refracting edge (returned)
    // A crack's broken face only flashes when it's angled to the light (from
    // the upper left): some cracks glint, others are faint dark hairlines.
    float crackShade(vec2 P, float d, float px, float w, float ca, out float line, out float vis) {
      float lw = px * w * mix(1.3, 0.6, smoothstep(0.0, 0.5, length(P)));
      line = 1.0 - smoothstep(lw * 0.5, lw * 1.5, d);
      float facing = pow(abs(sin(ca - 0.9)), 3.0);
      vis = d < lw * 4.0 ? (0.1 + 0.9 * facing) * (0.45 + 0.55 * smoothstep(-0.3, 0.6, snz(vec3(P * 6.0, 3.0)))) : 0.0;
      return 1.0 - smoothstep(lw * 1.5, lw * 3.5, d);
    }
    // the burn-through: a ragged round hole where the plasmoid melted the glass
    // and the panel; signed distance to its edge (negative inside)
    float holeEdge(vec2 P, float R) {
      vec2 u = normalize(P + 1e-6);
      float rag = snz(vec3(u * 1.8, 7.0)) * 0.2 + snz(vec3(u * 4.5, 3.0)) * 0.06 + snz(vec3(u * 11.0, 5.0)) * 0.012;
      return length(P * vec2(0.92, 1.0)) - R * (1.0 + rag);
    }
    // the liquid-crystal leak: signed distance to the blot's ragged edge (negative
    // inside), a main blot of radius R and a smaller one further along crack 0
    float inkEdge(vec2 P, float R, out float bn) {
      bn = fbm(vec3(P * 9.0, 2.0)) * 0.45 + snz(vec3(P * 34.0, 5.0)) * 0.08;
      // one blot, where the plasmoid splats
      return length(P * vec2(0.85, 1.0)) * (1.0 + bn) - R;
    }
  `;

  // The corruption pass: the popup's content (a snapshot) eaten by plasma,
  // seen through the monitor's broken glass. Output is premultiplied over the
  // live page: C.rgb is the light this layer gives, C.a how much of the page
  // behind it hides.
  const quadVert = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
  const compFrag = NOISE + H21 + CRACK_GLSL + `
    uniform sampler2D uSite, uRing; uniform vec2 uRes, uCore, uImp; uniform vec4 uRingRect;
    uniform vec4 uJet, uPl; uniform float uE;
    uniform float uT, uHitAge, uOver, uGlow, uSurge, uSpread, uGlitch, uSeed, uFlash, uShock, uShockAmp, uDim;
    uniform vec3 uCD, uCM, uCB;
    varying vec2 vUv;
    vec4 C;
    void light(vec3 l){ C.rgb += l; }                                    // light over everything
    void dim(float k){ C.rgb *= k; C.a = 1.0 - (1.0 - C.a) * k; }        // darken, page included
    void paint(vec3 c, float m){ C = mix(C, vec4(c, 1.0), m); }          // paint over
    vec3 plasmaCol(float t){
      vec3 pc = mix(uCD, uCM, smoothstep(0.05, .5, t)); pc = mix(pc, uCB * 1.15, smoothstep(.5, .8, t));
      return mix(pc, vec3(1.), smoothstep(.85, 1., t)) * 2.4;
    }
    // the popup's content at p, premultiplied: its text and small canvases
    // (uSite) over the ring (uRing, uploaded straight from ring.js's canvas)
    vec4 content(vec2 p){
      vec4 s = texture2D(uSite, p); s.rgb *= s.a;
      vec2 rp = (p - uRingRect.xy) / max(uRingRect.zw - uRingRect.xy, vec2(1e-5));
      if (rp.x > 0.0 && rp.y > 0.0 && rp.x < 1.0 && rp.y < 1.0) { vec4 g = texture2D(uRing, rp); g.rgb *= g.a; s += g * (1.0 - s.a); }
      return s;
    }
    // The escaping plasma as a plasmoid: a blob thrown out behind the hero shard
    // that splats on the glass and bleeds into the cracks (see updatePlasmoid).
    float vn2(vec2 x){ vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
    void main(){
      vec2 uv = vUv; float asp = uRes.x / uRes.y;
      vec2 q = uv - uCore; q.x *= asp; float d = length(q); vec2 dir = q / max(d, 1e-4);
      float sw = exp(-pow((d - uShock) / 0.035, 2.0)) * uShockAmp;
      uv -= vec2(dir.x / asp, dir.y) * sw * 0.03;
      float g = uGlitch * 0.6;
      // block displacement
      float bs = floor(mix(10.0, 34.0, h21(vec2(uSeed, 1.7))));
      vec2 bc = floor(vec2(uv.x * bs * asp * 0.6, uv.y * bs));
      float blk = step(h21(bc + uSeed * 7.13), g * 0.42);
      uv.x += blk * (h21(bc + uSeed + 3.1) - 0.5) * 0.16 * g;
      if (blk > 0.5 && h21(bc + 9.2 + uSeed) < 0.35) uv.y = (bc.y + 0.5) / bs;
      // scanline tears
      float row = floor(uv.y * 110.0);
      uv.x += step(h21(vec2(row, uSeed * 3.3)), g * 0.14) * (h21(vec2(row + 5.0, uSeed)) - 0.5) * 0.1;
      float ca = 0.0015 + g * 0.012 + sw * 0.02;
      // the monitor's glass: the struck point, its cracks, the loose pieces
      // each sitting a little askew over what's behind them
      vec2 P = (vUv - uImp) * vec2(asp, 1.0);
      float r = length(P), ang = atan(P.y, P.x);
      float hit = step(0.0, uHitAge);
      float run = smoothstep(0.0, 0.07, uHitAge) * hit;   // cracks cross glass almost instantly
      float px = 1.0 / uRes.y;
      Glass gc = glassCracks(P, run, smoothstep(0.4, 3.0, uHitAge), 0.0);
      vec2 cell = vec2(gc.si, gc.ringN);
      uv += (vec2(h21(cell + 1.3), h21(cell + 7.7)) - 0.5) * 0.004 * run;
      uv += (vec2(h21(gc.vi), h21(gc.vi + 3.0)) - 0.5) * 0.012 * gc.crush;
      // the popup's content, premultiplied, with a chromatic split
      vec4 sR = content(uv + vec2(ca, 0.0)), sG = content(uv), sB = content(uv - vec2(ca, 0.0));
      C = vec4(sR.r, sG.g, sB.b, sG.a);
      // the plasmoid: a blob of plasma flying behind the shard (uJet.zw), wispy
      // and swelling (uPl.x radius, w in flight); it splats on the glass into a
      // disc (uPl.y) that cools from white-hot to blue (uPl.z)
      if (uE > 0.0) {
        vec2 pa = vUv * vec2(asp, 1.0);
        vec2 bq = pa - uJet.zw * vec2(asp, 1.0); float bd = length(bq);
        float bw = vn2(bq * 30.0 + uT * 1.5) * 0.6 + vn2(bq * 70.0 - uT * 3.0) * 0.4;
        float rr = max(uPl.x * (0.75 + 0.5 * bw), 1e-4);
        light((mix(vec3(0.3, 0.5, 1.0), vec3(1.0, 0.98, 0.95), exp(-bd / rr)) * exp(-pow(bd / rr, 2.0)) * 1.6
              + vec3(0.3, 0.55, 1.0) * exp(-bd / (rr * 2.5)) * 0.35) * uPl.w * uE);
        vec2 sq = pa - uImp * vec2(asp, 1.0); float sd = length(sq);
        float sw2 = vn2(sq * 25.0 + 3.0) * 0.5 + vn2(sq * 60.0 - uT) * 0.5;
        float disc = smoothstep(uPl.y * (0.8 + 0.5 * sw2), uPl.y * 0.35, sd);
        light((mix(vec3(0.25, 0.45, 1.0), vec3(1.0, 0.97, 0.92), uPl.z * uPl.z) * disc * (0.5 + 0.7 * sw2)
              + vec3(0.3, 0.55, 1.0) * exp(-sd / max(uPl.y * 1.8, 1e-4)) * 0.35) * uJet.x * uE);
      }
      light(vec3(0.7, 0.85, 1.0) * sw * 0.25);
      // light bleeding out of the core between the shards
      light(vec3(0.55, 0.75, 1.0) * uGlow * (exp(-d * d / 0.004) * 1.4 + exp(-d * d / 0.05) * 0.35));
      if (blk > 0.5 && h21(bc + uSeed * 1.9) < 0.4) C.rgb = floor(C.rgb * 5.0 + 0.5) / 5.0;
      light(vec3((h21(gl_FragCoord.xy + fract(uT) * 91.0) - 0.5) * 0.07 * g));
      dim(1.0 - 0.18 * g * step(0.5, fract(gl_FragCoord.y * 0.5)));
      dim(1.0 - uDim);
      paint(vec3(0.86, 0.93, 1.0), uFlash);
      // backlight overload, the panel's last fraction of a second: the LED zones
      // behind it flare unevenly and flicker, the light pools in clouds, and the
      // edges stay dim
      if (uOver > 0.0) {
        vec2 zc = vUv * vec2(8.0, 5.0) - 0.5, zi = floor(zc), zf = smoothstep(0.0, 1.0, fract(zc));
        float fs = floor(uT * 16.0);
        float zone = mix(mix(h21(zi + fs), h21(zi + vec2(1.0, 0.0) + fs), zf.x),
                         mix(h21(zi + vec2(0.0, 1.0) + fs), h21(zi + vec2(1.0, 1.0) + fs), zf.x), zf.y);
        zone = smoothstep(0.3, 0.95, zone);
        float cloud = 0.55 + 0.45 * fbm(vec3(vUv * vec2(asp, 1.0) * 3.0, uT * 0.5));
        vec2 ev = min(vUv, 1.0 - vUv) * vec2(asp, 1.0);
        float rim = smoothstep(0.0, 0.2, min(ev.x, ev.y));
        float flare = uOver * zone * cloud * rim;
        dim(mix(1.0, 0.45 + 0.55 * zone, uOver));
        C.rgb *= 1.0 + 2.0 * flare;
        light(vec3(0.8, 0.86, 0.97) * flare * 1.6);
        dim(mix(1.0, rim, uOver * 0.6));
      }
      // the broken hardware, over everything the display shows
      if (hit > 0.5) {
        // the backlight stutters after the blow
        dim(1.0 - 0.3 * step(0.72, h21(vec2(floor(uHitAge * 22.0), 1.0))) * exp(-uHitAge * 1.2));
        // pressure marks: cloudy uneven backlight around the impact
        if (r < 0.35) light(vec3(0.5, 0.55, 0.62) * 0.08 * smoothstep(0.35, 0.0, r) * (0.5 + 0.5 * fbm(vec3(P * 5.0, 1.0))) * (1.0 - uFlash));
        // dead columns and rows, clustered around the impact; some only run from the crack down
        float colI = floor(vUv.x * uRes.x), rowI = floor(vUv.y * uRes.y);
        float pcol = 0.01 + 0.07 * smoothstep(0.22, 0.0, abs(vUv.x - uImp.x));
        float prow = 0.003 + 0.02 * smoothstep(0.15, 0.0, abs(vUv.y - uImp.y));
        float vl = step(1.0 - pcol, h21(vec2(colI, 7.7))) * step(h21(vec2(colI, 9.0)) * 2.5, uHitAge) * (h21(vec2(colI, 2.0)) > 0.5 ? step(vUv.y, uImp.y) : 1.0);
        float hl = step(1.0 - prow, h21(vec2(rowI, 3.9))) * step(h21(vec2(rowI, 4.0)) * 2.5, uHitAge);
        vl *= min(1.0, step(0.25, fract(uT * 0.7 + h21(vec2(colI, 5.0)) * 9.0)) + step(0.5, h21(vec2(colI, 6.0))));   // some flicker
        float pick = floor(h21(vec2(vl > 0.5 ? colI : rowI + 5000.0, 8.0)) * 7.0);
        vec3 lc = pick < 1.0 ? vec3(1, 0.1, 0.1) : pick < 2.0 ? vec3(0.1, 1, 0.2) : pick < 3.0 ? vec3(0.2, 0.3, 1) : pick < 4.0 ? vec3(1, 0.2, 1) : pick < 5.0 ? vec3(0.2, 1, 1) : pick < 6.0 ? vec3(1) : vec3(0);
        paint(lc, max(vl, hl) * 0.9);
        // liquid crystal leaking from the impact: a spreading black blot with a
        // thin-film rainbow at its rim
        float bn = 0.0;   // (the blot never reaches past r 0.3)
        float eb = r < 0.4 ? inkEdge(P, 0.03 + 0.1 * sqrt(clamp(uHitAge / 3.0, 0.0, 1.0)), bn) : 1.0;
        float grown = smoothstep(0.0, 0.15, uHitAge);
        vec3 ink = vec3(0.012, 0.007, 0.025) + vec3(0.05, 0.03, 0.1) * smoothstep(-0.04, 0.0, eb) * (0.6 + 0.4 * bn);
        paint(ink, smoothstep(0.008, -0.008, eb) * grown);
        vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + eb * 45.0 + 0.15));
        paint(film * 0.6, exp(-pow(eb / 0.006, 2.0)) * 0.22 * grown);
        // the burn-through: opens as the plasmoid splats, then keeps melting wider
        float Rh = (0.04 + 0.025 * sqrt(clamp(uHitAge / 3.0, 0.0, 1.0))) * smoothstep(0.0, 0.2, uHitAge);
        float hd = r < 0.35 ? holeEdge(P, Rh) : r;   // (the hole's edge stays within r 0.1)
        float outside = smoothstep(-0.5 * px, 1.5 * px, hd);
        float heat = uPl.z * uJet.x;
        // scorch: soot and heat-browned glass around the burn, uneven
        float sc = hd < 0.25 ? exp(-max(hd, 0.0) / 0.03) * (0.5 + 0.5 * fbm(vec3(P * 18.0, 4.0))) * smoothstep(0.0, 0.3, uHitAge) * outside : 0.0;
        dim(1.0 - 0.55 * sc);
        paint(vec3(0.08, 0.05, 0.03), sc * 0.3);
        // the cover glass: cracks start at the hole's edge, each catching the light its own way
        float line, vis;
        float dark = crackShade(P, gc.d, px, gc.w, gc.ca, line, vis) * outside;
        line *= outside;
        dim(1.0 - 0.45 * dark * run);
        paint(vec3(0.86, 0.9, 0.95), line * vis * run * 0.85);
        // where the plasmoid splats it seeps into the nearest cracks, a thin blue
        // glow that creeps further as it burns (uJet.y: how far)
        float spreadM = smoothstep(uJet.y, uJet.y * 0.4, r) * run * outside;
        float liv = spreadM > 0.0 && gc.d < 0.02 ? 0.5 + 0.5 * vn2(P * 40.0 - uT * 3.0) : 0.0;
        light((vec3(0.8, 0.9, 1.0) * exp(-pow(gc.d / (px * 0.7 * gc.w), 2.0)) * 0.7 + vec3(0.3, 0.5, 1.0) * exp(-gc.d / (px * 2.5)) * 0.3) * spreadM * uE * liv);
        // loose pieces each catch the room light at their own angle
        light(vec3(0.65, 0.72, 0.85) * 0.035 * h21(cell + 2.2) * run * (0.5 + 0.5 * sin(ang * 2.0 + h21(cell) * 6.0)) * outside);
        // chipped rim: little conchoidal flakes broken off around the edge
        float chip = smoothstep(0.01, 0.0, hd) * outside * (0.35 + 0.65 * gc.frag);
        paint(vec3(0.72, 0.77, 0.84) * (0.5 + 0.5 * gc.frag), chip * 0.3);
        // the molten lip: a rounded bead of re-melted glass, lit from the upper
        // left: its far inner wall bright, the near side in shadow
        float lit = dot(normalize(P + 1e-5), vec2(-0.6, 0.8));
        float lip = exp(-pow(hd / (2.0 * px + 0.0018), 2.0)) * step(0.001, Rh);
        light(vec3(0.82, 0.87, 0.95) * lip * max(-lit, 0.0) * 0.55);
        dim(1.0 - lip * max(lit, 0.0) * 0.45);
        // the rim still glowing from the plasma: incandescent orange, cooling
        float ember = (exp(-abs(hd) / 0.0035) + exp(-max(hd, 0.0) / 0.012) * 0.25) * heat;
        light(mix(vec3(1.0, 0.3, 0.06), vec3(1.0, 0.85, 0.6), heat * heat) * ember * (0.65 + 0.35 * vn2(P * 90.0 + uT * 2.0)) * 1.6);
        // inside: glass and panel gone; a dark cavity, a torn film edge one
        // layer down, the plasma's last glow deep inside
        float deep = smoothstep(0.0, -Rh * 0.8, hd);
        float torn = exp(-pow((hd + Rh * 0.2 * (1.0 + 0.4 * snz(vec3(P * 25.0, 1.0)))) / (1.3 * px), 2.0));
        vec3 cav = vec3(0.008, 0.008, 0.012) + vec3(0.035, 0.03, 0.045) * (1.0 - deep) * (0.5 + 0.5 * fbm(vec3(P * 30.0, 9.0)))
                 + vec3(0.13, 0.13, 0.15) * torn * 0.5 + vec3(0.3, 0.45, 1.0) * deep * heat * uE * 0.12;
        paint(cav, (1.0 - outside) * step(0.001, Rh));
        // the spark of the strike itself
        light(vec3(1.0) * exp(-r * r / 0.0015) * exp(-uHitAge * 14.0));
      }
      C = clamp(C, 0.0, 1.0);
      C.a = max(C.a, max(C.r, max(C.g, C.b)));   // keep it valid premultiplied colour
      gl_FragColor = C;
    }`;
  // After the power dies: the cracked glass alone (transparent elsewhere), over
  // the dark panel and then the BIOS, healed by the lattice rebuild.
  const paneFrag = NOISE + H21 + CRACK_GLSL + `
    uniform vec2 uRes, uImp; uniform float uHeal, uA;
    varying vec2 vUv;
    void main(){
      vec2 P = (vUv - uImp) * vec2(uRes.x / uRes.y, 1.0);
      Glass gc = glassCracks(P, 1.0, 1.0, uHeal);
      float px = 1.0 / uRes.y;
      float Rh = 0.065 * (1.0 - smoothstep(0.0, 0.9, uHeal));
      float has = step(0.001, Rh), rP = length(P);
      float hd = has > 0.5 && rP < 0.35 ? holeEdge(P, Rh) : rP;
      float outside = mix(1.0, smoothstep(-0.5 * px, 1.5 * px, hd), has);
      float line, vis;
      crackShade(P, gc.d, px, gc.w, gc.ca, line, vis);
      line *= outside;
      float bn = 0.0;
      float blot = rP < 0.4 ? smoothstep(0.008, -0.008, inkEdge(P, 0.13 * (1.0 - smoothstep(0.0, 0.9, uHeal)), bn)) * step(uHeal, 0.999) : 0.0;
      float chip = smoothstep(0.01, 0.0, hd) * outside * (0.35 + 0.65 * gc.frag) * has * 0.5;
      float lip = exp(-pow(hd / (2.0 * px + 0.0018), 2.0)) * max(-dot(normalize(P + 1e-5), vec2(-0.6, 0.8)), 0.0) * 0.6 * has;
      float g = max(max(line * vis, chip), lip);
      vec3 col = vec3(0.8, 0.84, 0.9) * g;
      gl_FragColor = vec4(col, max(blot * 0.97, g * uA));
    }`;
  // a render target onto the page's canvas: as is (premultiplied), or
  // premultiplied on the way (uMul, for the iCO drawn like ico.js draws it),
  // into a rectangle of the canvas (uRect: x0, y0, x1, y1 in 0..1)
  const blitVert = `uniform vec4 uRect;varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(mix(uRect.xy,uRect.zw,uv)*2.-1.,0.,1.);}`;
  const blitFrag = `uniform sampler2D uTex;uniform float uMul;varying vec2 vUv;void main(){vec4 c=texture2D(uTex,vUv);
    if(uMul>0.5)c.rgb*=c.a;else c.a=max(c.a,max(c.r,max(c.g,c.b)));gl_FragColor=c;}`;

  // ── shards: each icosahedron face cut into 4, some of those in 2 more ──
  function buildShards() {
    const V3 = THREE.Vector3, rnd = mulberry32(1987);
    const P = new THREE.IcosahedronGeometry(1.0, 0).attributes.position.array;
    const split4 = ({ v: [a, b, c], o }) => {
      const j = () => 0.5 + (rnd() - 0.5) * 0.26;
      const ab = a.clone().lerp(b, j()), bc = b.clone().lerp(c, j()), ca = c.clone().lerp(a, j());
      return [
        { v: [a, ab, ca], o: [0, o[1], o[2]] },
        { v: [ab, b, bc], o: [o[0], 0, o[2]] },
        { v: [ca, bc, c], o: [o[0], o[1], 0] },
        { v: [ab, bc, ca], o: [0, 0, 0] },
      ];
    };
    const split2 = ({ v, o }) => {
      const k = Math.floor(rnd() * 3), k1 = (k + 1) % 3, k2 = (k + 2) % 3;
      const m = v[k1].clone().lerp(v[k2], 0.35 + rnd() * 0.3);
      return [
        { v: [v[k], v[k1], m], o: [o[k], 0, o[k2]] },
        { v: [v[k], m, v[k2]], o: [o[k], o[k1], 0] },
      ];
    };
    const out = [];
    for (let i = 0; i < P.length; i += 9) {
      const A0 = new V3(P[i], P[i + 1], P[i + 2]), B0 = new V3(P[i + 3], P[i + 4], P[i + 5]), C0 = new V3(P[i + 6], P[i + 7], P[i + 8]);
      const n = new V3().subVectors(B0, A0).cross(new V3().subVectors(C0, A0)).normalize();
      if (n.dot(A0) < 0) n.negate();
      for (const t of split4({ v: [A0, B0, C0], o: [1, 1, 1] })) {
        for (const s of (rnd() < 0.55 ? split2(t) : [t])) out.push({ tri: s, n });
      }
    }
    return out.map(({ tri, n }) => {
      const c = tri.v[0].clone().add(tri.v[1]).add(tri.v[2]).divideScalar(3);
      const T = tri.v.map(v => v.clone().sub(c));
      const th = 0.075;
      const Bt = T.map(v => v.clone().multiplyScalar(0.84).addScaledVector(n, -th));
      const pos = [], nor = [], bc = [], ao = [], part = [], cen = [];
      const E = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], Z = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      const tri3 = (a, b, cc, want, bcs, o, prt) => {
        const gn = new V3().subVectors(b, a).cross(new V3().subVectors(cc, a));
        if (gn.dot(want) < 0) { [b, cc] = [cc, b]; bcs = [bcs[0], bcs[2], bcs[1]]; gn.negate(); }
        gn.normalize();
        [a, b, cc].forEach((p, k) => { pos.push(p.x, p.y, p.z); nor.push(gn.x, gn.y, gn.z); bc.push(...bcs[k]); ao.push(...o); part.push(prt); cen.push(c.x, c.y, c.z); });
      };
      tri3(T[0], T[1], T[2], n, E, tri.o, 0);
      tri3(Bt[0], Bt[1], Bt[2], n.clone().negate(), E, [1, 1, 1], 1);
      for (let k = 0; k < 3; k++) {
        const i = k, j = (k + 1) % 3;
        const mid = T[i].clone().add(T[j]).add(Bt[i]).add(Bt[j]).multiplyScalar(0.25);
        const want = mid.clone().addScaledVector(n, -mid.dot(n));
        tri3(T[i], T[j], Bt[j], want, Z, [1, 1, 1], 2);
        tri3(T[i], Bt[j], Bt[i], want, Z, [1, 1, 1], 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('aBC', new THREE.Float32BufferAttribute(bc, 3));
      g.setAttribute('aO', new THREE.Float32BufferAttribute(ao, 3));
      g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
      g.setAttribute('aCen', new THREE.Float32BufferAttribute(cen, 3));
      const area = new V3().subVectors(T[1], T[0]).cross(new V3().subVectors(T[2], T[0])).length() / 2;
      return { geo: g, c, area };
    });
  }

  /* ───────────────────────── the WebGL layer (built on demand) ───────────────────────── */
  let W = 1, H = 1, ICO_PX = 220;
  let G = null;            // the layer, once built

  // the BIOS screen's and shield's styles; added in idle time ahead of the
  // break (a new stylesheet makes the browser recheck the whole page's styles)
  function injectStyle() {
    if (document.getElementById('breach-style')) return;
    const st = document.createElement('style');
    st.id = 'breach-style';
    st.textContent = `
      #breach-shield { position: fixed; inset: 0; z-index: 3005; }
      #breach-bios { position: fixed; inset: 0; z-index: 3002; background: #000; padding: 32px 40px; box-sizing: border-box; overflow: hidden;
        font: 16px/21px 'IBM VGA', 'Share Tech Mono', monospace; color: #aaaaaa; white-space: pre;
        font-kerning: none; font-variant-ligatures: none; -webkit-font-smoothing: none; }
      #breach-bios .mid, #breach-bios .label { color: #aaaaaa; }
      #breach-bios .hi, #breach-bios .white, #breach-bios .blue { color: #ffffff; }
      #breach-bios .sep { color: #555555; } #breach-bios .cyan { color: #55ffff; } #breach-bios .red { color: #ff5555; }
      #breach-bios .flash-ready { color: #ffffff; text-shadow: 0 0 6px rgba(255,255,255,0.45); }
      #breach-bios .cur { display: inline-block; width: 8px; height: 0.75em; background: #aaaaaa; margin-left: 1px; vertical-align: text-bottom; animation: breach-blink 0.5s step-end infinite; }
      @keyframes breach-blink { 50% { opacity: 0; } }
      @media (max-width: 768px) {
        #breach-bios { padding: 20px 16px; font-size: min(16px, calc((100vw - 32px) / 27)); line-height: 1.3; }
      }`;
    document.head.appendChild(st);
  }

  function build() {
    if (G) return G;
    // the viewport's size, read before anything is added, so it costs no layout
    W = document.documentElement.clientWidth || innerWidth; H = document.documentElement.clientHeight || innerHeight;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
    } catch (e) { return null; }
    const canvas = renderer.domElement;
    canvas.id = 'breach-gl';
    canvas.setAttribute('aria-hidden', 'true');
    // inline, not a stylesheet: only this element gets styled
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:3001;pointer-events:none;';
    document.body.appendChild(canvas);
    renderer.setClearColor(0, 0);
    renderer.sortObjects = false;           // draw faces in ico.js's order while intact

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 100); cam.position.z = 4.8;
    const VIEW_H = 2 * 4.8 * Math.tan(21 * Math.PI / 180);   // ico.js: 220px shows this many units

    const COL = { cd: new THREE.Color(0x000d22), cm: new THREE.Color(0x0033cc), cb: new THREE.Color(0x4488ff) };   // ico.js PALETTE_DEFAULT[0]
    // additive light that leaves coverage alone (render targets and this canvas)
    const LIGHT = { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
    const plasmaMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uPulse: { value: 0 }, uWild: { value: 0 }, uFade: { value: 1 }, uCD: { value: COL.cd }, uCM: { value: COL.cm }, uCB: { value: COL.cb } },
      vertexShader: plasmaVert, fragmentShader: plasmaFrag,
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    });
    const plasma = new THREE.Mesh(new THREE.SphereGeometry(0.46, 48, 48), plasmaMat);
    scene.add(plasma);

    const glassMat = new THREE.ShaderMaterial({
      uniforms: {
        t: { value: 0 }, uPulse: { value: 0 }, bgTex: { value: null }, res: { value: new THREE.Vector2() }, uK: { value: new THREE.Vector2() },
        uSolid: { value: 0 }, uCrack: { value: 0 }, uImpact: { value: new THREE.Vector3(0, 0, 1) },
        uCoreI: { value: 0 }, uCoreV: { value: new THREE.Vector3() }, uSq: { value: 0 },
      },
      vertexShader: glassVert, fragmentShader: glassFrag, transparent: true, side: THREE.DoubleSide,
      extensions: { derivatives: true },
    });
    const group = new THREE.Group(); scene.add(group);
    const rnd = mulberry32(42);
    const built = buildShards();
    const meanArea = built.reduce((a, s) => a + s.area, 0) / built.length;
    const shards = built.map(({ geo, c, area }) => {
      const m = new THREE.Mesh(geo, glassMat); m.position.copy(c); group.add(m);
      const axis = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      // small pieces fly faster and spin harder than big ones
      const size = Math.min(1.5, Math.max(0.7, Math.sqrt(meanArea / area)));
      return { m, c, axis, size, spin: (1.5 + rnd() * 5) * size, speed: (0.75 + rnd() * 1.5) * size, fall: 0.6 + rnd() * 0.8, jit: rnd(), dir: new THREE.Vector3(), dir2: new THREE.Vector3(), from: new THREE.Vector3(), fromQ: new THREE.Quaternion(), delay: 0 };
    });

    // glass dust: the fine fragments a real shatter throws off, glinting as
    // they tumble; one wave leaves with the first crack, the larger with the blast
    const DUST = 900, drnd = mulberry32(7);
    const dPos = new Float32Array(DUST * 3), dDir = new Float32Array(DUST * 3), dPar = new Float32Array(DUST * 4);
    for (let i = 0; i < DUST; i++) {
      let x, y, z, l;
      do { x = drnd() * 2 - 1; y = drnd() * 2 - 1; z = drnd() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 0.01);
      l = Math.sqrt(l); x /= l; y /= l; z /= l;
      const r0 = 0.55 + drnd() * 0.4;
      dPos.set([x * r0, y * r0, z * r0], i * 3); dDir.set([x, y, z], i * 3);
      dPar.set([0.5 + Math.pow(drnd(), 1.6) * 2.6, drnd() < 0.3 ? 0 : 1, 0.5 + drnd() * 1.7, drnd()], i * 4);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dPos, 3));
    dustGeo.setAttribute('aDir', new THREE.Float32BufferAttribute(dDir, 3));
    dustGeo.setAttribute('aPar', new THREE.Float32BufferAttribute(dPar, 4));
    const dustMat = new THREE.ShaderMaterial({
      uniforms: { uTau: { value: 0 }, uTauR: { value: 0 }, uT: { value: 0 }, uI: { value: 0 }, uPx: { value: 1 }, uCam: { value: new THREE.Vector3(0, 0, 1) }, uGrav: { value: new THREE.Vector3(0, -1, 0) } },
      vertexShader: dustVert, fragmentShader: dustFrag,
      transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.frustumCulled = false; dust.visible = false; group.add(dust);
    // the biggest piece, scaled up, is the one that flies at the viewer and hits the glass
    const hero = new THREE.Mesh(built.reduce((a, b) => b.area > a.area ? b : a).geo, glassMat);
    hero.scale.setScalar(1.5); hero.visible = false; group.add(hero);

    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.PlaneGeometry(2, 2);
    const snap = document.createElement('canvas');
    const siteTex = new THREE.CanvasTexture(snap); siteTex.minFilter = THREE.LinearFilter; siteTex.generateMipmaps = false;
    const ringTex = new THREE.Texture(); ringTex.minFilter = THREE.LinearFilter; ringTex.generateMipmaps = false;
    const compMat = new THREE.ShaderMaterial({
      uniforms: {
        uSite: { value: siteTex }, uRing: { value: ringTex }, uRingRect: { value: new THREE.Vector4(0, 0, 0, 0) },
        uJet: { value: new THREE.Vector4() }, uPl: { value: new THREE.Vector4() }, uE: { value: 0 }, uRes: { value: new THREE.Vector2() }, uCore: { value: new THREE.Vector2() }, uImp: { value: new THREE.Vector2(0.5, 0.5) },
        uT: { value: 0 }, uHitAge: { value: -1 }, uOver: { value: 0 }, uGlow: { value: 0 }, uSurge: { value: 0 }, uSpread: { value: 0 }, uGlitch: { value: 0 }, uSeed: { value: 0 }, uFlash: { value: 0 }, uShock: { value: 0 }, uShockAmp: { value: 0 }, uDim: { value: 0 },
        uCD: { value: COL.cd }, uCM: { value: COL.cm }, uCB: { value: COL.cb },
        uNz: { value: renderer.capabilities.isWebGL2 ? noise3D() : null },
      },
      vertexShader: quadVert, fragmentShader: loopy(compFrag, renderer.capabilities.isWebGL2), depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    const paneMat = new THREE.ShaderMaterial({
      uniforms: { uRes: compMat.uniforms.uRes, uImp: compMat.uniforms.uImp, uHeal: { value: 0 }, uA: { value: 0.4 }, uNz: compMat.uniforms.uNz },
      vertexShader: quadVert, fragmentShader: loopy(paneFrag, renderer.capabilities.isWebGL2), transparent: true, depthTest: false, depthWrite: false,
    });
    const blitMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: null }, uMul: { value: 0 }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) } },
      vertexShader: blitVert, fragmentShader: blitFrag, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    const one = mat => { const s = new THREE.Scene(); s.add(new THREE.Mesh(quad, mat)); return s; };
    const compScene = one(compMat), paneScene = one(paneMat), blitScene = one(blitMat);

    // Render targets. bgRT and icoRT only hold the iCO's square (the at-rest
    // copy is drawn there exactly as ico.js draws it, then put on the page);
    // compRT covers the screen (1px until the egg runs).
    const rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    const bgRT = new THREE.WebGLRenderTarget(1, 1, rtOpts), icoRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    let compRT = null;
    let dpr = 1, unit = 0.0167, compScale = 1, building = false, full = false;
    const core = new THREE.Vector3();
    const sq = { x: 0, y: 0, s: 1 };      // the iCO's square on screen, CSS px (top-left origin)

    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      // full screen only while the egg is showing; otherwise a 1px canvas
      // (it lives for the whole visit, built at load, so it stays cheap)
      renderer.setSize(full ? W : 1, full ? H : 1, false);
      cam.aspect = W / H;
      unit = VIEW_H / ICO_PX;
      cam.fov = 2 * Math.atan((H * unit / 2) / 4.8) * 180 / Math.PI;
      cam.updateProjectionMatrix();
      dustMat.uniforms.uPx.value = H * dpr / (2 * Math.tan(cam.fov * Math.PI / 360));
      compMat.uniforms.uRes.value.set(W, H);
      if (compRT) sizeComp();
      if (!building) placeCore();   // (the first frame places it: no forced layout while building)
    }
    function makeComp() {
      if (compRT) return;
      compScale = Math.min(dpr, 1.25);
      compRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);
      sizeComp();
    }
    function sizeComp() {
      const k = full ? compScale : 0;   // 1px until the egg runs
      compRT.setSize(Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k)));
    }
    function setFull(on) {
      if (full === on) return;
      full = on;
      renderer.setSize(full ? W : 1, full ? H : 1, false);
      if (compRT) sizeComp();
    }
    function dropComp() {
      if (!compRT) return;
      compRT.dispose(); compRT = null;
    }
    // slow GPUs only: if the corruption pass can't hold ~40 fps, render it a
    // step smaller (soft plasma and glitch, so the drop is hard to see)
    function lowerComp() {
      if (!compRT || compScale <= 0.7) return false;
      compScale = Math.max(0.7, compScale * 0.8);
      sizeComp();
      return true;
    }
    function snapCanvasSize() {
      const w = Math.round(W * compScale), h = Math.round(H * compScale);
      if (snap.width !== w || snap.height !== h) { snap.width = w; snap.height = h; }
    }
    // where the real iCO is: the copy's position and size, and its square
    function placeCore() {
      const r = mount.getBoundingClientRect();
      if (!r.width) return;
      if (Math.abs(r.width - ICO_PX) > 0.5) { ICO_PX = r.width; unit = VIEW_H / ICO_PX; cam.fov = 2 * Math.atan((H * unit / 2) / 4.8) * 180 / Math.PI; cam.updateProjectionMatrix(); dustMat.uniforms.uPx.value = H * dpr / (2 * Math.tan(cam.fov * Math.PI / 360)); }
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      core.set((x - W / 2) * unit, -(y - H / 2) * unit, 0);
      compMat.uniforms.uCore.value.set(x / W, 1 - y / H);
      sq.s = Math.ceil(ICO_PX * 1.6); sq.x = Math.round(x - sq.s / 2); sq.y = Math.round(y - sq.s / 2);
      const px = Math.max(1, Math.round(sq.s * dpr));
      if (bgRT.width !== px) { bgRT.setSize(px, px); icoRT.setSize(px, px); }
    }
    // the copy as ico.js draws it: plasma into bgRT, then plasma + glass into
    // icoRT on a clear (unpremultiplied, like ico.js's canvas), then onto this
    // canvas at the iCO's square, premultiplied there by the browser's rule
    function drawIco(clearAll) {
      cam.setViewOffset(W, H, sq.x, sq.y, sq.s, sq.s);
      plasmaMat.blending = THREE.AdditiveBlending;
      group.visible = false; plasma.visible = true;
      renderer.setRenderTarget(bgRT); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, cam);
      group.visible = true;
      const gu = glassMat.uniforms;
      gu.bgTex.value = bgRT.texture; gu.res.value.set(bgRT.width, bgRT.height); gu.uK.value.set(ICO_PX / sq.s, ICO_PX / sq.s); gu.uSq.value = 0;
      renderer.setRenderTarget(icoRT); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(scene, cam);
      cam.clearViewOffset();
      renderer.setRenderTarget(null);
      if (clearAll) renderer.clear();
      blit(icoRT.texture, 1, sq.x, sq.y, sq.s, sq.s);
    }
    function blit(tex, mul, x, y, w, h) {
      const u = blitMat.uniforms;
      u.uTex.value = tex; u.uMul.value = mul;
      u.uRect.value.set(x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H);
      renderer.render(blitScene, ortho);
    }
    function screenGlass(tex, sqMode) {
      const gu = glassMat.uniforms;
      gu.bgTex.value = tex; gu.res.value.set(Math.round(W * dpr), Math.round(H * dpr)); gu.uK.value.set(ICO_PX / W, ICO_PX / H); gu.uSq.value = sqMode;
    }

    function render(mode) {
      renderer.setRenderTarget(null); renderer.setClearColor(0, 0);
      if (mode === 'rest') {
        drawIco(true);
      } else if (mode === 'fly') {
        // the iCO flying back together, its pieces outside its square: plasma
        // into compRT, then the whole scene straight onto the canvas
        plasmaMat.blending = THREE.AdditiveBlending;
        group.visible = false; plasma.visible = true;
        renderer.setRenderTarget(compRT); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, cam);
        renderer.setRenderTarget(null); renderer.setClearColor(0, 0); renderer.clear();
        Object.assign(plasmaMat, LIGHT);
        group.visible = true; screenGlass(compRT.texture, 1);
        renderer.render(scene, cam);
      } else if (mode === 'seq') {
        renderer.setRenderTarget(compRT); renderer.render(compScene, ortho);
        // the core sphere, while it's still there (once faded it would be a
        // screen-sized invisible sphere running the plasma noise for nothing)
        if (plasmaMat.uniforms.uFade.value > 0.002) {
          Object.assign(plasmaMat, LIGHT);
          renderer.autoClear = false; group.visible = false; plasma.visible = true;
          renderer.render(scene, cam);
        }
        renderer.setRenderTarget(null); renderer.autoClear = true;
        renderer.clear();
        blit(compRT.texture, 0, 0, 0, W, H);
        renderer.autoClear = false; group.visible = true; plasma.visible = false;
        screenGlass(compRT.texture, 0);
        renderer.render(scene, cam);
        renderer.autoClear = true; plasma.visible = true;
      } else if (mode === 'pane') {
        renderer.clear(); renderer.render(paneScene, ortho);
      } else {
        renderer.clear();
      }
      plasmaMat.blending = THREE.AdditiveBlending;
    }
    // The programs, compiled without freezing the page. Cold, they take the
    // GPU driver seconds (the corruption pass alone ~2-5 s on Windows/ANGLE),
    // and three.js r128 asks about each program right after linking it, which
    // makes the page wait for the driver. So three's own programs link on the
    // driver's threads (KHR_parallel_shader_compile): whenever three asks about
    // one that's still linking, the question is refused (WAIT) and three gets
    // back to it on a later pass; it picks up where it left off (the program
    // stays in its cache). Nothing blocks, in any browser: Chrome could reuse a
    // background compile from its driver cache, Firefox can't, so three's real
    // programs are the ones that compile in the background.
    // Without the extension: plain compile.
    const showAll = on => { dust.visible = hero.visible = on; };
    const GROUPS = {
      ico: [[scene, cam, showAll], [blitScene, ortho]],
      rest: [[compScene, ortho], [paneScene, ortho]],
    };
    function compileNow(list) {
      list.forEach(([s, c, vis]) => { if (vis) vis(true); renderer.compile(s, c); if (vis) vis(false); });
    }
    const WAIT = {}, solo = new THREE.Scene();
    function warm(name, done) {
      const list = GROUPS[name];
      const gl = renderer.getContext(), ext = gl.getExtension('KHR_parallel_shader_compile');
      if (!ext) { compileNow(list); done(); return; }
      // one object per material, each compiled on its own (a refusal only stops that one)
      const seen = new Set(), todo = [];
      list.forEach(([s, c]) => s.traverse(o => { if (o.material && !seen.has(o.material)) { seen.add(o.material); todo.push([c, o]); } }));
      const P = Object.getPrototypeOf(gl);
      const QS = ['getProgramParameter', 'getProgramInfoLog', 'getActiveUniform', 'getActiveAttrib', 'getUniformLocation', 'getAttribLocation'];
      const pass = () => {
        if (G !== self) return;   // thrown away meanwhile
        QS.forEach(k => { gl[k] = function (p) { if (p && !P.getProgramParameter.call(gl, p, ext.COMPLETION_STATUS_KHR)) throw WAIT; return P[k].apply(gl, arguments); }; });
        const check = renderer.debug.checkShaderErrors;
        renderer.debug.checkShaderErrors = false;   // (its log queries would wait)
        let waiting = 0;
        try {
          for (const t of todo) {
            if (t.done) continue;
            solo.children = [t[1]];
            try { renderer.compile(solo, t[0]); t.done = true; }
            catch (e) { if (e !== WAIT) throw e; waiting++; }
          }
        } finally {
          solo.children = [];
          QS.forEach(k => delete gl[k]);
          renderer.debug.checkShaderErrors = check;
        }
        if (waiting) { setTimeout(pass, 50); return; }
        // linked: report a broken one as three would have
        renderer.info.programs.forEach(pr => {
          if (!gl.getProgramParameter(pr.program, gl.LINK_STATUS)) console.error('ico-breach: program failed to link', pr.name, gl.getProgramInfoLog(pr.program));
        });
        done();
      };
      pass();
    }
    // A program's first draw into each kind of target costs the driver extra
    // work (on Windows it builds a variant per target format), and the
    // break's full-screen targets take a moment to allocate: both done here,
    // ahead of time, drawn and wiped within one task so nothing ever shows.
    function prewarmIco() {
      placeCore();
      render('rest'); renderer.clear();
    }
    function prewarmRest(step) {
      if (step === 0) { makeComp(); snapCanvasSize(); siteTex.needsUpdate = true; renderer.initTexture(siteTex); }
      else if (step === 1) { dust.visible = true; render('seq'); renderer.clear(); dust.visible = false; }
      else { render('pane'); renderer.clear(); }
    }
    function dispose() {
      dropComp(); bgRT.dispose(); icoRT.dispose(); siteTex.dispose(); ringTex.dispose();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      [plasmaMat, glassMat, dustMat, compMat, paneMat, blitMat].forEach(m => m.dispose());
      quad.dispose();
      renderer.dispose(); renderer.forceContextLoss();
      canvas.remove();
    }
    const self = G = {
      renderer, canvas, scene, cam, plasma, plasmaMat, glassMat, group, shards, dust, dustMat, hero, compMat, paneMat, snap, siteTex, ringTex,
      resize, placeCore, render, makeComp, dropComp, lowerComp, snapCanvasSize, warm, prewarmIco, prewarmRest, setFull, dispose,
      icoReady: false, allReady: false,
      screenToWorld: (u, v, z, out) => { const k = (4.8 - z) / 4.8; return out.set((u - 0.5) * W * unit * k, (v - 0.5) * H * unit * k, z); },
      get compScale() { return compScale; }, get core() { return core; },
    };
    building = true; resize(); building = false;
    return G;
  }
  function layout() {
    const w = document.documentElement.clientWidth || innerWidth, h = document.documentElement.clientHeight || innerHeight;
    if (w === W && h === H) return;     // unchanged: don't reallocate the canvas
    W = w; H = h;
    if (G) G.resize();
  }
  addEventListener('resize', () => { if (G) layout(); });

  // Built while the site boots, during the ECHO OS splash (index.html's
  // echoBoot: compiling freezes Firefox for a moment, which on a still splash
  // nobody sees, but during the BIOS text stopped the typing and on a click
  // stalled the iCO). The splash holds until it's done. So by the time Status
  // opens and the iCO is clicked, nothing is left to set up. If someone is
  // quicker than that, clicks wait: the copy takes over once the iCO's
  // programs are in, and a sixth click breaks the iCO the moment the rest are.
  const idle = fn => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 250 }) : setTimeout(fn, 60));
  function prepare() {
    if (G) return;
    idle(() => { if (!G) start(); });
  }
  let bootDone = null;   // resolves the splash's wait
  const booted = () => { if (bootDone) { bootDone(); bootDone = null; } };
  if (window.echoBoot) window.echoBoot.later(() => new Promise(res => { bootDone = res; prepare(); }));
  else {
    const bootBuild = () => setTimeout(prepare, 300);
    if (document.readyState === 'complete') bootBuild(); else addEventListener('load', bootBuild, { once: true });
  }
  function start() {
    if (!build()) { booted(); return false; }
    // one short task at a time: the layer, then each group's dry run
    const g = G;
    idle(() => {
      if (G !== g) return;
      g.warm('ico', () => {
        g.icoReady = true;
        if (G !== g) return;
        if (taps >= 3) takeOver(); else idle(() => { if (G === g && !S.copy) g.prewarmIco(); });
      });
      idle(() => {
        if (G !== g) return;
        g.warm('rest', () => {
          g.allReady = true;
          if (G !== g) return;
          if (S.pending) { S.pending = false; booted(); breach(); return; }
          // ahead of the break, one short idle task at a time
          const step = k => idle(() => {
            if (G !== g || S.active) { booted(); return; }
            if (k === 0) injectStyle();
            g.prewarmRest(k);
            if (k < 2) step(k + 1); else booted();
          });
          step(0);
        });
      });
    });
    return true;
  }

  /* ───────────────────────── snapshot: the popup's content as a texture ─────────────────────────
     Taken once at the break (positions, styles, and the ring, LIVE badge and
     ring arc drawn as a base layer), transparent elsewhere so the real panel
     stays under it. While the text garbles, only base + text are redrawn. */
  const snapBase = document.createElement('canvas');
  let snapTexts = [];
  // garble glyphs from the VGA font (CP437), which is named as the canvas
  // fallback below: a glyph no listed font has sends canvas text into a slow
  // system-font search on every draw
  const GLYPHS = '▓▒░█▄▀▌▐■≡Σ#%&01/+';
  const SNAP_TEXT = '.ver-readout .ro-k, .ver-readout .ro-v, #ver-activity .act-t, #ver-activity .act-l, #ver-activity .act-m, #ver-status-note';
  // the text's shadows (the etched cut), as the browser would draw them
  function parseShadows(v) {
    if (!v || v === 'none') return [];
    return v.split(/,(?![^(]*\))/).map(s => {
      const col = (s.match(/rgba?\([^)]*\)|#[0-9a-f]+/i) || ['transparent'])[0];
      const n = s.replace(col, '').trim().split(/\s+/).map(parseFloat);
      return { col, x: n[0] || 0, y: n[1] || 0, b: n[2] || 0 };
    });
  }
  function captureSnap() {
    G.snapCanvasSize();
    const cv = G.snap, sd = G.compScale;
    snapBase.width = cv.width; snapBase.height = cv.height;
    const ctx = snapBase.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(sd, 0, 0, sd, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const draw = (el, fn) => { if (!el || el.hidden) return; const r = el.getBoundingClientRect(); if (r.width) fn(r); };
    // the ring: rendered by ring.js and uploaded straight into this layer's
    // WebGL in the same task (GPU to GPU; copying it into this 2D canvas would
    // stall on a GPU readback)
    const cu = G.compMat.uniforms;
    cu.uRingRect.value.set(0, 0, 0, 0);
    draw(document.getElementById('ver-ring-gl'), r => {
      const rc = ring() && ring().capture ? ring().capture() : null;
      if (!rc) return;
      G.ringTex.image = rc; G.ringTex.needsUpdate = true;
      G.renderer.initTexture(G.ringTex);
      cu.uRingRect.value.set(r.left / W, 1 - r.bottom / H, r.right / W, 1 - r.top / H);
    });
    draw(document.getElementById('ver-ring-over'), r => ctx.drawImage(document.getElementById('ver-ring-over'), r.left, r.top, r.width, r.height));
    box.querySelectorAll('.act-live canvas').forEach(c => draw(c, r => ctx.drawImage(c, r.left, r.top, r.width, r.height)));
    snapTexts = [];
    box.querySelectorAll(SNAP_TEXT).forEach(el => {
      const r = el.getBoundingClientRect(); if (!r.width || !el.textContent.trim()) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return;
      let op = 1; for (let n = el; n && n !== box; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
      if (op < 0.01) return;
      let text = el.textContent.replace(/\s+/g, ' ').trim();
      if (cs.textTransform === 'uppercase') text = text.toUpperCase();
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}, 'IBM VGA'`, ls = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      ctx.font = font; if ('letterSpacing' in ctx) ctx.letterSpacing = ls;
      const m = ctx.measureText(text);
      const asc = m.fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.8, desc = m.fontBoundingBoxDescent ?? parseFloat(cs.fontSize) * 0.2;
      const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
      const al = cs.textAlign;
      const x = al === 'right' || al === 'end' ? r.right - pr - m.width : al === 'center' ? r.left + (r.width - m.width) / 2 : r.left + pl;
      snapTexts.push({ text, x, y: r.top + (r.height - (asc + desc)) / 2 + asc, font, ls, color: cs.color, op, sh: parseShadows(cs.textShadow) });
    });
  }
  function drawSnap(garble) {
    const cv = G.snap, sd = G.compScale, ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(snapBase, 0, 0);
    ctx.setTransform(sd, 0, 0, sd, 0, 0);
    for (const t of snapTexts) {
      const txt = garble ? t.text.replace(/\S/g, ch => Math.random() < garble ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : ch) : t.text;
      ctx.font = t.font; if ('letterSpacing' in ctx) ctx.letterSpacing = t.ls;
      ctx.globalAlpha = t.op;
      for (const s of t.sh) {
        // shadow only: draw the text far off the canvas and cast its shadow back
        ctx.shadowColor = s.col; ctx.shadowBlur = s.b * sd; ctx.shadowOffsetX = (s.x + 10000) * sd; ctx.shadowOffsetY = s.y * sd;
        ctx.fillStyle = '#000'; ctx.fillText(txt, t.x - 10000, t.y);
      }
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
      ctx.fillStyle = t.color; ctx.fillText(txt, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    G.siteTex.needsUpdate = true;
  }
  // the popup's own content, hidden while the snapshot stands in for it (the
  // panel itself, its glass and border, stays)
  const CONTENT = '#ver-modal-content, #ver-callouts, .ver-readout, #ver-activity';
  function showContent(on) {
    box.querySelectorAll(CONTENT).forEach(el => { el.style.visibility = on ? '' : 'hidden'; });
  }

  /* ───────────────────────── the gesture ───────────────────────── */
  const GAP = 1100;          // ms allowed between clicks for them to count as "in a row"
  let taps = 0, lastTap = 0, crack = 0, crackTarget = 0, stress = 0, shakeAmp = 0, shakeT = 0;
  let pulseStart = -10;
  const S = { active: false, copy: false, hidden: false, mode: 'rest', t0: 0, tau: 0, flags: {}, re: null, skip: false, wake: null, nextScr: 0, heal: 0, healS: 0, raf: 0 };

  box.addEventListener('click', e => {
    if (!modal.classList.contains('open') || S.active) return;
    const admin = document.getElementById('ver-admin');
    if (admin && !admin.hidden) return;
    if (e.target.closest('#ico-mount') && !e.target.closest('.ico-menu-item')) tap();
    else if (taps) { taps = 0; crackTarget = 0; stress = 0; SFX.humOff(); }   // anything else breaks the run
  });

  function tap() {
    const now = performance.now();
    if (now - lastTap > GAP) taps = 0;
    lastTap = now; taps++;
    pulseStart = now / 1000;
    if (taps < 6) SFX.tap(taps);
    if (taps === 1) { prepare(); return; }
    if (taps < 3) return;
    if (!G && !start()) { taps = 0; return; }   // clicked too fast for the idle build (or no WebGL)
    if (taps >= 6) {
      if (G.allReady) { taps = 0; breach(); return; }
      // still compiling: keep it at the edge (as at the fifth click) and break the moment it's ready
      S.pending = true; taps = 5;
    }
    if (taps === 3) {
      // the crack starts on the face pointing at the viewer
      G.group.rotation.set(RX, mirrorRy, 0);
      const q = new THREE.Quaternion().setFromEuler(G.group.rotation).invert();
      G.glassMat.uniforms.uImpact.value.set(-0.25, 0.35, 1).normalize().applyQuaternion(q);
    }
    crackTarget = [0, 0, 0, 0.3, 0.6, 0.92][taps];
    stress = taps >= 5 ? 1 : 0;
    shakeAmp = [0, 0, 0, 0.02, 0.035, 0.05][taps]; shakeT = now / 1000;
    if (taps === 4) { if (ring() && ring().log) ring().log('WARN', 'Lattice stress detected'); SFX.hum(4); }
    if (taps === 5) { if (ring() && ring().log) ring().log('WARN', 'Core containment unstable'); SFX.hum(5); }
    takeOver();
  }
  // from the third click, the copy stands in for the real iCO (once its programs are in)
  function takeOver() {
    if (!G || !G.icoReady) return;
    G.setFull(true);
    S.copy = true;
    run();
  }
  function handBack() {
    S.copy = false;
    const c = icoCanvas(); if (c) c.style.visibility = '';
    S.hidden = false;
    if (G) { G.render('off'); G.setFull(false); }
  }

  /* ───────────────────────── the sequence ───────────────────────── */
  // seconds after the sixth click
  const T_SLOW = 0.12, T_RELEASE = 1.3, T_SPREAD = 1.45, T_IMPACT = 1.62, T_OVERLOAD = 0.3, T_SURGE = 4.45, T_CUT = 4.85;
  const timescale = T => T < T_SLOW ? 1 : T < 0.25 ? lerp(1, 0.06, (T - T_SLOW) / 0.13) : T < T_RELEASE ? 0.06 : T < 1.6 ? lerp(0.06, 4.2, sstep(T_RELEASE, 1.6, T)) : 4.2;
  const TAU_DT = 1 / 500, TAU = new Float32Array(3501);   // tau(T) for T in 0..7 s
  for (let i = 1; i < TAU.length; i++) TAU[i] = TAU[i - 1] + timescale((i - 0.5) * TAU_DT) * TAU_DT;
  function tauAt(T) { const f = Math.min(T / TAU_DT, TAU.length - 1.001), i = f | 0; return TAU[i] + (TAU[i + 1] - TAU[i]) * (f - i); }
  const TAU_R = tauAt(T_RELEASE);
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _qI = new THREE.Quaternion();

  let shield = null, bios = null;
  function onKey(e) {
    if (!S.active) return;
    // Escape does nothing either: it can't close the popup or cut the reboot short
    if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); }
  }
  addEventListener('keydown', onKey, true);
  function shieldOn(on) {
    if (on && !shield) {
      shield = document.createElement('div');
      shield.id = 'breach-shield';
      // clicks are swallowed: the reboot always plays to the end
      shield.addEventListener('pointerdown', e => e.preventDefault());
      shield.addEventListener('click', e => e.stopPropagation());
      document.body.appendChild(shield);
    } else if (!on && shield) { shield.remove(); shield = null; }
  }
  const shake = (x, y) => {
    const t = x || y ? `${x.toFixed(2)}px ${y.toFixed(2)}px` : '';
    box.style.translate = t; if (G) G.canvas.style.translate = t;
  };

  function breach() {
    S.active = true; S.skip = false; S.flags = {}; S.tau = 0; S.nextScr = 0;
    taps = 0; stress = 0;
    shieldOn(true);
    if (ring() && ring().log) ring().log('CRIT', 'Containment breach · core 0x1C0');
    SFX.humOff(true);
    injectStyle();
    // the full breach plays for everyone, Reduce Motion or not: it only starts
    // when someone taps the iCO six times on purpose
    G.setFull(true);
    G.makeComp();
    layout();
    G.placeCore();   // where the iCO is, before the popup freezes (the arcs start there)
    // freeze the popup into a texture; from here the shader owns it
    captureSnap(); drawSnap(0);
    showContent(false);
    if (ring() && ring().hold) ring().hold(true);
    window.__icoPaused = true;
    S.copy = true;
    S.mode = 'seq'; S.t0 = performance.now() / 1000;
    crack = crackTarget = 1;
    G.renderer.sortObjects = true;
    G.glassMat.uniforms.uSolid.value = 1;
    G.group.rotation.set(RX, mirrorRy, 0); G.group.updateMatrixWorld();
    const inv = G.group.quaternion.clone().invert();
    const camDir = new THREE.Vector3(0, 0, 1).applyQuaternion(inv);
    S.grav = new THREE.Vector3(0, -1, 0).applyQuaternion(inv);   // world "down" in the iCO's own frame
    for (const s of G.shards) {
      s.dir.copy(s.c).normalize().addScaledVector(camDir, 0.35 + s.jit * 0.5).normalize();
      // the blast pushes each shard on from where it already is, scattered a little
      s.dir2.copy(s.dir).add(_v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5)).normalize();
    }
    const du = G.dustMat.uniforms;
    du.uCam.value.copy(camDir); du.uGrav.value.copy(S.grav); du.uTauR.value = TAU_R; du.uTau.value = 0;
    G.dust.visible = true;
    // where the hero shard will hit: off the core, somewhere still well on screen
    const cu = G.compMat.uniforms, core = cu.uCore.value, a = Math.random() * Math.PI * 2, dist = 0.16 + Math.random() * 0.1;
    S.imp = new THREE.Vector2(
      Math.min(0.85, Math.max(0.15, core.x + Math.cos(a) * dist * H / W)),
      Math.min(0.85, Math.max(0.15, core.y + Math.sin(a) * dist)));
    cu.uImp.value.copy(S.imp); cu.uHitAge.value = -1; cu.uOver.value = 0;
    cu.uE.value = 0; cu.uJet.value.set(0, 0, core.x, core.y); cu.uPl.value.set(0, 0, 0, 0); S.lastSnap = 0;
    S.heroAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    SFX.breach();
    run();
  }

  // ── the escaping plasma: a plasmoid ──
  // It flies behind the hero shard, swelling; splats at the impact and spreads
  // along the cracks, cooling, flaring again at the overload.
  function updatePlasmoid(T) {
    const cu = G.compMat.uniforms, core = cu.uCore.value;
    const late = clamp01((T - T_RELEASE) / (T_CUT - T_RELEASE)), over = T >= T_CUT - T_OVERLOAD;
    const k = clamp01((T - T_RELEASE) / (T_IMPACT - T_RELEASE)), hit = T >= T_IMPACT, ha = T - T_IMPACT;
    const spread = hit ? 0.05 + 0.25 * Math.pow(sstep(T_IMPACT, T_CUT - 0.3, T), 0.8) : 0;
    cu.uJet.value.set(hit ? 1 : 0, spread, core.x + (S.imp.x - core.x) * k, core.y + (S.imp.y - core.y) * k);
    cu.uPl.value.set(0.016 + 0.034 * k, hit ? 0.04 + 0.09 * (1 - Math.exp(-ha * 7)) : 0, hit ? Math.min(1, 0.3 + 0.7 * Math.exp(-ha * 1.5) + (over ? 0.6 : 0)) : 1, !hit && T >= T_RELEASE ? 1 : 0);
    cu.uE.value = T < T_RELEASE ? 0 : (hit ? 0.6 + 0.6 * Math.exp(-ha * 2) + 0.3 * late + (over ? 0.6 : 0) : 1.1) * (0.92 + 0.08 * Math.random());
  }

  function updateSeq(T) {
    const u = G.compMat.uniforms;
    // time: a hard pop, then slow motion while the core tears loose, then release
    S.tau = tauAt(T);
    // two kicks: the crack pops the shell open, the blast throws it apart
    const x1 = S.tau, d1 = kick(x1, KICK1), d2 = kick(x1 - TAU_R, KICK2), fall = 0.1 * x1 * x1;
    for (const s of G.shards) {
      s.m.position.copy(s.c).addScaledVector(s.dir, s.speed * 1.1 * d1).addScaledVector(s.dir2, s.speed * 2.3 * d2).addScaledVector(S.grav, fall * s.fall);
      s.m.quaternion.setFromAxisAngle(s.axis, s.spin * (1.2 * d1 + 1.4 * d2));
      const wz = _v.copy(s.m.position).applyQuaternion(G.group.quaternion).z * G.group.scale.x;
      s.m.visible = wz < 3.9;
    }
    // the hero shard flies at the viewer, accelerating, and strikes the glass
    const k = (T - T_RELEASE) / (T_IMPACT - T_RELEASE);
    G.hero.visible = k > 0 && k < 1;
    if (G.hero.visible) {
      G.screenToWorld(S.imp.x, S.imp.y, 4.3, _w).sub(G.group.position).multiplyScalar(k * k).add(G.group.position);
      G.group.updateMatrixWorld(); G.group.worldToLocal(_w);
      G.hero.position.copy(_w);
      G.hero.quaternion.setFromAxisAngle(S.heroAxis, 0.6 + k * 5);
    }
    u.uHitAge.value = T - T_IMPACT;
    crack = 1 - 0.6 * sstep(0.2, 1.3, T);
    const pm = G.plasmaMat.uniforms;
    if (T < T_RELEASE) {
      const kk = sstep(0, T_RELEASE, T);
      G.plasma.scale.setScalar(1 + 0.9 * kk * kk);
      pm.uWild.value = 0.15 + 0.85 * kk;
      pm.uPulse.value = 0.6 + 0.4 * Math.abs(Math.sin(T * 23));
      pm.uFade.value = 1;
    } else {
      G.plasma.scale.setScalar(1.9 + Math.pow(T - T_RELEASE, 1.2) * 12);
      pm.uWild.value = 1; pm.uPulse.value = 1;
      pm.uFade.value = 1 - sstep(T_RELEASE, 1.5, T);
    }
    // page corruption
    const step = Math.floor(T * 14);
    const spike = (Math.sin(step * 12.9898) * 43758.5453 % 1 + 1) % 1 > 0.82 ? 0.45 : 0;
    u.uT.value = T * 1.6 + 10;
    u.uSeed.value = step + (spike ? 0.5 : 0);
    // the escaping plasma (see updatePlasmoid)
    updatePlasmoid(T);
    // kept low through the pop and the blast so the shatter itself reads clean;
    // the corruption only takes hold once the debris is on its way
    u.uGlitch.value = T < 0.1 ? 0.35 * (1 - T / 0.1) : T < T_RELEASE ? spike * 0.12 : Math.min(1, (0.85 * (T - T_RELEASE) / 3.1 + sstep(1.7, 2.3, T) * (0.22 + spike)) * 0.2);
    if (T < 1.0) { u.uShock.value = T * 1.7; u.uShockAmp.value = Math.pow(1 - T, 2); }
    else if (T > T_RELEASE && T < 2.3) { u.uShock.value = (T - T_RELEASE) * 2.0; u.uShockAmp.value = Math.pow(1 - (T - T_RELEASE), 2) * 1.2; }
    else u.uShockAmp.value = 0;
    u.uDim.value = 0.4 * sstep(T_SLOW, 0.5, T) * (1 - sstep(T_RELEASE, 1.45, T));
    u.uFlash.value = Math.min(1, (T < 0.06 ? 0.12 * (1 - T / 0.06) : 0) + (T > T_RELEASE ? 0.3 * Math.exp(-(T - T_RELEASE) / 0.05) : 0));
    // no white-out: the backlight overloads for the panel's last fraction of a second
    u.uOver.value = sstep(T_CUT - T_OVERLOAD, T_CUT - T_OVERLOAD + 0.08, T);
    // the core as a light source for the debris: a hard flash at the crack, a
    // flickering glow through the slow motion, a blinding pulse at the blast
    const coreI = T < 0.15 ? 0.6 + 0.9 * (1 - T / 0.15)
      : T < T_RELEASE ? 0.6 + 0.5 * sstep(T_SLOW, T_RELEASE, T) * (0.8 + 0.2 * Math.sin(T * 37))
      : 0.3 + 2.6 * Math.exp(-(T - T_RELEASE) * 3.5);
    G.glassMat.uniforms.uCoreI.value = coreI;
    G.glassMat.uniforms.uCoreV.value.copy(G.group.position).applyMatrix4(G.cam.matrixWorldInverse);
    const du = G.dustMat.uniforms; du.uTau.value = S.tau; du.uT.value = T; du.uI.value = coreI;
    u.uGlow.value = T < 0.15 ? 1.2 * (1 - T / 0.15) + 0.2 : T < T_RELEASE ? 0.2 + 0.55 * sstep(T_SLOW, T_RELEASE, T) * (0.85 + 0.15 * Math.sin(T * 37)) : 1.1 * Math.exp(-(T - T_RELEASE) * 3);
    // text garbles as the plasma reaches it
    if (T > T_SPREAD && T > S.nextScr) {
      S.nextScr = T + 0.1;
      drawSnap(clamp01((T - T_SPREAD) / 2.5) * 0.45);
    }
    // camera shake: a tremor (layered sines), not per-frame random jitter
    const sh = (T < 0.4 ? 10 * (1 - T / 0.4) : 0) + (T > T_RELEASE && T < 1.8 ? 7 * (1 - (T - T_RELEASE) / 0.5) : 0) + (T > T_RELEASE ? spike * 1.2 + 1.5 * clamp01((T - 2) / 2) : 0)
      + (T > T_IMPACT ? 16 * Math.exp(-(T - T_IMPACT) * 9) : 0);   // the jolt of the strike
    const nx = 0.6 * Math.sin(T * 47.3) + 0.4 * Math.sin(T * 83.1 + 1.7), ny = 0.6 * Math.sin(T * 51.7 + 0.9) + 0.4 * Math.sin(T * 77.3 + 2.3);
    if (sh > 0.1) shake(nx * sh * 0.5, ny * sh * 0.5); else shake(0, 0);

    if (T >= T_CUT && !S.flags.cut) {
      // a flat panel doesn't collapse to a dot: the power just dies, and the
      // cracked glass stays, faintly catching the room's light, over the BIOS
      S.flags.cut = true;
      shake(0, 0);
      S.mode = 'off'; S.heal = S.healS = 0;
      G.dust.visible = false;
      showBios(true);
      G.canvas.style.zIndex = '3003';
      reboot();
    }
  }

  const sleep = ms => new Promise(r => { const id = setTimeout(r, ms); S.wake = () => { clearTimeout(id); r(); }; });
  const SKIP = {};
  async function wait(ms) { if (S.skip) throw SKIP; await sleep(ms); if (S.skip) throw SKIP; }
  function skip() { S.skip = true; if (S.wake) S.wake(); }

  function showBios(on) {
    if (on && !bios) {
      bios = document.createElement('div');
      bios.id = 'breach-bios';
      bios.setAttribute('aria-hidden', 'true');
      document.body.appendChild(bios);
    }
    if (!bios) return;
    if (on) bios.textContent = '';   // a fresh, black screen: never the last run's text
    bios.hidden = !on;
  }

  async function reboot() {
    try {
      await wait(1100);      // the dark beat: just the cracked glass
      S.flags.bios = true;
      bios.textContent = '';
      SFX.beep();
      await biosType(bios);
      await wait(650);
      // the text goes, the black screen stays: the splash fades in over it,
      // and the popup only comes back after the splash (restore hides this)
      bios.textContent = '';
      await wait(300);
      await splash();
    } catch (e) { if (e !== SKIP) console.error(e); }
    splashReset();
    restore();
  }

  async function biosType(el) {
    const HR = '─'.repeat(54), HR2 = '═'.repeat(54);
    const line = (txt, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = txt || ' '; el.appendChild(d); return d; };
    const cursor = d => { el.querySelectorAll('.cur').forEach(c => c.remove()); const c = document.createElement('span'); c.className = 'cur'; d.appendChild(c); };
    const pair = (label, val, cls) => { const d = line(label, 'label'); const s = document.createElement('span'); s.className = cls; s.textContent = val; d.appendChild(s); return s; };
    const L = [
      () => line('ECHO OS  ·  BIOS v0.1a  ·  Polyspheric Inc.', 'white'), 60,
      () => line(`Copyright (C) ${new Date().getFullYear()}. All rights reserved.`, 'mid'), 50,
      () => line(''), 20, () => line(HR, 'sep'), 20, () => line(''), 40,
      () => line('[ RECOVERY ]  Unexpected shutdown', 'blue'), 220,
      () => pair('Shutdown cause  ··········  ', 'CORE BREACH', 'red'), 160,
      () => pair('Fault address   ··········  ', '0x1C0 · iCO', 'mid'), 120,
      () => pair('Plasma field    ··········  ', 'CONTAINED', 'cyan'), 240,
    ];
    for (let i = 0; i < L.length; i += 2) { const d = L[i](); cursor(d.closest('div') || d); SFX.tick(); await wait(L[i + 1]); }
    const s = pair('Lattice rebuild ··········  ', '00/20', 'cyan'); cursor(s.parentNode);
    // each step pulls the screen's cracks a little further back into the glass
    for (let k = 1; k <= 20; k++) { s.textContent = String(k).padStart(2, '0') + '/20'; S.heal = k / 20; if (k % 3 === 0) SFX.tick(); await wait(60); }
    await wait(120);
    for (const [fn, ms] of [
      [() => pair('Glass integrity ··········  ', 'PASS', 'cyan'), 160],
      [() => line(''), 30], [() => line(HR2, 'sep'), 30], [() => line(''), 60],
    ]) { const d = fn(); cursor(d.closest('div') || d); SFX.tick(); await wait(ms); }
    const init = line('Initializing ECHO OS', 'hi'); cursor(init);
    for (let k = 1; k <= 3; k++) { await wait(240); init.firstChild.textContent = 'Initializing ECHO OS' + ' .'.repeat(k); }
    await wait(200);
    line(''); const ready = line('ECHO OS  ·  READY.', 'flash-ready'); cursor(ready);
    for (let k = 0; k < 4; k++) { ready.style.visibility = k % 2 ? 'visible' : 'hidden'; await wait(110); }
    ready.style.visibility = 'visible';
  }

  // the site's own ECHO OS splash (index.html's #psy-splash), played again
  let splashKeep = null;
  async function splash() {
    const sp = document.getElementById('psy-splash');
    if (!sp) return;
    const logo = document.getElementById('psy-logo'), bloom = document.getElementById('psy-bloom'), tag = document.getElementById('psy-tagline');
    splashKeep = { z: sp.style.zIndex, display: sp.style.display, opacity: sp.style.opacity, transition: sp.style.transition };
    [logo, bloom, tag].forEach(el => { if (el) el.style.opacity = '0'; });
    Object.assign(sp.style, { zIndex: '3004', display: 'flex', transition: 'opacity 0.5s ease', opacity: '0' });   // over the black BIOS screen and the glass layer
    void sp.offsetWidth;
    sp.style.opacity = '1';
    if (typeof playSound === 'function' && typeof _bufSplash !== 'undefined' && _bufSplash) playSound(_bufSplash);
    await wait(100);
    if (logo) logo.style.opacity = '1'; if (bloom) bloom.style.opacity = '1';
    await wait(500);
    if (tag) tag.style.opacity = '1';
    await wait(1600);   // the site's splash hold
    sp.style.opacity = '0';
    await wait(600);
  }
  function splashReset() {
    const sp = document.getElementById('psy-splash');
    if (!sp || !splashKeep) return;
    ['psy-logo', 'psy-bloom', 'psy-tagline'].forEach(id => { const el = document.getElementById(id); if (el) el.style.opacity = '1'; });
    Object.assign(sp.style, { zIndex: splashKeep.z, display: 'none', opacity: '0', transition: splashKeep.transition });
    splashKeep = null;
  }

  function restore() {
    S.mode = 'rest';
    shake(0, 0);
    SFX.cut();
    showBios(false);
    G.canvas.style.zIndex = '3001';
    G.compMat.uniforms.uHitAge.value = -1; G.compMat.uniforms.uOver.value = 0;
    showContent(true);
    if (ring() && ring().hold) ring().hold(false);
    window.__icoPaused = false;
    if (ring() && ring().log) ring().log('INFO', 'Core rebuilt · lattice 20/20');
    box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: 'ease-out' });
    G.canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: 'ease-out' });
    // shards come home from wherever they flew
    const rnd = Math.random;
    for (const s of G.shards) {
      s.from.copy(s.c).normalize().multiplyScalar(3.5 + rnd() * 4).add(new THREE.Vector3((rnd() - 0.5) * 3, (rnd() - 0.5) * 3, (rnd() - 0.5) * 3));
      s.fromQ.setFromAxisAngle(s.axis, (rnd() - 0.5) * 9);
      s.delay = 0.25 + rnd() * 0.45;
      s.m.visible = true;
    }
    G.plasma.scale.setScalar(0.001);
    const pm = G.plasmaMat.uniforms; pm.uWild.value = 0; pm.uFade.value = 1; pm.uPulse.value = 0;
    G.glassMat.uniforms.uCoreI.value = 0; G.dust.visible = false; G.hero.visible = false;
    crack = crackTarget = 1;
    S.re = { t0: performance.now() / 1000, dur: 0.9, snapped: false };
    SFX.reform(0.25 + 0.45 + 0.9);
  }

  function updateReform(now) {
    const re = S.re, T = now - re.t0;
    for (const s of G.shards) {
      const k = clamp01((T - s.delay) / re.dur);
      const e = 1 - Math.pow(1 - k, 4);
      s.m.position.lerpVectors(s.from, s.c, e);
      s.m.quaternion.copy(s.fromQ).slerp(_qI, e);
    }
    const pk = clamp01((T - 0.55) / 0.8);
    G.plasma.scale.setScalar(Math.max(0.001, 1 + 2.70158 * Math.pow(pk - 1, 3) + 1.70158 * Math.pow(pk - 1, 2)));
    if (!re.snapped && T > 1.62) {
      re.snapped = true;
      G.glassMat.uniforms.uSolid.value = 0;
      G.renderer.sortObjects = false;
      pulseStart = now; crackTarget = 0;
      SFX.snap();
    }
    if (T > 2.6) {
      S.re = null; S.active = false;
      shieldOn(false);   // touchable again only once the iCO has formed
      for (const s of G.shards) { s.m.position.copy(s.c); s.m.quaternion.identity(); }
      handBack();   // (shrinks the canvas and the break's targets back to 1px)
      trophy();
    }
  }

  // the glass is whole again: the site's trophy (index.html's icoTrophy, once per visit)
  function trophy() { setTimeout(() => { if (typeof window.icoTrophy === 'function') window.icoTrophy(); }, 500); }

  /* ───────────────────────── loop ───────────────────────── */
  // Runs only while the copy stands in for the iCO or the egg plays.
  let ry = 0.4, last = 0, lastFrame = 0;
  function run() { if (!S.raf) S.raf = requestAnimationFrame(frame); }
  function frame(ts) {
    S.raf = 0;
    if (!G || (!S.copy && !S.active)) return;
    S.raf = requestAnimationFrame(frame);
    if (ts - lastFrame < 1000 / 60 - 2) return;
    const dtMs = lastFrame ? ts - lastFrame : 16; lastFrame = ts;
    const s = ts / 1000, dt = Math.min(0.05, last ? s - last : 0.016); last = s;

    // ico.js click pulse: sharp attack, exponential decay
    const pt = Math.max(0, s - pulseStart) / 0.9;
    let pulse = 0;
    if (pt <= 1) pulse = (1 - Math.pow(1 - Math.min(pt / 0.08, 1), 3)) * Math.exp(-Math.max(pt - 0.08, 0) * 4.5);

    // the gesture lapses: cracks seal again, then the real iCO takes back over
    if (!S.active && taps && !S.pin && !S.pending && performance.now() - lastTap > GAP + 300) { taps = 0; crackTarget = 0; stress = 0; SFX.humOff(); }
    crack += (crackTarget - crack) * Math.min(1, dt * (crackTarget > crack ? 9 : S.re ? 1.4 : 1.8));
    if (!S.active && !taps && crack < 0.004 && pt > 1) { handBack(); return; }

    // (held still while the egg plays: the popup shakes, and this canvas with it)
    if (!S.active || S.re) G.placeCore();
    const ms = 1 + pulse * 0.06;
    const shk = shakeAmp * Math.exp(-(s - shakeT) * 7) + stress * 0.006;
    G.group.position.copy(G.core); G.group.position.x += (Math.random() - 0.5) * shk; G.group.position.y += (Math.random() - 0.5) * shk;
    G.plasma.position.copy(G.group.position);

    if (S.mode === 'seq') {
      const T = S.debugT != null ? S.debugT : s - S.t0;
      ry += 0.24 * dt * (T < T_RELEASE ? 0.2 : 0);
      G.group.rotation.set(RX, ry, 0); G.group.scale.setScalar(1);
      updateSeq(T);
      if (S.mode !== 'seq') { G.render('pane'); return; }
      G.glassMat.uniforms.uCrack.value = crack;
      G.glassMat.uniforms.uPulse.value = T < 0.5 ? 1 - T * 2 : 0.2;
      G.plasmaMat.uniforms.uT.value = s * 0.78 * (T > T_SLOW && T < T_RELEASE ? 1.8 : 1);
      G.glassMat.uniforms.t.value = s;
      G.plasma.rotation.y = s * 0.08;
      G.render('seq');
      // adaptive: sustained slow frames during the corruption step the pass down
      if (T > T_RELEASE && T < T_SURGE && S.debugT == null) {
        S.slow = dtMs > 26 ? (S.slow || 0) + 1 : 0;
        if (S.slow > 12 && G.lowerComp()) S.slow = 0;
      }
      return;
    }
    if (S.mode === 'off') {
      S.healS += (S.heal - S.healS) * Math.min(1, dt * 10);
      G.paneMat.uniforms.uHeal.value = S.healS;
      if (S.healS < 0.999) G.render('pane');
      else if (!S.flags.cleared) { S.flags.cleared = true; G.render('off'); }
      return;
    }

    // at rest: ico.js's loop, at ico.js's angle
    ry = mirrorRy;
    G.group.rotation.set(RX, ry, 0);
    G.group.scale.setScalar(ms); if (!S.re) G.plasma.scale.setScalar(ms);
    if (S.re) updateReform(s);
    else if (stress) for (const sh of G.shards) sh.m.position.copy(sh.c).multiplyScalar(1 + (0.006 + 0.012 * sh.jit) * (0.6 + 0.4 * Math.sin(s * 40 + sh.jit * 30)));
    else for (const sh of G.shards) sh.m.position.copy(sh.c);
    if (!S.copy) return;   // handed back during the reform's last frame
    const flick = stress ? 0.25 + 0.25 * Math.sin(s * 31) * Math.sin(s * 17) : 0;
    G.plasmaMat.uniforms.uT.value = s * 0.78;
    G.plasmaMat.uniforms.uPulse.value = Math.max(pulse, flick);
    G.glassMat.uniforms.uCrack.value = crack;
    G.glassMat.uniforms.t.value = s;
    G.glassMat.uniforms.uPulse.value = pulse;
    G.plasma.rotation.y = s * 0.08;
    // the reform flies pieces in from off the iCO's square; once it has snapped
    // shut, the copy is drawn exactly as ico.js would draw it
    G.render(S.re && !S.re.snapped ? 'fly' : 'rest');
    if (!S.hidden) { const c = icoCanvas(); if (c) c.style.visibility = 'hidden'; S.hidden = true; }
  }

  // The popup closing: hand the iCO back (the layer stays, shrunk to 1px and
  // its full-screen targets dropped; the egg itself can't be closed mid-way:
  // the shield takes the clicks and Escape).
  new MutationObserver(() => {
    if (modal.classList.contains('open') || S.active) return;
    if (!taps && !S.copy) return;
    taps = 0; crackTarget = crack = 0; stress = 0; S.pending = false; SFX.humOff(true);
    handBack();
  }).observe(modal, { attributes: true, attributeFilter: ['class'] });

  // index.html asks this before the iCO's usual click sound: true while this
  // takes the Status iCO's clicks (it plays glass instead, on every click)
  window.icoBreach = {
    quiet() {
      if (S.active) return true;
      const admin = document.getElementById('ver-admin');
      return modal.classList.contains('open') && !(admin && !admin.hidden) && !!ac();
    },
  };

  // local testing only: step the sequence by hand
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__icoBreach = { S, start, breach: () => { if (G && G.allReady) breach(); }, get G() { return G; } };
})();
