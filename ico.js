/**
 * iCO — Exact port of ICOGem3D.jsx from polyspheric-prototype
 * Glass icosahedron with FBM plasma core, chromatic dispersion,
 * caustics, barycentric wireframe, multi-pass refraction.
 *
 * Lifted from the neya-ico standalone copy (itself pulled out of the NEYA
 * site) and dropped into the Version popup. Two changes from that copy:
 *   1. palSource below points at PALETTE_DEFAULT (blue/violet) instead of
 *      PALETTE_NEYA — this site already has its own ice-blue identity, and
 *      NEYA's gold/chrome/indigo set belongs to that project, not this one.
 *   2. The neya-ico copy imports "three" as an ES module (needs an import
 *      map + a real server — file:// blocks module script loading by CORS
 *      policy, so it silently never runs when the page is opened directly).
 *      This site already loads three.js r128 as a plain classic script, so
 *      this file is a classic script too now, reusing that same global
 *      THREE instead of fetching its own copy — works over file://, and
 *      one three.js on the page instead of two.
 * Render pipeline itself unchanged either way.
 */

// ── Palette definitions (exact from source) ────────────────
const PALETTE_DEFAULT = [
  [0x000d22, 0x0033cc, 0x4488ff],
  [0x06001e, 0x1a22aa, 0x5566ee],
  [0x08001a, 0x3311bb, 0x7744ff],
  [0x050028, 0x2200aa, 0x4433dd],
  [0x000818, 0x0044bb, 0x3377ff],
  [0x030022, 0x1100cc, 0x5522ff],
];

// NEYA palette: face (gold) → landscape (blue) → abstract (chrome) → portrait (indigo)
const PALETTE_NEYA = [
  [0x332200, 0xcc9933, 0xffcc33],   // face gold - dark
  [0x443300, 0xddaa44, 0xffdd66],   // face gold - bright
  [0x001133, 0x3366aa, 0x5599cc],   // landscape blue - dark
  [0x001a44, 0x4477bb, 0x66aadd],   // landscape blue - bright
  [0x9aa0aa, 0xd0d4dc, 0xf4f6fa],   // abstract chrome - dark
  [0xb0b6c0, 0xe0e4ec, 0xffffff],   // abstract chrome - bright
  [0x120a30, 0x3a309a, 0x9a8cd8],   // portrait indigo - dark
  [0x1a1142, 0x4a3eb0, 0xb7a3e5],   // portrait indigo - bright
];

// ── Shared noise GLSL ──────────────────────────────────────
const NOISE = `
  vec3 m3(vec3 x){return x-floor(x*(1./289.))*289.;}
  vec4 m4(vec4 x){return x-floor(x*(1./289.))*289.;}
  vec4 prm(vec4 x){return m4(((x*34.)+1.)*x);}
  vec4 tiv(vec4 r){return 1.79284291-0.85373472*r;}
  float snz(vec3 v){
    const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
    vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;
    vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
    i=m3(i);
    vec4 p=prm(prm(prm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
    float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
    vec4 xx=x_*ns.x+ns.yyyy;vec4 yy=y_*ns.x+ns.yyyy;vec4 h=1.-abs(xx)-abs(yy);
    vec4 b0=vec4(xx.xy,yy.xy);vec4 b1=vec4(xx.zw,yy.zw);
    vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
    vec4 nm=tiv(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=nm.x;p1*=nm.y;p2*=nm.z;p3*=nm.w;
    vec4 mm=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
    mm*=mm;return 42.*dot(mm*mm,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  float fbm(vec3 p){float t=0.,a=.5,f=1.;for(int i=0;i<3;i++){t+=snz(p*f)*a;a*=.5;f*=2.;}return t;}
`;

// ── Plasma shaders ─────────────────────────────────────────
const plasmaVert = `varying vec3 vPos,vN,vV;void main(){vPos=position;vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`;

