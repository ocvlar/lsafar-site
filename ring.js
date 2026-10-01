/**
 * Orbit ring — the glass-and-steel ring around the iCO in the Status popup,
 * plus the etched status label and its lit orb.
 *
 * Built in the "iCO Orbit Ring" artifact and ported here with its final
 * settings (S below). Like ico.js this is a classic script that reuses the
 * page's global THREE (r128), so it works over file:// too.
 *
 * Layers inside #ver-ico-wrap, back to front:
 *   #ver-ring-gl    WebGL canvas, the whole ring (+ etched label and orb),
 *                   sized to the ring's bounds and anchored on the iCO
 *   #ico-mount      the iCO (ico.js)
 *   #ver-ring-over  2D canvas the size of the iCO; only used when the ring's
 *                   front arc crosses the gem, to draw that part over it
 *   #ver-status-badge  the HTML badge: keeps the text (for layout and screen
 *                   readers) while the look is drawn in WebGL
 * Plus, over the popup box: leader tubes (in the ring's scene) from the
 * joints to the .ver-readout labels (moved with the ring),
 * whose live values (render rate, location, distance, the visitor's machine) are
 * filled here too; and #ver-activity, a live log of real events and
 * background jobs.
 *
 * Nothing renders while the popup is closed: openVerModal()/closeVerModal()
 * call window.icoRing.open()/close(), which also pause ico.js through
 * window.__icoPaused.
 */
