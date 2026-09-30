/* Message popup: the Status popup's structure around a hologram sphere.
   Built in the "Message Popup" artifact, then ported here. Sending posts to
   Formspree alongside the animation; DELIVERED waits for both.
   The word you're typing forms inside the sphere letter by letter, each one
   materialising behind a rising scan line. A finished word holds for a
   moment, then lifts and fades while the next forms (shorter holds when you
   type faster). A deleted letter collapses and fades at once; deleting back
   into the previous word brings it back. Sending folds what's there into a
   point of light that lifts out of the sphere.
   One small canvas, 30 fps, only while this version is on screen. */
(function () {
  const sec = document.getElementById('v-lv');
  const hero = document.getElementById('lv-hero');
  const cv = document.getElementById('lv-gl');
  const CYAN = [0.59, 0.84, 1.0];

  const badge = (id, text, lit) => window.etchedUI.etchedBadge(document.getElementById(id), { text, rgb: CYAN, lit });
  let stateText = '';
  const setState = t => { if (t !== stateText) { stateText = t; badge('lv-state', t, true); document.getElementById('lv-state').setAttribute('aria-label', t); } };
  setState('LISTENING');

  // ── the form: callouts, badge, send ──
  const $ = id => document.getElementById(id);
  const name = $('lv-name'), why = $('lv-why'), msg = $('lv-msg'), send = $('lv-send');
  const form = sec.querySelector('form');
  let composing = false, sendLit = false, sending = false;
  const hot = (el, on) => el.classList.toggle('hot', on);
  // ── VIBE: the overall tone of the message, read in the browser (nothing is sent) ──
  // The message is split into clauses (sentences, and turns like "but" / "though").
  // Each clause scores every vibe from its words, emoji and punctuation; later
  // clauses and the side of a turn that carries the feeling count for more,
  // and a negated positive ("not impressed") reads as disappointment.
  // The strongest vibe wins; a close runner-up shows as "mixed · …".
  const VIBES = [
    // positive
    ['RESPECT',      /\b(respect\w*|admir\w*|honou?r\w*|legend\w*|goat|salute|inspir\w*|role model|huge fan|big fan|fan of|idol)\b/giu, 3, +1],
    ['WOW',          /\b(wo+w+|who+a+|insane|crazy|unreal|mind ?blow\w*|incredible|omg|no way|jaw)\b|🤯|😮|😲|😱/giu, 3, +1],
    ['IMPRESSED',    /\b(impress\w*|amazing|brilliant|beautiful|stunning|gorgeous|great (work|job|stuff)|well done|masterpiece|fire|talent\w*|skill\w*)\b|🔥|👏|💯/giu, 2.5, +1],
    ['LOVE',         /\b(love[ds]?|loving|adore|obsessed)\b|❤️?|😍|🥰|💙/giu, 2, +1],
    ['GRATEFUL',     /\b(thanks?|thank you|thx|ty|grateful|appreciat\w*)\b|🙏/giu, 3, +1],
    ['COLLAB',       /\b(collab\w*|work together|working together|partner\w*|project|hire|hiring|commission\w*|opportunit\w*|budget|client|brand|proposal|freelance|gig)\b|🤝/giu, 3, 0],
    ['EXCITED',      /\b(excited|hyped?|can'?t wait|let'?s go+|pumped|stoked)\b|!{2,}/giu, 2.5, +1],
    ['PLAYFUL',      /\b(lo+l|lmao|lmfao|ha(ha)+|hehe+|jk|kidding)\b|😂|🤣|😅|😜/giu, 2, +1],
    ['HAPPY',        /\b(happy|happier|happiest|glad|joy\w*|cheerful|delighted|blessed|smil(e|ing)|feeling (good|great)|good (day|mood|vibes)|great day|awesome|nice)\b|😊|😁|😀|😃|☺️?|🥳|:D/giu, 2.4, +1],
    ['FRIENDLY',     /\b(hi+|hey+|hello|yo|sup|hiya|greetings|cheers)\b|🙂|:\)/giu, 1, +1],
    ['CURIOUS',      /\b(how|what|when|wonder\w*|curious|question|could you|can you|explain|process)\b|\?/giu, 1.2, 0],
    // negative
    ['SAD',          /\b(sad|sadly|upset|hurt\w*|lonely|miss(ing|ed)? you|miss\b|crying|cried|heartbroken|down|depress\w*|left on read|why (aren'?t|don'?t|won'?t|didn'?t|haven'?t) you)\b|😢|😭|💔|☹️?|🙁|:\(/giu, 3.2, -1],
    ['FRUSTRATED',   /\b(angry|annoy\w*|mad|furious|pissed|frustrat\w*|ridiculous|wtf|seriously\?|unacceptable|rude|hate|ignor\w*|no reply|no response)\b|😡|🤬|😤/giu, 3.2, -1],
    ['DISAPPOINTED', /\b(disappoint\w*|meh|let ?down|expected more|underwhelm\w*|not (that |very |really )?(good|great|impressed|amazing))\b|😕|😒/giu, 3, -1],
    ['CONFUSED',     /\b(confus\w*|don'?t (get|understand)|lost|unclear|huh|wait what)\b|🤔|😵/giu, 3.4, 0],
  ];
  const NEG = /\b(not|never|no|n't|dont|don't|isn'?t|wasn'?t|aren'?t|hardly)\b[^.!?]{0,14}$/i;
  const TURN = /\b(but|though|however|although|yet|still)\b/i;
  function readVibe(text) {
    const t = text.trim();
    if (t.length < 4) return { main: '—', sub: '' };
    // clauses: split on sentence ends and on turns, remembering which side of a turn each is on
    const parts = t.split(/(?<=[.!?…])\s+|\s*\b(?=(?:but|however|although|yet)\b)/i).filter(p => p && p.trim());
    const score = Object.fromEntries(VIBES.map(v => [v[0], 0]));
    parts.forEach((clause, i) => {
      let w = 1 + 0.35 * i;                                    // later clauses weigh a little more
      if (/^\s*(but|however|although|yet)\b/i.test(clause)) w *= 1.5;   // the side after a turn carries the feeling
      if (/\b(though|tho)\b/i.test(clause)) w *= 1.4;          // "I'm sad though": this clause is the point
      VIBES.forEach(([name, re, weight, pol]) => {
        re.lastIndex = 0; let m;
        while ((m = re.exec(clause))) {
          const before = clause.slice(0, m.index);
          if (pol > 0 && NEG.test(before)) score.DISAPPOINTED += weight * w * 0.8;   // "not impressed"
          else score[name] += weight * w;
        }
      });
      const bangs = (clause.match(/!/g) || []).length;
      if (bangs) { score.EXCITED += Math.min(1.5, bangs * 0.35) * w; score.WOW += Math.min(1, bangs * 0.2) * w; }
    });
    const ranked = Object.entries(score).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return { main: t.length < 14 ? '—' : 'NEUTRAL', sub: '' };
    const [[main, top], second] = ranked;
    const sub = second && second[1] >= top * 0.5 && second[0] !== 'FRIENDLY' && second[0] !== 'CURIOUS' ? 'mixed · ' + second[0].toLowerCase() : '';
    return { main, sub };
  }
  // each vibe's tint: muted, so it reads as light in the glass, not a label colour
  const VIBE_TINT = {
    RESPECT: '165,185,255', WOW: '110,215,255', IMPRESSED: '130,200,255', LOVE: '255,140,185',
    GRATEFUL: '120,230,185', COLLAB: '110,175,255', EXCITED: '255,190,100', PLAYFUL: '255,215,110',
    FRIENDLY: '140,225,165', CURIOUS: '180,160,255', SAD: '120,150,235', FRUSTRATED: '255,120,100',
    DISAPPOINTED: '235,170,95', CONFUSED: '195,150,245', HAPPY: '250,228,140',
  };
  // the readout decodes into its new word, like a HUD settling
  const vibeEl = $('ro-vibe'), vibeSub = $('ro-vibe-sub');
  let vibeNow = '—', vibeTimer = 0, decodeRAF = 0;
  function showVibe({ main: v, sub }) {
    vibeSub.textContent = sub;
    if (v === vibeNow) return;
    vibeNow = v; cancelAnimationFrame(decodeRAF);
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', t0 = performance.now(), dur = v === '—' ? 1 : 420;
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / dur), shown = Math.floor(p * v.length);
      vibeEl.textContent = v.split('').map((c, i) => i < shown ? c : A[(Math.random() * 26) | 0]).join('');
      if (p < 1) decodeRAF = requestAnimationFrame(step); else vibeEl.textContent = v;
    };
    step();
    const tint = VIBE_TINT[v];
    vibeEl.classList.toggle('hot', !!tint);
    vibeEl.style.color = tint ? `rgb(${tint})` : '';
    vibeEl.style.textShadow = tint ? `0 -0.7px 0 rgba(0,0,0,0.8), 0 0 10px rgba(${tint},0.6)` : '';
  }
  const queueVibe = () => { clearTimeout(vibeTimer); vibeTimer = setTimeout(() => showVibe(readVibe(msg.value)), 380); };
  function sync() {
    const n = msg.value.trim().length;
    $('ro-len').textContent = n + (n === 1 ? ' character' : ' characters'); hot($('ro-len'), n > 0);
    queueVibe();
    send.disabled = !n;
    if (n && !composing) { composing = true; setState('COMPOSING'); }
    if (!n && composing) { composing = false; setState('LISTENING'); }
  }
  // typing speed (keystrokes per second, smoothed) sets the pace of the words
  let lastKey = 0, rate = 0;
  [name, why].filter(Boolean).forEach(el => el.addEventListener('input', sync));
  let holo = null;
  // the dots show while you're typing a message, and fade ~1.4 s after you pause
  const dots = $('lv-dots'); let dotsTimer = 0;
  const typingDots = on => { clearTimeout(dotsTimer); dots.classList.toggle('on', on); if (on) dotsTimer = setTimeout(() => dots.classList.remove('on'), 1400); };
  msg.addEventListener('input', () => {
    typingDots(!!msg.value.trim() && !sending);
    const now = performance.now();
    if (lastKey) rate = rate * 0.6 + Math.min(14, 1000 / Math.max(now - lastKey, 60)) * 0.4;
    lastKey = now;
    sync();
    if (holo) holo.text(msg.value);
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!msg.value.trim() || sending) { msg.focus(); return; }
    sending = true;
    typingDots(false);
    [name, why, msg].filter(Boolean).forEach(el => el.disabled = true);
    setState('TRANSMITTING');
    // the real send runs alongside the animation; DELIVERED waits for both
    const post = fetch('https://formspree.io/f/mlgpavdr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ name: name.value.trim() || 'anonymous', message: msg.value.trim(), vibe: vibeNow }),
    }).then(r => { if (!r.ok) throw new Error('send failed: ' + r.status); });
    const shown = new Promise(res => (holo ? holo.send(res) : setTimeout(res, 900)));
    Promise.all([post, shown]).then(() => {
      setState('DELIVERED');
      // the sphere stays; the transcript and the send row give way to the reply
      showDone(true);
    }, err => {
      console.error('[msg]', err);
      // let the animation finish, then give the message back to try again
      shown.then(() => {
        sending = false;
        [name, why, msg].filter(Boolean).forEach(el => el.disabled = false);
        if (holo) { holo.reset(); holo.text(msg.value); }
        setState('NOT SENT · TRY AGAIN');
        send.disabled = !msg.value.trim();
      });
    });
  });
  // you type into the hologram: clicking the sphere (anywhere but a callout) writes the message
  hero.addEventListener('click', e => { if (!e.target.closest('.ro') && !msg.disabled) msg.focus(); });
  msg.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); } });
  // ready to type as soon as the popup opens
  new MutationObserver(() => { if (!sec.hidden && !msg.disabled && matchMedia('(pointer: fine)').matches) setTimeout(() => msg.focus({ preventScroll: true }), 60); })
    .observe(sec, { attributes: true, attributeFilter: ['hidden'] });
  // the two confirmation lines span the same width: the shorter one's letters spread to match
  function fitDone() {
    const lines = [...sec.querySelectorAll('.lv-done .dl')];
    lines.forEach(l => { l.style.letterSpacing = ''; l.style.paddingLeft = ''; });
    const base = parseFloat(getComputedStyle(lines[0]).letterSpacing) || 0;
    // ink width = box width minus the spacing after the last letter
    const ink = l => l.getBoundingClientRect().width - base;
    const target = Math.max(...lines.map(ink));
    lines.forEach(l => {
      const n = l.textContent.length, extra = (target - ink(l)) / Math.max(1, n - 1);
      if (extra > 0.01) { l.style.letterSpacing = (base + extra) + 'px'; }
      l.style.paddingLeft = (parseFloat(l.style.letterSpacing) || base) + 'px';   // keeps it centred
    });
  }
  if (document.fonts) document.fonts.ready.then(() => { if (!sec.querySelector('.lv-done').hidden) fitDone(); });
  window.__msgPopup = { opened() { if (!sec.querySelector('.lv-done').hidden) resetAll(); } };
  // after sending, the reply takes the message line's place; the message line and SEND
  // keep their space (just invisible), so the popup keeps its exact size
  function showDone(on) {
    const script = sec.querySelector('.lv-script'), done = sec.querySelector('.lv-done');
    sec.classList.toggle('is-done', on);
    done.hidden = !on;
    if (on) {
      // centred in the space the message line and SEND leave behind
      const row = sec.querySelector('.lv-sendrow');
      fitDone();
      done.style.top = Math.round((script.offsetTop + row.offsetTop + row.offsetHeight - done.offsetHeight) / 2) + 'px';
    }
  }
  function resetAll() {
    form.reset(); showDone(false);
    [name, why, msg].filter(Boolean).forEach(el => el.disabled = false);
    const a = sec.querySelector('.again'); if (a) a.remove();
    composing = false; sending = false; setState('LISTENING'); sync();
    if (holo) holo.reset();
  }

  // SEND: the site's plasma glass button, in the hologram's cyan-blue
  if (window.mountPlasmaButton) window.mountPlasmaButton('lv-send', 'lv-send-canvas', { stretchDivisor: 1.4, colorMid: 0x2f6fd0, colorBright: 0xbfe3ff });

  // ── WebGL ──
  if (!window.THREE) return;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'low-power' }); } catch (e) { return; }
  renderer.setClearColor(0, 0);
  const DPR = Math.min(devicePixelRatio || 1, 2);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 0, 5.2);
  const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const U = { uT: { value: 0 }, uFlash: { value: 0 }, uPhase: { value: 0 }, uHitT: { value: -1 },
              uGather: { value: 0 }, uSweep: { value: -9 }, uReveal: { value: 1 } };
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const easeInOut = x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.14)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const glow = (rgb, size, opacity = 1) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial(Object.assign({ map: glowTex, opacity }, ADD)));
    s.material.color.setRGB(...rgb); s.scale.setScalar(size); return s;
  };

  // the sphere: glass skin, a faint field of rising scan bands, a projector glow below
  const SR = 0.66;
  const sphere = new THREE.Group(); scene.add(sphere);
  const sphVS = `varying vec3 vN,vV,vP;void main(){vP=position;vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`;
  sphere.add(new THREE.Mesh(new THREE.SphereGeometry(SR * 0.98, 48, 32), new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, ...ADD, vertexShader: sphVS,
    fragmentShader: `uniform float uT, uFlash, uPhase, uGather, uSweep, uReveal; varying vec3 vN,vV,vP;
      void main(){
        // rising scan bands (their pace eases and quickens with your typing), and a finer layer drifting down
        float up = pow(0.5 + 0.5*sin(vP.y*70.0 - uPhase), 6.0);
        // while sending they're pulled in from the top and bottom toward the core
        float inward = pow(0.5 + 0.5*sin(abs(vP.y)*70.0 + uPhase*1.3), 6.0);
        float band = mix(up, inward, uGather);
        float fine = pow(0.5 + 0.5*sin(vP.y*150.0 + uPhase*0.45 + vP.x*4.0), 12.0) * (1.0 - uGather);
        // after the launch they blink out and re-scan from the bottom up behind a bright edge
        float ry = mix(-0.7, 0.72, uReveal);
        float shown = smoothstep(ry + 0.03, ry - 0.03, vP.y);
        float edge = exp(-pow((vP.y - ry) * 30.0, 2.0)) * step(0.001, uReveal) * step(uReveal, 0.999);
        // one bright line rides up with the ball
        float sweep = exp(-pow((vP.y - uSweep) * 16.0, 2.0));
        float low = smoothstep(0.7, -0.7, vP.y);
        vec3 col = vec3(0.25,0.5,1.0)*(0.05 + (0.085*band + 0.035*fine) * shown) * (0.5 + 0.8*low)
                 + vec3(0.55,0.8,1.0)*(sweep*0.35 + edge*0.4) + vec3(0.6,0.8,1.0)*uFlash*0.15;
        gl_FragColor = vec4(col, 1.0);
      }`,
  })));
  sphere.add(new THREE.Mesh(new THREE.SphereGeometry(SR, 56, 36), new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, vertexShader: sphVS,
    fragmentShader: `uniform float uFlash, uHitT; varying vec3 vN,vV,vP;
      void main(){ vec3 N = normalize(vN), V = normalize(vV);
        float e = 1.0 - max(dot(N, V), 0.0);
        float spec = pow(max(dot(reflect(-V, N), normalize(vec3(-0.4,0.8,0.5))), 0.0), 60.0);
        // the send ripple: a ring spreading over the glass from the top, where the ball broke through
        float wave = 0.0;
        if (uHitT >= 0.0) {
          float d = acos(clamp(normalize(vP).y, -1.0, 1.0));
          float rr = uHitT * 2.4;
          wave = exp(-pow((d - rr) * 8.0, 2.0)) * (1.0 - clamp(uHitT / 0.85, 0.0, 1.0)) * 0.8 + exp(-d * d * 22.0) * max(0.0, 1.0 - uHitT * 2.5);
        }
        gl_FragColor = vec4(mix(vec3(0.72,0.86,1.0), vec3(0.9,0.97,1.0), wave), pow(e, 3.0)*(0.6+0.4*uFlash) + spec*0.35 + wave*0.42); }`,
  })));
  const projector = glow([0.35, 0.6, 1.0], 0.9, 0.28); projector.position.set(0, -SR * 0.92, 0); sphere.add(projector);

  // ── glyphs: one plane per letter, a hologram shader with a rising scan-line reveal ──
  const texCache = new Map();
  const GH = 128, FONT = "400 92px Michroma, 'Share Tech Mono', sans-serif";
  const measure = document.createElement('canvas').getContext('2d');
  const glyph = ch => {
    if (texCache.has(ch)) return texCache.get(ch);
    measure.font = FONT;
    const w = Math.max(24, Math.ceil(measure.measureText(ch).width) + 16);
    const c = document.createElement('canvas'); c.width = w; c.height = GH;
    const g = c.getContext('2d'); g.font = FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff'; g.fillText(ch, w / 2, GH / 2 + 4);
    const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter;
    const out = { tex: t, aspect: w / GH, adv: measure.measureText(ch).width / GH };
    texCache.set(ch, out); return out;
  };
  // Michroma may still be loading: redraw cached glyphs once it's in
  if (document.fonts && !document.fonts.check(FONT)) document.fonts.load(FONT).then(() => {
    [...texCache.keys()].forEach(ch => { const old = texCache.get(ch); texCache.delete(ch); const n = glyph(ch); old.tex.image = n.tex.image; old.tex.needsUpdate = true; old.aspect = n.aspect; old.adv = n.adv; });
  }, () => {});

  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const letterMat = map => new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uA: { value: 0 }, uO: { value: 1 }, uT: U.uT, uSeed: { value: Math.random() } },
    ...ADD,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform float uA, uO, uT, uSeed; varying vec2 vUv;
      void main(){
        float a = texture2D(map, vUv).a;
        float line = uA * 1.2 - 0.1;                                  // the reveal's scan line, rising
        float vis = smoothstep(line + 0.03, line - 0.03, vUv.y);
        float beam = exp(-pow((vUv.y - line) * 26.0, 2.0)) * (1.0 - smoothstep(0.85, 1.0, uA));
        float scan = 0.8 + 0.2 * sin(vUv.y * 80.0 - uT * 7.0);        // fine hologram lines
        float flick = 0.93 + 0.07 * sin(uT * 21.0 + uSeed * 40.0);
        vec3 col = mix(vec3(0.42,0.72,1.0), vec3(0.9,0.96,1.0), a);
        float alpha = (a * vis * scan + beam * (0.12 + a) * 0.9) * uO * flick;
        gl_FragColor = vec4(col * alpha * 1.35, alpha);
      }`,
  });

  // ── the phrase: the last few words of your message, set in the sphere ──
  const LH = 0.17;            // letter height
  const LINE = 0.23;          // line spacing
  const MAXW = SR * 1.5;      // the widest a line may run before it's scaled down
  const SHOW = 3;             // words on screen at once
  const SP = LH * 0.55;       // the space between words
  const words = [];           // { idx, str, letters, state: 'on' | 'leaving' | 'dropping', grp, x, y, z, s, width }
  const newWord = idx => { const w = { idx, str: '', letters: [], state: 'on', x: null, y: null, z: 0, s: 1, width: 0, grp: new THREE.Group() }; sphere.add(w.grp); words.push(w); return w; };
  function addLetter(w, ch, fast) {
    const gl = glyph(ch);
    const m = new THREE.Mesh(planeGeo, letterMat(gl.tex));
    m.scale.set(LH * gl.aspect, LH, 1);
    const L = { ch, gl, m, a: fast ? 0.6 : 0, o: 1, dying: false, x: null };
    w.grp.add(m); w.letters.push(L); return L;
  }
  // bring a word's letters in line with str: keep the shared start, collapse the rest, add the new
  function setStr(w, str, fast) {
    const alive = w.letters.filter(L => !L.dying);
    const a = alive.map(L => L.ch), b = [...str];
    let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++;
    alive.slice(k).forEach(L => { L.dying = true; });
    b.slice(k).forEach(ch => addLetter(w, ch, fast));
    w.str = str;
  }
  const advOf = L => L.gl.adv * LH + LH * 0.08;
  const widthOf = w => w.letters.filter(L => !L.dying).reduce((s, L) => s + advOf(L), 0);
  function placeLetters(w, dt) {
    let x = -w.width / 2;
    w.letters.filter(L => !L.dying).forEach(L => {
      const adv = advOf(L), tx = x + adv / 2; x += adv;
      L.x = L.x === null ? tx : L.x + (tx - L.x) * Math.min(1, dt * 14);
      L.m.position.x = L.x;
    });
  }
  // lay the words on screen out as centred lines, wrapping when a line runs too wide
  function layoutPhrase(dt) {
    const on = words.filter(w => w.state === 'on').sort((p, q) => p.idx - q.idx);
    on.forEach(w => { w.width = widthOf(w); });
    const lines = []; let cur = [], cw = 0;
    on.forEach(w => {
      const add = (cur.length ? SP : 0) + w.width;
      if (cur.length && cw + add > MAXW) { lines.push({ ws: cur, w: cw }); cur = []; cw = 0; }
      cw += (cur.length ? SP : 0) + w.width; cur.push(w);
    });
    if (cur.length) lines.push({ ws: cur, w: cw });
    const n = lines.length, ease = Math.min(1, dt * 9);
    lines.forEach((ln, li) => {
      const k = ln.w > MAXW ? MAXW / ln.w : 1, y = ((n - 1) / 2 - li) * LINE;
      let x = -ln.w * k / 2;
      ln.ws.forEach((w, j) => {
        if (j) x += SP * k;
        const tx = x + w.width * k / 2; x += w.width * k;
        if (w.x === null) { w.x = tx; w.y = y; w.s = k; }
        w.x += (tx - w.x) * ease; w.y += (y - w.y) * ease; w.s += (k - w.s) * ease;
      });
    });
    return on;
  }

  let clock = 0, prevText = '', endsSpace = true;
  // a thin hologram caret, after the last word
  const caret = new THREE.Mesh(new THREE.PlaneGeometry(0.012, LH * 0.8), new THREE.MeshBasicMaterial(Object.assign({ color: 0xbfe0ff, opacity: 0.8 }, ADD)));
  sphere.add(caret);
  const folded = glow([0.85, 0.93, 1.0], 0.4, 0); sphere.add(folded);
  const trail = [0, 1, 2, 3, 4].map(i => { const tr = glow([0.5, 0.78, 1.0], 0.3 - i * 0.04, 0); sphere.add(tr); return tr; });
  const charge = [0].map(() => { const r = new THREE.Mesh(new THREE.RingGeometry(0.975, 1, 96), new THREE.MeshBasicMaterial(Object.assign({ color: 0xcfe8ff, opacity: 0 }, ADD))); r.position.z = 0.02; sphere.add(r); return r; });
  let sendBoost = 0;   // 0..1: how hard the scan lines race while sending
  const inner = glow([0.3, 0.55, 1.0], 1.1, 0.22); sphere.add(inner);

  holo = {
    text(text) {
      if (sending) return;
      const grew = text.length > prevText.length;
      prevText = text;
      const tokens = text.split(/\s+/).filter(Boolean);
      endsSpace = /\s$/.test(text) || !tokens.length;
      const first = Math.max(0, tokens.length - SHOW);
      const want = new Map();
      for (let i = first; i < tokens.length; i++) want.set(i, tokens[i]);
      words.forEach(w => {
        if (w.state !== 'on') return;
        if (want.has(w.idx)) { setStr(w, want.get(w.idx), !grew); want.delete(w.idx); }
        else if (w.idx < first) w.state = 'leaving';                                   // scrolled off: lifts away
        else { w.letters.forEach(L => { L.dying = true; }); w.state = 'dropping'; }    // deleted: collapses
      });
      // new words: typed ones build letter by letter, words coming back (deleting, pasting) return quickly
      want.forEach((str, idx) => setStr(newWord(idx), str, !grew || idx < tokens.length - 1));
    },
    send(done) {
      // the words on screen gather, left to right; words already fading keep fading
      const all = [];
      words.filter(w => w.state === 'on').sort((a, b) => a.idx - b.idx)
        .forEach(w => w.letters.forEach(L => { if (!L.dying) all.push({ L, from: L.m.getWorldPosition(new THREE.Vector3()), s0: L.m.scale.clone() }); }));
      all.forEach((e, k) => {
        e.delay = all.length > 1 ? (k / (all.length - 1)) * 0.32 : 0;
        e.mote = glow([0.72, 0.9, 1.0], 0.06, 0); sphere.add(e.mote);
      });
      if (holo.anim) holo.anim.all.forEach(e => e.mote && sphere.remove(e.mote));
      holo.anim = { t0: clock, all, done, hist: [] };
      caret.visible = false;
    },
    reset() {
      if (holo.anim) holo.anim.all.forEach(e => e.mote && sphere.remove(e.mote));
      words.slice().forEach(w => { sphere.remove(w.grp); }); words.length = 0; prevText = ''; endsSpace = true;
      folded.material.opacity = 0; folded.position.set(0, 0, 0); folded.scale.setScalar(0.4); caret.visible = true; holo.anim = null;
      trail.forEach(tr => { tr.material.opacity = 0; }); charge.forEach(r => { r.material.opacity = 0; }); sendBoost = 0;
      U.uHitT.value = -1; sphere.scale.setScalar(1); U.uGather.value = 0; U.uSweep.value = -9; U.uReveal.value = 1;
    },
    anim: null,
  };

  function tick(dt, t) {
    clock += dt;
    const on = layoutPhrase(dt);
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i];
      w.letters.forEach(L => {
        if (L.dying) { L.a = Math.max(0, L.a - dt * 9); L.o = Math.max(0, L.o - dt * 8); L.m.position.y = (Math.random() - 0.5) * 0.01; }
        else L.a = Math.min(1, L.a + dt * (4 + rate * 0.5));
        L.m.material.uniforms.uA.value = L.a; L.m.material.uniforms.uO.value = L.o;
      });
      w.letters = w.letters.filter(L => { if (L.dying && L.o <= 0) { w.grp.remove(L.m); L.m.material.dispose(); return false; } return true; });
      if (w.state === 'leaving') {
        w.y += dt * 0.34; w.z -= dt * 0.3; w.s = Math.max(0.5, w.s - dt * 0.4);
        w.letters.forEach(L => { L.o = Math.max(0, L.o - dt * 1.8); });
        if (w.letters.every(L => L.o <= 0.01)) w.letters.forEach(L => { L.dying = true; });
      }
      if (w.state !== 'on') w.width = widthOf(w);
      w.grp.position.set(w.x || 0, w.y || 0, w.z); w.grp.scale.setScalar(w.s);
      placeLetters(w, dt);
      if (w.state !== 'on' && !w.letters.length) { sphere.remove(w.grp); words.splice(i, 1); }
    }
    // the caret sits after the last word (a space further on once you've typed one)
    const lastW = on[on.length - 1];
    if (lastW) caret.position.set(lastW.x + (lastW.width / 2 + (endsSpace ? SP : 0)) * lastW.s + 0.03, lastW.y, 0.01);
    else caret.position.set(0, 0, 0.01);
    caret.scale.setScalar(lastW ? lastW.s : 1);
    caret.visible = false;   // no caret in the sphere
    inner.material.opacity = 0.2 + 0.05 * Math.sin(t * 1.3);

    // ── sending, in four beats (~2.4 s) ──
    //   1 gather  0.0–0.9   letters spiral in, left to right, turning into motes of light;
    //                       the scan lines are drawn in toward the core
    //   2 charge  0.9–1.42  one ring contracts into the core, then a small dip before launch
    //   3 launch  1.42–2.1  the ball springs up, stretching, with a fading trail
    //   4 exit    ~1.8      a soft ripple spreads over the glass where it broke through;
    //                       DELIVERED once it's gone
    const A = holo.anim;
    if (A) {
      const p = clock - A.t0;
      let gathered = 0;
      A.all.forEach(e => {
        const q = clamp01((p - e.delay) / 0.58), g = easeInOut(q);
        const ang = Math.atan2(e.from.y, e.from.x) + g * 1.8;
        const r = Math.hypot(e.from.x, e.from.y) * (1 - g);
        // the spiral stays inside the glass, however long the word was
        const rr = Math.min(r, SR * 0.78);
        const world = new THREE.Vector3(Math.cos(ang) * rr, Math.sin(ang) * rr, e.from.z * (1 - g));
        e.L.m.parent.updateMatrixWorld(true);   // this frame's transform, so the letter and its light stay together
        e.L.m.position.copy(e.L.m.parent.worldToLocal(world.clone()));
        e.L.m.scale.copy(e.s0).multiplyScalar(1 - 0.85 * g);
        e.L.m.material.uniforms.uO.value = q >= 1 ? 0 : Math.max(0, 1 - 1.6 * g);
        e.L.m.material.uniforms.uA.value = 1;
        e.mote.position.copy(world);
        e.mote.material.opacity = q >= 1 ? 0 : Math.min(1, g * 2.2) * (1 - g * 0.3);
        e.mote.scale.setScalar(0.05 + 0.05 * Math.sin(Math.PI * g));
        if (q >= 1) { e.L.m.visible = false; gathered++; }
      });
      const share = A.all.length ? gathered / A.all.length : 1;
      // the scan lines: drawn in while it gathers and charges, released at the launch
      U.uGather.value = p < 1.3 ? easeInOut(clamp01((p - 0.1) / 0.8)) : Math.max(0, 1 - (p - 1.3) / 0.3);
      if (p < 1.3) {
        folded.position.set(0, 0, 0);
        folded.scale.setScalar(0.1 + 0.24 * share);
        folded.material.opacity = Math.min(1, 0.2 + share);
        const c = clamp01((p - 0.9) / 0.4), ring = charge[0];
        ring.scale.setScalar(0.52 * (1 - easeInOut(c)) + 0.06);   // starts just inside the glass
        ring.material.opacity = c > 0 && c < 1 ? 0.38 * Math.sin(Math.PI * c) : 0;
      } else if (p < 1.42) {
        const a = Math.sin(clamp01((p - 1.3) / 0.12) * Math.PI / 2);   // the small dip before launch
        charge[0].material.opacity = 0;
        folded.position.set(0, -0.05 * a, 0);
        folded.scale.set(0.34 * (1 + 0.15 * a), 0.34 * (1 - 0.15 * a), 1);
        folded.material.opacity = 1;
      } else {
        const q = clamp01((p - 1.42) / 0.68), y = -0.05 + q * q * q * 2.8, v = 3 * q * q * 2.8 / 0.68;
        folded.position.set(0, y, 0);
        folded.scale.set(0.3 - 0.08 * q, 0.3 + Math.min(0.55, v * 0.05), 1);
        folded.material.opacity = 1 - clamp01((y - 1.5) / 1.1);
        A.hist.unshift(y); A.hist.length = 18;
        trail.forEach((tr, i) => {
          const hy = A.hist[(i + 1) * 3];
          if (hy === undefined) { tr.material.opacity = 0; return; }
          tr.position.set(0, hy, 0);
          tr.material.opacity = (0.45 - i * 0.075) * folded.material.opacity * Math.min(1, v * 0.3);
        });
        if (y > SR * 0.82 && !A.hit) A.hit = clock;
        if (q >= 1 && !A.landed) A.landed = clock;
        if (A.landed && clock - A.landed > 0.3 && !A.fired) {
          A.fired = true; folded.material.opacity = 0; trail.forEach(tr => { tr.material.opacity = 0; }); A.done();
        }
      }
      U.uHitT.value = A.hit ? clock - A.hit : -1;   // the ripple over the glass
    }
    U.uFlash.value *= Math.exp(-dt * 2.0);
  }

  // callouts: leaders from points on the sphere's edge, out to the labels
  const svg = document.getElementById('lv-leaders');
  const ros = [...hero.querySelectorAll('.ro')];
  const ANG = [0.62, -0.5, 3.75];   // FROM upper right, LENGTH lower right, VIBE lower left
  const RUN = [64, 38, 80];          // each leader's horizontal run in px: FROM, LENGTH, VIBE (the longest)
  const v3 = new THREE.Vector3();
  function place(W, H) {
    let d = '', dots = '', hits = '';
    ros.forEach((el, i) => {
      v3.set(Math.cos(ANG[i]) * SR * 1.02, Math.sin(ANG[i]) * SR * 1.02, 0).project(cam);
      const x = (v3.x * 0.5 + 0.5) * W, y = (-v3.y * 0.5 + 0.5) * H;
      const side = x < W / 2 ? -1 : 1, up = y < H / 2 ? -1 : 1;
      const ex = x + side * 20, ey = y + up * 16;
      const lx = RUN[i] ? ex + side * RUN[i] : side < 0 ? Math.min(ex - 18, 140) : Math.max(ex + 18, W - 140);
      d += `M${x.toFixed(1)} ${y.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)} L${lx.toFixed(1)} ${ey.toFixed(1)} `;
      if (el.querySelector('input')) hits += `<path class="hit" data-i="${i}" d="M${x.toFixed(1)} ${y.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)} L${lx.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="transparent" stroke-width="16"/>`;
      dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" fill="rgba(3,8,16,0.9)" stroke="rgba(150,200,245,0.45)" stroke-width="0.8"/>`;
      el.className = 'ro ' + (side < 0 ? 'left' : 'right') + (el.querySelector('input') ? ' editable' : '');
      el.style.top = (ey - 9) + 'px';
      if (side < 0) { el.style.right = (W - lx + 10) + 'px'; el.style.left = 'auto'; }
      else { el.style.left = (lx + 10) + 'px'; el.style.right = 'auto'; }
      el.style.maxWidth = (side < 0 ? lx - 10 : W - lx - 10) + 'px';
    });
    svg.innerHTML = `<path d="${d}" fill="none" stroke="rgba(0,0,0,0.85)" stroke-width="1" transform="translate(0,-0.6)"/>
      <path d="${d}" fill="none" stroke="rgba(150,200,245,0.32)" stroke-width="1"/>${dots}${hits}`;
  }
  // clicking a FROM / ABOUT leader line (or hovering it) works like the callout itself
  const fieldOf = i => ros[i] && ros[i].querySelector('input');
  svg.addEventListener('click', e => { const h = e.target.closest('.hit'); if (!h) return; e.stopPropagation(); const f = fieldOf(+h.dataset.i); if (f && !f.disabled) f.focus(); });
  svg.addEventListener('pointerover', e => { const h = e.target.closest('.hit'); if (h) ros[+h.dataset.i].classList.add('hover'); });
  svg.addEventListener('pointerout', e => { const h = e.target.closest('.hit'); if (h) ros[+h.dataset.i].classList.remove('hover'); });
  ros.forEach(el => el.addEventListener('click', e => { const f = el.querySelector('input'); if (f && e.target !== f && !f.disabled) f.focus(); }));

  let W = 0, H = 0;
  function fit() {
    const w = hero.clientWidth, h = hero.clientHeight;
    if (!w || !h || (w === W && h === H)) return;
    W = w; H = h;
    renderer.setPixelRatio(DPR); renderer.setSize(W, H, false);
    cam.aspect = W / H; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    place(W, H);
  }
  addEventListener('resize', fit);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let t = 0, last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (sec.hidden) { last = 0; return; }
    fit();
    if (now - last < 1000 / 30 - 2) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0; last = now;
    if (!reduce) t += dt;
    if (performance.now() - lastKey > 400) rate *= Math.exp(-dt * 2.5);
    U.uT.value = t;
    if (!reduce) U.uPhase.value += dt * (3.4 + 0.7 * Math.sin(t * 0.37) + Math.min(rate, 10) * 0.14 + sendBoost * 9);
    tick(dt, t);
    renderer.render(scene, cam);
  }
  requestAnimationFrame(frame);
})();