const plasmaFrag = NOISE + `uniform float uT;uniform float uPulse;uniform vec3 uCD,uCM,uCB;varying vec3 vPos,vN,vV;void main(){vec3 p=vPos*0.65;vec3 q=vec3(fbm(p+vec3(0.,uT*.05,0.)),fbm(p+vec3(5.2,1.3,2.8)+uT*.05),fbm(p+vec3(2.2,8.4,.5)-uT*.02));float d=fbm(p+2.*q);float t=(d+.4)*.8;float alpha=smoothstep(0.05,.7,t);float side=smoothstep(-0.08,0.08,vPos.y+q.x*0.15);vec3 mainCol=mix(uCM,uCB,side);vec3 col=mix(uCD,mainCol,smoothstep(0.05,.5,t));col=mix(col,mainCol*1.15,smoothstep(.5,.8,t));col=mix(col,vec3(1.),smoothstep(.85,1.,t));float f=dot(normalize(vN),normalize(vV));float boost=1.0+uPulse*0.9;col*=boost;col=mix(col,vec3(0.85,0.92,1.0),uPulse*0.30);float aBoost=1.0+uPulse*0.45;gl_FragColor=vec4(col*2.4,alpha*(.05+.95*(f+1.)*.5)*aBoost);}`;

// ── Glass shaders ──────────────────────────────────────────
const glassVert = `
  attribute vec3 aBC;
  varying vec3 vN, vP, vW, vWN, vBC;
  void main(){
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vP = mv.xyz;
    vW = (modelMatrix * vec4(position, 1.0)).xyz;
    vWN = normalize(mat3(modelMatrix) * normal);
    vBC = aBC;
    gl_Position = projectionMatrix * mv;
  }`;