(() => {
  if (typeof THREE === 'undefined' || !window.etchedUI) return;

  const S = {
    size: 2.7,       // ring width ÷ iCO width
    tilt: 58,        // deg from face-on; 90 = edge-on
    roll: -3,        // deg, in-screen lean
    spin: 0,         // deg/s of continuous turn. 0 since the HUD callouts plug
                     // into the joints (a full turn would carry them away); it
                     // rocks instead:
    rock: 5,         // deg each way the ring rocks around its own axis…
    rockPeriod: 14,  // …over this many seconds; the callouts ride along
    tube: 0.054,     // glass tube radius (ring radius is 2.2)
    joints: 4,       // segment joints (the HUD callouts plug into these)
    glow: 0.6,       // core intensity
    pulse: 0.04,     // energy pulse speed, laps/s
    pulseGlow: 0.5,  // how bright the pulses get
    orb: 0.22,       // orb speed through the tube, laps/s
    color: 0.75,     // ring color saturation: 0 = greyscale, 1 = full palette
  };
  const R = 2.2;
  const D = 7;       // camera distance, in the ring's world units (sets the perspective)
  const ICO = 220;   // px — matches `size` in ico.js
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Built from index.html's own values: accent rgba(100,150,255), steel
  // rgba(140,175,220), ice rgba(200,225,255), grey-steel rgba(150,165,185).
  const P = {
    core: [0.39, 0.59, 1.0], hot: [0.78, 0.88, 1.0],
    steel: 0xa6b3c6, gun: 0x3a4456, gasket: 0x0b0f18,
    env: {
      top: '#0a0f1c', mid: '#0c1426', horizon: '#1c2a44', low: '#07090f', floor: '#010203',
      key: '#e4ecf8', side: '#1a2238', panelA: '#8cafdc', panelB: '#6496ff',
      strip: 'rgba(140,175,220,0.75)', pool: 'rgba(100,150,255,0.22)',
    },
  };

  const box = document.getElementById('ver-modal-box');
  const wrap = document.getElementById('ver-ico-wrap');
  const mount = document.getElementById('ico-mount');
  const badge = document.getElementById('ver-status-badge');
  if (!box || !wrap || !mount || !badge) return;

  let renderer;
  try {
    // low-power: on dual-GPU laptops, stay on the integrated GPU for a decorative element.
    // MSAA only below 2× density; on retina screens the extra pixels already smooth edges.
    renderer = new THREE.WebGLRenderer({ antialias: (devicePixelRatio || 1) < 2, alpha: true, powerPreference: 'low-power' });
  } catch (e) {
    return; // no WebGL: the popup keeps its plain CSS badge
  }
  const gl = renderer.domElement;
  gl.id = 'ver-ring-gl';
  wrap.prepend(gl);
  const over = document.createElement('canvas');
  over.id = 'ver-ring-over';
  over.hidden = true;
  mount.after(over);
  const overCtx = over.getContext('2d');

  // Pixel ratio starts at min(dpr, 2) and steps down if frames run slow (see frame()).
  let pr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr);
  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
  scene.fog = new THREE.Fog(0x0c0c10, 6, 14);

  // Pull a color toward its own luminance by S.color (brightness is kept).
  const desat = rgb => {
    const l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    return rgb.map(v => l + (v - l) * S.color);
  };
  const desatHex = hex => { const c = new THREE.Color(hex); return new THREE.Color().setRGB(...desat([c.r, c.g, c.b])); };

  // ── Environment: painted softbox studio → PMREM, drives all the steel ──
  function makeEnv(e) {
    // Painted in 1024×512 units at half resolution; PMREM blurs it anyway.
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.scale(0.5, 0.5);
    const sat = `saturate(${S.color})`;
    g.filter = sat;
    const sky = g.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0.00, e.top);
    sky.addColorStop(0.44, e.mid);
    sky.addColorStop(0.50, e.horizon);
    sky.addColorStop(0.56, e.low);
    sky.addColorStop(1.00, e.floor);
    g.fillStyle = sky; g.fillRect(0, 0, 1024, 512);
    g.filter = `blur(5px) ${sat}`;
    g.fillStyle = e.key;    g.fillRect(390, 40, 250, 70);      // key softbox overhead
    g.fillStyle = e.side;   g.fillRect(0, 70, 150, 36); g.fillRect(890, 70, 134, 36);
    g.fillStyle = e.panelA; g.fillRect(150, 170, 90, 150);     // side panels
    g.fillStyle = e.panelB; g.fillRect(700, 190, 110, 130);
    g.fillStyle = e.strip;  g.fillRect(0, 244, 1024, 10);      // horizon line → long tube highlight
    g.fillStyle = e.pool;   g.fillRect(300, 400, 420, 60);
    g.filter = 'none';
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    const env = pm.fromEquirectangular(tex).texture;
    pm.dispose(); tex.dispose();
    return env;
  }
  scene.environment = makeEnv(P.env);

  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(2, 4, 5);
  scene.add(key);

  // ── Shared uniforms + shaders ────────────────────────────────────────
  const U = {
    uT:        { value: 0 },
    uGlow:     { value: S.glow },
    uPulse:    { value: S.pulse },
    uPulseAmt: { value: S.pulseGlow },
    uFlash:    { value: 0 },
    uSide:     { value: 0 },   // 0 whole ring, +1 front half only
    uR:        { value: R },
    uColA:     { value: new THREE.Vector3().fromArray(desat(P.core)) },
    uColB:     { value: new THREE.Vector3().fromArray(desat(P.hot)) },
    uOrbU:     { value: 0 },   // orb position along the tube, 0..1 in torus u
    uOrbOn:    { value: 1 },
  };

  const VERT = `
    varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vZ;
    void main(){
      vUv = uv;
      vN = normalize(normalMatrix * normal);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vZ = wp.z;
      vec4 mv = viewMatrix * wp;
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`;

  const COMMON = `
    uniform float uT, uGlow, uPulse, uPulseAmt, uFlash, uSide, uR, uOrbU, uOrbOn;
    uniform vec3 uColA, uColB;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vZ;
    // light the orb throws on the core: tight spill around it + long trail behind
    float orbLight(float u){
      float d = fract(u - uOrbU);
      float h = min(d, 1.0 - d);
      return uOrbOn * (exp(-h * h * 6000.0) * 1.4 + exp(-(1.0 - d) * 16.0) * 0.55);
    }
    // three pulses per lap: bright head + fading tail
    float pulses(float u){
      float p = 0.0;
      for (int i = 0; i < 3; i++) {
        float d = fract(u - uT * uPulse + float(i) / 3.0);
        float h = min(d, 1.0 - d);
        p += exp(-h * h * 2500.0) + exp(-(1.0 - d) * 30.0) * 0.28;
      }
      return p * uPulseAmt;
    }
    float depthFade(){ return mix(0.42, 1.0, smoothstep(-uR, uR * 0.6, vZ)); }
    float facing(){ return abs(dot(normalize(vN), normalize(vV))); }
    void sideClip(){ if (uSide * vZ < 0.0) discard; }
  `;

  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

  const coreMat = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VERT, ...additive,
    fragmentShader: COMMON + `
      void main(){
        sideClip();
        float p = pulses(vUv.x);
        float o = orbLight(vUv.x);
        vec3 c = mix(uColA, uColB, clamp(p + o * 0.7 + uFlash * 0.6, 0.0, 1.0));
        c *= (0.5 + 1.7 * p + 1.8 * o + uFlash * 1.4) * (0.5 + 0.5 * facing()) * uGlow * depthFade();
        gl_FragColor = vec4(c, 1.0);
      }`,
  });

  const glowMat = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VERT, ...additive,
    fragmentShader: COMMON + `
      void main(){
        sideClip();
        float p = pulses(vUv.x);
        float a = pow(facing(), 2.0) * (0.2 + 0.6 * p + 1.1 * orbLight(vUv.x) + uFlash * 0.8) * uGlow * depthFade();
        gl_FragColor = vec4(uColA * a * 1.4, 1.0);
      }`,
  });

  // Tube orb body: hot white center fading to the accent at its edge.
  const orbMat = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VERT, ...additive,
    fragmentShader: COMMON + `
      void main(){
        sideClip();
        float f = facing();
        vec3 c = mix(uColA, vec3(1.0), pow(f, 1.5)) * (0.35 + 1.9 * pow(f, 2.5));
        gl_FragColor = vec4(c * uOrbOn * depthFade(), 1.0);
      }`,
  });
  // Soft round glow texture, shared by the tube orb's halo and the status orb's.
  const haloTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  // Joints write depth, so they hide the orb as it passes through them.
  const haloMat = new THREE.SpriteMaterial({ map: haloTex, ...additive });
  haloMat.color.setRGB(...desat(P.core)).lerp(new THREE.Color().setRGB(...desat(P.hot)), 0.35);

  // ── iCO glass for the tube ───────────────────────────────────────────
  // ico.js's glassFrag (front-face branch), with two changes for a thin tube:
  //  - refraction offsets are scaled to the tube's width in pixels (uRefrPx)
  //    instead of a fraction of the canvas, which only suits a gem-sized canvas;
  //  - the facet-edge bevel term (barycentric, icosahedron-only) is replaced
  //    by the tube's silhouette.
  // bgTex holds the core, glow and orb, rendered at a third of the resolution first.
  const glassRT = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const glassMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, {
      bgTex:   { value: glassRT.texture },
      res:     { value: new THREE.Vector2(1, 1) },
      uRefrPx: { value: 10 },
      uSat:    { value: S.color },
    }),
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 vN, vP; varying float vZ;
      void main(){
        vN = normalize(normalMatrix * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vZ = wp.z;
        vec4 mv = viewMatrix * wp;
        vP = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uT, uFlash, uSide, uR, uRefrPx, uSat;
      uniform sampler2D bgTex;
      uniform vec2 res;
      varying vec3 vN, vP; varying float vZ;

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
        return ggx(max(dot(N, H), 0.0), rough) * max(dot(N, L), 0.0);
      }

      void main(){
        if (uSide * vZ < 0.0) discard;
        float uPulse = uFlash;
        vec3 N = normalize(vN);
        vec3 V = normalize(-vP);
        float NdV = max(dot(N, V), 0.001);
        float edge = pow(1.0 - NdV, 6.0) * 0.6;
        float fresnel = fresnelSchlick(NdV, 0.04);
        vec2 uv = gl_FragCoord.xy / res;
        vec2 px = vec2(uRefrPx) / res;

        float dispBoost = 1.0 + uPulse * 1.8;
        vec3 refDirR = refract(-V, N, 1.0 / (1.47 - uPulse * 0.05));
        vec3 refDirG = refract(-V, N, 1.0 / 1.50);
        vec3 refDirB = refract(-V, N, 1.0 / (1.53 + uPulse * 0.05));
        vec3 reflDir = reflect(-V, N);
        if(length(refDirR) < 0.001) refDirR = reflDir;
        if(length(refDirG) < 0.001) refDirG = reflDir;
        if(length(refDirB) < 0.001) refDirB = reflDir;

        float refrScale = 1.0 + edge * 0.3;
        vec3 refracted = vec3(
          texture2D(bgTex, clamp(uv + refDirR.xy * px * refrScale * 1.04 * dispBoost, 0.001, 0.999)).r,
          texture2D(bgTex, clamp(uv + refDirG.xy * px * refrScale, 0.001, 0.999)).g,
          texture2D(bgTex, clamp(uv + refDirB.xy * px * refrScale * 0.96 * dispBoost, 0.001, 0.999)).b
        );
        vec3 reflected = texture2D(bgTex, clamp(uv + reflDir.xy * px * 0.7, 0.001, 0.999)).rgb;

        float caustic = pow(max(dot(refDirG, vec3(0.0, 0.0, -1.0)), 0.0), 4.0) * 1.5;
        caustic *= 0.8 + 0.2 * sin(uT * 2.0 + dot(N, vec3(1.7, 2.3, 0.5)) * 6.0);

        vec3 L1 = normalize(vec3(-0.5, 0.85, 0.6));
        vec3 L2 = normalize(vec3(0.8, 0.3, -0.5));
        vec3 L3 = normalize(vec3(0.0, -0.7, 0.7));
        float rough = 0.018;
        float totalSpec = specHighlight(N, V, L1, rough) * 0.55
                        + specHighlight(N, V, L2, rough) * 0.30
                        + specHighlight(N, V, L3, rough) * 0.20;

        float rim = pow(1.0 - NdV, 3.5);
        vec3 rimCol = vec3(0.55, 0.58, 0.82) * rim * (0.40 + uPulse * 0.55);
        rimCol += vec3(0.80, 0.88, 1.05) * pow(1.0 - NdV, 2.2) * uPulse * 0.30;
        float bevelSpec = edge * (0.3 + 0.5 * pow(max(dot(reflect(-L1, N), V), 0.0), 16.0));
        vec3 bevelCol = vec3(0.65, 0.70, 0.88) * bevelSpec * 0.45;

        vec3 interior = refracted * (1.2 + caustic * 0.5);
        vec3 intRefl = reflected * fresnel * 0.45;
        vec3 reflCol = vec3(0.60, 0.65, 0.85) * fresnel * 0.28;
        vec3 specCol = vec3(0.80, 0.82, 0.95) * totalSpec;
        vec3 causticCol = refracted * caustic * 0.35;
        // The glass's own tints follow S.color; what it refracts keeps its color.
        vec3 tint = reflCol + specCol + rimCol + bevelCol + vec3(0.05, 0.08, 0.14) * rim * 0.3;
        tint = mix(vec3(dot(tint, vec3(0.2126, 0.7152, 0.0722))), tint, uSat);
        vec3 col = interior * (1.0 - fresnel * 0.5) + intRefl + causticCol + tint;
        float alpha = mix(0.32, 0.85, fresnel) + totalSpec * 0.5 + edge * 0.35 + caustic * 0.1;
        alpha = clamp(alpha, 0.22, 0.97);

        float fade = mix(0.42, 1.0, smoothstep(-uR, uR * 0.6, vZ)); // dim the far side
        gl_FragColor = vec4(col * fade, alpha * mix(0.6, 1.0, fade));
      }`,
  });

  // Status orb: the tube orb's recipe with its own (semantic) color, never desaturated.
  const dotMat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Vector3(0.25, 0.87, 0.55) }, uLit: { value: 1 } },
    vertexShader: VERT, ...additive,
    fragmentShader: `
      uniform vec3 uCol; uniform float uLit;
      varying vec3 vN; varying vec3 vV;
      void main(){
        float f = abs(dot(normalize(vN), normalize(vV)));
        vec3 c = mix(uCol, vec3(1.0), pow(f, 1.5) * 0.75 * uLit) * (0.3 + 1.7 * pow(f, 2.5) * (0.35 + 0.65 * uLit));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });

  const DS = { side: THREE.DoubleSide };
  const steelMat = new THREE.MeshStandardMaterial({ color: desatHex(P.steel), metalness: 1, roughness: 0.1, envMapIntensity: 1.35, ...DS });
  const gunMat = new THREE.MeshStandardMaterial({ color: desatHex(P.gun), metalness: 1, roughness: 0.2, envMapIntensity: 1.1 });
  const gasketMat = new THREE.MeshStandardMaterial({ color: desatHex(P.gasket), metalness: 0.4, roughness: 0.38, envMapIntensity: 0.8, ...DS });

  // ── Geometry ─────────────────────────────────────────────────────────
  const group = new THREE.Group();   // tilt + roll + parallax
  const ring = new THREE.Group();    // spins around its own axis (local Z)
  group.add(ring);
  scene.add(group);

  // Profiles are [radius, y] in tube radii, revolved around the tube axis (local Y).
  const lathe = (t, pts) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r * t, y * t)), 40);

  (function build() {
    const t = S.tube;
    // 256 segments around: at the ring's full ~600px width the chord error is
    // well under a pixel, so more would be invisible.
    const shell = new THREE.Mesh(new THREE.TorusGeometry(R, t, 24, 256), glassMat);
    shell.renderOrder = 10; // after the core/orb it refracts
    // Layer 1 = what the glass refracts (rendered into glassRT first).
    const glowMesh = new THREE.Mesh(new THREE.TorusGeometry(R, t * 0.78, 12, 256), glowMat);
    const coreMesh = new THREE.Mesh(new THREE.TorusGeometry(R, t * 0.26, 8, 256), coreMat);
    glowMesh.layers.enable(1);
    coreMesh.layers.enable(1);
    ring.add(shell, glowMesh, coreMesh);

    // Segment joints: the tube is cut into pieces whose ends flare into
    // polished steel rims; a dark ridged gasket sits in the seam, with a small
    // clamp ear hanging off it below the ring plane.
    // Joint-local axes: X = outward from ring center, Y = along the tube, Z = ring normal.
    // Each part is one InstancedMesh shared by every joint (5 draw calls total).
    const g = 0.2; // half the seam width
    const parts = {
      cap: lathe(t, [
        [0.95, g], [1.2, g], [1.29, g + 0.05], [1.33, g + 0.16], [1.32, g + 0.3],
        [1.24, g + 0.6], [1.12, g + 1.0], [1.05, g + 1.4], [1.02, g + 1.8],
      ]),
      gasket: lathe(t, [
        [0.95, -0.22], [1.12, -0.22], [1.18, -0.14], [1.12, -0.05],
        [1.12, 0.05], [1.18, 0.14], [1.12, 0.22], [0.95, 0.22],
      ]),
      ear: new THREE.BoxGeometry(t * 0.28, t * 0.34, t * 0.9).translate(0, 0, -t * 1.5),
      tip: new THREE.CylinderGeometry(t * 0.17, t * 0.17, t * 0.28, 16).rotateZ(Math.PI / 2).translate(0, 0, -t * 1.95),
      pin: new THREE.CylinderGeometry(t * 0.07, t * 0.07, t * 0.34, 10).rotateZ(Math.PI / 2).translate(0, 0, -t * 1.95),
    };
    const n = S.joints;
    const inst = (geo, mat, count) => {
      const m = new THREE.InstancedMesh(geo, mat, count);
      m.frustumCulled = false; // instance bounds aren't tracked in r128; the ring is always in view
      ring.add(m);
      return m;
    };
    const caps = inst(parts.cap, steelMat, n * 2);
    const gaskets = inst(parts.gasket, gasketMat, n);
    const ears = inst(parts.ear, gunMat, n);
    const tips = inst(parts.tip, gunMat, n);
    const pins = inst(parts.pin, steelMat, n);
    const M = new THREE.Matrix4(), F = new THREE.Matrix4();
    const flip = new THREE.Matrix4().makeRotationX(Math.PI);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.PI / n;
      const c = Math.cos(a), s = Math.sin(a);
      M.set(
        c, -s, 0, R * c,
        s,  c, 0, R * s,
        0,  0, 1, 0,
        0,  0, 0, 1,
      );
      caps.setMatrixAt(2 * k, M);
      caps.setMatrixAt(2 * k + 1, F.multiplyMatrices(M, flip));
      gaskets.setMatrixAt(k, M);
      ears.setMatrixAt(k, M);
      tips.setMatrixAt(k, M);
      pins.setMatrixAt(k, M);
    }
  })();

  // ── Tube orb: lives on `group`, not `ring`, so its speed is independent of the spin
  const orb = new THREE.Group();
  const orbBody = new THREE.Mesh(new THREE.SphereGeometry(S.tube * 0.62, 16, 12), orbMat);
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(S.tube * 7);
  orbBody.layers.enable(1);
  halo.layers.enable(1);
  orb.add(orbBody, halo);
  group.add(orb);
  let orbPhase = 0;

  // Canvas size and scale, filled in by resize().
  const view = { w: 0, h: 0, ico: ICO, ringPx: 0, topExt: 0 };

  // ── Status: etched label + lit orb ───────────────────────────────────
  // "ONLINE" is etched into the popup's frosted-glass surface, and the status
  // orb (3D, lit like the tube's orb) sits in a small socket cut into the same
  // surface, spilling a little of its light onto the letters. The HTML badge
  // keeps the text and sets the layout; everything here matches its box.
  const badgeDot = document.getElementById('ver-status-dot');
  const badgeText = document.getElementById('ver-status-label');
  const STATUS = {
    online:  { rgb: [0.25, 0.87, 0.55], lit: 1 },
    away:    { rgb: [1.0, 0.72, 0.28],  lit: 1 },
    offline: { rgb: [0.59, 0.62, 0.67], lit: 0 },
  };
  const presence = ['online', 'away', 'offline'].find(s => badgeDot && badgeDot.classList.contains('is-' + s)) || 'offline';
  let st = STATUS[presence]; // changed live by setStatus() (the site's status API)

  const pill = new THREE.Group();
  const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), dotMat);
  dotMat.uniforms.uCol.value.fromArray(st.rgb);
  dotMat.uniforms.uLit.value = st.lit;
  const dotHaloMat = new THREE.SpriteMaterial({ map: haloTex, ...additive, fog: false });
  dotHaloMat.color.setRGB(...st.rgb);
  const dotHalo = new THREE.Sprite(dotHaloMat);
  // Etched surface (letters + socket), drawn crisp at device resolution.
  const labelCanvas = document.createElement('canvas');
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.encoding = THREE.sRGBEncoding;
  labelTex.minFilter = THREE.LinearFilter;
  labelTex.generateMipmaps = false;
  // Normal blending (not additive) so the cut shadows can darken.
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: labelTex, transparent: true, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
  }));
  label.renderOrder = -1; // under the orb, which sits in the socket
  pill.add(label, dot, dotHalo);
  scene.add(pill);          // on the scene, not the ring: it never tilts or spins
  let haloBase = 0;

  // Badge box relative to the iCO's center, in CSS px.
  function pillBox() {
    const br = badge.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), dr = badgeDot.getBoundingClientRect();
    const bx = br.left + br.width / 2, by = br.top + br.height / 2;
    return {
      cx: bx - (wr.left + wr.width / 2), cy: by - (wr.top + wr.height / 2),
      w: br.width, h: br.height,
      dotX: dr.left + dr.width / 2 - bx, dotR: dr.width / 2,
      left: br.left, top: br.top,
    };
  }

  // The etched-into-glass look (letters, socket, the orb's light) is shared
  // with LIVE and the EXPERIMENTING chips: etched.js.
  const { paintEtched, etchedBadge } = window.etchedUI;

  function drawEtch(b) {
    const tr = badgeText.getBoundingClientRect();
    const cs = getComputedStyle(badgeText);
    const fs = parseFloat(cs.fontSize);
    const ls = parseFloat(cs.letterSpacing) || 0;
    const sr = b.dotR * 1.7;                     // socket radius
    const pad = Math.ceil(sr * 4) + 2;           // room for the orb's light spill, CSS px
    const ss = pr * 2;                           // supersample for crisp edges
    const W = b.w + pad * 2, H = b.h + pad * 2;
    const rgb = st.rgb.map(v => Math.round(v * 255)).join(',');

    labelCanvas.width = Math.ceil(W * ss);
    labelCanvas.height = Math.ceil(H * ss);
    const g = labelCanvas.getContext('2d');
    g.setTransform(ss, 0, 0, ss, 0, 0);
    g.clearRect(0, 0, W, H);

    const text = badgeText.textContent.toUpperCase();
    paintEtched(g, {
      sx: pad + b.w / 2 + b.dotX, sy: pad + b.h / 2, sr,
      tx: pad + (tr.left - b.left), ty: pad + (tr.top - b.top) + tr.height / 2, textW: tr.width,
      text, font: `${cs.fontWeight} ${fs}px ${cs.fontFamily}`, ls, rgb, lit: st.lit,
    });
    labelTex.needsUpdate = true;
    return pad;
  }

  function buildPill() {
    if (!view.ringPx) return;
    const b = pillBox();
    const wpp = 2 * R / view.ringPx;           // world units per CSS px at the iCO's depth
    // Just in front of the iCO's plane, so the ring's front-half clip keeps it whole.
    pill.position.set(b.cx * wpp, -b.cy * wpp, 0.02);
    // orb half-sunk into its socket
    dot.position.set(b.dotX * wpp, 0, b.dotR * 0.35 * wpp);
    dot.scale.setScalar(b.dotR * 1.1 * wpp);
    dotHalo.position.copy(dot.position);
    haloBase = b.dotR * 5 * wpp;
    const pad = drawEtch(b);
    label.scale.set((b.w + pad * 2) * wpp, (b.h + pad * 2) * wpp, 1);
  }

  // ── Framing ──────────────────────────────────────────────────────────
  // The ring is sized in iCO widths and centered on the iCO. When the popup
  // is too small (short laptop screens, phones), the iCO and ring shrink
  // together; below 60% the ring hugs the iCO tighter instead of shrinking it
  // further. #ver-ico-wrap's margins grow to hold the ring, so it never
  // spills out of the popup box and causes scrolling.
  const PHONE = matchMedia('(max-width: 768px)');
  function resize() {
    const d2r = THREE.MathUtils.degToRad;
    const cs = getComputedStyle(box);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const boxH = cs.maxHeight !== 'none' ? parseFloat(cs.maxHeight) : box.clientHeight;
    const availW = box.clientWidth - padX;
    const availH = boxH - padY;
    if (availW <= 0 || availH <= 0) return;

    // The camera sits a fixed distance D from the iCO, so the ring's
    // perspective is the same at every size; the canvas only crops it.
    // Perspective makes the near (front) arc reach much further below the
    // iCO than the far arc reaches above it, so the canvas is taller below
    // the iCO than above. Extents are in world units at the iCO's depth, for
    // the most open parallax lean (4° past the set tilt).
    const t1 = d2r(Math.max(S.tilt - 4, 0));
    const frontW = R * Math.cos(t1) / (D - R * Math.sin(t1)) * D;
    const backW = R * Math.cos(t1) / (D + R * Math.sin(t1)) * D;
    const tubeW = S.tube * 2.4 * D / (D - R * Math.sin(t1)); // near tube + clamp ears
    const fH = (frontW + backW + 2 * tubeW) / (2 * R);       // canvas height per px of ring width
    const spanW = r => r * 1.14 + 32;
    let k = Math.min(1, (availW - 32) / (S.size * ICO * 1.14), (availH - 24) / (S.size * ICO * fH));
    let ringPx = S.size * ICO * k;
    if (k < 0.6) {
      k = 0.6;
      ringPx = Math.max(ICO * k * 1.6, Math.min(S.size * ICO * k, (availW - 32) / 1.14, (availH - 24) / fH));
    }
    // phones (Status D): the iCO and ring a size smaller, leaving room around
    // the ring for the readings on their leaders
    if (PHONE.matches) { k *= 0.68; ringPx *= 0.68; }
    const icoPx = ICO * k;
    wrap.style.width = wrap.style.height = icoPx + 'px';
    const wpp = 2 * R / ringPx; // world units per CSS px at the iCO's depth

    // Keep the badge off the ring. It normally sits just under the iCO, inside
    // the ring; when the ring hugs the iCO tightly (phones), the ring's front
    // edge runs through that spot, so the badge drops to just below the ring.
    badge.style.bottom = '';
    const tilt = d2r(S.tilt);
    const frontY = R * Math.cos(tilt) / (D - R * Math.sin(tilt)) * D / wpp; // px below center
    const reach = tubeW / wpp + 6;
    let pb = pillBox();
    const top = pb.cy - pb.h / 2, bottom = pb.cy + pb.h / 2;
    if (bottom > frontY - reach && top < frontY + reach) {
      badge.style.bottom = (parseFloat(getComputedStyle(badge).bottom) - (frontY + reach + 2 - top)) + 'px';
      pb = pillBox();
    }

    // Canvas extents above/below the iCO's center. The badge (and its orb's
    // light) is drawn in this canvas too, so keep room for it.
    const spill = pb.dotR * 1.7 * 4 + 2;
    const upPx = Math.max(icoPx / 2 + 4, (backW + tubeW) / wpp + 12);
    const downPx = Math.max(icoPx / 2 + 4, (frontW + tubeW) / wpp + 12, pb.cy + pb.h / 2 + spill);
    const w = Math.round(Math.min(availW, spanW(ringPx)));
    const h = Math.round(Math.min(availH, upPx + downPx));
    const topExt = Math.round(upPx * h / (upPx + downPx)); // canvas top → iCO center

    const below = pb.cy + pb.h / 2 - icoPx / 2 + 10; // badge's reach past the wrap's bottom
    const mt = Math.max(12, topExt - icoPx / 2), mb = Math.max(46, h - topExt - icoPx / 2, below);
    // Nudge the group (ring, iCO, status) down by up to 44px of the spare
    // height, keeping the total margin so the layout doesn't grow: it leaves
    // the popup's top-left corner clear for the live log.
    const spare = availH - (icoPx + mt + mb);
    const nudge = Math.max(0, Math.min(spare / 2, 44));
    wrap.style.margin = `${mt + nudge}px auto ${Math.max(0, mb - nudge)}px`;
    Object.assign(view, { w, h, ico: icoPx, ringPx, topExt });

    renderer.setPixelRatio(pr);
    renderer.setSize(w, h);
    gl.style.top = `calc(50% - ${topExt}px)`;
    gl.style.transform = 'translateX(-50%)';
    // Project as if the canvas were centered on the iCO (full height 2×max
    // extent), then crop to the part we draw.
    const fullH = 2 * Math.max(topExt, h - topExt);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(fullH * wpp / 2 / D));
    camera.aspect = w / fullH;
    camera.setViewOffset(w, fullH, 0, fullH / 2 - topExt, w, h);
    camera.position.set(0, 0, D);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    scene.fog.near = D - R * 0.3;
    scene.fog.far = D + R * 2.8;

    // Glass inputs: full drawing-buffer size for gl_FragCoord → uv, a third-res
    // target for what it refracts (all soft glow, so no detail is lost), and
    // the tube radius in device pixels.
    glassMat.uniforms.res.value.set(Math.round(w * pr), Math.round(h * pr));
    glassRT.setSize(Math.max(1, Math.round(w * pr / 3)), Math.max(1, Math.round(h * pr / 3)));
    glassMat.uniforms.uRefrPx.value = S.tube * (ringPx / (2 * R)) * pr;
    crossDirty = true;

    over.style.width = over.style.height = icoPx + 'px';
    over.width = over.height = Math.round(icoPx * pr);
    buildPill();
    layoutCallouts();
  }

  // ── Pointer parallax ─────────────────────────────────────────────────
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', e => {
    par.tx = (e.clientX / innerWidth - 0.5) * 2;
    par.ty = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });

  // Clicking the iCO (which pulses it, see ico.js) also flashes the ring.
  let flashStart = -10;
  mount.addEventListener('click', () => { flashStart = performance.now() * 0.001; });

  // ── Does the front arc cross the iCO? ────────────────────────────────
  // At the default tilt it passes below the iCO, so the extra pass is skipped.
  // The ring is a circle, so spinning never changes the answer; it's only
  // recomputed when the tilt/parallax lean or the framing changes.
  const SAMPLES = 48, probe = new THREE.Vector3();
  let crossDirty = true, crossCached = false;
  const lastLean = new THREE.Vector3(1e9, 0, 0);
  function frontCrossesIco() {
    const r = group.rotation;
    if (!crossDirty && Math.abs(r.x - lastLean.x) + Math.abs(r.y - lastLean.y) + Math.abs(r.z - lastLean.z) < 0.002) {
      return crossCached;
    }
    lastLean.set(r.x, r.y, r.z);
    crossDirty = false;
    group.updateMatrixWorld();
    const half = view.ico / 2 + (S.tube * 2.2) * (view.ringPx / (2 * R)); // tube + ear reach, px
    crossCached = false;
    for (let i = 0; i < SAMPLES; i++) {
      const a = (i / SAMPLES) * Math.PI * 2;
      probe.set(R * Math.cos(a), R * Math.sin(a), 0);
      ring.localToWorld(probe);
      if (probe.z <= 0) continue;
      probe.project(camera);
      // NDC → px from the iCO's center (the canvas is not centered on it vertically)
      const dx = probe.x * view.w / 2, dy = (1 - probe.y) / 2 * view.h - view.topExt;
      if (Math.abs(dx) < half && Math.abs(dy) < half) { crossCached = true; break; }
    }
    return crossCached;
  }

  // ── HUD callouts ─────────────────────────────────────────────────────
  // Leader lines that grow out of the ring's joints: each leaves a joint's
  // steel collar square to the tube (along the ellipse's outward normal
  // there), runs a short way, then elbows horizontally to its label. The
  // lines are real 3D tubes in the ring's scene, drawn with the ring's own
  // materials (the iCO glass shell, the glow, the blue core with its
  // travelling pulses), just thinner; each grows straight out of its joint's
  // collar. Anchors are each .ver-readout's data-angle around the ring's
  // plane, set to joint positions. The ring doesn't spin (a full turn would
  // carry the joints away) but gently rocks (S.rock), and the anchors follow
  // their joints through it, and through the lean with the mouse.
  // Labels move with their lines (transform only — composited, no layout).
  const calloutSvg = document.getElementById('ver-callouts');
  const TICK = 16, RUN = 22, GAP = 8; // px: out from the ring, elbow run, line→label
  // Leader tubes use the ring's own shaders: the glass shell as is, and
  // copies of the core and glow with the travelling orb's light switched
  // off (it only belongs to the ring), so the pulses flow along them.
  const leaderCoreMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, { uOrbOn: { value: 0 } }),
    vertexShader: VERT, fragmentShader: coreMat.fragmentShader, ...additive,
  });
  const leaderGlowMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, { uOrbOn: { value: 0 } }),
    vertexShader: VERT, fragmentShader: glowMat.fragmentShader, ...additive,
  });
  const LEADER_R = S.tube * 0.4; // tube radius, world units (the ring's is S.tube)
  // A two-segment tube (joint → elbow → label end) whose vertices are
  // rewritten in place as the ring moves: fixed topology, no per-frame
  // allocations. uv.x runs 0→1 along it, like the ring's, so the core's
  // pulses travel out along the line.
  const LR = 10; // sides around the tube
  function leaderGeo() {
    const g = new THREE.BufferGeometry();
    const n = 4 * (LR + 1); // 2 segments × 2 end rings
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const idx = [];
    for (let seg = 0; seg < 2; seg++) {
      const r0 = seg * 2 * (LR + 1), r1 = r0 + LR + 1;
      for (let k = 0; k < LR; k++) {
        const a = r0 + k, b = r1 + k;
        idx.push(a, a + 1, b, b, a + 1, b + 1); // wound to face outward
      }
    }
    g.setIndex(idx);
    return g;
  }
  const tv = { d: new THREE.Vector3(), n1: new THREE.Vector3(), n2: new THREE.Vector3(), o: new THREE.Vector3(), Z: new THREE.Vector3(0, 0, 1) };
  function setLeaderGeo(g, pts, r) {
    const pos = g.attributes.position.array, nor = g.attributes.normal.array, uv = g.attributes.uv.array;
    const l0 = pts[0].distanceTo(pts[1]), l1 = pts[1].distanceTo(pts[2]), total = l0 + l1 || 1;
    let v = 0;
    for (let seg = 0; seg < 2; seg++) {
      const a = pts[seg], b = pts[seg + 1];
      tv.d.subVectors(b, a).normalize();
      tv.n1.crossVectors(tv.d, tv.Z);
      if (tv.n1.lengthSq() < 1e-6) tv.n1.set(1, 0, 0);
      tv.n1.normalize();
      tv.n2.crossVectors(tv.d, tv.n1);
      for (const [end, u] of [[a, seg ? l0 / total : 0], [b, seg ? 1 : l0 / total]]) {
        for (let k = 0; k <= LR; k++) {
          const th = (k / LR) * Math.PI * 2;
          tv.o.copy(tv.n1).multiplyScalar(Math.cos(th)).addScaledVector(tv.n2, Math.sin(th));
          pos[v * 3] = end.x + tv.o.x * r; pos[v * 3 + 1] = end.y + tv.o.y * r; pos[v * 3 + 2] = end.z + tv.o.z * r;
          nor[v * 3] = tv.o.x; nor[v * 3 + 1] = tv.o.y; nor[v * 3 + 2] = tv.o.z;
          uv[v * 2] = u; uv[v * 2 + 1] = k / LR;
          v++;
        }
      }
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.attributes.uv.needsUpdate = true;
  }
  const callouts = calloutSvg ? [...box.querySelectorAll('.ver-readout')].map((el, n) => {
    // the leader tube: glass shell (renders after what it refracts, like the
    // ring's), glow and core (layer 1: refracted by the glass)
    const tube = new THREE.Group();
    const glassGeo = leaderGeo(), glowGeo = leaderGeo(), coreGeo = leaderGeo();
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.renderOrder = 10;
    const glow = new THREE.Mesh(glowGeo, leaderGlowMat);
    const core = new THREE.Mesh(coreGeo, leaderCoreMat);
    glow.layers.enable(1);
    core.layers.enable(1);
    for (const m of [glass, glow, core]) m.frustumCulled = false; // moved every frame by hand
    tube.add(glass, glow, core);
    scene.add(tube);
    return {
      el, tube, glassGeo, glowGeo, coreGeo,
      dx: el.classList.contains('is-right') ? 1 : -1,
      tick: parseFloat(el.dataset.tick) || TICK, // per-label overrides
      run: parseFloat(el.dataset.run) || RUN,
      angle: THREE.MathUtils.degToRad(parseFloat(el.dataset.angle) || 0),
      w: 0, h: 0, d: '',
    };
  }) : [];
  const co = { on: false, offX: 0, offY: 0, tubePx: 0 };
  // Cache the ring canvas's position in the box, the tube's radius in px and
  // each label's size (only change on resize), so frames don't read layout.
  // Offsets, not on-screen rects: the popup opens with a scale-up animation
  // that would skew them.
  function layoutCallouts() {
    // the canvas is centered on #ver-ico-wrap horizontally, and its top sits
    // view.topExt above the wrap's center (see resize()); jointAt() needs
    // these too, so they're kept even when the callouts are hidden
    co.offX = wrap.offsetLeft + wrap.clientWidth / 2 - view.w / 2;
    co.offY = wrap.offsetTop + wrap.clientHeight / 2 - view.topExt;
    // lines start at the joints' collar (its widest radius is 1.33 tube radii)
    co.tubePx = 1.4 * S.tube * view.ringPx / (2 * R);
    co.on = callouts.length > 0 && getComputedStyle(calloutSvg).display !== 'none';
    for (const c of callouts) c.tube.visible = co.on;
    if (!co.on) return;
    for (const c of callouts) c.d = '';
  }
  const cp = new THREE.Vector3();
  // a point on the ring (angle around its plane) → px in the popup box
  function ringPointPx(angle, out) {
    cp.set(R * Math.cos(angle), R * Math.sin(angle), 0);
    group.localToWorld(cp).project(camera);
    out.x = co.offX + (cp.x + 1) / 2 * view.w;
    out.y = co.offY + (1 - cp.y) / 2 * view.h;
    return out;
  }
  const pA = { x: 0, y: 0 }, pB = { x: 0, y: 0 }, pC = { x: 0, y: 0 };
  const jw = new THREE.Vector3(), jw2 = new THREE.Vector3(), ew = new THREE.Vector3(), hw = new THREE.Vector3();
  // px in the popup box, at a given NDC depth → world point
  function toWorld(px, py, zN, out) {
    return out.set(((px - co.offX) / view.w) * 2 - 1, 1 - ((py - co.offY) / view.h) * 2, zN).unproject(camera);
  }
  function updateCallouts() {
    if (!co.on) return;
    group.updateMatrixWorld();
    cp.set(0, 0, 0);
    group.localToWorld(cp).project(camera); // ring center, to know which way is "out"
    pC.x = co.offX + (cp.x + 1) / 2 * view.w;
    pC.y = co.offY + (1 - cp.y) / 2 * view.h;
    for (const c of callouts) {
      const a = c.angle + ring.rotation.z;  // the joint, wherever the ring has rocked it
      ringPointPx(a, pA);
      ringPointPx(a + 0.02, pB);             // a hair along the ring → its tangent
      let tx = pB.x - pA.x, ty = pB.y - pA.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      let nx = -ty, ny = tx;                 // normal…
      if (nx * (pA.x - pC.x) + ny * (pA.y - pC.y) < 0) { nx = -nx; ny = -ny; } // …pointing outward
      const sx = pA.x + nx * co.tubePx, sy = pA.y + ny * co.tubePx;         // tube's outer surface
      // phones (Status D): a short tick and run, like desktop's shape at the smaller size
      const tick = PHONE.matches ? 7 : c.tick, run = PHONE.matches ? 32 : c.run;
      const ex = sx + nx * tick, ey = sy + ny * tick;                     // out from the ring
      const hx = ex + c.dx * run;                                         // elbow run to the label
      const d = `M${sx.toFixed(1)} ${sy.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}H${hx.toFixed(1)}`;
      if (d === c.d) continue; // ring hasn't moved: leave everything alone
      c.d = d;
      // the tube in 3D: from the joint's center (inside its collar) to the
      // elbow and the label end, both at the joint's depth so it projects
      // onto exactly this screen path
      jw.set(R * Math.cos(a), R * Math.sin(a), 0);
      group.localToWorld(jw);
      const zN = jw2.copy(jw).project(camera).z;
      toWorld(ex, ey, zN, ew);
      toWorld(hx, ey, zN, hw);
      const path3 = [jw, ew, hw];
      // same on-screen thickness for every leader: front joints are nearer
      // the camera, so their tubes get a proportionally thinner radius
      const r = LEADER_R * (PHONE.matches ? 0.62 : 1) * (camera.position.distanceTo(jw) / D);
      setLeaderGeo(c.glassGeo, path3, r);
      setLeaderGeo(c.glowGeo, path3, r * 0.78);
      setLeaderGeo(c.coreGeo, path3, r * 0.26);
      // anchored by the edge facing the line and centered on it, in % of the
      // label's own size, so labels whose text changes (RENDER's fps, the
      // location arriving) stay clear of the line without re-measuring
      // phones: the reading sits on the run's outer end and reads inward, above
      // the line for the upper joints and below it for the lower ones (Status D)
      if (PHONE.matches) {
        const up = ey < pC.y;
        c.el.style.transform = `translate(${hx.toFixed(1)}px, ${ey.toFixed(1)}px) translate(${c.dx > 0 ? -100 : 0}%, ${up ? 'calc(-100% - 5px)' : '5px'})`;
        continue;
      }
      const lx = c.dx > 0 ? hx + GAP : hx - GAP;
      c.el.style.transform = `translate(${lx.toFixed(1)}px, ${ey.toFixed(1)}px) translate(${c.dx > 0 ? 0 : -100}%, -50%)`;
    }
  }

  // ── The visitor's machine ("Node connected") ─────────────────────────
  // Real details of the computer looking at the page, read locally from the
  // browser just to display them — nothing is sent anywhere.
  const node = { os: '', browser: '', screen: '', cores: '', gpu: '', link: '' };
  const roNodeState = box.querySelector('[data-ro="node-state"]');
  const roDevice = box.querySelector('[data-ro="device"]');
  const roDevice2 = box.querySelector('[data-ro="device2"]');
  function paintNode() {
    // phones: just "Node" (Status D)
    if (roNodeState) roNodeState.textContent = navigator.onLine === false ? 'Node offline' : PHONE.matches ? 'Node' : 'Node connected';
    if (roDevice) roDevice.textContent = [node.os, node.browser].filter(Boolean).join(' · ') || 'Unknown node';
    if (roDevice2) roDevice2.textContent = [node.screen, node.cores].filter(Boolean).join(' · ');
  }
  (function readNode() {
    const ua = navigator.userAgent;
    // OS
    if (/Windows NT/.test(ua)) node.os = 'Windows';
    else if (/iPhone|iPad|iPod/.test(ua)) node.os = 'iOS';
    else if (/Mac OS X/.test(ua)) node.os = 'macOS';
    else if (/Android/.test(ua)) node.os = 'Android';
    else if (/CrOS/.test(ua)) node.os = 'ChromeOS';
    else if (/Linux/.test(ua)) node.os = 'Linux';
    // Browser + major version (order matters: Edge/Opera also say "Chrome")
    for (const [re, name] of [
      [/Edg\/(\d+)/, 'Edge'], [/OPR\/(\d+)/, 'Opera'], [/CriOS\/(\d+)/, 'Chrome'],
      [/FxiOS\/(\d+)/, 'Firefox'], [/Firefox\/(\d+)/, 'Firefox'], [/Chrome\/(\d+)/, 'Chrome'],
      [/Version\/(\d+)[\d.]*.*Safari/, 'Safari'],
    ]) {
      const m = ua.match(re);
      if (m) { node.browser = `${name} ${m[1]}`; break; }
    }
    node.screen = `${screen.width}×${screen.height}`;
    if (navigator.hardwareConcurrency) node.cores = `${navigator.hardwareConcurrency} cores`;
    // GPU, from the ring's own WebGL context: "ANGLE (NVIDIA, NVIDIA GeForce
    // RTX 3060 (0x2504) Direct3D11 …)" → "NVIDIA GeForce RTX 3060"
    try {
      const g = renderer.getContext();
      const ext = g.getExtension('WEBGL_debug_renderer_info');
      let r = ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      r = r.replace('ANGLE Metal Renderer: ', '').replace(/\((R|TM)\)/g, '');
      const angle = r.match(/ANGLE \([^,]+,\s*(.+?)(?:\s*\(0x[0-9a-f]+\)|\s+(?:Direct3D|OpenGL|Vulkan)|,)/i);
      if (angle) r = angle[1];
      if (!/SwiftShader|llvmpipe|Software/i.test(r)) node.gpu = r.replace(/\s+/g, ' ').trim();
    } catch (e) { /* no GPU name exposed: skip it */ }
    // Network, where the browser reports it (Chromium)
    const c = navigator.connection;
    if (c && c.effectiveType) node.link = c.effectiveType.toUpperCase() + (c.downlink ? ` · ${c.downlink} Mbps` : '');
    paintNode();
    // Windows 10 and 11 share a user-agent string; Chromium can tell them apart
    const uad = navigator.userAgentData;
    if (node.os === 'Windows' && uad && uad.getHighEntropyValues) {
      uad.getHighEntropyValues(['platformVersion']).then(v => {
        const major = parseInt(v.platformVersion, 10);
        if (major >= 13) node.os = 'Windows 11'; else if (major > 0) node.os = 'Windows 10';
        paintNode();
      }).catch(() => {});
    }
  })();
  addEventListener('online', paintNode);
  addEventListener('offline', paintNode);

  // Return visits, remembered only in this browser (localStorage): counted
  // once per browser session (sessionStorage), with when the previous one
  // started. Shown under NODE and logged when the popup opens.
  const visit = (() => {
    const v = { n: 1, last: null };
    try {
      const saved = JSON.parse(localStorage.getItem('lsafar.node') || 'null');
      if (saved) { v.n = saved.n; v.last = saved.prev || null; }
      if (!sessionStorage.getItem('lsafar.session')) {
        v.n = saved ? saved.n + 1 : 1;
        v.last = saved ? saved.at : null;
        localStorage.setItem('lsafar.node', JSON.stringify({ n: v.n, at: new Date().toISOString(), prev: v.last }));
        sessionStorage.setItem('lsafar.session', '1');
      }
    } catch (e) { /* storage blocked: every visit is a first */ }
    return v;
  })();
  const roVisits = box.querySelector('[data-ro="visits"]');
  const visitText = () => (visit.n > 1 && visit.last ? `Visit ${visit.n} · last seen ${ago(visit.last)}` : 'First visit');

  // ── LOCATION: where the visitor's connection comes in ────────────────
  // From the status server (index.html → 'sitelink'): the city and country
  // Cloudflare places the request in (the country's code spelled out in
  // English: GB → United Kingdom), the round trip, and the Cloudflare data
  // centre that answered ("London, United Kingdom · 24 ms" / "via LHR edge").
  // Until it answers, or without it: a rough place from the browser's time
  // zone ("Europe/London" → London), with no numbers.
  // DISTANCE, its own callout: the visitor's distance to where the operator
  // last set the status from (the Worker sends only the rounded number;
  // 0 = same area) — "3,410 km / from operator"; "—" until known.
  const roLink = box.querySelector('[data-ro="link"]');
  const roLink2 = box.querySelector('[data-ro="link2"]');
  const roDist = box.querySelector('[data-ro="dist"]');
  const roDist2 = box.querySelector('[data-ro="dist2"]');
  let lastLink = null;
  const kmText = km => (km == null ? '' : km === 0 ? 'same area as operator' : `${km.toLocaleString('en-US')} km from operator`);
  (function linkFromTimeZone() {
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    const place = tz.includes('/') ? tz.split('/').pop().replace(/_/g, ' ') : '';
    if (roLink) roLink.textContent = place || 'Unknown';
  })();
  document.addEventListener('sitelink', e => {
    const { city, country, colo, ms, km } = e.detail;
    lastLink = e.detail;
    if (km != null) {
      if (roDist) roDist.textContent = km === 0 ? 'Same area' : `${km.toLocaleString('en-US')} km`;
      if (roDist2) roDist2.textContent = km === 0 ? 'as operator' : 'from operator';
    }
    let countryName = country;
    try { if (country) countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(country) || country; } catch (err) {}
    const place = [city, countryName].filter(Boolean).join(', ');
    if (roLink && place) roLink.textContent = `${place} · ${ms} ms`;
    if (roLink2) roLink2.textContent = colo ? `via ${colo} edge` : '';
  });

  // ── Live log ─────────────────────────────────────────────────────────
  // The last three entries of a small system log (time · level · message),
  // newest at the bottom. Two sources:
  //  - real events, logged the moment they happen: the session attaching
  //    (the visitor's real OS/browser), the status syncing from the Worker
  //    (with when it was last set), iCO pulses, the link dropping/returning,
  //    the tab coming back after being away;
  //  - background jobs in between, in a bursty rhythm: some type out and
  //    report a duration, some count progress, a few hit a snag (WARN) and
  //    recover. Their numbers build over the session instead of re-rolling.
  // Runs only while the popup is open; reduced motion: no typing/counting.
  const actLog = box.querySelector('#ver-activity .act-log');
  const actRows = [];
  if (actLog) for (let k = 0; k < 3; k++) {
    const row = document.createElement('div');
    row.className = 'act-row';
    row.innerHTML = '<span class="act-t"></span><span class="act-l"></span><span class="act-m"></span>';
    actLog.appendChild(row);
    actRows.push(row);
  }
  // LIVE: drawn exactly like ONLINE (etched.js), in the ring's blue.
  const liveBox = box.querySelector('#ver-activity .act-live');
  const LIVE_RGB = [0.45, 0.66, 1.0];
  function drawLiveBadge() {
    if (liveBox) etchedBadge(liveBox, { text: 'LIVE', rgb: LIVE_RGB, lit: true });
  }

  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const hex = n => Array.from({ length: n }, () => '0123456789abcdef'[rnd(0, 15)]).join('');
  const fmtMs = ms => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
  const logClock = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };
  const ago = iso => {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
  };

  // numbers that only grow over the session
  const tally = { frames: rnd(38000, 61000), registry: rnd(1180000, 1260000), uploads: rnd(300, 900) };

  let entries = [], typing = null, pushed = 0;
  function renderLog() {
    const show = entries.slice(-3);
    actRows.forEach((row, k) => {
      const e = show[k - (3 - show.length)];
      const [t, l, m] = row.children;
      row.style.visibility = e ? 'visible' : 'hidden';
      if (!e) return;
      t.textContent = e.time;
      l.textContent = e.level;
      l.className = 'act-l is-' + e.level.toLowerCase();
      m.textContent = e.shown;
      if (e === typing) m.insertAdjacentHTML('beforeend', '<span class="act-caret"></span>');
    });
  }
  function push(level, text, { type = false } = {}) {
    const e = { time: logClock(), level, text, shown: type && !reduceMotion ? '' : text };
    entries.push(e);
    if (entries.length > 12) entries.shift();
    pushed++;
    const newest = actRows[actRows.length - 1];
    if (newest) { newest.classList.remove('is-new'); void newest.offsetWidth; newest.classList.add('is-new'); }
    renderLog();
    return e;
  }
  const edit = (e, level, text) => { e.level = level; e.text = e.shown = text; renderLog(); };

  let jobTimer = 0, logRunning = false;
  const later = (fn, ms) => { jobTimer = setTimeout(fn, ms); };
  // type an entry out (uneven, readable); instant with reduced motion
  function typeOut(e, done) {
    if (reduceMotion) { done(); return; }
    typing = e;
    const step = () => {
      if (!logRunning) return;
      e.shown = e.text.slice(0, e.shown.length + rnd(1, 2));
      renderLog();
      if (e.shown.length < e.text.length) later(step, rnd(28, 55));
      else { typing = null; renderLog(); done(); }
    };
    step();
  }
  // count a progress entry up to `total` in uneven bursts
  function countUp(e, label, total, done) {
    let n = 0;
    const show = () => edit(e, 'INFO', `${label} · ${n.toLocaleString('en-US')} / ${total.toLocaleString('en-US')} (${Math.round(n / total * 100)}%)`);
    if (reduceMotion) { n = total; show(); done(); return; }
    const step = () => {
      if (!logRunning) return;
      n = Math.min(total, n + Math.ceil(total * (Math.random() * 0.14 + 0.02)));
      show();
      if (n < total) later(step, rnd(250, 700)); else done();
    };
    step();
  }

  // background jobs; each calls next() when finished
  const JOBS = [
    { w: 3, run(next) {                                     // progress
      const total = rnd(800, 2400);
      const e = push('INFO', 'Scanning frames', { type: true });
      typeOut(e, () => countUp(e, 'Scanning frames', total, () => {
        tally.frames += total;
        edit(e, 'OK', `Scanning frames · ${total.toLocaleString('en-US')} checked · ${tally.frames.toLocaleString('en-US')} total`);
        next();
      }));
    } },
    { w: 2, run(next) {                                     // flaky, then OK
      const text = 'Stranger test against registry';
      const e = push('INFO', text, { type: true });
      typeOut(e, () => {
        const flaky = Math.random() < 0.3;
        if (!flaky) {
          const ms = rnd(280, 900);
          later(() => { edit(e, 'OK', `${text} · 0 matches · ${fmtMs(ms)}`); next(); }, ms);
          return;
        }
        later(() => {
          edit(e, 'WARN', `${text} · timeout · retry 1/3`);
          const ms = rnd(900, 2200);
          later(() => { push('OK', `${text} · recovered · 0 matches · ${fmtMs(ms)}`); next(); }, ms);
        }, rnd(1200, 1800));
      });
    } },
    { w: 2, run(next) {                                     // pipeline job
      const job = hex(4), genes = Math.random() < 0.75 ? 4 : 3, ms = rnd(300, 1400);
      const e = push('INFO', `Scoring pipeline · job ${job}`, { type: true });
      typeOut(e, () => later(() => { edit(e, 'OK', `Scoring pipeline · job ${job} · ${genes}/4 genes matched · ${fmtMs(ms)}`); next(); }, ms));
    } },
    { w: 2, run(next) {                                     // semantic DNA
      const ms = rnd(400, 1600);
      const e = push('INFO', 'Semantic DNA · regeneration check', { type: true });
      typeOut(e, () => later(() => { edit(e, 'OK', `Semantic DNA · mark survived · sha ${hex(4)}…${hex(2)}`); next(); }, ms));
    } },
    { w: 2, run(next) {                                     // uploads, counted
      const total = rnd(12, 64);
      const e = push('INFO', 'Hashing uploads', { type: true });
      typeOut(e, () => countUp(e, 'Hashing uploads', total, () => {
        tally.uploads += total;
        edit(e, 'OK', `Hashing uploads · ${total} new · ${tally.uploads.toLocaleString('en-US')} indexed`);
        next();
      }));
    } },
    { w: 2, run(next) {                                     // registry sync, growing
      tally.registry += rnd(3, 48);
      const ms = rnd(150, 700);
      const e = push('INFO', 'Registry sync', { type: true });
      typeOut(e, () => later(() => { edit(e, 'OK', `Registry sync · ${tally.registry.toLocaleString('en-US')} marks · ${fmtMs(ms)}`); next(); }, ms));
    } },
    { w: 1, run(next) {                                     // detection stack
      const e = push('INFO', 'Detection stack · sweep', { type: true });
      typeOut(e, () => later(() => { edit(e, 'OK', `Detection stack · 0 anomalies · ${pick(['4 genes', 'all genes'])} green`); next(); }, rnd(300, 1000)));
    } },
    { w: 1, run(next) {                                     // the visitor's real GPU
      if (!node.gpu) return next();
      const e = push('INFO', `GPU link · ${node.gpu}`, { type: true });
      typeOut(e, () => later(() => { edit(e, 'OK', `GPU link · ${node.gpu} · ${fps() || 60} fps`); next(); }, rnd(200, 600)));
    } },
  ];
  const weighted = JOBS.flatMap(j => Array(j.w).fill(j));
  let lastJob = null;
  function nextJob() {
    if (!logRunning) return;
    // unhurried, time to read each line: a few seconds apart, now and then
    // a longer quiet stretch
    const r = Math.random();
    const gap = reduceMotion ? 6000 : r < 0.6 ? rnd(2500, 4000) : r < 0.9 ? rnd(4500, 7000) : rnd(8000, 12000);
    later(() => {
      let job;
      do { job = pick(weighted); } while (job === lastJob && JOBS.length > 1);
      lastJob = job;
      job.run(nextJob);
    }, gap);
  }

  // ── real events ──
  let lastStatus = null, statusLogged = false, lastPulse = 0, hiddenAt = 0;
  // one "Status sync" per opening (the page-load fetch and the fetch on open
  // would otherwise both log it); your own updates always log
  function logStatus(d) {
    const label = d.status[0].toUpperCase() + d.status.slice(1);
    if (d.source === 'update') { push('OK', `Status set · ${label} · by operator`); return; }
    if (statusLogged) return;
    statusLogged = true;
    push('INFO', `Status sync · ${label}${d.updated ? ' · set ' + ago(d.updated) : ''}`);
  }
  document.addEventListener('sitestatus', e => {
    lastStatus = e.detail;
    if (logRunning) logStatus(e.detail);
  });
  mount.addEventListener('click', () => {
    const now = performance.now();
    if (!logRunning || now - lastPulse < 2500) return; // throttled
    lastPulse = now;
    push('OK', `Pulse received from node · ack ${rnd(18, 64)} ms`);
  });
  addEventListener('offline', () => { if (logRunning) push('WARN', 'Link lost · retrying…'); });
  addEventListener('online', () => { if (logRunning) push('OK', `Link restored · ${rnd(20, 90)} ms`); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    const away = hiddenAt ? Math.round((Date.now() - hiddenAt) / 1000) : 0;
    hiddenAt = 0;
    if (logRunning && away >= 5) push('INFO', `Node idle ${pad2(Math.floor(away / 3600))}:${pad2(Math.floor(away / 60) % 60)}:${pad2(away % 60)} · resumed`);
  });
  // the window losing focus without the tab going hidden (another app,
  // another screen); tab switches are the idle line above
  let blurAt = 0;
  addEventListener('blur', () => {
    if (!logRunning) return;
    setTimeout(() => {
      if (document.hidden || document.hasFocus()) return;
      blurAt = Date.now();
      push('WARN', 'Focus lost · node looking away');
    }, 150);
  });
  addEventListener('focus', () => {
    if (!blurAt) return;
    const away = Math.max(1, Math.round((Date.now() - blurAt) / 1000));
    blurAt = 0;
    if (logRunning) push('OK', `Focus restored · ${away} s`);
  });

  function runActivity() {
    if (!actLog || logRunning) return;
    logRunning = true;
    entries = [];
    drawLiveBadge();
    if (roVisits) roVisits.textContent = visitText();
    typing = null;
    statusLogged = false;
    push('INFO', `Session attached · ${[node.os, node.browser].filter(Boolean).join(' / ') || 'visitor node'}`);
    // then, a line at a time, what's known about this visitor: their visit,
    // the status (the fresh fetch on open logs itself when it answers; if
    // it's slow or there's no status server, the last known one), their
    // distance to the operator, and the sections opened this session
    const trail = (window.__trail || []).map(s => s.name).filter((n, k, a) => n !== a[k - 1]).slice(-4);
    const intro = [
      () => push(visit.n > 1 ? 'OK' : 'INFO', visit.n > 1 && visit.last
        ? `Node recognised · visit ${visit.n} · last seen ${ago(visit.last)}` : 'New node registered · first visit'),
      () => { if (lastStatus && lastStatus.source !== 'update') logStatus(lastStatus); },
      () => { if (lastLink && lastLink.km != null) push('INFO', `Signal traced · ${kmText(lastLink.km).toLowerCase()}`); },
      () => { if (trail.length) push('INFO', `Trail · ${trail.join(' → ')}`); },
    ];
    const step = (k, wait) => later(() => {
      if (!logRunning) return;
      if (k >= intro.length) { nextJob(); return; }
      const before = pushed;
      intro[k]();
      step(k + 1, pushed === before ? 0 : 1800); // nothing to say: straight on
    }, wait);
    step(0, 1600);
  }
  function stopActivity() { logRunning = false; typing = null; clearTimeout(jobTimer); }

  // RENDER, ticking once a second while the popup is open: the frame rate
  // this popup is actually drawing at (frames counted in frame()) and its
  // current resolution scale, which drop on slower machines as the adaptive
  // quality steps down.
  const roRender = box.querySelector('[data-ro="render"]');
  let framesDrawn = 0, lastTick = 0, lastFps = 0;
  const fps = () => lastFps;
  const pad2 = n => String(n).padStart(2, '0');
  let roTimer = 0;
  function tickReadouts() {
    if (roRender) {
      const now = performance.now();
      if (lastTick) {
        const fps = Math.round(framesDrawn * 1000 / (now - lastTick));
        roRender.textContent = `${fps} fps · ${+pr.toFixed(2)}× res`;
        lastFps = fps;
      }
      framesDrawn = 0;
      lastTick = now;
    }
  }

  // ── Loop ─────────────────────────────────────────────────────────────
  // One full pass draws the whole ring under the iCO. Only when the front arc
  // crosses the iCO, a second pass draws the front half inside the iCO's box
  // (scissored, so only ~220×220px of fill) and copies it to #ver-ring-over.
  const frontPlane = [new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)];
  const NO_PLANES = [];
  let fpsCap = 60;           // 120/144Hz screens don't render extra frames
  const clock = new THREE.Clock();
  let time = 0, lastDraw = 0, raf = 0, running = false;
  let slowAcc = 0, slowSq = 0, slowN = 0, slowWarm = true; // adaptive quality; the first window after opening is warm-up
  let overShown = false;
  const TAU = Math.PI * 2;
  let ringRock = 0; // current rock angle, part of ring.rotation.z

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (ts - lastDraw < 1000 / fpsCap - 2) return;
    const interval = lastDraw ? ts - lastDraw : 16.7;
    lastDraw = ts;

    // If we can't hold ~40fps over ~2s, drop resolution a notch (down to 1×);
    // if it's still slow at 1×, drop to 30fps.
    // A steady ~30fps isn't the GPU struggling but the screen capping frames
    // (iPhone Low Power Mode): that dropped the ring to 1x on a 3x phone, soft
    // and jaggy. So a steady 30 keeps its resolution, and phones never go
    // below 1.5x even when they really are slow.
    slowAcc += interval; slowSq += interval * interval; slowN++;
    if (slowN >= 120) {
      const mean = slowAcc / slowN, sd = Math.sqrt(Math.max(0, slowSq / slowN - mean * mean));
      const capped = mean > 30 && mean < 36 && sd < 4;
      const floor = PHONE.matches ? Math.min(1.5, Math.min(devicePixelRatio || 1, 2)) : 1;
      if (mean > 25 && !capped && !slowWarm) {
        if (pr > floor) { pr = Math.max(floor, pr - 0.25); resize(); }
        else fpsCap = 30;
      }
      slowAcc = 0; slowSq = 0; slowN = 0; slowWarm = false;
    }

    const dt = Math.min(clock.getDelta(), 0.05);
    const m = reduceMotion ? 0.25 : 1;
    time += dt * m;
    U.uT.value = time;
    const ft = performance.now() * 0.001 - flashStart;
    U.uFlash.value = ft < 0 || ft > 1.2 ? 0 : Math.min(ft / 0.06, 1) * Math.exp(-ft * 4);

    par.x += (par.tx - par.x) * 0.05;
    par.y += (par.ty - par.y) * 0.05;
    const d2r = THREE.MathUtils.degToRad;
    group.rotation.x = -d2r(S.tilt) + par.y * 0.07;
    group.rotation.y = par.x * 0.12;
    group.rotation.z = d2r(S.roll);
    ring.rotation.z += d2r(S.spin) * dt * m;
    // gentle rock around its own axis (added on top of any spin)
    ring.rotation.z -= ringRock;           // undo last frame's rock…
    ringRock = d2r(S.rock) * Math.sin(time * 2 * Math.PI / S.rockPeriod);
    ring.rotation.z += ringRock;           // …and apply this frame's
    updateCallouts();

    orbPhase = (orbPhase + S.orb * TAU * dt * m) % TAU;
    orb.position.set(R * Math.cos(orbPhase), R * Math.sin(orbPhase), 0);
    U.uOrbU.value = (((orbPhase - ring.rotation.z) / TAU) % 1 + 1) % 1; // into the ring's own u

    // Status orb halo breathes (off when offline).
    const br = st.lit ? (reduceMotion ? 0 : Math.sin(time * 2.6)) : -1;
    dotHalo.scale.setScalar(haloBase * (1 + 0.18 * br));
    dotHaloMat.opacity = st.lit ? 0.6 + 0.25 * br : 0;

    // Glass: first render what it refracts (core, glow, orb) into glassRT,
    // like ico.js renders the plasma into bgRT before drawing the gem.
    U.uSide.value = 0;
    renderer.clippingPlanes = NO_PLANES;
    camera.layers.set(1);
    renderer.setRenderTarget(glassRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 0);
    camera.layers.set(0);

    if (frontCrossesIco()) {
      // The iCO's box within the canvas: yTop from the top (2D canvas),
      // yGl from the bottom (WebGL scissor).
      const s = view.ico, x = (view.w - s) / 2, yTop = view.topExt - s / 2, yGl = view.h - yTop - s;
      U.uSide.value = 1;
      renderer.clippingPlanes = frontPlane;
      renderer.setScissor(x, yGl, s, s);
      renderer.setScissorTest(true);
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
      overCtx.clearRect(0, 0, over.width, over.height);
      overCtx.drawImage(gl, x * pr, yTop * pr, s * pr, s * pr, 0, 0, over.width, over.height);
      if (!overShown) { over.hidden = false; overShown = true; }
    } else if (overShown) {
      over.hidden = true; overShown = false;
    }

    U.uSide.value = 0;
    renderer.clippingPlanes = NO_PLANES;
    renderer.render(scene, camera);
    framesDrawn++;
  }

  // ── Open / close ─────────────────────────────────────────────────────
  let isOpen = false;
  function start() {
    if (running || !isOpen || document.hidden) return;
    running = true; lastDraw = 0; clock.getDelta();
    slowAcc = 0; slowSq = 0; slowN = 0; slowWarm = true;   // opening frames are slow: don't judge them
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  new ResizeObserver(() => { if (isOpen) resize(); }).observe(box);

  // WebGL now draws the badge; CSS in index.html hides the plain version.
  badge.classList.add('gl');
  // Michroma (the label face) may arrive after first layout and change the text width.
  if (document.fonts) document.fonts.load(`400 9.5px "Michroma"`).then(() => { if (isOpen) resize(); }, () => {});

  // Switch the status orb and etched label live (index.html calls this after
  // it has updated the badge's text, e.g. when the status API answers).
  function setStatus(name) {
    st = STATUS[name] || STATUS.offline;
    dotMat.uniforms.uCol.value.fromArray(st.rgb);
    dotMat.uniforms.uLit.value = st.lit;
    dotHaloMat.color.setRGB(...st.rgb);
    if (isOpen) resize(); else if (view.ringPx) buildPill(); // label width may change
  }

  // Which joint (if any) is under a click: its angle around the ring in
  // degrees (45, 135, 225, 315 with four joints, as placed in build()), or -1. Used by the hidden
  // status gesture in index.html. Joints are ~20px wide; 16px of slack.
  function jointAt(clientX, clientY) {
    if (!isOpen || !view.ringPx) return -1;
    const br = box.getBoundingClientRect();
    const x = clientX - br.left, y = clientY - br.top;
    group.updateMatrixWorld();
    let best = -1, bestD = 16;
    for (let k = 0; k < S.joints; k++) {
      const deg = (360 / S.joints) * k + 180 / S.joints;
      ringPointPx(THREE.MathUtils.degToRad(deg) + ring.rotation.z, pA);
      const d = Math.hypot(pA.x - x, pA.y - y);
      if (d < bestD) { bestD = d; best = Math.round(deg); }
    }
    return best;
  }
  // The same brief ring flash the iCO click gives, as quiet feedback.
  function flash() { flashStart = performance.now() * 0.001; }

  window.icoRing = {
    setStatus,
    jointAt,
    flash,
    open() {
      isOpen = true;
      window.__icoPaused = false;
      lastTick = 0;   // fresh frame-rate window for this opening
      tickReadouts(); // real values before layout measures the labels
      clearInterval(roTimer);
      roTimer = setInterval(tickReadouts, 1000);
      stopActivity();
      runActivity();
      resize();
      start();
    },
    close() {
      isOpen = false;
      window.__icoPaused = true;
      clearInterval(roTimer);
      stopActivity();
      stop();
    },
  };
})();
