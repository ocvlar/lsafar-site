/**
 * Menu arc as glass: the nav arc beside the menu orbs drawn as the Status
 * ring's glass tube (ring.js): a refracting glass shell over a soft glow and
 * a bright core. The hovered menu item lights the tube level with it, in place
 * of the old nav dot; otherwise the light inside stays even.
 *
 * index.html still works out the curve (_curvePts) and draws the arc's wide
 * blue glow on #nav-curve; this draws the tube on its own WebGL canvas laid
 * exactly over it. initNavCurve() calls window.arcGlass.build() whenever the
 * curve changes, and the arc's frame loop calls window.arcGlass.render(t).
 * Without WebGL nothing changes: the 2D arc draws as before.
 */
(() => {
  if (typeof THREE === 'undefined') return;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) { return; }
  const cvs = renderer.domElement;
  cvs.className = 'nav-curve nav-curve-glass';
  cvs.setAttribute('aria-hidden', 'true');
  renderer.setClearColor(0x000000, 0);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const scene = new THREE.Scene();
  // pixels 1:1 with the 2D arc's canvas; world y = -canvas y
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -50, 50);
  const rt = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });

  // the ring's palette (ring.js P.core / P.hot at its 0.75 saturation)
  const desat = (rgb, k) => { const l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]; return rgb.map(v => l + (v - l) * k); };
  const U = {
    uT: { value: 0 },
    uSelU: { value: 0 },    // where the hovered item's light sits, 0..1 along the tube
    uSelOn: { value: 0 },   // and how lit it is
    uColA: { value: new THREE.Vector3().fromArray(desat([0.39, 0.59, 1.0], 0.75)) },
    uColB: { value: new THREE.Vector3().fromArray(desat([0.78, 0.88, 1.0], 0.75)) },
  };

  const VERT = `
    varying vec2 vUv; varying vec3 vN;
    void main(){ vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  // along the arc: the ends fade out like the old arc
  const COMMON = `
    uniform float uT, uSelU, uSelOn; uniform vec3 uColA, uColB;
    varying vec2 vUv; varying vec3 vN;
    float facing(){ return abs(normalize(vN).z); }
    float ends(){ return smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x); }
    // the hovered item's light: a bright spot in the core with a long soft spill either side
    float selLight(float u){
      float h = u - uSelU;
      return uSelOn * (exp(-h * h * 1500.0) * 1.5 + exp(-h * h * 140.0) * 0.35);
    }