const glassFrag = `
  uniform float t;
  uniform float uPulse;
  uniform sampler2D bgTex;
  uniform vec2 res;
  varying vec3 vN, vP, vW, vWN, vBC;

  float fresnelSchlick(float cosTheta, float f0){
    return f0 + (1.0 - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
  }

  float ggx(float NdH, float rough){
    float a2 = rough * rough;
    float d = NdH * NdH * (a2 - 1.0) + 1.0;
    return a2 / (3.14159 * d * d + 0.0001);
  }

  float specHighlight(vec3 N, vec3 V, vec3 L, float rough){
    vec3 H = normalize(L + V);
    float NdH = max(dot(N, H), 0.0);
    float NdL = max(dot(N, L), 0.0);
    return ggx(NdH, rough) * NdL;
  }

  float edgeFactor(){
    vec3 d = fwidth(vBC);
    vec3 f = smoothstep(vec3(0.0), d * 1.8, vBC);
    return 1.0 - min(min(f.x, f.y), f.z);
  }

  void main(){
    vec3 N = gl_FrontFacing ? vN : -vN;
    vec3 V = normalize(-vP);
    float NdV = max(dot(N, V), 0.001);
    float edge = edgeFactor();

    float f0 = 0.04;
    float fresnel = fresnelSchlick(NdV, f0);

    vec2 uv = gl_FragCoord.xy / res;

    // Chromatic dispersion — pulse widens the split for a real dispersion burst.
    float dispBoost = 1.0 + uPulse * 1.8;
    float iorR = 1.0 / (1.47 - uPulse * 0.05);
    float iorG = 1.0 / 1.50;
    float iorB = 1.0 / (1.53 + uPulse * 0.05);

    vec3 refDirR = refract(-V, N, iorR);
    vec3 refDirG = refract(-V, N, iorG);
    vec3 refDirB = refract(-V, N, iorB);

    vec3 reflDir = reflect(-V, N);
    if(length(refDirR) < 0.001) refDirR = reflDir;
    if(length(refDirG) < 0.001) refDirG = reflDir;
    if(length(refDirB) < 0.001) refDirB = reflDir;

    float refrScale = 0.20 + edge * 0.06;
    vec2 uvR = clamp(uv + refDirR.xy * refrScale * 1.04 * dispBoost, 0.01, 0.99);
    vec2 uvG = clamp(uv + refDirG.xy * refrScale, 0.01, 0.99);
    vec2 uvB = clamp(uv + refDirB.xy * refrScale * 0.96 * dispBoost, 0.01, 0.99);

    vec3 refracted = vec3(
      texture2D(bgTex, uvR).r,
      texture2D(bgTex, uvG).g,
      texture2D(bgTex, uvB).b
    );

    vec2 reflUV = clamp(uv + reflDir.xy * 0.14, 0.01, 0.99);
    vec3 reflected = texture2D(bgTex, reflUV).rgb;

    float caustic = pow(max(dot(refDirG, vec3(0.0, 0.0, -1.0)), 0.0), 4.0) * 1.5;
    caustic *= 0.8 + 0.2 * sin(t * 2.0 + dot(N, vec3(1.7, 2.3, 0.5)) * 6.0);

    vec3 L1 = normalize(vec3(-0.5, 0.85, 0.6));
    vec3 L2 = normalize(vec3(0.8, 0.3, -0.5));
    vec3 L3 = normalize(vec3(0.0, -0.7, 0.7));

    float rough = 0.018;
    float totalSpec = specHighlight(N, V, L1, rough) * 0.55
                    + specHighlight(N, V, L2, rough) * 0.30
                    + specHighlight(N, V, L3, rough) * 0.20;

    float rim = pow(1.0 - NdV, 3.5);
    vec3 rimCol = vec3(0.55, 0.58, 0.82) * rim * (0.40 + uPulse * 0.55);
    // Bloom halo on pulse — soft additive periwinkle ring.
    rimCol += vec3(0.80, 0.88, 1.05) * pow(1.0 - NdV, 2.2) * uPulse * 0.30;

    float bevelSpec = edge * (0.3 + 0.5 * pow(max(dot(reflect(-L1, N), V), 0.0), 16.0));
    vec3 bevelCol = vec3(0.65, 0.70, 0.88) * bevelSpec * 0.45;

    vec3 col;
    float alpha;

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

      float backIor = 1.5;
      vec3 backRef = refract(-V, N, backIor);
      if(length(backRef) < 0.001) backRef = reflDir;

      vec3 backRefracted = vec3(
        texture2D(bgTex, clamp(uv + backRef.xy * 0.12 * 1.03, 0.01, 0.99)).r,
        texture2D(bgTex, clamp(uv + backRef.xy * 0.12, 0.01, 0.99)).g,
        texture2D(bgTex, clamp(uv + backRef.xy * 0.12 * 0.97, 0.01, 0.99)).b
      );

      vec3 backRefl = texture2D(bgTex, clamp(uv + reflDir.xy * 0.10, 0.01, 0.99)).rgb;

      vec3 internalTint = vec3(0.10, 0.30, 0.48) * (1.0 - iFresnel) * 0.35;
      col = backRefracted * 0.65 + backRefl * iFresnel * 0.3 + internalTint + rimCol * 0.4 + bevelCol * 0.5;
      col += vec3(0.7, 0.85, 1.0) * specHighlight(N, V, L1, 0.05) * 0.15;

      alpha = mix(0.18, 0.60, iFresnel) + edge * 0.25;
      alpha = clamp(alpha, 0.12, 0.72);
    }

    gl_FragColor = vec4(col, alpha);
  }`;

