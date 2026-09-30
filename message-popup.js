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

  // SEND's sound ("UI Beep 4"), embedded like the splash sound so it
  // also plays when the page is opened as a file; uses the page's shared AudioContext
  // (decoded the first time the popup opens: SEND_SOUND sits at the end of this file)
  let sendBuf = null, sendDecoding = false;
  function loadSendSound() {
    if (sendDecoding || typeof _actx === 'undefined' || typeof SEND_SOUND === 'undefined') return;
    sendDecoding = true;
    const bin = atob(SEND_SOUND), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    _actx.decodeAudioData(arr.buffer, buf => { sendBuf = buf; }, () => {});
  }

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
    // the sound goes off as the ball launches up out of the sphere, not on the click
    const whoosh = () => { if (sendBuf && typeof playSound === 'function') playSound(sendBuf); };
    const shown = new Promise(res => (holo ? holo.send(res, whoosh) : (whoosh(), setTimeout(res, 900))));
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
  window.__msgPopup = { opened() { loadSendSound(); if (!sec.querySelector('.lv-done').hidden) resetAll(); } };
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
    send(done, onLaunch) {
      // the words on screen gather, left to right; words already fading keep fading
      const all = [];
      words.filter(w => w.state === 'on').sort((a, b) => a.idx - b.idx)
        .forEach(w => w.letters.forEach(L => { if (!L.dying) all.push({ L, from: L.m.getWorldPosition(new THREE.Vector3()), s0: L.m.scale.clone() }); }));
      all.forEach((e, k) => {
        e.delay = all.length > 1 ? (k / (all.length - 1)) * 0.32 : 0;
        e.mote = glow([0.72, 0.9, 1.0], 0.06, 0); sphere.add(e.mote);
      });
      if (holo.anim) holo.anim.all.forEach(e => e.mote && sphere.remove(e.mote));
      holo.anim = { t0: clock, all, done, onLaunch, hist: [] };
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
        if (!A.launched) { A.launched = true; if (A.onLaunch) A.onLaunch(); }
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
    // phones: the same leaders with short runs, the labels tucked closer (Message A)
    const compact = matchMedia('(max-width: 800px)').matches;
    const runs = compact ? [10, 10, 10] : RUN, gap = compact ? 8 : 10, lift = compact ? 7 : 9;
    ros.forEach((el, i) => {
      v3.set(Math.cos(ANG[i]) * SR * 1.02, Math.sin(ANG[i]) * SR * 1.02, 0).project(cam);
      const x = (v3.x * 0.5 + 0.5) * W, y = (-v3.y * 0.5 + 0.5) * H;
      const side = x < W / 2 ? -1 : 1, up = y < H / 2 ? -1 : 1;
      const ex = x + side * 20, ey = y + up * 16;
      const lx = runs[i] ? ex + side * runs[i] : side < 0 ? Math.min(ex - 18, 140) : Math.max(ex + 18, W - 140);
      d += `M${x.toFixed(1)} ${y.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)} L${lx.toFixed(1)} ${ey.toFixed(1)} `;
      if (el.querySelector('input')) hits += `<path class="hit" data-i="${i}" d="M${x.toFixed(1)} ${y.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)} L${lx.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="transparent" stroke-width="16"/>`;
      dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" fill="rgba(3,8,16,0.9)" stroke="rgba(150,200,245,0.45)" stroke-width="0.8"/>`;
      el.className = 'ro ' + (side < 0 ? 'left' : 'right') + (el.querySelector('input') ? ' editable' : '');
      el.style.top = (ey - lift) + 'px';
      if (side < 0) { el.style.right = (W - lx + gap) + 'px'; el.style.left = 'auto'; }
      else { el.style.left = (lx + gap) + 'px'; el.style.right = 'auto'; }
      el.style.maxWidth = (side < 0 ? lx - gap : W - lx - gap) + 'px';
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
    const w = cv.clientWidth, h = cv.clientHeight;   // the canvas, not the hero: on phones it's shorter
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

// SEND's sound as base64 (47 KB mp3)
var SEND_SOUND = '//vQZAAABpthyxVh4AJxD6hSpKAAZcYpPfm8AAHJxSa3HqAAAJW6SMP4/kY51eBgMebnFKcaAgyGMxAEQvAkQEjEPE3E3HrHrJ2Ts0y4GgaBoGgdCGIYoEPQ9D0PQ9Xq9Xs6sVisVisVjI8eP379+/fv73pSjxWKx5Epe8N+/vvFLw36vZ4+/mlNfFKUo/ve97v37948ePHjx48eP379+/fv37948ePHjx48eP379+/fv37948ePHjx48eP379/e97v3jx48ePHjx4zv379+/fv7xHjx48ePKa97v38ceBj/8PAP+ABh4eHh4AAAAABh4eHh4AAAAAIEgQhCEIQsjAwJEwuGzdQXBQCwGgoKCgoYju7u7v//y7p//uiIif7u7u7///+/wiJ///////8Iif//7mJUli4Nw/FxQUREREr5d3+0T//////hP93/93RERERNEr///////hBc97hESv//+EFBQUFBDNAABEEKzESKTdSjAwDAqDcRGkIcWslnwYqmIDRh08ZiEmU94GOTGz4SeUrzCQNrwlRuojIzeAkmGvHF5d5gKH9JpOR7eKfaK+zlMOl7/2rCLco1BT+v61mGnel+t99SiduyiLOlbhl/ZVGpcumj/8mWgI28ssWtRU2STNlUNQ190A7fOL/+8jRpTl3uddFrI8RoTDnauuTE9cvvUhIbTkcZZhypEiJYeSfrJ915VYvS2PVeUtamefJ/1qSyc1csf647iqoOm6lOkeeTs3fu5XzjMddaNQ1KYy7N9/mlUMO/r4jr/lnPpMZimlcsjEYgTP909Tlv7lTLHUxlvHHWsub/9Yf///////93D+Fjfaft2CYv2tKKT///////+f9yYJidupAGFibZZL5Q+DFfoAABK5HAPjAwBAAAiGtjSSrq+yaqJC+ThUrelRGIK5kbghCwSgvmojFDxDiwWT+32mmf0Ms6f9/z/yD8jb/Zk/z/I7uYLCm/90Yz+FwaaPRgIQmEQY//9f/RvyMnMP/af//z////mZIy//7nTGJzyf5EhoQAAzBShABtmxIFjoCX9YQDgJoCaQVEA9pMlagoAMWmmtQDLbkuqzrpiAEECKJtJivG2sw527La2//70mQdABiXf893b0AAf2/Zmue0ACLd/0PtaffB7D8mfPE2cbFLhzesK9p/aLGV3+f39R9JxT1bnc7jk3se/z+/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';