`;
  // additive light that leaves the canvas's alpha alone: plain AdditiveBlending
  // also adds to alpha, so where the glow fades out it would paint opaque black
  // over the page (the ring never shows this; it sits on the popup's dark box)
  const additive = {
    transparent: true, depthWrite: false, blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  };
  const coreMat = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VERT, ...additive,
    fragmentShader: COMMON + `
      void main(){
        float l = selLight(vUv.x);
        // the hover light: the site's deep blue, with an icier centre where it's brightest
        vec3 c = uColA * 0.5 + mix(vec3(0.2, 0.46, 1.0), vec3(0.55, 0.78, 1.0), clamp(l * 0.45, 0.0, 1.0)) * 2.6 * l;
        c *= (0.5 + 0.5 * facing()) * 0.6 * ends();
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const glowMat = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VERT, ...additive,
    fragmentShader: COMMON + `
      void main(){
        float l = selLight(vUv.x);
        vec3 c = uColA * 0.2 * 1.4 + vec3(0.16, 0.4, 1.0) * 1.6 * l;
        gl_FragColor = vec4(c * pow(facing(), 2.0) * 0.6 * ends(), 1.0);
      }`,
  });

  // ring.js's glassMat (itself ico.js's glass), for an orthographic view
  // (the view direction is straight out of the screen) and without the ring's
  // far-side dimming; the ends fade with the core
  const glassMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, { bgTex: { value: rt.texture }, res: { value: new THREE.Vector2(1, 1) }, uRefrPx: { value: 6 } }),
    transparent: true, depthWrite: false, vertexShader: VERT,
    // the canvas is premultiplied: the default blend also squares the alpha
    // (colour*a over alpha*a), which dims and roughens the tube's edge
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    fragmentShader: `
      uniform float uT, uRefrPx; uniform sampler2D bgTex; uniform vec2 res;
      varying vec2 vUv; varying vec3 vN;
      float fresnelSchlick(float c, float f0){ return f0 + (1.0 - f0) * pow(clamp(1.0 - c, 0.0, 1.0), 5.0); }
      float ggx(float NdH, float r){ float a2 = r*r; float d = NdH*NdH*(a2 - 1.0) + 1.0; return a2 / (3.14159*d*d + 0.0001); }
      float specHighlight(vec3 N, vec3 V, vec3 L, float r){ vec3 H = normalize(L + V); return ggx(max(dot(N, H), 0.0), r) * max(dot(N, L), 0.0); }
      void main(){
        vec3 N = normalize(vN);
        vec3 V = vec3(0.0, 0.0, 1.0);
        float NdV = max(dot(N, V), 0.001);
        float edge = pow(1.0 - NdV, 6.0) * 0.6;
        float fresnel = fresnelSchlick(NdV, 0.04);
        vec2 uv = gl_FragCoord.xy / res;
        vec2 px = vec2(uRefrPx) / res;
        vec3 refDirR = refract(-V, N, 1.0 / 1.47);
        vec3 refDirG = refract(-V, N, 1.0 / 1.50);
        vec3 refDirB = refract(-V, N, 1.0 / 1.53);
        vec3 reflDir = reflect(-V, N);
        float refrScale = 1.0 + edge * 0.3;
        vec3 refracted = vec3(
          texture2D(bgTex, clamp(uv + refDirR.xy * px * refrScale * 1.04, 0.001, 0.999)).r,
          texture2D(bgTex, clamp(uv + refDirG.xy * px * refrScale, 0.001, 0.999)).g,
          texture2D(bgTex, clamp(uv + refDirB.xy * px * refrScale * 0.96, 0.001, 0.999)).b);
        vec3 reflected = texture2D(bgTex, clamp(uv + reflDir.xy * px * 0.7, 0.001, 0.999)).rgb;
        float caustic = pow(max(dot(refDirG, vec3(0.0, 0.0, -1.0)), 0.0), 4.0) * 1.5;
        caustic *= 0.8 + 0.2 * sin(uT * 2.0 + dot(N, vec3(1.7, 2.3, 0.5)) * 6.0);
        vec3 L1 = normalize(vec3(-0.5, 0.85, 0.6));
        vec3 L2 = normalize(vec3(0.8, 0.3, -0.5));
        vec3 L3 = normalize(vec3(0.0, -0.7, 0.7));
        float rough = 0.018;
        float totalSpec = specHighlight(N, V, L1, rough) * 0.55 + specHighlight(N, V, L2, rough) * 0.30 + specHighlight(N, V, L3, rough) * 0.20;
        float rim = pow(1.0 - NdV, 3.5);
        vec3 rimCol = vec3(0.55, 0.58, 0.82) * rim * 0.40;
        float bevelSpec = edge * (0.3 + 0.5 * pow(max(dot(reflect(-L1, N), V), 0.0), 16.0));
        vec3 bevelCol = vec3(0.65, 0.70, 0.88) * bevelSpec * 0.45;
        vec3 interior = refracted * (1.2 + caustic * 0.5);
        vec3 intRefl = reflected * fresnel * 0.45;
        vec3 reflCol = vec3(0.60, 0.65, 0.85) * fresnel * 0.28;
        vec3 specCol = vec3(0.80, 0.82, 0.95) * totalSpec;
        vec3 causticCol = refracted * caustic * 0.35;
        vec3 tint = reflCol + specCol + rimCol + bevelCol + vec3(0.05, 0.08, 0.14) * rim * 0.3;
        tint = mix(vec3(dot(tint, vec3(0.2126, 0.7152, 0.0722))), tint, 0.75);
        vec3 col = interior * (1.0 - fresnel * 0.5) + intRefl + causticCol + tint;
        float alpha = clamp(mix(0.32, 0.85, fresnel) + totalSpec * 0.5 + edge * 0.35 + caustic * 0.1, 0.22, 0.97);
        // the glass fades out a little before the light inside it, so its
        // empty ends never show as a dark sleeve over the glow
        float e = smoothstep(0.05, 0.2, vUv.x) * smoothstep(0.95, 0.8, vUv.x);
        gl_FragColor = vec4(col, alpha * e * e);
      }`,
  });

  let meshes = [], ok = false, W = 0, H = 0, arcLen = [0];
  function build(cv, pts, w, h) {
    if (!cv || !pts || pts.length < 2) return;
    W = w; H = h;
    if (cvs.parentNode !== cv.parentNode || cvs.previousSibling !== cv) cv.after(cvs);
    cvs.style.left = cv.style.left; cvs.style.top = cv.style.top;
    // at least 2x: on a 1x screen the 8px tube's edge needs the supersampling
    const pr = Math.min(Math.max(devicePixelRatio || 1, 2), 3);
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H);
    rt.setSize(Math.round(W * pr), Math.round(H * pr));
    glassMat.uniforms.res.value.set(W * pr, H * pr);
    camera.left = 0; camera.right = W; camera.top = 0; camera.bottom = -H;
    camera.updateProjectionMatrix();
    meshes.forEach(m => { scene.remove(m); m.geometry.dispose(); });
    const step = Math.max(1, Math.floor(pts.length / 48));
    const v = [];
    for (let i = 0; i < pts.length; i += step) v.push(new THREE.Vector3(pts[i].x, -pts[i].y, 0));
    const last = pts[pts.length - 1];
    if (v[v.length - 1].y !== -last.y) v.push(new THREE.Vector3(last.x, -last.y, 0));
    const curve = new THREE.CatmullRomCurve3(v);
    // the tube's u runs by arc length; keep each curve point's share of it
    arcLen = [0];
    for (let i = 1; i < pts.length; i++) arcLen.push(arcLen[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = arcLen[arcLen.length - 1] || 1;
    arcLen = arcLen.map(d => d / total);
    document.documentElement.classList.add('arc-glass');   // hides the nav dot
    const r = innerWidth <= 768 ? 2.8 : 4.2;   // the tube's radius in px
    const shell = new THREE.Mesh(new THREE.TubeGeometry(curve, 200, r, 48, false), glassMat);
    const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, 200, r * 0.78, 24, false), glowMat);
    const core = new THREE.Mesh(new THREE.TubeGeometry(curve, 200, r * 0.26, 12, false), coreMat);
    shell.renderOrder = 10;
    glow.layers.enable(1); core.layers.enable(1);   // layer 1: what the glass refracts
    meshes = [shell, glow, core];
    scene.add(shell, glow, core);
    ok = true;
  }
  // sel: the curve point index of the hovered item's light; lit: 0..1
  function render(t, sel, lit) {
    if (!ok) return false;
    U.uT.value = reduceMotion.matches ? 0 : t;
    U.uSelU.value = arcLen[Math.max(0, Math.min(arcLen.length - 1, Math.round(sel || 0)))] || 0;
    U.uSelOn.value = lit || 0;
    camera.layers.set(1);
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
    camera.layers.set(0);
    renderer.setRenderTarget(null); renderer.clear(); renderer.render(scene, camera);
    return true;
  }
  window.arcGlass = { build, render, get ok() { return ok; } };
  // the curve may already exist when this loads
  if (typeof _curvePts !== 'undefined' && _curvePts.length && typeof _navArc !== 'undefined' && _navArc) {
    build(document.getElementById('nav-curve'), _curvePts, _navArc.W, _navArc.H);
  }
})();