// ── Initialize ─────────────────────────────────────────────
function initICO() {
  const el = document.getElementById('ico-mount');
  if (!el) return;

  el.style.cursor = 'pointer';
  // Desktop: menu is hover-driven (CSS :hover). Mobile/touch has no
  // persistent hover, so we tap-toggle the .menu-pinned class instead —
  // first tap opens the menu (labels fade in), second tap closes it.
  // Tapping outside the iCO also closes the menu so it doesn't linger
  // across an interaction with the page.
  const isTouchDevice =
    'ontouchstart' in window ||
    (navigator.maxTouchPoints || 0) > 0;

  // Auto-close timer — touch only. Menu auto-dismisses 2s after open
  // if the user doesn't pick anything, so it doesn't linger on screen.
  // Force-hide is done via inline styles because iOS Safari's sticky
  // :hover state can keep CSS opacity rules matching even after we
  // remove .menu-pinned — bypassing CSS guarantees the visual closes.
  let autoCloseTimer = null;
  const forceHideMenu = () => {
    el.querySelectorAll('.ico-menu-item').forEach(item => {
      item.style.opacity = '0';
      item.style.pointerEvents = 'none';
    });
  };
  const clearForceHide = () => {
    el.querySelectorAll('.ico-menu-item').forEach(item => {
      item.style.opacity = '';
      item.style.pointerEvents = '';
    });
  };
  const armAutoClose = () => {
    if (autoCloseTimer) clearTimeout(autoCloseTimer);
    autoCloseTimer = setTimeout(() => {
      el.classList.remove('menu-pinned');
      forceHideMenu();
      autoCloseTimer = null;
    }, 2500);
  };
  const cancelAutoClose = () => {
    if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null; }
  };

  // Tap feedback — clicking the iCO orb (not its menu items) fires a short
  // dispersion pulse via window.triggerIcoPulse, registered below in the loop.
  el.addEventListener('click', (e) => {
    if (e.target.closest('.ico-menu-item')) {
      // User picked a menu item — cancel the auto-close so it doesn't
      // fire mid-navigation, and clear any leftover force-hide styles.
      cancelAutoClose();
      clearForceHide();
      return;
    }
    if (isTouchDevice) {
      el.classList.toggle('menu-pinned');
      if (el.classList.contains('menu-pinned')) {
        clearForceHide();
        armAutoClose();
      } else {
        forceHideMenu();
        cancelAutoClose();
      }
    }
    if (typeof window.triggerIcoPulse === 'function') window.triggerIcoPulse();
  });

  // Close the menu when the user taps anywhere outside the iCO (touch only).
  if (isTouchDevice) {
    document.addEventListener('click', (e) => {
      if (!el.classList.contains('menu-pinned')) return;
      if (el.contains(e.target)) return;
      el.classList.remove('menu-pinned');
      forceHideMenu();
      cancelAutoClose();
    });
  }

  const size = 220;
  const palette = 'deepspace';
  const status = 'open';

  let renderer, bgRT;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false });
    renderer.setSize(size, size);
    // Capped at 2 (was 3): on 3× phones that's 2.25× fewer pixels for both
    // passes below, with no visible difference at 220px.
    const dpr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.setClearColor(0, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    cam.position.z = 4.8;

    const rtSize = size * dpr;
    bgRT = new THREE.WebGLRenderTarget(rtSize, rtSize, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    // Lights
    const keyL = new THREE.DirectionalLight(0xffffff, 5.2);
    keyL.position.set(-2, 3, 3);
    scene.add(keyL);

    const fillL = new THREE.DirectionalLight(0x6677aa, 0.5);
    fillL.position.set(2, -1, -2);
    scene.add(fillL);

    const innerL = new THREE.PointLight(0xd0e0ff, 4.0, 5);
    scene.add(innerL);

    // Plasma sphere
    const plasmaMat = new THREE.ShaderMaterial({
      uniforms: {
        uT: { value: 0 },
        uPulse: { value: 0 },
        uCD: { value: new THREE.Color(0x4466cc) },
        uCM: { value: new THREE.Color(0x88aaee) },
        uCB: { value: new THREE.Color(0xf0f4ff) },
      },
      vertexShader: plasmaVert,
      fragmentShader: plasmaFrag,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const plasma = new THREE.Mesh(new THREE.SphereGeometry(0.46, 48, 48), plasmaMat);
    plasma.renderOrder = 0;
    scene.add(plasma);

    // Icosahedron geometry with flat normals + barycentric coords
    const geo = new THREE.IcosahedronGeometry(1.0, 0).toNonIndexed();
    const pa = geo.attributes.position.array;

    // Flat normals
    const na = new Float32Array(pa.length);
    for (let i = 0; i < pa.length; i += 9) {
      const ax=pa[i],ay=pa[i+1],az=pa[i+2];
      const bx=pa[i+3],by=pa[i+4],bz=pa[i+5];
      const cx=pa[i+6],cy=pa[i+7],cz=pa[i+8];
      let nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay);
      let ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az);
      let nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
      const l=Math.sqrt(nx*nx+ny*ny+nz*nz);
      nx/=l; ny/=l; nz/=l;
      for(let j=0;j<3;j++){na[i+j*3]=nx;na[i+j*3+1]=ny;na[i+j*3+2]=nz;}
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(na, 3));

    // Barycentric coordinates
    const vertCount = pa.length / 3;
    const bary = new Float32Array(vertCount * 3);
    for (let i = 0; i < vertCount; i += 3) {
      bary[i*3]=1; bary[i*3+1]=0; bary[i*3+2]=0;
      bary[(i+1)*3]=0; bary[(i+1)*3+1]=1; bary[(i+1)*3+2]=0;
      bary[(i+2)*3]=0; bary[(i+2)*3+1]=0; bary[(i+2)*3+2]=1;
    }
    geo.setAttribute('aBC', new THREE.BufferAttribute(bary, 3));

    // Glass material
    const glassMat = new THREE.ShaderMaterial({
      uniforms: {
        t: { value: 0 },
        uPulse: { value: 0 },
        bgTex: { value: null },
        res: { value: new THREE.Vector2(rtSize, rtSize) },
      },
      vertexShader: glassVert,
      fragmentShader: glassFrag,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const ico = new THREE.Mesh(geo, glassMat);
    ico.renderOrder = 10;
    scene.add(ico);

    // Palette
    const palSource = PALETTE_DEFAULT;
    const PAL = palSource.map(p => p.map(c => new THREE.Color(c)));

    // Hint: null = free cycle, 0 = face (gold), 2 = landscape (blue),
    //       4 = abstract (chrome), 6 = portrait (indigo)
    let hintStart = null;
    let currentPos = 0;
    window.__icoHint = (name) => {
      hintStart = name === 'face' ? 0 : name === 'landscape' ? 2
                : name === 'abstract' ? 4 : name === 'portrait' ? 6 : null;
    };

    // Brighten any color whose lightness is below a floor — keeps the plasma
    // readable when a gradient contains near-black mid-stops (landscape/abstract).
    function liftColor(input) {
      const c = (input instanceof THREE.Color) ? input.clone() : new THREE.Color(input);
      const hsl = {};
      c.getHSL(hsl);
      const floor = 0.22;
      if (hsl.l < floor) {
        c.setHSL(hsl.h, hsl.s, Math.min(0.34, hsl.l + 0.18));
      }
      return c;
    }

    // Smooth color transition state — lerps uniforms from current to target over `duration` seconds.
    let transition = null; // { from:[Color×3], to:[Color×3], start:s, duration:0.7 }

    function startTransition(targetColors) {
      transition = {
        from: [
          plasmaMat.uniforms.uCD.value.clone(),
          plasmaMat.uniforms.uCM.value.clone(),
          plasmaMat.uniforms.uCB.value.clone(),
        ],
        to: targetColors.map(c => c.clone()),
        start: lastTs,
        duration: 0.7,
      };
    }

    // Lock the plasma to a specific 3-color palette.
    // Order maps directly to shader slots: [base (uCD, edges), mid (uCM, dominant area), bright (uCB, highlights)]
    window.__setIcoColors = (colors) => {
      if (!Array.isArray(colors) || colors.length < 3) return;
      const lifted = [liftColor(colors[0]), liftColor(colors[1]), liftColor(colors[2])];
      PAL.length = 0;
      PAL.push(lifted);
      hintStart = null;
      currentPos = 0;
      startTransition(lifted);
    };

    // Restore the free-cycling NEYA palette.
    window.__resetIcoColors = () => {
      PAL.length = 0;
      palSource.forEach(p => PAL.push(p.map(c => new THREE.Color(c))));
      hintStart = null;
      currentPos = 0;
      startTransition(PAL[0]);
    };

    const spinRate = 0.24;
    let ry = 0.4, rx = 0.28, lastTs = 0;

    // Click-pulse — fast attack, exponential decay (mirrors id-composer's
    // first-screen tap feedback). External callers fire it via window.triggerIcoPulse.
    let pulseStart = -10;
    const PULSE_DUR = 0.9;
    window.triggerIcoPulse = () => { pulseStart = performance.now() * 0.001; };

    // Skip all work while the Status popup is closed (ring.js sets
    // window.__icoPaused on open/close), and cap at 60fps so 120/144Hz
    // screens don't render extra frames.
    let lastFrame = 0;
    function loop(ts) {
      requestAnimationFrame(loop);
      if (window.__icoPaused) { lastTs = 0; return; }
      if (ts - lastFrame < 1000 / 60 - 2) return;
      lastFrame = ts;
      const s = ts * 0.001;
      const dt = lastTs ? s - lastTs : 0.016;
      lastTs = s;

      // Envelope: 0..1 with sharp attack, exponential decay.
      const pt = Math.max(0, s - pulseStart) / PULSE_DUR;
      let pulse = 0;
      if (pt >= 0 && pt <= 1) {
        const attack = 1 - Math.pow(1 - Math.min(pt / 0.08, 1), 3);
        const decay = Math.exp(-Math.max(pt - 0.08, 0) * 4.5);
        pulse = attack * decay;
      }
      const meshScale = 1 + pulse * 0.06;
      ico.scale.setScalar(meshScale);
      plasma.scale.setScalar(meshScale);

      plasmaMat.uniforms.uT.value = s * 0.78;
      plasmaMat.uniforms.uPulse.value = pulse;
      glassMat.uniforms.t.value = s;
      glassMat.uniforms.uPulse.value = pulse;

      if (transition) {
        const t = Math.min(1, (s - transition.start) / transition.duration);
        const eased = t * t * (3 - 2 * t);
        plasmaMat.uniforms.uCD.value.copy(transition.from[0]).lerp(transition.to[0], eased);
        plasmaMat.uniforms.uCM.value.copy(transition.from[1]).lerp(transition.to[1], eased);
        plasmaMat.uniforms.uCB.value.copy(transition.from[2]).lerp(transition.to[2], eased);
        if (t >= 1) transition = null;
      } else {
        // Lerp toward the hinted pair. With no hint the palette holds steady —
        // the iCO never cycles on its own; it only moves on hover / carousel.
        if (hintStart !== null) {
          const target = hintStart + 0.5;
          const diff = target - currentPos;
          const wrapped = ((diff + PAL.length / 2) % PAL.length) - PAL.length / 2;
          currentPos += wrapped * Math.min(dt * 2.5, 1);
          currentPos = ((currentPos % PAL.length) + PAL.length) % PAL.length;
        }
        const idx = Math.floor(currentPos) % PAL.length;
        const nxt = (idx + 1) % PAL.length;
        const f = currentPos - Math.floor(currentPos);
        const mix = f * f * (3 - 2 * f);
        plasmaMat.uniforms.uCD.value.copy(PAL[idx][0]).lerp(PAL[nxt][0], mix);
        plasmaMat.uniforms.uCM.value.copy(PAL[idx][1]).lerp(PAL[nxt][1], mix);
        plasmaMat.uniforms.uCB.value.copy(PAL[idx][2]).lerp(PAL[nxt][2], mix);
      }

      // Rotation
      ry += spinRate * dt;
      ico.rotation.set(rx, ry, 0);
      plasma.rotation.y = s * 0.08;
      innerL.intensity = 3.5 + Math.sin(s * 1.5) * 0.5 + pulse * 2.4;

      // Two-pass render: plasma to RT, then glass reads RT
      ico.visible = false;
      renderer.setRenderTarget(bgRT);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.setRenderTarget(null);

      ico.visible = true;
      glassMat.uniforms.bgTex.value = bgRT.texture;
      renderer.setClearColor(0, 0);
      renderer.render(scene, cam);
    }

    loop(0);
  } catch (err) {
    console.error('iCO init failed:', err);
  }
}

// ── Boot ────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initICO);
} else {
  initICO();
}
