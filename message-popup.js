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
    ['RESPECT',      /\b(respect\w*|admir\w*|honou?r\w*|legend\w*|goat|salute|inspir\w*|role model|huge fan|big fan|fan of|idol|hats? off|bow(ing)? down|look(ing)? up to|icon\w*|visionar\w*|pioneer\w*|mentor|true artist|real one|the best|you'?re the best|king|queen|boss|chef'?s kiss)\b|🫡|👑/giu, 3, +1],
    ['WOW',          /\b(wo+w+|who+a+|insane|crazy|unreal|mind ?blow\w*|mind[- ]?bending|incredible|omg|oh my god|no way|jaw|speechless|breathtaking|out of this world|next level|wild|holy (shit|crap|moly)|damn+|dang|sheesh|bro what|how did you|how is this|i can'?t even|unbelievable|surreal|phenomenal|blew me away)\b|🤯|😮|😲|😱|😳/giu, 3, +1],
    ['IMPRESSED',    /\b(impress\w*|amazing|brilliant|beautiful\w*|stunning|gorgeous|great|good(?! (morning|evening|afternoon|night|day|luck))|great (work|job|stuff)|well done|masterpiece|masterful|fire|talent\w*|skill\w*|details?|detailed|attention to detail|craft\w*|craftsmanship|effort|dedication|the time (you )?put|time put into|hours? (of|into)|polish\w*|clean|smooth|sleek|slick|elegant|crisp|refined|thoughtful|intricate|meticulous|precis\w*|flawless|perfect\w*|quality|artistry|artistic|creativ\w*|genius|vision|taste|tasteful|aesthetic\w*|stylish|sick|dope|epic|cool|sublime|exquisite|immaculate|top ?notch|world ?class|professional|solid|fantastic|fabulous|excellent|outstanding|remarkable|exceptional|superb|magnificent|splendid|wonderful|nailed it|killing it|killed it|slaps|goes hard|so good|really good|very good)\b|🔥|👏|💯|✨|🎯|🙌|👌/giu, 2.5, +1],
    ['LOVE',         /\b(love[ds]?|loving|adore\w*|obsessed|in love|fell in love|crush|xoxo|my favou?rite|favou?rite)\b|❤️?|😍|🥰|💙|💜|💖|💕|💗|😘|🫶|<3/giu, 2, +1],
    ['GRATEFUL',     /\b(thanks?|thank you|thank u|thx|ty|tysm|grateful|gratitude|appreciat\w*|means a lot|meant a lot|so kind|kind of you|lucky to)\b|🙏/giu, 3, +1],
    ['COLLAB',       /\b(collab\w*|work together|working together|team up|partner\w*|project|hire|hiring|commission\w*|opportunit\w*|budget|client|brand|proposal|freelance|gig|contract\w*|rates?|pricing|quote|availab\w*|portfolio|campaign|sponsor\w*|let'?s (talk|chat|connect)|get in touch|reach out|interested in|business)\b|🤝/giu, 3, 0],
    ['EXCITED',      /\b(excited|exciting|hyped?|can'?t wait|let'?s go+|lfg|pumped|stoked|thrilled|ecstatic|buzzing|eager|so ready|yay+|woo+(hoo+)?|ye+s+)\b|!{2,}|🎉|🚀|⚡/giu, 2.5, +1],
    ['PLAYFUL',      /\b(lo+l+|lmao+|lmfao+|rofl|ha(ha)+h?|ja(ja)+|je(je)+|k{4,}|hehe+|heh|jk|kidding|joking|silly|cheeky|teehee|xd|i'?m dead|dying)\b|😂|🤣|😅|😜|😆|😝|😹|😏/giu, 2, +1],
    ['HAPPY',        /\b(happy|happier|happiest|glad|joy\w*|cheerful|delighted|blessed|smil(e|es|ing)|feeling (good|great|amazing)|good (day|mood|vibes)|great day|awesome|nice|cute|sweet|wholesome|uplifting|made my day|brightened|peaceful|vibes|vibing|good stuff)\b|😊|😁|😀|😃|☺️?|🥳|🌞|🌈|:D/giu, 2.4, +1],
    ['FRIENDLY',     /\b(hi+|hey+|hello|yo|sup|hiya|howdy|greetings|cheers|good (morning|evening|afternoon)|how are you|how'?s it going|hope you'?re (well|good|doing well)|nice to meet you|take care|best wishes|regards|friend|buddy|bro|mate|see (you|ya)|catch you|talk soon)\b|🙂|👋|:\)/giu, 1, +1],
    ['CURIOUS',      /\b(how|what|when|why|which|where|wonder\w*|curious|question|could you|can you|would you|explain|process|tell me|teach|tips?|advice|learn|tutorial|behind the scenes|what tools|what software|how long)\b|\?/giu, 1.2, 0],
    // negative
    ['SAD',          /\b(sad|sadly|upset|hurt\w*|lonely|miss(ing|ed)? you|miss\b|crying|cried|tears|heartbroken|down|depress\w*|left on read|grief|griev\w*|sorrow|unhappy|gloomy|why (aren'?t|don'?t|won'?t|didn'?t|haven'?t) you)\b|😢|😭|💔|☹️?|🙁|😞|😔|🥺|:\(/giu, 3.2, -1],
    ['FRUSTRATED',   /\b(angry|anger|annoy\w*|mad|furious|pissed|frustrat\w*|ridiculous|wtf|seriously\?|unacceptable|rude|hate|ignor\w*|no reply|no response|fed up|sick of|tired of|over it|irritat\w*|outrag\w*|disgust\w*|terrible|awful|worst|useless|trash|garbage|scam)\b|😡|🤬|😤|🙄|💢/giu, 3.2, -1],
    ['DISAPPOINTED', /\b(disappoint\w*|meh|let ?down|expected more|underwhelm\w*|mid|could be better|not (that |very |really )?(good|great|impressed|amazing)|bland|boring|mediocre|lacking|missed the mark|falls? (flat|short)|not for me)\b|😕|😒|😐|🫤/giu, 3, -1],
    ['CONFUSED',     /\b(confus\w*|don'?t (get|understand)|lost|unclear|huh|wait what|what do you mean|makes no sense|doesn'?t make sense|not sure what)\b|\?{2,}|🤔|😵|🤨/giu, 3.4, 0],
  ];
  // KEYBOARD SMASH: most of the message is mashed keys ("frhjgiohgeoh"). A
  // word reads as mashed when many of its letter pairs are rare in English,
  // it stacks five consonants, runs along a keyboard row ("asdf", "hjkl"),
  // or holds one key down. Only used when nothing else reads in the message.
  const COMMON = new Set(('th he in er an re on at en nd ti es or te of ed is it al ar st to nt ng se ha as ou io le ve co me de hi ri ro ic ne ea ra ce li ch ll be ma si om ur ca el ta la ns di fo ho pe ec pr no ct us ac ot il tr ly nc et ut ss so rs un lo wa ge ie wh ee wi em ad ol rt po we na ul ni ts mo ow pa im mi ai sh ir su id os iv ia am fi ci vi pl ig tu ev ld ry mp fe bl ab gh ty op wo sa ay ex ke fr oo av ag if ap gr od bo sp rd do uc bu ei ov by rm ep tt oc fa ef cu rn sc gi da yo cr cl du ga qu ue ff ba ey ls va um pp ua up lu go ht ru ug ds lt pi rc rr eg au ck ew mu br bi pt ak pu ui rg ib tl ny ki rk ys ob mm fu ph og ms ye ud mb ip ub oi rl gu dr hr cc tw ft wn nu af hu nn eo vo rv nf xp gn sm fl iz ok nl my gl aw ju oa eq sy sl ps jo lf nv je nk kn gs dy hy ze ks xt bs ik dd cy rp sk xi oe oy ws lv dl rf eu dg wr xa yi nm eb rb tm xc eh tc gy ja hn yp za gg ym sw bj lm cs ii ix xe oh lk ah ka ko ku zi zo az oz ae').split(' '));
  const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const rowRun = w => { for (let i = 0; i + 4 <= w.length; i++){ const q = w.slice(i, i + 4);
    if (ROWS.some(r => r.includes(q) || r.includes([...q].reverse().join('')))) return true; } return false; };
  // short words count too ("huvytic vd typi ojoj"): a two-letter word is mashed unless it's
  // a real one, a three- or four-letter word when half its letter pairs are rare
  const SHORT = new Set(('a i am an as at be by do go he hi if in is it me my no of oh ok on or so to up us we yo ya ye im id ur uh um ah aw eh hm mm ty ig gg tv pc ai ux ui').split(' '));
  function mashed(w) {
    if (w.length === 1) return false;
    if (w.length === 2) return !SHORT.has(w);
    if (/(.)\1{3,}/.test(w) || rowRun(w) || /[^aeiouy]{5,}/.test(w)) return true;
    let rare = 0;
    for (let i = 0; i + 1 < w.length; i++) if (!COMMON.has(w.slice(i, i + 2))) rare++;
    return rare / (w.length - 1) >= (w.length < 5 ? 0.5 : 0.3);
  }
  function smashed(text) {
    const words = text.toLowerCase().match(/[a-z]+/g) || [];
    const letters = words.reduce((n, w) => n + w.length, 0);
    if (letters < 6) return false;
    return words.filter(mashed).reduce((n, w) => n + w.length, 0) / letters >= 0.6;
  }
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
    if ((!ranked.length || ranked[0][1] < 2) && smashed(t)) return { main: 'KEYBOARD SMASH', sub: 'did a cat walk on your keyboard?' };
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
    'KEYBOARD SMASH': '255,170,215',
  };
  // the readout decodes into its new word, like a HUD settling
  const vibeEl = $('ro-vibe'), vibeSub = $('ro-vibe-sub');
  let vibeNow = '—', vibeTimer = 0, decodeRAF = 0;
  function showVibe({ main: v, sub }) {
    vibeSub.textContent = sub;
    vibeSub.classList.toggle('tight', v === 'KEYBOARD SMASH');   // its note set tight, as wide as the word
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
    // SEND's click: the same sound as the yap popup's Close (index.html's _bufBack)
    if (typeof playSound === 'function' && typeof _bufBack !== 'undefined') playSound(_bufBack);
    typingDots(false);
    [name, why, msg].filter(Boolean).forEach(el => el.disabled = true);
    setState('TRANSMITTING');
    // the real send runs alongside the animation; DELIVERED waits for both
    const post = fetch('https://formspree.io/f/mlgpavdr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ name: name.value.trim() || 'anonymous', message: msg.value.trim(), vibe: vibeNow }),
    }).then(r => { if (!r.ok) throw new Error('send failed: ' + r.status); });
    const shown = new Promise(res => (holo ? holo.send(res, () => {}) : setTimeout(res, 900)));
    Promise.all([post, shown]).then(() => {
      setState('DELIVERED');
      // the sphere stays; the transcript and the send row give way to the reply
      showDone(true);
      // the trophy for it (index.html's msgTrophy, once per visit)
      if (typeof window.msgTrophy === 'function') window.msgTrophy();
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

  // The soft glow sprites' falloff, written as exact pixels (white, alpha
  // 1 → 0.6 → 0.14 → 0 at r = 0, 0.2, 0.5, 1). It used to be a canvas radial
  // gradient, which iPhone Safari dithers; the faint, noisy pixels showed as
  // dark specks in the sphere's core once stretched over it.
  const glowTex = (() => {
    const N = 128, d = new Uint8Array(N * N * 4);
    const stops = [[0, 1], [0.2, 0.6], [0.5, 0.14], [1, 0]];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const r = Math.min(1, Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / (N / 2));
      let a = 0;
      for (let k = 1; k < stops.length; k++) if (r <= stops[k][0]) {
        const [r0, a0] = stops[k - 1], [r1, a1] = stops[k];
        a = a0 + (a1 - a0) * (r - r0) / (r1 - r0); break;
      }
      const i = (y * N + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(a * 255);
    }
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    return t;
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

// SEND's sound as base64 (37 KB mp3)
// The old SEND sound ("UI Sound 73"), no longer played (SEND now uses the
// yap Close sound); kept so it can come back.
var SEND_SOUND = '//vUZAAABhF1QgUZ4AJkxUfAoaAAYJINLfmKAAHFqSJjErAAiIIEIiIs8mTJ2YAAAnyViFgpwVYh5ls96Uo8ePKUpe9379+/j7z8UePHjx4zq9Xoeh6Hs6QEIACwB+GGXNnjw38eJSlKUpSj9+/j3u/fv3jx48ePFYnFAh5bxbxNxcy5s8isQ9Rq9/Hve96Up/////SlHkR+/fv37+8NPmgoIKfNM01Gzv2R48ePKUpS973ve970pT/+96UgMCcORDHBvNA0FAyPHjx5Ej3ve973vSlKUpSlN5ve97/F74eKxWKx5qAiIiIiBAMDAwN3OAANwbh+Lnu7uiIif6JX6CgoDcBcAcAGAuC89yxQUSSxcXFz0RERERHd3d3dxQUMAAAADw8PDwwAAAAADw/8wwAAAAADw8PH//8EB4e+ABn/gAB4ef+Bn/4eHu8xM1LoQ4ARD2ZEMCEYildiOEoeADUiMNVEu1tiqFzAOSb5EtxnBASlBRWAIDBs0XyoBwyQGDDgNEQ9QDIgw98Gg4DhEjIWaO4iwGMFASDB9BIybH0Px4gA7SMJ8ujnksNMrkyGok2PopChguMbKYmAv2I+HYQcitExU9bm7Lc4VhmAxYBhAAgwvHlmQNQADjJOMgZMBhCg4LLm5OCAQqBECbPld6ZkZJLWkggcJ83KIj8BBkQ4mFlUnyAECEFBshq4ZupJ7D0BKePh3TQXTosigMcHQmBPHjc+aJrQMzpQFzGKKrqQoNmiO/+sn///7pE4IKFVSkVKWgtJ///6hTgoRNUjwC3QCGCAAG5mX/KReApCYLIhScBNSiQWARmrG0+chhqJiJue6p5pSh0BSh70Q2Ghx2wO0WnWXF58byZHaY2s6Jdf/38bNykonZr/+v0GbK/JzXXx//+hP9XMn4v/WVPILvd///67YY0LcWd/////+g4hV5doYxABUQAhNzReRCg3ZUxDCEZorty3XV6re1piMjgB05mVRW1DkbbI/7AjAR4w8BDiVf7JGnuQ7cAEIMVA//vUZB+AeHhwS39nYAJuTIil4UgAHXnJN+1ht8GsJyOgN8ngkZCAoCgUCMAAwMFA4VVqSySxGgcaBCYjNcpDjigxkPLgKULTXg2F6oJj0RiUalM9S2r1HOU9uxT0krlEfgiPwSzJbIhFgMbOq06QyOR0UvsU9SvUu1bl3LHvO8w3res9Y01NO2rFukz1vOpjrGtjlqkp6CboEQUTAcHSFlsidV7mzNTT4LLigMHASeDfwiRzk/Yt52Oyajk0nnJ+ell+dnp2XUuVNVpqtqrMRGauU9Jnh2kn2cs9ZLas017LHKtvDPDPDPDC/en38ldzZB63aSAABrZvqc6lDGOkqMwI/OFA441AvWBNyAnzQ0RM00FHDQ0pnyug7oE0ISBiQqTAnHdNA0K5s1BrqqQN2SZ0qaExF2RMrmaCCr/9Zoau9fvr7/6+r2pk2rRNU8zL7upaSDf1t+n/9X/Us3Z3/P+H4rL3ZhSAgIaADGaBIgbUlAg3gQBTRY2Bm5uwIOkGXRkgBOUSHoaFny5jMlypFNNYsjAaWeZ8C1h3IfdiA4IguCojEpVKZqUyqUxqMxp/nZa0wELiHMgOqYSpViuU/LlQzDURhqUzNzG5dubwp42/AJeBv1pegortaiuGXtYc+CGHuIzt2IchuSQ+5FPHKGarQHDUTjlDQR2NRKMz1WXS2Xby7zt63YjZfQFIea7Wxyx7jlljljlZrUuVarNTMSiLMiA5uG8Mom5ivUr4Z586zs6LpInw2AHQLTq6Ls62/vQQatX/+tHWcGHKaGgf74QtQ1jsInkReAoGBnuwIyYFGJmpVuuM/MTDy2NXfrUTZJGhaBBgXtGQLqBRTPoLNz1l+rTkPIOfRqpKODLkOKjpI//danf//8zL7f6uszJpFmNk6KRcE8DHFczWBHf/o+gOI/4JHQTE63jMzZhAABOAlEyvY4wMwQEVGA0OOmzTJjPEDBIx6c5CrgAEEYdBoRBWWrWVzAzyrjMxkDAI1sXc2H4EgeKQuEQuD4TCnleZ//vUZCOACFB2TfVrIAByybkUocAAH+HbRfmtAAH9p+Z/FzAArLUlsp9CpQdaeeo8ktNskrfSG5XDkvnJ+itS2ml1WtduU85TxSQN8BB0uFJOKoMw1lTKnReqDYhBscicQlENxSH4Yp4xL6Scn7FuctUVHRUVHenp2encr1m1ZtTsuflOYkBTOg6RSGRSGjkMii0Ov05KewYCbrqSTd3plT7zFPST9in1jlvW9b//1nr8Pw5flrInXYjJJupYt3r+OW6mPcO8/HW8MO2fx1vDvccsdZ4d5jljcu4W7Np0oGxy53k248N9BUaQAHshKJDQ3opDpq6k0SdIaPQtJeDvh2R0GRmfWcMGlw4pZmQMh5OGZsQMgYsQbYLAgVj8wWkg6zeh9jdMM7FxkXPpMgtcc0nzdaD3v/1Jf/9ex0hia/qoMnTL6SmsrWoeySKzMCduU1E2/8rd/VSWoyi5U2F1FpGNEKMl9vcQEkHThshAsFNjPIAhpggMXh2gIBmaEGbQgJI+w9HDBI4CMWRWqOk1KksnJCgpnBg0saXSwZMJcrWEUwgPL4vLFDFHEsofeWJq0GAkNys4sRbuYACuhrsvsyzCUT05GLtuXrDMzjbqv87T8PxYcCKuPDGFmNwJLG1ft1GstieOmhMHQRF69Slv1pFLI32VWYRTSqblE7aksRp9WcrVq5jv8sc5fBhROv5YW6aZlEtUqQe1Tfv+a//196x9vPv9wxwr08A9hmYqxLc1XpZmlw1lc7rf8/Pmsv////////ziH/////////////+u7/fPx/H4CRAZAoiYxMDEBADAxULAEAzmzpCmO5BUHXd0S4Y4pJAvGQswuEVMWFCjULRkm6CSUyTLokA5pEZmILjImjl4L0j7Na2PrSDu3VUUVegA2IkCLhhZTmTLWWthoGRgmitfTZH+r3a/X1trv0Fn69ugO/FZGw3Tm4+CPDEtxH////SqERJEZliGiGcBhMltlSoGlJBi2Yo8JPDHREsFQxoRAeDtRGA6oAXT//vUZBOAB5CDU35mQAJ7afoPxswAHcnJR/2tAAHItGX7sqABPVsLXS7gN0w30PxBsZnBHY6AxiAFIX+C4Md5wyEBws8KUIwdwFROCzhHhAhYxmlD7BSxQwyLJAXMQlNGlceycJkvEUKxMqJoixozorQLBFBsE2ZGJByBkWMiiMyPsrIrH46LmQXImQBEwUQwdhA6SRkiooi4a+6IzxWdaZkMwzmhFBQwb4WRtnkVJZfBzEENPy4UCcNHLiBSJw0Jym7olAghiPZeWgdpMykiGjMl46eX+pZubqb////TKRGizCHGRVR////rUoXgnyYxASNWipu0eQGwO632KgYihehZZoxoZGrkADSJSLhANCRYSgLKAwUCEQX5AsAtToatF+UCobij6lqjmBYgO8/RGaGMdM6Q8y38sOeZSBSPMpk1jYTmy1RiMmmguGkGKJFKKev/7K/rUcZS1HxAyT/qP+3U+yaSqsyHT31sLzey6KhCngDQhFGnaGPlKuMmYMuONOOMSKMO0ByUKhTFDFN0eC2bEET1hHkQeNtOCPIcOTBZ80twHEb9vZdKZqVyiRy6laVAa8DCihoFGVMpyDZBLrMqr3p61nOy6zGS8xpDhKBW3ApQGS5WCX2uxf7QWIsyjcce9vYlN3KCB8J59ZNdvX5dS0Fec7jljvlMkJAtrmt/rf/zu9azs34zpfJbVyIFl0pqV72WOWs+T1nKnipd9itHZyq5fzLLeHcdbw7qtl3/q4///hvX/hrf1IYa5Z7hr9//6//1vn/WtVa7szuW9dx///////Ck4YDTQIAAAAAOMqZxnJ3YB4z1jqgOXaUhjukotc3EGF2TmEwUw+NKi0XOLMaYWLFjBsPxDD8SxkKwBELobCKBpNQsZdrZ5p6Xvm2C5IV2Vp7M03/9DP/9Xnqil2N0f+QHEDf1ISjf/v21v////bVmJnqymtLrqwE2REICjkZB6ZMePMDQqxAuPJGJjJagyxwKHxpGW7BhYUFrDJhg4QyRIoUOGVbk3eKO//vUZBqAB8ByT21rAAJ1rRl+rDQAHqoRT/maAAH7I6f3HzAA8/rWYaqyZs8Cx6Nw5FLkfikLqx6CcL2D13L9LQXcJ2VTMokTkjoDahQt1losacdmrOnRfyFv1GZJB8Ow9M1JPGq9abltNQ0luXSmYp52mmblPFoZUWMYGPvzDUzMWLVXWd7sRlEso5S6UrfmpE4ApIGsyqnk0WmYhFIehm5blsNNVLKsmjNBbs02+dy3zLf93rHLv/Vw/e9d3czs5Z35TQRZaKYMUl1XvNb5rv5a/8v5/df/f/v/rLvNb5Wr2H1a7ebYUAU5AAAAAABnClA7BlUXh933qLgqjAAQ6+da5UsZkmE3CuEsGwlQmqKTGKbmbqSGpbmpSKYJEkXzyZHFk5iMyknUu2TQ+H00ENqrLKiSZbrU/X//zhcOpv//foDCHnd6OrquXB4pvr9T///9Tf62///qUcf/WpDTNkRERMy6m2k3bfW5AAjOCWVKBdNWQSCDhzbIA0a10bcwAiDhhowt9CfDniuDCC2Qg0EQMPcHsL+AVDgPBANAheD2RUdhDxBAUKKSD0rkcgJ/DiAvoGJCTFOAwK4DQDwsLOlICJ4DPixSAzBopA0NyBi5SBE8dKQ90q5XNSDk/L5PjNESNiHEWRKimWgbpJlcc8vkTPEPJ8mB1CUA/UZIckghsarHKGULymrrNEKBcNCDjnkyyZ0mSaJ4zLxBlXVZZukWUxO59A3TdBBk03EZA3IGWMqP8iYFQJOt/0NN5ogg////2pTApmqRTNv///+kboSiAEBttrnWDAMBgKBAAAkjxSRit0RDktZpSLkb8FDT/IWJ6BXoLFAwFDIYjgOMNhwE8ylhawSJ0yMSk6ZMXF0LMGQNSo5VRRRQGypBE3KAatKZfLpGIl5Lyye42EaNA437fuYiHM2utD9RVbzIbqj61D9vMn6meo7iH/BD4jf/RXOJv8tYZIF0gVLQ9YxSBCkxp05yEst6Nam9cHViIQMWLUAINK0HBNJtRYVGZ8rM//vUZBeAB6Js0P9nIAJ3ibm+7MAAHk2zQe1h+Unjpuf9l6n5rUu21GXzljtSuzTR2MRZ2nxagXuGKTT6OwcEhNbcZcqnSlyaKZBotAZ5jLY0fYxL5bKq965ckUtuT1Lct2avLVXC1LY9K4AlLkReZtT8zTXLc7cv71+GNyNRrKrLeb7jcz5cz5lczpZqJxkZEB1jF32eupTUNJaq1LNbdmmu8rXbVLctSnCnYa/CmLuJDM2fWipqtirqsxxTCtHaSXRKmpbk9S1LVLnS1LV3ValsWbFr//fO67v869LegNQOa1V7hd1WwbVAGpnlzUgAAD6kdccs6gydZpmDmBKCriI6FwEFj2UUjR3fKoZMAwh74c0ggwhZJRJo2MEUeYssuk8OI3HaTpfQFzjkmx8jA34WwuTiCd2HQbGqLUv5utq/r//qUkT5q9X/19A6ZPV//1v9TIrKQqjWr//W/V1IKmkStndlmaCIWCcYEG+NhRyDkpwYBtVhrDxloICKkxABIUgQqBJgwFDMIZGrHDSwzVEuPkcrpasgjepZnbhy/G7eMYd4gCmcUnAaLVHiCQJ91pM/rS05Xc3SSu1KKGelkrlbd41AjtySdl9yxUxz1zOefTbdF1LWtPvIpyzPyW/LJm/hjT5T9JjLoTu3UnKTGnqam9a3qrcymZhCcBlLDqSLKhL29oKezc7lv4UPwI96+1/SNHfZgeDuma08LKvYUohxuD0GMrM3dvHRpzmWzKCVLn4qFGly5ptKYh2eN8ZngTX+oU5PSFIVDZV5NgOE8HJKncJWXuWiOwN7wRUVSSXLAQkgZfgvQDijFFC4BeF/2mGAAW3foHBoT5SqURsPGOIXpUKB88t9XtAzjV6pWL6Zm8fwjdaCVMJeG2BBYGBPJ1beVrt95KR3+h5SVU448tzjz2V/nOceRAMiHEw2fPOqaW/1NSv/6t/9iHFEiZmJQ1QG9IMJUC7IgJpWQII07EZ0NELU4nNYEwNlDD16sKjk+xOco6tSXwzHZC+2dmav//vUZBoAB6Nr0Xs8fwJ2CBnfZZGYHp2nPe0nHoHssea5lKsIxmgszVPDrYmtQPG2ux2Qv9Pzt6jsF0RYlTswQGCggEs8XaMg9AIcFphEyG/deaFMA8azGQZHAAAhcCAOUAMwEAVMAwBJop4EKQ8sJfUYdRsjFXCXNFSKk/lGdKStBpGhbi4jQaWg7g0tBpGzqDSNLM+a3FTMgQ4GMm2HUbOq/f1vOvredfeafHhwKx4nv71gWh0XSicJ5XBuuw0YpGKVWtyuYVapnqeZnsVXMwqRWo5ze0jZ1jeN1xGUqGsoCi7zqrb1kVDOgHmABjK2KB46KZoJDgjomCmCr0giBZqiWjtorqkEKL6hQoa3VLDsSbCFBNUjsT6fe3VmYNhBqiaRLDqvxrg6qVUB39+G69hCBMgKtxlyuT5PoonDpgSBxmWy6l1//+3//6i/YxS+t3xH//v+n+NO8i05V3Mq0YiOUCBWEYgWYWSOEDUmjIGwMlHAoNNDRUxYB6nRQZSQlEfaK+kfWDbVrF+ldx74Mdpuc7aqPq40ay1ZlcNPXKWvRR4I7BMBQErbBJu14GYGkGqLGPBF9QwiCQCI5hhYOCGeRiAgbVgaEgEDkZVWrDQ+zqPu7EotERYAyMNFxKWaKnhMmiTYWshcRIajANE4Pg22hbQsGomH//K24deROQWjYZnubD5/h+f73r7v3NTOojZGQCTVYvh3VLharvzg71uHaeHaSXU8ZsRqvGqeGaKGqOGb0SisSf6rS1GRF3lLsZVfpeZZY83vV8QhYZf7neZi6QlXACCfdFg61T5SOe420AsmjKbRpmgXhYNHl6lw9eBuPI8oAnG2zxtJoZqiryrveWLW9c1jDDlozy60UVC1vAOiMMXT/iZLnCjBBFhT3MaZf7trp/24jl3//+5QLpGNX/6r/2echUn/5hk7d+nSc+v3Uek5nsz1SmSN67lGWABZgcLuEBoWTtPMWOAwQ24U5CE5oo55RLxo77BUkzlORDRhMPUjmRVmkB0skkUe//vUZBqAB7VtTftMzyByienvZWWcHwXRMezp+YnUmig9rDCwm4Zwh7buypr1NLoy/rjKXG2ED1Mt6xdQVqKOTjA4DEVkrESFX6+0bh2kl1PS4jyZi4xdxpt6HqZximXk55ALA6D9Ra5DCfnhr8zuVjbd666V2O8uq7rure71a3HYpATiA0wFoMih+AaSJV49uZwmvlOcqp4ajD12n0p5LOwDFYKCoBkkCQUlh2kltimYs0lfrYmvRBPp+3Jikkl70v7GqGQUGEpzpM5bUlqwG//Xf/n///v91eTU09JfSES3V4NoK0vGXOZKs6AC8ATxrIMjM/Q1rAJUMEXsAmkIAoBDiS4NHSoYdWa5BbrPpALQpFZJTx3k6u/qq30QBFAsyGTZoU4fWnX3T5pqSzxDAPEhC1X3U/oQw1jPUrKzXyxzd9TDAdEb//0KRBJ////1LUc///VzP8yyxMSzkqAAGABCvA88YvZzWgmoOiMuEKAIPoghgaiFxEJsy0YaStqvozMSKo4vak9155iBNU8vch4WPsTcqda64JjlHvgdbyAMGhmbhYiChJ8W4OIrqsvi/1WI3qbctjNqzPJEvPEa2WfM+XsO9mpV2al1u7EoapZ2pZrRbVn+9qW/w5D8cg5/6aH6acs27/L2rOE9nLZxypEyl7y/qVqgLBX2d6Zd3cO3n+kUZhMSdaOLqYOYomTY1gXNiEapJrszjlW/escaRsar9U6vbEY3udo8bE1dTx8z3r//fe86xbOa4rWExRx8iGmSrZ61pbec0zr428ZwZW67c7beKgHn4FJBYhGDAw554EAzXEVtL4Dsm8pwCy5UiMrA2hRNKhsb7MtSLdbKkOT4kODz1ezbTOYmH9uLOzqdo9OgFEsfibGZk08GsPFw0hAUDVT1f+ZpP/WadrLv/1Jmd3d76WcLpkCo5Dv6X//mW9P/4pVReYiWMiADgBlEtMcKpPG9BmcamKIA0QGDEKI0wkmGGHPtPTUjpcq5Pl0l3P1D7uwxDTuNya+9MHKz//vUZB0AB/x0yvNbH8JyKBn/ZGLwGlmNKYzh9kKDLGU5l68QJFDM0wrousFQEXSpUxYGiAwtB2HgoBHgIBDDxtyAEGEhy+X+ldLLJV2d3chmyIwEri+sMqbLLlXmXxTk1epaepKL0zyllOUqsRmrGoaizOrKYLOTCRwxeDAysNCTOkunXYK9jlPNMyG7GaSmn6sZikSoqPGrLaCNWojTXYZsRqemXJiDWWIocjDQ4FBypmnR2HbcRpeapvq/vf4Yfnv7derJioHBgDqSU2Fy1qrV1lW1a0tJgWzTUsxzY8irHGPvz55hgKDIrc3ux7YATdoJqqyjLDB1Rj4mkqpu7KWa6iIUUBXegkKgj/MxT/tPIrWuqVsOZJawxw///958/X3bTl5XuZ440u5iXvFDtBn27N2ZBp2XVBBrzRWW0lWtlhjj3IcMiwr3atI6f3er//+piQwF/zehf/98BzuqYAhABVhQgL2nraZ7BN6begvYlwKjpHCxxkBmEQVQnVLOts2aw0lrbcXAZFbgmmgF3ZIxKLoTTMZOqkHSlK8YrAyTgHi/TtxaZmYYgxlIYlTI3k51pmZDVZSFtENxBoJOBrvo0lvm2IUN7uDWzFuC9gPYr6NKyxHzNIro56klEiAIimJUdOX0ZlZX6uo+tqubWU+IrE+9rfWq1xjea61FpidyrX23G9oc1fb2jbzWuH0XCuVxPgcxJrsL7dYucb3m7/xJsx4XNvJeLK3mMyfEKKhQ6iggAEFNhMMgxlzjUTnYvNXW4GEfKnEfluTld7Mu8l60GU3v1/4b5hnrKkXZKL0q0pWAWR0RoSRP1sMErSaJ8QIX4yjJZVc5be6ZtotGuBDq098RNembuOsmXwk59HpbHcx/8pSO49fH/fU/yxUPJrKYGTlO59ndRFwamRaI4bNJKtHgdDuLBAiAecbcfXEX36sNuEpFgvFAfDnkpcyqQHZ3iFVQARmS0OwBEAiSYMEblGAgBcMHBWVNgWijKECZxuS4mJLGenMTA4zpQmMY//vURBgABYdhSvtPW+Cs7Cl/aeiMFjWLIay8/kLCsaQxp6/JTSzIdHlr24/mZPMahQpRnCXspmbL6LRwOU4TzHhZ+8k1B8PegQgIj0W36az7LUjyr0CckmsUIEk4ubHv4bMMoxJJPQNTpKHcfDEOAPisnWidqEoesSCaWXxff/9xEG7jWopxw0lQPq1R/u9rf+WwpbXRcotqDY1OAeXNTv+j+GhEovFtEoygBjMuEIYuoFJJgxBmzacgyJBQkGnAwzMrlCALZmtMGWGRSs0Dbuz9OVOKJLrpDoVa43DXcJvQlibCYjwSay4REQzF3YZRMCTpyM/zJFpGZVs6A7qOo+df/W/zpMDk0aRKGjrHKQIwndajiDlEggCMcTRQtYKQYAWLFrVY3GY8DzZ/n/60+2QCxZcYcgy1ASmJj+2655WCh78wzSq0xQqYANZrjf//JEUbbvJsAAJAC8hTeBtTTCYiPHLhee1DLqslxVRdCUfWm3aZ1DUYh5u0MyOHKCBbHOxN/km3wqXrjgLxCxiESu5G/UOoMmmGzkKgFB5ELTwPRXp2fy3D8VTaGBnlrZUuM/zPV+3ykfUyyw11h3qDTOM1aqvZYdaLtVHlFD0qHGGl7M22JaUucWBpUJgJBkbnOa3V+roeRAMFRseVBFceFRc5zLvt9Y8N1/+1DrmCYSS6rr2x217XQAPCQwF0wK+BDsQAWtOJI4lD9qlcqq3eMbeWieVkLWXkilHGpbBETlmOrszGUaLE9NUrXltIDEBzkv/S4SkGBossd2nvWZeu3qa5nGpQ5TdwMbkzXb8v5hX7S4Une/jvI1rt9dak3vVPrd5N4aobmrAbabfRnUWmKbbHzNtIAnnhtFAHS1NiP7bw2piXBmWXDZWG1U5Le3/1898xKp53d8zXcf02vVgdWJ4J/UWH7b/eoFvMklQIHoS0f8FpR5UObsxOnkMcgC9GXdhFHbsNLllPTM9jVJEasWp6mUZhlEjuVjBuVUtW67Bt0LRCqV6nthpWJoClyxoV//vURCYABPNZSWsGh4CbyykdYet+FDlBI6w9k8JwsaP1l59gUf2VTzbOPDqRhVStyLP9Cp+1Lp/7/8mkQUGJUTo0COBk8naklrQTTJ+HxCxoqXRWh760TcZEvlQcoiDKc/v+q6zhQRbSQSSLI4EnX//rP/7UfQxtNf/QAjUWUnz0gRyUokKmbW3c7K5yJ0Na9VdOKLg8m5XItv8ze+bPi9HqnLklt4tO4hixCcrhoTqYAPD6HKCBLGSUvqIgK6dcr7I5EzAQF9cvYjK43pWLWxmvp5k+WuijVrb/r5cS3FYFhmylm8L8Vf1KaggXkAiIpY9kdz91tt2cNyaAfTUD73EC0QZmaudTf///k5/tqZ5ChRm2293QCFiYTfIsjLDA4uAPPXu7kOLsijpcnbmnqgGVxlpUNU1llB/ohOnsdECWySQ4H+pn3cU4Tot4XcFcxU8TkIaqI4npYyTGUzRJH7XGlgxQHI1XGDG3Nu2tZ76E9tAy9d0k3BgWlg31isvi6VkyUDQOKSi//AiSzO7NP1DTPH4lDyjrTrb07P032oKOB02/MVUcFzEg2SHE/Kf8cKfqIl2WaKwAERgEhDIxSUArUAyjU4pRuvEqnJe/1N9PSa7BcXfaggOilVe1nVwylSjuMqppikedaShqvmXwe5dJFiIVvWjlxjUlNpWYc76VKgbDEBonRauc0vSnvvDpwkeTdntqLWmoN70/j0rWO4p8nDPNu29f13//bFYENmhCzKOe2NZz//1d0AseZmjdDwidl2/9VGv/9jOcNG2+HUqlLbIAEKygQDH+iJhiGlSFSVdb3O4TlLT5T8RjsBsEmqmUBOtVswHX/DnX0XpF6WX0kcbZ9Yei8KhlsRIpM1+pSDEWn3jkSs4Q2/rKI5DDXVsrhqW8v5+tY/5zg7ZtbFnw6HKNO8Mi2NH9E2H4BuVj1dczP+sk55rQeUKVuLuOJ4s847mh0NKYfaVmh6DI/F13/+7///uDGVrRHaFdYiEBX7IiAETFXgFQ2bqXZS6Q//vURFgABNJix+sLF7Caqgk/ZY/0Et09Haw9GsJfKCM1hi9QKXy3G3T7xsZTNKmiknFIBiM7HYapLOXcKZusrpscNV44278amufinhFadgKJMTeCihinp5h8IafxbBEtFKs/f5hjzHLvHYrOY39Z6+e1+u782suhZXFUJDi6FmzWn7PztM2ApIz9Og5qx/bbv4pnGq+DRFDXjx2WLNiV6x4mcXd6j3+UJJ1yR3ZANWAhVEpKAVH5hdYu/bl9iAbVjCf1jnuHq7S5BTSCzLpqH30l+o3JJ0RgGEwjeE1nRiEbT+wDLXeC4GvRdTUEDFJufbyPq7KoGpOD1F/eM1q11v5/z7T0jXw/96Yx6YpWmd4w35ZWMAdFic8xaYtff/+KqEqOCsGx+tX/VcXU8jTwFV7JtCyQAIFG/rf/WLnK9qAoUUwoACqQQ2EmyIFHAQ8ctvHfq0uH5UO7eWssXSfOzauV5PL56gq2PdF1V2xGKO1H9tAeF6Y/D0WiskS9X6xQFFD07gtSONKUj5IAsirDpGtpnZm5Vy3QH99efma69DF3fFxC54rATG/bZ6+ncdTDbolnxHKwQ01EGN/qLdfNI2dD04q5YpLhpPoEV/QYZ9RYTCVamPQmmg1G/ADgMUuUQwjAdhD7OLxathnZqdxmbkfiLsL/ppytGcZDFqavOyuQNhRscR/oTNO+1oKDT6jk9UagrMZUrjdlr5DjydfFukoOmAJobkouVt/zEv+M4+0Yj7mJhk1cuWkkEsByB4zNy7jSenxzfTsbjSgRA2NTE85zzj7in/Jo4Q00ziyq8MsPpsucg/c929FQOh2S30SlWEqDsyfZ+ZRLQjkbbdICNgQ2t0x4NpmAyperVIJ5DZJsHyxQH//uI5i2WI9274uwdrDiz2EhxcxfMMd48LeIa4pxmaJouoUaHCWKQ0Qhx1NkbP/x95+bUmzSDJvH3XEb0vvMno8UcdOg/RLVhXibxu/+v9ZlbqZwhCieb3jX/+M7kxbe5ydvHjju0OzE1JrU//vURJQABQtrRMsLFtKQygjdYY8uE5V/J+wyE8KAMGS9h574oOCI79v+ffuvyoqyGzPEwWBflRcoi7gulHim+9+OFXnKtmrWjMpYO98BRmBactQ5y22TgElpzOEUkKkhbKgkFwQnsYgv973+8l8BgDQAEwsMfay87v+/dthxYwhMUWMXfffbbveFidN3BrNyHGfv/e96rftdjc+iYF9TUNMzFniTCUCKEEJwuFMn1ikVpm6Jq6ReRLpu5um1v//9TUCbJ8HwfP//+IBU2ZGRolAB3mnchMRBKMJtSql5X53C1hv9Xs4s/VuVTUoq1YvI91auMAL2rSurHIbkRkUZ+KBkPaBLEpu+73vvCLHAmggDO4TYx97vnN48t6UiUxqlKX3u94cefcTWmFdIYIuqZoKn138O////1PG14+M5//vDOcZwuCgQhWRFW/uIqjXsG2dy1jx7v4cOkTH/sZ+YYYZHAHg7Jnn///iCWsit/pYXiRVZvDFpgKNca1S4ZXOas2vr56dihTShhwI5FJRLH7huH6enjb7qVq3tFUDd+J36drsqrOi1mM35Xblc1F5ydjLsui2FbZKDCsMxUUyucAtTGmRCTJAafq8Wkw82zfr3ZewdVqNzZHkSkSJSmsYpSmKUxe7+HHZ0KELJuLehbG/f3vfeLe894eYMRj1FivYMV6xK5rNFCYtda/pWbWq1tb7jY9Nf41cw1hr+YYavZQ3C6+FikpLlqLt+agjznmyBAMBIU7P+sNBQCUCNVZ4cbkSQanwp4TJdzU/3bOKxqxdQGx8lko6Zj8dq2M1K7w6QUSoaa1ZptPCNGi09/ZZSPxDboPOWKnn0jgnEkCgXAkEYqEV59kbOPfqvt/8iOmoh53/9BUNjxsg8Qan33R1mjw8SPMRB9AubK5d/60FL25Gg+AWzHNBf5z9XiyytbmwLCgOB4wLKgdOTEpJh3GuJWBgg21AHdFutNd1/ZK1tuszMVLlNPZPrJ8dU1NTU09TS9mLDn6eSnmZmhktDHLlz//vUZMqABnZgyGtPx7BuabkPPweyWdmBJafp9YmqqGMw8qeYudO7bW2ds4aw/kYjbKzAiQwEZAoZkeAia63/+HGcLsXQxNibO3/t2HISQMpSNMYQMaBDsRjsFjvNk3Ekilc5pst6nL+WAvBrRlEwL0jM9y8x879s68D+v+Zc11/b11r/73b5ze+7TAHgGBozHduTNGbS3KtOikATKDbUxAHEw0hinohqd1en/t7+0Lfg118ws4kzfW7DJH/STcyuYS6v3N5K4wIycHyQZVw60+dQMxlXCwCMJP7//sx2/+lFOdf/pnOYOh4SC2t7X4Z10DEBZE6yywgWUEZxvrCEh/T5DIemugSgSXCAAEKdPa5DKKN12I3s6GzM2bNXHd2DKB0HCbs3ZkUSiT6v67r8vy9nEdDPiIkS5yDQiOMIiKqjgCozuFtvCkLoCeBnUMQPIoegKCoAeDjRZPBjlOk+0an4ff92HwfZ3m+b9m7T3Lghtk4iIGKBYoIg4zMN7jPRUDAg0GFAiNAKVqpWAs9eN/IQ7rksNXKsC6oFCC9MGNefp5oPkbPDgXdnOJmRoG4gVRGRyKXR/MTNTWPRwcL7fx3DuznPB3GYdQ0+tsSkhRGWmHkDGcwc5tu+XricqwFUeJzIcrrZevXu71rFrX2rN7ztkrPnG9/1rXXzX0xCTEoQV4sAgABOICDAjhOiiHJJU3uvV+ubpNSKzQnGqnQUiM4AsixPA+PQYi02XfiTAFkAezolOtO5e1rLgsVik8jn5+b5+/9T2u5QGgCCgmdOP/ie5IBZVzz//tSBUNHDgjBoR2yPOnV3ypRQficSD6OOFWkQFTsefu+U5Zxxgca/HYCVa/qAZu4DRpx0qW3TOQ4CciANDwxg4FEFhFhFbE5GAO3DdBD92OOA7EMTcZitiZUrSLZeoUowxRqz6mN4nILA4iBgqlLdJI9jYX7et9YNpFA2tzcRu/BkFUMtxc9g1p2oel1rKNQ81psUYoXdayw5rzhSJ/QsGajo86bNAsiu//vUZP0CB+hvxGM7fkKBSkicNYi2HamvDw1l+UoGKCJod6KorjWmvMucaBoVG5E/T/RqVRaQSmVUEcoKmVPE4Dgis7671AznyDxWVrvXpSv3E43L79y5T188PIjZM/p4ana4edUvjVYkGvvpX/7feusfWd334GfT/N//n6m1t/fx2eMkhpAHogSgVeoEDHh76fRY/2qAAArgQgAIA48eEx9f/nOLDbnpKD9wg2u2BwoG01V0BPBVNcaidnM07lEuyzWYk9aQYEHMoTosIEIYqDVqAd2jyvsQo2t/fxfDtdBLwOMmrZxP/8zMOIweNz/H8Sx4fCMIAhh+EYxzW0+ImXmIckWGW1Og5IYmQe/rU3uAdoL33dYZCSTcqqKsJBWCmCElRpdS/2XrZQ5A2UGDkLBaHdMtCehmkWhoq1l7GwuAmCg6taCjlrUVAvyMOQCAmkCw0PyqGmBJjJal+W9a81qQzsWctc16ENbflKAS1D0OSyzM07ttxZ6mM4Uodh/LOLK2D0E6lkPNfmPw/FKs3T8zgx5Yfp5RKKTk24bDwAZXEkzr3aKGJ2US3tJUpoGkcfLOjxJwswJsSUuxCnzmioTdiaDBlxmVvhwh2DtQqs+3q1ikTUTWpc4trUA9SdIyY/x6zLZ2TN9/6pjOtfp9OVzTWc6+r3x8watiuXLC30e+0lIKvLYXBUVvfGNY1m8C5zAAJKScAOABptO6/ycygYTnD1mqbPYEiPqL3f+FALtGa47EiGBXqlYWX2W0SWVbUkS9Z38WeLg5wb4HcSp2EoaYbc3xpX+GqJrO9f0b3r8NWuYed20tKuhFVHAcOt/yHIETFDpxRhcctOrNqlCqXECBwvC6d3Hd8F3ueGXYF6QkmYisCke0nUyp4XVljlMqBgF4C0RjwSPSw01SSGXQ83JhSqgGAHTGEjYRHgqHeRCRGI4/z4xmHY/XgOqyCzNPLMu5KHTC4UV4Lcd+oVFn/mcI5HK0rjcxBbZ2W40kAQUvI7HXXjORWkh6RT9Smv3K//vUZPSAB9dzxON4fPJ96YicJeWqHJnTE21iF8nup6Jkt5awu6Ru7jUk7q1aym4zSTvP/uMpsTH6/uXcbM7P3VinJYsZ9IpFZmUZS+bt5UEosXJRSYzc3TR6WSeOKUFnC7DTJZXl8s+3Xz5e3fqbumxFiHCuAXiMN1K11ep1spJ1PRqZK7+6NvMiaPj8M+ThhTXVqZAwNEWwA5gABxFL67m2SA+ARNGTxFpRGftzO/FnutjJfvMxzDayD5hVXbPIkle4oYqn0PeKbph4PBIoY7cM3xrF76hVxv1+rzs7KkCXqx7SuMVlvJBy7a3q7V7InPun+f2Dw4YPINiu9tc2pTiSoaZyKLAewkFLDneU3qE11rcA1QA1EAFpGqPM253Jb8ySXQ6RFYXwWwXNPq9jP5HJ04ZokVlzO+iTG470sneNxV24DXnQybk+0rOFSISKAX9lUNyvGkpMp+fj8Bt1fmKzny5+noe+U0WGV+nz5nvWUUpSqKtJx6P/3V5hVq7r61Yocbjy633LnP7ZlNJFoNbWKxejp38e+Xy6lsZU1m9ftd5O0uchjMbRqBULtxaAqkqj2Fihx7Ww/ualIBAxMuiVN/1+RCt/b/dHKhv+BAQ0AarWADGwMR4sP2tiB0+XiDpwThfAvAVZzn/zCAzBKSw1mcGWVHIccRQBhHA1UiKNgwyXJVEGiOieZNgdKNWb8rr42KT79SCu3ITYpa0qizhSOW3sNcn85U78vwgaMQOqMSWxmFTtakpOYxGznT2qStbxg188O/qpzHuMMzC7oJdWMReF15RWrV90lyeose9y+zjnOxmnWsGBjdNc/uXNXe/lhll1SkAg5VL+39v+v//6OW//DCjAAtMgJIXMtWO2ssccsGSUVLRV4HKJBImtP4/D+xORRqajcnbo5FJOVMWkRe9yVNHdNc7kXorEW7RBvoFo26IYv1bu0uHbepXNX4B3VwzwmZBW5jdo9d5qper550wohy78YZw/GFHbvyitlllvVSVRKlva5vv4a/W8//vURPWABd50REn5FfK2rpiaPwLMFyXTDyxgV8LmOmHljJb45u1eYIv6MyWmt3sv73G3l/Mfyy7TZwdGJPVsQw5cXymr+pS71jLDl5CrXY51Z9X2stGUCEu36/gzoQ50a/9CimACG6AZA/KtIPy/P+NdT5xvXsZEhcHud6BHVnXkhuHok7c+3RlkmljWIKYpHu34+0W06tLWjruO1LlbZNLnwQ41pHN4Tmp6jjkfcBhsIsS+jzxl+Gv+tnUxqVPm6ProGEEUxOouxBxfmMrt6wtZcs3c5ujlkgww5v8v1+sLvaHr8NCsX5rHDn/3+575j/bX0231jUnu2H8Z3D/dVtRF3r2WHnVFR+lXrtuml0IoGAv/7pV0EHdGv/Qo9gABkCjWnrou6+tjHfiPNZRK201la0Y5LpJKGf0tDKGWL0FGqEO7nBa6iJU81DhP4vBw3mduYWpmmiolSSPImZIz9cGGR4+CphMzuPpIwcYxutcY1EunydkrUo9Y12oDsGmrIE8sTMOLM2RLKGV4qo9MX+fvVfqbR2p5phu3Gs8b/O/TWdtSGKh/t47h3izLwsKWdQa2tB9fuuc/lPtnL0fRzXc8jJ7cxG0YhGIIIRV94AgA1aeOBN2Mq3InD8jv4U0up2Qw/Av0UahTPorXlC6FLBE9LFrr/sqlA43BjYAHkQ1HHG4riApGgqltAhqjybot6xNbRJyJwnxmRJJbVntq+/FzrFNWP8W8cdgwgtCHAugP7A1eXMCDX2tDXoDOrdVx8/X+8MWXI8I8fDGy1iTfON73rx4ScRkeJAgQL4WF4Ok8lmLBtaDrWcR8HZZzVs6qG7nVx9bXbYl5uT4ZL4qubiUSBANY1nmfuOjDs3bty6SxCISm1rHKkfZ3INiFPnkXKjUfgoHOZxLo7EIafAdinlNTzShU611NIouxMdZ/YIetrbpqwF/dRYGH0VSxwh4pZmFMzRYtoaZLu5btCn9NxMQV2KAayoFtBGjgWEeyyX3PfdMRo7WrMUiX+NV39YxR//vURPEI1YNsQsMPVfC5LZhFYeu+l+HNBAw9W0rLuaDI96r5hZW6HeG2piaSmY8CI2IYaDIxx2QgYlWyaHPiLfFI0Rlb5vr7+MXPZVeioZQ1+yWU5qbj0sYEkWDVO681HNOR7aXnoPB4jWALMZSmju96UXBytmp5qSuenznVXmgN1mZ0gAVF8L2u7uTAUx/LbBGEcPcnaFFsEnHGebGNd+W4lxuLTP3OHC3acN0uJYBRwmlyZnKOszwk4rd08DTm3kMK5TgqAzW9VKKZ45b7y3pXMF84PY829fO/jeMv36lerz93Rui3fz0pInEMZGO7IYY8WqLmR1nNoUL5tP9X+PrMORX0KtWbQzfZuqKagSR4bdl6ebMf91PQgHiPSgAQGAIAPzXOgMq2ZbG40+xbdOR3bFiU14ceXGHYEia+y4cMu69zVmSKin4/S9ICpLNwkS+Qgao2eurUEEVMG9U7MbH7QPQCsGlExW3auWZShNb6JAK8igKu7UbdlYJzq8Xgu1hrLdSJxmCI20ERNDe3H+kVWxNfV3nq7V1yQ6X3OU8vt4YU+XL9bUN0TXoxGH95RXaaZ1ewv0UWBpl/yKczr1qurjo19VMs6WMW78/h3Hn7+paobXf8vq0i9807bMFLdWbt5exzYdP1/Eyl/PH/P0kA6LxgAQAy5SnNh1HfKNXkeOlmxmsaI9bVVDSivF2YlYomhQHFKpRXDtFpGgNWh9u7glMBUiw9OZHp6QctsFNjTlLucmGoXXtXaapNKPpXQGPDhUjk8qrW29iv3IlL8cMrGdJLX0gOQCQg6z8TDt56sbpamd7edulhuC5TKKtPdpMK/4fzT4WWKW56esvvGamU9evX52HgahZ8PWLlupvLlPKMrW8KbsoktzWOe88Mu4eTeeJfTak3lzGvi0aNY4zRz7erE1UXc/x3HfX1zfTgHRmsDyNiBmU3ZZp8MtVCOkMFgl3Cn2cMJwV7GI4AjNb18dByEEezE6OwJEYaxEL+GpIoolIspFoPwb4TCkJU//vURPEIBrVzv8sYXfLPTnf1Pwu+VD1xBSfhHkJ1riEk/B/InEIDVMDQ81hsVC4dH6gC9nm8eM6YKdljM7gqeZ48y73KOQwwEmTNaitNj3c1U7hXyt/Lo1QPAvbWOevn8YpIKRBHCMQEgxSoT2lLnhbe2Dn/iC8Yk7R6fx8+8f1g6ZJpb2GmiLhhAJq4v5TO9M9f5YFiJDcVsHvKHOl5bzPF5Cm2BoP43DdhmEcKlHaaLVRPPEYLmoFAmz+LkIsWYsReyVtIsp4KyNXLW/Z0kmBZ1DAvEkqo4jjWY4sbeFmpLZqNvhITMaAF+xOi1O6/Vjn9/l29ORBwGbVMd69dVH0GxhcdOE4y5Wz0VjirXV3PF4cbR1EVTBIYxl/V/rzThFLafDnKdNUQLsshlyYasUsPQFA6tRdx/7VqhzVkXRTxJ5OrDFEnflUoUaaTVYI2SCa8F5RmQOCm4AlI4Imui15gC+AsAKIWEZEuYy0UQWVYeoxJJAunCWhZjEWFRBqbxJEbHqoXXboL+juZzZwCYQoR1jVz7MZkZIt4zurza8bjgzVjzZ3Xds0leIpHp6MyvFIeZd/Bf2tJPndMWZn+ayltePHeFbF6vg7lwrHHHv8dzyD+PmL19up7/fMl5/t8NPl2eyML2I2PPVh8QMyZJs9jRl0wsguQalFLqEzqUGC1MChUxKQKhwuj2eGkb4nzYFoJsmEweKldnEBqKIsYk85NR5hHSbgQBYywArQ3gZqGK5jZmliNIwjPCTEiUGGqZsPwviyyYZsVjVe6cnFHnSBuCrItVzYVrM8QySBEtB1teSaAX4TPSFj4vWWNBYYpBze2lFIaLtcWdX3fcOHJjUSjn2slLKZGar14tXbYeSoTjx/rOs4CMF2vXyBArOfnU5+rzz64DS33Nrmn6P3Su8w6j3yvKJYoAl/c3SZxRsjPc43bvpTqYRzcvpI2ziedF/FHnNichdmkexiCAFuzlQC/M2WIAl6eCsC7JQ/sgdvcTpM90kQJFq1QI+lJKp2g//vUROwN1h5ovgsPNtDBzPfBPeO+VsGO+Aw8fsKwtV8BhgvYYDCd5xixl5vV5tqCVQliOKLaFnSlTVsx6efTYhbixrGtbzW31TG2GGaKUNhW7JWN5Vz31uDnyzUzAmnxWOZ6Fwo+LbUjPdzxDiRvvbzEifnxL2/UzVgYg45YcRkIlUmVDLdhHeM07+VXvNRuAWsU+5T2NTkm1TQ7ARfYmFZmttElCTr7QJErjYakNZugwaMl7W5SJ74Oh16CZi4nP5aYnDUanML9SI08UbELDb2Py+3NSh+J3KluQjf3vtp1y4TlJuatvOEEm0cvPXPEIlPMH9o+tPzXfRF5sOT0qFagBUSVFlYv2ex+vvUqyXApHVF1qUP/KbvPu787VTD7UBjaNdFq6ns8wIBc/7JR8EwdrIqgMugFdqxRJub1vLKo4TYL9TO5ioHJ5Y8DTZyIyWBa9KpUxdh7vV4ZTuAwSsEAUFLKUyC3jTWaMBWDdZD5fTDC9QAvMcVrpbRnbhLxh5iBb91TJSEI4RinW9rXZj5IwOcrUWdDF1603StEsUiIdXO65rrS7pa731zTK2/zk0ndl4wLaEQAv6EcSIk/d6dlwd3DIPILFQXTTSHBhwUKOgd/sShwQPf3K5pJrpzfE46SCYo3mfakAgG3IDl6kSDXiQqtelCXebMB5YDcDrTLPMt1Je3RrIKEYZRMI0uKwUZxjqROkh5iYEGJi2Ut/Ll6J3pkEeqcaxHTTNLPsDdCHX0ftuDxX01kjRY1Gh35DA8t0hXLLdiijP65jc1XikM5qnVHH4AhjHB2kebcKnVAKUoPi2xlxcvo+WJkwvAfrF7xLaM9z0+dumpbmEoye6oKziZoNr//z008dj/4TWqGzfz/UVX6Tl3db5GRu0ySy/onVqe4EifV97FavOwCFhXiXStF2I5GlYZVDrW0tVrMAV9BEEwG7sjdh7YeYOY4AXLGm1uI5KTRTVXCQgMKlCFHCKtlLAHv7PRx0nncRQJD13ChZwa9HJI07s5TWaSe//vUROYABaFfvbMsR6C07Ge5PyuqGJ2M7gy8vsMdsd2Fl6PYgfcaV+9zEYTnEJsiUOe1l3LHzbSvfQk4ha+uqZ1W27RrS4N5HMBdj8fmeIqf67W4k2Mx516A2uM71k3ClIITh5H0+U53MxpHjHhwPfWKmUVbqIgqpOyvVpThjpwILD9PANSg4ytI1TfcisfHbDTl2Vc6kBy2Vhgy343D7s0hb7KAbxcBiwoCq1w3aaNKpBAdG9yAAwhx4EHYNLUFQSu4XqDNF7LUMFYGGu2kHIYdkMTeRaYihQyUqCFRJSw8ed6eevGtKalzd870+w0K+AWCZUp4eMeV5eNJSDBePmZJpw3S8tGLVvSntLAO4ym8n75SnkAXjivW1qz0ntjwrQY00ZThTEvjPYbIZ0FlinCh+59UtSdiQhrjalq2O+otoHmlj6mBhQjDevSHqgMEAkgA8whBDqhWvIuZmz+E7pg5UbMTxhh5f3gsMRaTHfaXtxT3S1Zo5FLBaiidBf4W89sfXOw0kOh7FAAVtXCZo+0aic/Fqztyqflrjreoqvc888Nd5hUIc244XtEAasG0hDjZ339cqE8tBJVVrurZv3nc+JAaOB5Ckshr3qw/zsQxs2s4BYsth+jQbl2qMnr++5bc+6ybcWOpaor4ioj9h5+V6QB8zYwuwpPUkLaXxaCwNEY9FSwzAbGwYWXdZyikLSPQAymngCMiI7sh5X9aetB84AX61wlCnQ68660/IOYVakfkKAouIv2lgWiucpu4W8cfr1rk7PXoDno2xpYC3MXbFhyDKprB5OIhkOwek2fP17YPUIpYmOsRxoDQoNN6sPz6k015umqajwCEymWVlxMOgTGx/r5ua2z/Sj7op2P/r7X/88eyr2vpuzAqJCGKz07cgKgm3e+vutTQM8DjKGwLI5Zcl+qdVB4msxKTRCHQKgrAqWQPa0gdqLyYG7SpGHs/SpBDig1oTeGqUDHRsfqw0gzQNQRkU4fIFNLuDO8jMjiyyXrPbdNO5m5ibxnh//vURNkA5ShivUn4XUCnDFeBJwuqlwWs7Aw8u0MMsZ1A/D6oOODSbzLDtvfpSGuWmIIah7bpmxm3zBtetexoo7i6t7YWMjE8f1rF1mf+PtsVmNNriW9jVskkNshNtIOYOsfas7k6LHWla2uFHW+Ild/du+IslPuwE0WYd9xYp7m0/aoWe4L6Gx/ChLV3q7LC/dR+7LWog8tGsZ75VLF8k9iYNgsBRVbiXtLWqAOKfBKYNNqUEpnIvH8EdVY1OjOJp8vjsZl0rpKKxYmYRjhZs7xs0rxLkJIIJ3UgeKUNWzfnTVnCGNaHnsjSRqhojWtie26xpJnxI1wPhD0kRoCiy7fvsYrVFsz2kN65VWT1NkGi6ixrsZwoa4FtVFazfEbWf7U3/R7Gvu297+76/mx858GsYL7Q0lCQOuo1AD25kkKCx/2ZTFmrNehzFQ0rYkyKm4Z1lHZcqKQGWw1ibOWAGGKO8M9l7Y28pUf6Auk0V843D9SRUM+/1xNx9QBh1GyByWnnrVcRxVvmYRK1h0WSzXvfuu1XPOyVGBOfWy338wi86OkgSCNAXJ7Kmp+Gtbbof3kg2c+41fr//t+18VzDzGZVPvuHQ6EF0q1f0ADngttbZY6dfUOdNeQ10JgxKYZM5zZlLu4yyHlDGuQNZ6ytgzbvDSzUOyWRMlZ1Dj0tq+sixqSjucxJGJQyP6nMq1/sFyexj2vvlsOmiQdJAYDI4TSbTLhRa3PH8yFpNDyKJY2Z2Pby9hTQaj8NFEEQwe2Sy981262K0y7EASL50WSSE2xP1F8x1XDrSuFHVzUfRsd+vNT+/vwWhEAAqG2FhhJVb8pf2XNOlMxTVNVaWpyG85yhirxMRpfs14YqvDKqR2TNrA4awj8paEgxiHnYek+jgsGlG/zemAgl8LylVJTGvJoVOwe88NqYKDgES5kBbbOa6rlx2cj0UpNRK/uh1O0sYkrh+zIxQfp6H8jF2YUmYUJnvRYXKpIYQUngItKzX1u7+u8uCjRaEHuW1wdo4ait//vUROMEZI9gPRGYXaCbLHeBMwuoGpmM5szh+otItZyg/L6oZYL3e76cbR4bc+hS9Mh/7Z96gJ5tomC8Rt3+PBnleMEnv85YlFp+r7x871JajY6Ttr+22uo977Rzvo/BCADV1osLvVm1kwDBJuzteZLLqp7p+Czt5kMGmpIJKTwBGG+VhIhBoxqcadcZLAwb7ERTK1DVGSoCSDGIUW7lRshkw6El9Gc2IxL4yuWOMxJIWkLdgFisqhh66STU9ugaFGN4/L5F9ly64ObQAMHg+jr122IpEXJGkPCCyiQyvIKqj1x9wIcGK2lzURsWQU6ZAZhXmE5obz/GIiCkkiuaKg83D/GL6tjabKlcEKQxU5i7+JafDxjxv5141rt99Z/1S2Gp9Pm16RFdnP/9/XWsf99fngNAEGVWpPbNwvZ88+Wrh+5FiyFyKOB1QnBw/JKsUXlDjsGMhTuJmbKXgc20v4XPGGnjiS4rjQN9Pq7duLPlzNgCZi0Kh6fsYMpsVcu2LWeqW9H90N1/QixcR/MqGUX7NNjurhblmpe59JLHovc/m/3jlYzxoncmVvy7GFvvWs01ftnLU0XMHpmzC8JIhiJDTzxEkzBIEwy7LuqE3qz5hN+7zvcmI+Gq0IIQCCAB09VpTWXqIgUDD6r6HsTCMmoB8qXSagRhtZGHgXlsvvUUsUeLeNSjL8wC4yHBC5O9rKV6xnNdGWVqmEMUjxQEkqSIfPD6LmMTnd63+uZXM+fL61UVO5bvcsy7FR8QxypsbOIBQhCUdax/fxGWD8BcHjSlxvBHJxkxz2Q2HWi6ptSUghPtU8gxXcw76h1mxOn9zTVXII8diW97jSF/nJ0dfFgDwfwBSmzV3T6MJBORY3HAPEcYeuchgHjuyyji3LDX2tpmNykDkMBBEh0uDphdhdkZdiNIfpfsJLzF1GgtKnGzY8qxOHH7p3DImlzvfrKBLVNexuRqdxxr35TYnYTAjwmMmijJ6ea7Vv1/1qklMzSw6riZlLe933uWWX87VlGD//vUROcOFUdiuoGYVeCl7GdpJwu4FwGM5kZlNcLdM9zhh6/QvuzKaN22BK6zpLuNzn42qrYt5BzKIQtkKxpNrkFhnPfuTssgVd79wajCYr9WnO8UVfV//DPNIwm+AAAAXLLM2X1Lcey3VcqvrH8KsvmpTD0sp4McixrD9RqL5zGDU4YnonVVvQpArEV3Hdx2GxsKYwysFQDNkwo08cssXMJYyduShrLQkCACjq51JmWymrjS9hRsvbP5tVEdC2MInKGubLa+rdla8uC3ANtcsSHyf2/hxJ77VbsxTmVKfawp1+mdZr8fJnbzsnIKSAIUElsS1hESMQrH6qv+3W6rvmXNai+KhnFWqULs+k0WVP/Nqn4lAHKqVjOc+9PnNxEiAaZYC9Gfs1n0VYOcv5fLRGyJDN9QPC8iekW8kD33gEIQkEDj0LYg1hgSdTS0HIdBhRArOwTAL5L4cCXQUsuXtNENIT8VQHhfuG4xpl8IxrT720++3cMblTKuKjNfiFNS968g5ZZrvLq/RznfDbM0zjyW97PmxyOtFXZEyQVvfxIn83+8yWv40CFlTkyY8esJgW25WRa6+/e2IS9bGv7WiU8u//jWPmT/f+YMbWVRUHgOIAAdUiUrKpigr8km3xlVWrvGy7smjrexeWQ01uZoe6sNYp6SnXiyNotSrOiIIYwD4emBmT3oFd8fu1NIsZc7b1P5J4btzsRvplNDEAArlTzDJq3J8Hdgf7Vi5rVY2ZXr+CfxbkZWAhz3E88Fiti64c3GqHIlCr/43WDWl5jwUyRJ6FauWstxTP8Z3m0W2a5gwcteZcnPHeb+sNbi8VzNWLv5pZRMnnMyMFCLaGZISZMjDBG/VEinWHCo+fnn2lWVvOGaenfbKUy2xZ7K4dZXCYTArLXHnPlXIjRWpqNmCI7Ufvy4vIk8YSwEAXgz91khY2aAraoDTCVWHWEjf4yaBpBKYIBoAjVOSWBo5TdmrCzaTGksRbddyya1PBclcIBWNNTHvR9Fhx22ErUpGXa///vURPYPdedjOQn5fcC6LXclYeX2FkmM5Ay9HoK7sdyA/LLiF+qXxau6ynU8OttMpxgDDbmT5puv3ljEnFIFjgkBuIr8sPKFAiEVvqZTs8Y8VwQdWWkek/cz+1hIWG/xejEIJenXj+TMeA2LOIW97c2RmZS9boYWo+0/tBLEBlNgvzU3qh2ZRvIgApWtOmkLTUqnDBIim6u0/nHeykry2h5NwE30OtsZKTE3Nl9+ejDjSfmruOGuWOfW5TvC0Clhcjh259ezXZqw0ZDoJ6B98m+36bcuCtg8CE4MyqAKHkLrt57YMpOra7j3FUrxZ7/D2ufuprOzto99KX+inK9vz9NnZm9bfmfs2Yar1tlRMPSq+Rq2Q5KaGWccNtJllOfInq5ArxRhiM48TtUk5FeWaSV2pRVZCuBlGMAsqScArk+lcP0pBBLFAqk2LQfCrE7QAMfRP3yzMtmEUR4GMIahhCkJRUV88VzlCo2TwprSvp3imjqEFybh2KvDnmu/uadtWU1RVIIka3PN//bNbSwEemTUaFGSAI4YbgoPGvbd/NrUaZ66ZWVRHC5yfTixYQY6VW1X1nfZ0MKTSQDorabPAAWqIOCFdici9OuKGvPLa35xCngrnMsO5WpumUol0lijW4zh8JgfCnzm7AwNWhr8olKRJrWISl93UUqTReBvQ+WQaFRMmG/tNYeujhNyRF3ygK9RhydMvmc5RNSq1ypXnqtmkq1Zmih7GGAcdg9NIKKty9bxuZVrtutVbSLNxhWe9Yf/71ldmqXTrMzzk8Xbten/sb7qz2lnNX6bPPdt2GeTl+vnKpXEIDkjy7w1//RGHk8YLVUWdPuKHayoIA92/I/GPVqjRuSZsS7HB5HyikFXMoe1p5qrxtCqzeUrldNXrccuLx2XtgLqxSbh/EQoDJHwbbNeUdLAGwDEDjpg6DhRoI0XFuVapem63JIxCIL6AUl8R0N/WAwQ4WbaxXVpnbi8gHKHULeackF5rPriR41NtlehqBIQxwNatJu3/ixH//vURPePpcFjOAMPFtC6TWcAYwW+Fl2M4Aw8W0LcsVwYnD6orSpkgsKxmE8g4vXXzDrJeu31qwUgYQczy0XLC/iJ1cXib3vOdpl8EjKAHZ/qY6VmKM/lDkRj8AHSwoPWhINm0DhJqp7UIhwkRIVgXPkimPViV6VQK6whQw2W1Ykn+lA4iJcEpOJrtMSHWUgMR3OBgwb7yWtEsZJm3zxp4q2UzTablqno4ZrYVb9y1hY+gs26leMhQrJZBDUN7pN0xq3hrh5C0tn6fznP/rVfrdWR5Agj9SSQMVPpytf74zDrFjwa/xkWnB8xpoF1cnNTIbEzN8WtCvNDe0pnW4kHUBcQLan1rWtqZix/mkYOdLKjNQB1L4gxX6aM5QNyJPHa72zjM07pqWynKYdC5ZksAxlI1iFOxAV2lArqGn7dNhQqAs4nA4i+ZetAQgARk+EyyYT7vk9kcdqX3oYYEvF43LRmKPTkQiVFuU/U7Xl9ryYrpsYjcQ0SoapURm19isV9qJHhKVjgiyw25Kxc23b5mrai7il0XCkPFWE7P1m3BrrO6WcYz+JV/mFIjT1Wf6xm1K7SW7vv/jd18oIORwwyUonDE7XaBoekDkAQAAK5yLv3FLs9lMW5e3lnf6ynbFLAVvsAxGHa0ss127Q9OtXVsbg16FwRIYCHAiIieSu3Caqz8cTIUkCVxk0OpaOKdSvIisQgggCIKcUYsKoR+bsSs1WO/dRMvZo8RtX3NUhLxLKRpVyncJn3Y3kJtM56riEHk+KymcfWNapWS6mYltJyJ5HjU1q9J8+eHsZQmwqyKTQJH68y5sgImCW/v+sycq/37ckfk0cGWfn8Omw7a9LtN3v//y7h/amLkfzlMammmOpFCrp2tWstLM6puUkSdQM6dgNpbEfEYWorgkoqS1i7I26LJF9BcQ0SAJxwXeQeGTl2XBFivC9j6QRAkRp30gKOhSDZBcCt0HROhvQG62NzsQsf3Cxf5dh6WtKkcEvzqVU3c6t7V7fKSFyqGGKyZ1O///vURPcPJblft4sPF7C+7Wb2YenYFq2q3gfhd0LcNZuA/B7xz9YRu1DcXNL1gQSoHAJqTFKSjkqWnbKxNk3PCqzRh86PrbHdV1/0zk9fzvJ151F8xHT5pnxweW2x89Vf+ljJkFico2Yje7KMxcQp96uq6rhTxC7lC+g4c8OrolOkiGGTOl0afRIcGgZKvuFwpd7+omgssghkHPT4ceF6kT7S2Rvs0gHLSMVcny1uHPwpWF5UdLF87WG5/KV1H1f5uRKhc0By2T4z967e1V5uekNOz5T8CtV/P8u6y/6+puuoHK4Bhp65FZrWuc5ny5sdJVGg2EaRCEAcmyIpMmG1u3Xcqnuppa6Umqsw4dOqyiIGmRt+TblB4aoBAA3I03gtG07cM01Hxus7Lqa5XvWJRMRi1jL2r4Y1bdl9ZdhBamooKCA2LQytAKGFJhGGLA6jrR111DTCLQGICjKrWs1lkSoJqhj85XUVZwDuV2UkvvTkbeOXTFftSTb/3ouelYIJgC4xqSrlCnfTWw+UjVCmRc5smiyOdvqsTeMsDnguyON3bOnStgK5wtnP1Zd0EMs1UhChgky2jk9c/J7D+KD2jOZeWmdzKRJmo1K/BRNXP9TmqvKp0y8AAA1caVFqOxNZ2Z5eNJV/WGdmX1WvWblmDL+Go1k70CU8CNSQWZxIYGWmieIXkK2dO3GGAKNrlcJFNTQxgFOIJl8gmqC45D+O9Ps3PsRPmdpL9rGGLdNMyv6P6RIlHiZTyMAxkbaoypv4sHECSKuUJb2A8IVi2LVJf8792trYGqisW0AoyCqFcsep6YpaE61dqc5JqMRYjKVebPYLuRli7p/vNHZgYdr1DB6gwjdLzq/ILAErsyfqLodwKILpV6asJCy6WL7vrLU1yL6EUTiUg7pDrAgbfEZPd8mR0jT00jWkwCW5ONuy53WRma6HwYcGFcJisIosIdv2IywGmZ4r9dzKKOKZ6gJvrOXL9yZypty+RO67TIJcUhfloUsj+qmeGdLbo5XaqVIJ//vURPOLJedjNqsvT6S47WbVZeL2Fl2M2gfhd0LnMdtZh7PQZHS3rXfxxOS5rh9NgSgSxBLsHwD5mdVclERK+guunvcLQFXMTfmiw7h3j4hbJb8S1kfyqf4tR+6+6hTrb9mhnkdAEAD+Wyl9YY5VtzNes6l6lprtNDEastBp6V64fyr9isqhmU1oefJsrqzl1rqQqELTC18OK4jsPNMeVpZaExts3XglkZmow8clf9IYdCRILi52p6rq/LOW8c70j53OxwFynhHQeRclL3lp6xtYu/YIrw3i2MqMjVtSNTG9Y0dKrP8ph+MbAnEc5+BG+qWnm806D9OSSIELPsJUBJkI3veZn8p5BXUm8srUmsu2WP9uPa/RHs72pXc5whH1CIAAAAJcikNO9ZpLvJFbpp2MXrfcqKtTXIRnQP5Yz7cuyyKYQYyCJu/EpiVIriFKwKl9yCXtpFGzMhoKfMLgpwnQdyvjUls89bJ2gBeTAIdjMbxuWoe7jX/3rjEGIzvmcpDHXCvZ5t23BrPBvSPc2EMiz4/+//8SSSKcXdvV+yYk7cn2cb3r5vl8mDlD8Fh9RQ7UZmjq/6WhgfT8HNLFiAZfSvZVgJGMjjvFNQ8AfqrzfS9hHr8zy5Kc8rPcH6jtVd0/WgHtDax1QPjK9Oi1RpSLMM6sKRAJGPF6mu21rsmV0swtcTCLQtPisAzcNSulgtxWul9FgwBlh7lTsx2+8NnvzFFuD/NR84srwBuLGe7yJq8WF4zdAjK5Zqg2GIau6+96yelp027XmAmzAbxfhvLeI8f+1sT6kez1ZBcWZhDSsRIqCd3d/5t6qS56/kQXhxDH/a/ssbT/ro33lgfRgYA2poIIn2OO+YnzsKeGZuqbiKW781WhTFsFtUMllfkt50qNYH8PtC974syNNxMQwiISnQ/DNnST5Jm2chdcEPprumvd+HThuKP8yFosfUGBeoGVXQ5TlyiUsslsunYzKs8OUeVPbpMWUsxZvL5iNTfLQ2fR0sYoxLLZifDr8dNr//vURPAKJWhftzsPR6CzTHbBYen0l72M1kfllwK/L9sZh6fQNt2+28GxeBubho+Rj+XdmO/22C3QZMTgdlURr59MgjXOWzcmXdURnm7m8PBYq57fz3ZTX4jn5m+sPDNCWQ9QgAvstxg+UYV+crTExWyywtyr9xamlM/TUn5RykgKepYy1VhTsv7GXQWHZMttFpyakQZctpCY3kVBQmHwU4kPwxWxlsEP81xiojQBhN/MVp/3mwwpKCV6g2g71hsjq0yC5I969mrqB5XsKR5O3k9bWZknrT4xjf+WVwhJEuyHPnMoGql6W1jGay5trZNYMlJwxRxZCjQtXm7/U90/CvXp3qZnduruHioMEiyOp5DP2AAANqWDeF4+iM8M+IKkNVSKLFMMzayGyjE+cwjyaW9ppsUKVNFQj9FmSGZ3k7LqGmWCsmIJqPsWCobeIVBULIDBl8Wun0w28lU+6q0mNu40Yv0e8wtOrl6JNFZcx6lnaOa5ndyvXPsVJ1sAoRGWbXI1WrWq2GFL+deehmTOG6k9ruGr+WPd44vHN08YdGPMyYM505Y/nMebqdFNaqNY4dTEvfmJjlOKyyzSZzMuhH8Ikqt++pUu8leem2fWHjY4sTSDjuE9qIAAAAWphIG2DHbKpGCn4serbvCy0QyfPlYhqdf605yvnrkqkNFPUm7m5G5ZaAvSPHg+LJz1HpEIB5qWpuI1Z/qsXfDKejMYd4u6yIE7BUX27u3cb2WWvr1sr298s3JdNTSz5t1N0NS7LdiBBjK7joyHU3SxRfNZgrdywcCcdD8kI6GYLawx+9buda2rKyH+qSBundtZdjicjDp0Wzns5qYmO/27rdqM235nLzqGirM/R4/HJUHZ2JpqQvCsSmqxS6+kDT8bl2Muu2ngX/Bijbixl9XhiMxSNauSp+9Ubl4uVJaB3HqEKIuCCmHDShQqQBv6a9zMCRQ8UBqZfsptxaWzczJmcMVLeHkSJQyKl+wF9iWePHUWu4OrQ1hvbRLo9onhub/GsRca//vURPcOJjBgNRH5ZeC3zGamPwy4FymO0gy8XQLGsZr0zDH4o4NGUmekU34ttwswvG3TLmsJ56aEqyDJDmbXJYlzBtrMkGDiG/jM6QV0aeLhyhMrKoELOKlt/OWTCfkNUzUelAivqxRFuNOb6YAwGACARUyQCxEMZhrY9PWFK00zjOQSlmGNaak0Y7uI8lc5jVctRtw5XQv+ju5QgAvN1IPgl2I6MNXSyMICy2D56rDtBrHbsN840JXzlDNNb3Zyztfc3PtmnqyMnjo0fouo1e7LV7eftUVnBUL15nZyD7ZJbaNg5JqA/APZUi9jp+NmbY1DtKwnb0Fu2GvrCkPvzO5LtUqgeTDGpug6neNiNBaF2/NUQy5FOzLiNvS6LU0CAAAAAkjomY4YqKd6OTLJNSaavOMJpVuVXkqkZOwzNRKE43Mw2R8nadbKwj2BAE5AG17OmkiudaZdVfg9Jp72slk1PbkMZjjpMiSSjBvAyVzaO1U3AU/zeFXOv/LFmWWrUKFBz7pyu5et/2+MYb4kIyJT/WY2dZ17736xXTDCOt82k8JzT63rX/3msLMO2MkiVSPtbL57uFJLrOf9XcXG+tb9cuL3WGNjdbv8bsxdaff/VYv8M5mCAAAFiEhmnzC4PmHncV7C3YpZKkS8OXcdMNqnvhbbx7p1ZJSTkNUu6Dp5/wQUSWZ2hgFmsRRCfwSaBWo3hiHNJlsnduT523avPyosoSpWW7DpTzqxnk/YvfrCthyv2exxuvIsggs0l3HaicYluM/Yxu1b9yXz7+wh9HUneazy1hh9z4jbyeqG4tPuupZVltzPHu+6dqyrKzJPABGWLVTTLCSYbYryqX+12r8ayYNJaKCTMyH+Q8Y17Sal4q6EhgAA25KUOrsU0khvOXSuPX7+5ZqOuDI4fpbMgpWT0uO5+mdZmtBDqyxKdmlabLE/i/6BwYavPr0htKuW2E0AFNiMVnZLNymxHF1LIftJwNq5NW5qkuT/atfcntEzaBJFeKE4CYoUtKek9vm0//vURPCCZbhjtTn4fjC+TGaGPwm8FumK0uw9PoLEMVoFh6+YeDqin7iHcThwnt94xun982bpk8zx3p2muqab9PrFG8dHSczhnh5FcmRoAx5osJs3P+uY1QidH68PChE0AUMla2f2NDxMxv+phvyewO6y+obs09+5TSh94phTyvGtckFR6tWpUzSNVt0lPBsQo4aYERRj77SuYRBae12AWW8dqEI9CEqa6Og5gSczd+bT+u9anJNDaugzyGAU2ZagzsLHmLM+rCdxs4gNzGrDyA0jXgsyDa9x4GKy3yiI6NZGwwlmHqu/TFNViMKh0fB+x2cTwusWHi9/m+TJh52WXbgP051y41OlqDoO/9bFTv/lNNk82NtfzTbr2FTdrgrY1QBw4nCJmTlvk7xRH8hrOp91YR+nO1hWqxaW0KRj1jJGXlQHSiUmPkJkuzEKF4ZQjMAzq6Xq/jHWWIEUHMDDZIFOt5IFjdmGLtG5Sp08AbBL9K1x3to5fTRSexpatz9438rdiHYytkkGrp+IzB1uUa3y3cytSyBomp0+9E997LWtdv0FATRGBJHSQICA1gRAnoF7EkX25JZ9vTcjqINP09U4bybAs6/4hk8XX9wev/r5i5qb/zBzcOcjAAAAGhOBWBgtUZ656PMaLujgEI88GzNSqTjf2Do2Ia+S8wS0RnvhhZSObVQa5fsw/7E27TBd5JJ/FTFAfaMmhsbgxOy+EvOkhZDmZMWowq+WPGZn97Zm9GM/4cwKkFci12yxLbtd7mLlpWlwO9hb1Ra/9/rGbwWNtUigSTi4K9nd0x/rVYbg98RdKxqpGQ48GSFEgZQmZcPY/r7Z3h5On1mN/alUY4Q1zT2pncfVp0Zn/2gmP03xoAC2FSQcD8vObDIxwJVY+ma9bVDtkQ2RzM1/M85FaspqSmGNA3Q9R1odiLPwy7TmIyWQqAuAQBUzWSbBICncj0skV3OZszU0/hZ5j8ehy1U1Qut+7NLIeat75awr2X3dlOCOUU9jj1mWrTCjOnz9//vURO+CZcdjM4n4XdC2jFaGMw+ylqmA0ufhk4LrsdmE/DKw8Ohwjcmdzcv7RkfD0vfLAnlYwazLVzdyGLaPw6ojC48uvgTl5JEaIL9WcmZiYWGo7X/aJ4KtMNCPjMectdUiegrrTXWrWHOEIP9VqlguwQWA16YbN3Uarb2COnD2Il4+nbrRrKGqeHgAMHqWTlADFRtAmRH5XUAtKUklMBjI/B4xCdpcNRG1UlVA+sUZQ/FIJxXQ1+Yjc9LHMo8rWpF3K9Q5R2/JoUsMjGPbceQX6l67elEz25P0k9guh+nJfurvv8z3aVXlwul+4kI4AJhcdr2e3OzInmrrGqKeEFWo6GqGSXTK6D7Uzt5nUNT8/M1c78p85mTbG6zOzG05qLKMMpUAfg0KBsjor1SYl8PRSG+5WO0zRoPpo3eoJ2W3YxNRaYmpmo/ydiQYADcF7GLEJByLHn2nQ+rorBKylgpsE11diRrYrbTso5KJbI2wMMW7D59Ihm7OVN2hnpFyWyS3hy1yZj324vK2wh3Wly+zGuzFvdW3QXZDZ3O23ScWvZ5Xsfn/N2of6+bPV7x1+Z1eMus8z/WO+I1lvVONDQhttQgCLIDg6eIr5XaRVf1m6Zy7/+bVVq5cWOdScIwtAKElAs2jDg9CskHfwxJSTQ4HA6TvAlkdFj8eahDMrR7KQpjOQ0KTBhgDc8KFnr3dJWdWxHIKDeh+JItNx5ZI6kAxaLw/F4ITqFYoMRS9F92WvQJjYrfX1fmMbuNuA3LfwrG4lS7Q23PUd+9s/RTS/DqRh1RmSa0DeYl/RtOyCepdhyoBrFsJQ9jVxjwtUvbMRqjzxoqCFQ4425MbxmYztc92+N/F9S7/z8Ppc6hz73923nda/1rBli9A51ABJvDoDCzkaRdgRk6i6JlQNAqjMGWgeEhNJMuu3amoHrZErG8r1Ts2BaGwQ5YaPI11u2mKgWRIdYBWL8qxu3XfiWyF+ZW7MHuC+IcRPSGp2OcqXO500ota/XO/2WPTVSFxl0pt//vURO2O5c1isos4RlC9TGZAMw+qFc2MzEThNdK8sVkFh4/a/qrjVscq4U3xGApqahf7w7+X91r+XJx/XtnpWyJfULs75nn/7lqeuvc4eX3M8QtSc2sbz/3c5mb/rRSVjio8+/D3vNkOf/xf/IMD/qURWZsTWc5bgWmwu17WnBklSGaOW2n/x7yP8brGXrlowNNxE6dwhswTecy1ZFASvHLTqiY7QWAkSsl93gcq3MyWLPXL2co+Fuz+goTKZPal1uSwm1XzgePXfhsuJFMknoF5verE2Z3nlbt4kitx+umGLn7rmtNZvtZu1l2GlYvofp6tGJqY3T3xG1b7rSGXctjhXNmRs3Gdy4t/mkRHFF+urkqn8hynr70AR76jagBobSb64ZXhYvtli7sw/SwFHfuuFHn4Z29ssQnhh32nNOJIlbpCo5SQ6jGpbDEDJlkSU5A74bpp7tK9ZasKAcqbgAB5ZCGurDxRh7dpBEbrE1YC5ZGRNddNFSQqULQgWjtTr8yZg7zi7KyxR9jMUGdObX4EJ6zQ7z9fMEmqajudsf+/1qExOBdh6y2pNuGieD6nzi/xBifEs2PDqsqyla4rDisDk52t//UpHfo6QV3p6FZ9WBj+GN7uzg7h5NUZnwX6IczLjKmm2ysKqRBjKovgVCvW4jWwk5R6fo5rlkD8yBxASGCkVgB5hS2VShWNcwMLSABJoTCqN5mUN87j47jcVcCNFVdDwiVYky6q6uDB6mr+4huLirUrZoDkX8TQBDX1YzNeKP9NjDWWC3r05cixFo4Uvu2pdW23F/luOE/D2PVOhytL7zV1/93tWNFjvPolqhtaG31Vh/51OYJAMDizrj58P6C4eoDnDwHydByAQrK7HeKyqtf1c9H8tXVuI2WTCQGjLZ9I0xii9FhGpt0WzX6Z2lINPgW1HW4InFgiK7BmVtISVcEBPZMrcXCgGJPnZr8kN2+6TXW7g7AaKRQ7njXeOBcPvUeWtuZxcaWsg6O58sezXaHqmFnXEtVh/lr8//vURPEC9cRjMgsPF7C1qgYwPy+2FfWAyufhkYLbsZiBh4to3sz990zYsIRh5bbiW36cnNZbcdt0aKh8fMaxdlUS4F6csZ3Zk6ysLB1Z3cTxLXa+e4zK6Z1bpZvWSV+rdOjIt+ahqHLl6nj7sRiYzs8gB+6dGaNSFaRc3Cev36RrTFph6WfoNlAXair/KKhT4dxyFzw6le0hFotIucCJAhwAVqMeTciZ1krBaBiAbQloxVYio6dQwnrrcW8XcOkN552pjRADOQZRHQ2xIf3NCmjzqySSGaaNWK6pS1sV1nR6nupV2n9EhFJJFIyWm3Tf3E3Jtufz5wmS5wKfE00F8k5r2/3U0WhhuhW2d/o5bLRxiFckYy9FEAAAB0N8hG6kBU8ptJ2xGP27b0yrdx01+PErbD8ffdL1vJ/N0Y1TW5W1kLAXennH4HiixCqZQMeXIwy6WzzlsDEoFDPI31IjsqVHSWq9R92Dhci1WFIIBYzBeQNE7zuymWYzG4mNv61nRzhQegMp8j3bXuBTUbOXzRFgE7dPYc+t/Gb/3hnLeipP1wPcXiEtsDWdeuYjWQnqkqEAkGyl7GaYVXEOrX/doUpLE1VO6ESFDHo4/72YRLJS/uarWr0EAAAAAN/A7M6dWaXN5uVqN7FB1hJK5ZOpzgG4XZC82YmGYikxNO+UJWY9UIja60Ba9xoDHl6PC1QKhE1LCSVMZvH/cScmKWj6ziDaJspKlIGUWpbqmlk9T2sZbhXsXLPaWTRF4iFKuYZpLl77aj+TLe++pkG+cZs/2/pbeHBzfNpCJ1eLkXWaPq/v8bvFks9t3zGvJyPDzI8bFctltfX9P++vJpcPJqQKbVU8Kdi+PJbG0THV7Zw37tgMQiddtDBWSx2CIVnEpVGrk1a3vGGJdDS44frMZZxK73ZO8bPJRtr7/oYLQfmRui/y6CMiXbEb0sR6M6yxJQtOsCCKcdZxLL+G2tq6EeQgYQK801C+jS3iQol4ELyXu+ny1RkME+LEwPPmErtE2sTw//vURPSCZftjMTMPT6C5i/Y3Pw+qFwGAxuw9morRsVgBh4vYFdU6KzYxHTIuyi7J7HCk6dnw9PDyIw7qr87WauMbsTq/K2ISsAzajo3Xo05Ei6cmZYgKw5HyfJ23F907Gi7j2PTE09oxa+oZqOpzIRSqVxXCUzNPnDNFln8Dw7HVLLkRIQCR6kvyijwOG6spYg4YXCwFp15vyzafBdaXt0mkeokPEBk2gktSSZcWUO7NSrUSjs03VHqIBmlnRfl6IfBVPbmK9vN5osu3j7JvnuEqH+uI8ZkYcQsPdQUBIpBuIQtoW47pfWs+1m6HDWx3FAaMwTA/n1pdb/x5dXjvs7ersYrkqZ7ZSSqcla5uVb5/3bOydKR0f+t63Bt1LTUHVUxBTYAAAAAKNbUO85Hy4d0P1QQkC5NzrDw+oUpvsaEI0+VwqmB40wK/rxMsTlA5GGtEft/5oKpBonga3gnssYtyDUDQRw7Lnaa9CIrnLbcaeBeZehGcBPkr2w1TSq9L88c5+ly5fm86s3VmX8FHw5SZRqm3ruWeeWrPypWxxaKrnhr/7/Ob3YxlrX29irhs8h6j5nje/eeUTMfGnOFSzG9riFk2oFD5Ws/uatPfD55HEGcbr14VKeIWZf3qP7M9IAAAAEy52TDEqqzrB6LZiN1jcy2T1lBZAjVAkW6NE8s08igtm7/CoUfKscYSQxVwEbZm0jq72m1kwVJl2VprXgGS1LP6sYP0pORgay95VnPy2pEL26mNbdLzuVzUrjL7IJJu1G7+r+zrUVlp13C9WWjuP6znS1OsKygI6AK4zg4UKY2fj7LYjx+qSnKnRQ7t81PNNLaDlp2Zetfj92dloFS1aGJF+stZXo5ODsADfdUAUDqKgiCIIhlRoiCpLR0MpE0pLGiEUikESVYZDSajtT96NNxUBZ1L2UrFh0QDN0QhsFRhd0LVtU1nV4lyVczbuyiLPrIHebqwV4QCicFQKi0lHZZOVhk3EuhdtjzMS6w5DstHkDpNW1zVsB7AffNU//vURO4CJd9isTn4TXCwS/YXMwyqFWVEwMThlMKFsBgol7KIxkUxKVVy9WnqwupkZzAfIZNQ4lzbtvrTrWv1tWrWlyGII6sPMsOnSoqk1atdkOjCoiJhoKgqCoNfnYaQFAIEqREQJGlctCCLREauMVXCIEVADCZYLBo1kULMGLlOtA+i4vC3Js0RdgAodWEkGoIgFHVa7UvCS6cnrUa1MdgKAMqgMo1tDpbXLfta5WvZbXRyEZg+suutpa7T0Ji48OIHSzufXLb05aEknvNPYVQaiKpa/mo2npqtPXZnisDY2ZgMrrbTtDo+2ls+ufVp5m9bez38dOtRs0/mr212oOpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqgEfWCIfhMPP6+zotKWkwluj7xCCW7NVZ43R03IddoK6lMVDlE2NsAa+3jfOK1paKlSE5HVR5oq0kBIjIQLHFEhEEaVCp2CNu5jrNdcF6IfitSHnBeht1NlAV5M9bsvFLYYCOkFUEpS+iYa1HHOQ5zoWHKt5lEX0uxsnufh1oA8iWjeHKMogRMy+HWlFt05MqdXT+bvk6dx/qNYduKqNElQn//vUZFCP9/JzFwsPT7B/yLNwJYbEAAABpAAAACAAADSAAAAEoiwYwp4wCdnAj1QzuEWk72FLSV8nlK3NrEfpdihLIqjDORRrC0yq5hUq8xoJpFThdeE4PQkQhDxwugNniYhIioyURsPdKMlk4bnq4ZubiJCWOnVEbD0KIqWLF0DbgqNF0DbE4T340hWVSOlSyaypEIQeA8HRgbICNAjYnclUpulp6SSsXUJKSg5B4LwvHAllhHE8eiUCQKjQSzgvkIaQ0B4axwJ54rQWqWvKlu1S00acBgRR5iaJIiKAxJR8OxZV7lPUnGnCgMo+CyiwIosywTBMx//4sLsTFhX/6xRMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
