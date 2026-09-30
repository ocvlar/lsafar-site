/**
 * Menu orbs: the ME, WORK and EXPERIENCE icons as live WebGL orbs.
 *
 * Built and tuned in the "Menu Orbs" artifact, then ported here. Each orb is
 * a glass sphere (faint caustic water, dark navy band, blue rim, a rippling
 * ring portal at the bottom) around a subject:
 *   ME          EVE (eve-mesh.js) as a hologram
 *   WORK        a lite copy of ico.js's iCO (plasma + dispersion glass)
 *   EXPERIENCE  the 8 MB memory card
 *
 * Kept cheap on purpose:
 *   - one small WebGL renderer for all three, drawn at the icons' real size
 *     (about 100 css px, x2 on sharp screens) and copied into each icon's
 *     2D canvas; the iCO's refraction pass runs at a third of that;
 *   - 30 fps cap (the motion is slow; 60 looks the same);
 *   - nothing renders before the menu appears, while a panel or popup is
 *     open over it (the last frame stays), or while the tab is hidden;
 *   - reduced motion: one still frame, redrawn only when an icon lights up;
 *   - the PNG icons stay underneath as the fallback: they're only hidden
 *     after a first successful render, and come back if WebGL is lost.
 *
 * Classic script like ico.js and ring.js: reuses the page's global THREE (r128).
 */
(async function () {
  if (!window.THREE) return;
  const items = ['item-me', 'item-directed', 'item-exp'].map(id => document.getElementById(id));
  if (items.some(el => !el)) return;
  const boxes = items.map(el => el.querySelector('.icon-box'));
  const menuWrap = document.querySelector('.menu-wrap');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Render size: the orb's on-screen size (desktop ~101 px, phones 52 px) x DPR.
  const canvases = boxes.map(box => {
    const c = document.createElement('canvas');
    c.className = 'orb3d';
    c.setAttribute('aria-hidden', 'true');
    box.appendChild(c);
    return c;
  });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const cssSize = () => Math.max(...canvases.map(c => c.clientWidth)) || 101;
  // drawn at 2x and scaled down smoothly: small detail (the card's label) stays legible
  const RS = Math.min(320, Math.round(Math.max(cssSize(), 101) * DPR * 2));

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) { canvases.forEach(c => c.remove()); return; }
  renderer.setPixelRatio(1);
  renderer.setSize(RS, RS, false);
  renderer.setClearColor(0x000000, 0);

  // ── shared GLSL ──
  const NOISE = `
    vec3 hash3(vec3 p){
      p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
      return fract(sin(p)*43758.5453);
    }
    // distance between nearest and second-nearest moving cell points: thin at cell borders
    float cells(vec3 p, float t){
      vec3 i = floor(p), f = fract(p);
      float f1 = 8.0, f2 = 8.0;
      for (int x=-1; x<=1; x++) for (int y=-1; y<=1; y++) for (int z=-1; z<=1; z++){
        vec3 g = vec3(float(x),float(y),float(z));
        vec3 o = hash3(i+g);
        o = 0.5 + 0.42*sin(t + 6.2831*o);
        vec3 r = g + o - f;
        float d = dot(r,r);
        if (d < f1){ f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      return sqrt(f2) - sqrt(f1);
    }
    float caustic(vec3 p, float t){
      float a = 1.0 - smoothstep(0.0, 0.16, cells(p*2.3, t*0.55));
      float b = 1.0 - smoothstep(0.0, 0.12, cells(p*4.6 + 3.1, -t*0.7));
      return pow(a, 2.2)*0.9 + pow(b, 2.6)*0.3;
    }`;

  const VS = `
    varying vec3 vObj, vW, vN, vWN, vV;
    void main(){
      vObj = position;
      vec4 wp = modelMatrix * vec4(position,1.0);
      vW = wp.xyz;
      vWN = normalize(mat3(modelMatrix) * normal);
      vN = normalize(normalMatrix * normal);
      vec4 mv = viewMatrix * wp;
      vV = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;

  const haloTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const grd = g.createRadialGradient(64,64,0,64,64,64);
    grd.addColorStop(0,'rgba(255,255,255,1)'); grd.addColorStop(0.15,'rgba(255,255,255,0.7)');
    grd.addColorStop(0.4,'rgba(255,255,255,0.18)'); grd.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  })();

  // ── the orb every icon shares: water wall, ring portal + glow, front glass ──
  function makeOrb(opts) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(0, 0, 3.95);
    const U = { uT: { value: 0 }, uLit: { value: 0 }, uGlow: { value: new THREE.Vector3(0, -0.58, 0.1) } };
    const spin = new THREE.Group(); scene.add(spin);

    // inner far wall: deep water with moving caustics, brighter toward the glow
    const wall = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({
      uniforms: U, side: THREE.BackSide, vertexShader: VS,
      fragmentShader: NOISE + `
        uniform float uT, uLit; uniform vec3 uGlow;
        varying vec3 vObj, vW, vN, vWN, vV;
        void main(){
          float face = abs(dot(normalize(vN), normalize(vV)));
          float c = caustic(vObj, uT);
          float low = smoothstep(0.9, -0.9, vW.y);
          vec3 col = mix(vec3(0.014,0.03,0.07), vec3(0.1,0.21,0.42), low*0.8);   // navy-black into a soft blue haze, like the ECHO OS splash
          col += vec3(0.59,0.84,1.0) * c * 0.22 * (0.55 + 0.45*low) * (0.85 + 0.35*uLit);
          float g = exp(-pow(length(vW - uGlow*1.6), 2.0) * 2.2);
          col += vec3(0.45,0.8,1.0) * g * (0.36 + 0.2*uLit);
          col *= mix(0.46 + 0.29*uLit, 1.0, smoothstep(0.0, 0.55, face));   // edge darkening lifts on hover
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
    wall.renderOrder = 0; spin.add(wall);

    // bottom glow
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.material.color.setRGB(0.8, 0.9, 1.0);
    glow.scale.setScalar(0.55); glow.position.set(0, -0.64, 0.15); glow.renderOrder = 2;
    scene.add(glow);

    // ring portal under the subject: bright core with rings rippling out
    const portal = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uT, uLit; varying vec2 vUv;
        void main(){
          float r = length(vUv - 0.5) * 2.0;
          float rings = pow(0.5 + 0.5*sin(r*34.0 - uT*2.4), 10.0);
          float a = rings * (1.0 - r) * 0.32 + exp(-r*r*18.0) * 0.42;
          gl_FragColor = vec4(vec3(0.62,0.86,1.0) * a * (0.8 + 0.4*uLit), 1.0);
        }`,
    }));
    portal.rotation.x = -Math.PI/2 + 0.32; portal.position.set(0, -0.66, 0.1); portal.renderOrder = 1.5;
    spin.add(portal);

    // front glass: dark navy band inside a bright rim
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1.0, 96, 64), new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, vertexShader: VS,
      fragmentShader: NOISE + `
        uniform float uT, uLit;
        varying vec3 vObj, vW, vN, vWN, vV;
        void main(){
          vec3 N = normalize(vN), V = normalize(vV);
          float NdV = max(dot(N,V), 0.0);
          float e = 1.0 - NdV;
          // dark band inside the rim; on hover it fades and the rim widens, so the
          // orb's light runs straight into the halo instead of a dark ring
          float band = smoothstep(0.45, 0.8, e) * (1.0 - smoothstep(0.9, 0.99, e)) * (1.0 - 0.75*uLit);
          float rim = pow(smoothstep(0.82 - 0.06*uLit, 1.0, e), 2.0);
          float c = caustic(vObj*1.3 + 7.0, uT*0.8) * smoothstep(0.3, 0.85, e);
          vec3 col = vec3(0.0, 0.02, 0.08) * band
                   + vec3(0.72, 0.88, 1.0) * rim * (0.8 + 0.12*uLit)
                   + vec3(0.59, 0.84, 1.0) * c * 0.07;
          float a = band*0.5 + rim*0.9 + c*0.05;
          gl_FragColor = vec4(col / max(a, 0.001), clamp(a, 0.0, 1.0));
        }`,
    }));
    shell.renderOrder = 3; scene.add(shell);

    return { scene, camera, U, spin, glow, shell, lit: 0, hover: false, ...opts };
  }

  // ── ME: EVE ──
  // EVE from id-composer (models/ethereal/posed.glb): "Low Poly Female Base Mesh"
  // by Mesh-Base, https://sketchfab.com/mesh-base, CC BY 4.0 (credited on the page).
  // Positions are packed as 16-bit, normals as 8-bit, then base64.
  const EVE = window.EVE_MESH;   // eve-mesh.js
  // EVE's pose and finish, as set in the Menu Orbs artifact
  const EVE_DEFAULTS = { x: -0.1, y: 0.15, size: 1.28, facing: 282, lean: 1, tilt: 0, sway: 25, finish: 'holo' };
  function eveGeometry() {
    const raw = Uint8Array.from(atob(EVE.b), c => c.charCodeAt(0)).buffer;
    const q = new Uint16Array(raw, 0, EVE.n * 3);
    const nq = new Int8Array(raw, EVE.n * 6, EVE.n * 3);
    const idx = new Uint16Array(raw.slice(EVE.n * 9, EVE.n * 9 + EVE.i * 2));
    const pos = new Float32Array(EVE.n * 3), nrm = new Float32Array(EVE.n * 3);
    for (let k = 0; k < EVE.n * 3; k++) {
      const a = k % 3;
      pos[k] = EVE.min[a] + q[k] / 65535 * EVE.rng[a];
      nrm[k] = nq[k] / 127;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }
  function buildMe() {
    const o = makeOrb({ kind: 'me' });
    // chrome: a mirror finish reflecting a blue studio (bright horizon band,
    // dark floor, the portal's cyan glow below) plus the water's moving ripples
    const mat = new THREE.ShaderMaterial({
      uniforms: o.U,
      vertexShader: VS,
      fragmentShader: NOISE + `
        uniform vec3 uGlow; uniform float uT, uLit;
        varying vec3 vObj, vW, vN, vWN, vV;
        vec3 env(vec3 R){
          float y = R.y;
          vec3 sky = mix(vec3(0.22,0.38,0.62), vec3(0.05,0.1,0.22), smoothstep(0.1, 0.9, y));
          vec3 floor_ = mix(vec3(0.02,0.04,0.09), vec3(0.0,0.01,0.03), smoothstep(-0.1, -0.7, y));
          vec3 c = mix(floor_, sky, smoothstep(-0.12, 0.12, y));
          c += vec3(0.7,0.85,1.0) * exp(-abs(y - 0.12) * 9.0) * 0.8;          // horizon line
          c += vec3(0.5,0.7,1.0) * pow(max(dot(R, normalize(vec3(-0.6,0.6,0.5))), 0.0), 16.0) * 0.9; // key light
          c += vec3(0.3,0.8,1.0) * pow(max(-y, 0.0), 4.0) * 0.9;           // portal glow from below
          return c;
        }
        void main(){
          vec3 N = normalize(vWN);
          vec3 V = normalize(cameraPosition - vW);
          vec3 R = reflect(-V, N);
          float fres = 0.55 + 0.45 * pow(1.0 - max(dot(N, V), 0.0), 3.0);
          vec3 col = env(R) * fres * vec3(0.85, 0.92, 1.0);
          col += vec3(0.25,0.6,1.0) * caustic(R * 1.2, uT) * 0.08;         // water ripples in the reflection
          float fall = 1.0 / (1.0 + 2.5*dot(uGlow - vW, uGlow - vW));
          col += vec3(0.2,0.5,1.0) * pow(max(dot(N, normalize(uGlow*1.4 - vW)), 0.0), 2.0) * fall * (0.35 + 0.2*uLit);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    // hologram: iridescent film that shifts with the view, fine scanlines,
    // a slow bright band sweeping up, bright edges; additive so it glows
    const holo = new THREE.ShaderMaterial({
      uniforms: o.U, vertexShader: VS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      fragmentShader: `
        uniform float uT, uLit;
        varying vec3 vObj, vW, vN, vWN, vV;
        void main(){
          vec3 N = normalize(vN), V = normalize(vV);
          float NdV = abs(dot(N, V));
          float fres = pow(1.0 - NdV, 2.0);
          float hue = fract(dot(normalize(vWN), vec3(0.3, 0.5, 0.2)) + fres * 0.6 + uT * 0.05);
          vec3 irid = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
          irid = mix(irid, vec3(0.45, 0.8, 1.0), 0.58);
          float scan = 0.8 + 0.2 * sin(vW.y * 260.0 - uT * 6.0);
          float band = pow(1.0 - fract(vW.y * 1.2 - uT * 0.35), 18.0);
          float flicker = 0.94 + 0.06 * sin(uT * 37.0) * sin(uT * 13.0);
          vec3 col = irid * (0.3 + fres * 1.6) * scan + vec3(0.6, 0.9, 1.0) * band * 0.45;
          gl_FragColor = vec4(col * flicker * (0.95 + 0.25 * uLit), 1.0);
        }`,
    });
    if (!EVE) return o;   // no mesh data: the orb still renders, just empty
    const mesh = new THREE.Mesh(eveGeometry(), mat);
    mesh.quaternion.set(0, 0.9312653541564941, 0, 0.36434170603752136);   // the glb node's own rotation
    const inner = new THREE.Group(); inner.add(mesh);
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    mesh.position.sub(c);
    const fig = new THREE.Group(); fig.add(inner);
    mesh.renderOrder = 1;
    // lean (z) and tilt (x) sit outside the sway, so they stay put while she turns
    const lean = new THREE.Group(); lean.add(fig);
    o.spin.add(lean);
    const D2R = Math.PI / 180;
    o.eve = {
      P: Object.assign({}, EVE_DEFAULTS),
      setFinish(f) { this.P.finish = f; mesh.material = f === 'holo' ? holo : mat; mesh.renderOrder = f === 'holo' ? 2.2 : 1; },
    };
    o.tick = (t) => {
      const P = o.eve.P;
      fig.scale.setScalar(P.size / size.y);
      lean.position.set(P.x, P.y, 0);
      lean.rotation.set(P.tilt * D2R, 0, P.lean * D2R);
      fig.position.y = Math.sin(t*0.9)*0.02;
      fig.rotation.y = P.facing * D2R + Math.sin(t*0.3) * P.sway * D2R;
    };
    o.eve.setFinish(o.eve.P.finish);
    return o;
  }

  // ── WORK: the site's iCO (ico.js), lite ──
  // Same plasma + glass recipe as ico.js, cut down for a 100px icon:
  // plasma fbm 2 octaves (was 3) and 3 fbm calls (was 4), a 24×16 sphere
  // (was 48×48), and the refraction pass at a third of the resolution.
  const ICO_NOISE = `
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
    float fbm(vec3 p){float t=0.,a=.5,f=1.;for(int i=0;i<2;i++){t+=snz(p*f)*a;a*=.5;f*=2.;}return t;}`;

  function buildWork() {
    const o = makeOrb({ kind: 'work' });
    const rt = new THREE.WebGLRenderTarget(Math.round(RS / 3), Math.round(RS / 3), { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const gem = new THREE.Group();
    gem.scale.setScalar(0.56); gem.position.y = 0.06;
    o.spin.add(gem);

    const plasmaMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uCD: { value: new THREE.Color(0x0c1c55) }, uCM: { value: new THREE.Color(0x7a66d8) }, uCB: { value: new THREE.Color(0x98a6bf) } },
      vertexShader: `varying vec3 vPos,vN,vV;void main(){vPos=position;vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
      fragmentShader: ICO_NOISE + `
        uniform float uT; uniform vec3 uCD,uCM,uCB; varying vec3 vPos,vN,vV;
        void main(){
          vec3 p=vPos*0.65;
          vec2 q=vec2(fbm(p+vec3(0.,uT*.05,0.)), fbm(p+vec3(5.2,1.3,2.8)+uT*.05));
          float d=fbm(p+2.*vec3(q, q.x*0.5));
          float t=(d+.4)*.8;
          float alpha=smoothstep(0.05,.7,t);
          float side=smoothstep(-0.08,0.08,vPos.y+q.x*0.15);
          vec3 mainCol=mix(uCM,uCB,side);
          vec3 col=mix(uCD,mainCol,smoothstep(0.05,.5,t));
          col=mix(col,mainCol*1.15,smoothstep(.5,.8,t));
          col=mix(col,vec3(0.8,0.84,0.92),smoothstep(.85,1.,t));   // peaks stay silver, not white
          float f=dot(normalize(vN),normalize(vV));
          gl_FragColor=vec4(col*1.45, alpha*(.05+.95*(f+1.)*.5));
        }`,
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    });
    // soft dark halo behind the gem so it separates from the bright water
    const shade = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0x000000, transparent: true, depthWrite: false, opacity: 0.7 }));
    shade.scale.setScalar(2.9); shade.position.z = -0.9; shade.renderOrder = 1.55;
    gem.add(shade);
    const plasma = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 16), plasmaMat);
    plasma.renderOrder = 1.6;
    gem.add(plasma);

    // icosahedron with flat normals + barycentric coords, as in ico.js
    const geo = new THREE.IcosahedronGeometry(1.0, 0);   // r128: already non-indexed
    const pa = geo.attributes.position.array, na = new Float32Array(pa.length);
    for (let i = 0; i < pa.length; i += 9) {
      const ax=pa[i],ay=pa[i+1],az=pa[i+2],bx=pa[i+3],by=pa[i+4],bz=pa[i+5],cx=pa[i+6],cy=pa[i+7],cz=pa[i+8];
      let nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay), ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az), nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
      const l = Math.hypot(nx, ny, nz); nx/=l; ny/=l; nz/=l;
      for (let j = 0; j < 3; j++) { na[i+j*3]=nx; na[i+j*3+1]=ny; na[i+j*3+2]=nz; }
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(na, 3));
    const bary = new Float32Array(pa.length);
    for (let i = 0; i < pa.length; i += 9) { bary[i]=1; bary[i+4]=1; bary[i+8]=1; }
    geo.setAttribute('aBC', new THREE.BufferAttribute(bary, 3));

    const glassMat = new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 }, bgTex: { value: rt.texture }, res: { value: new THREE.Vector2(RS, RS) }, uRefr: { value: 0.1 }, uExpo: { value: 1.3 } },
      vertexShader: `
        attribute vec3 aBC; varying vec3 vN, vP, vBC;
        void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vP = mv.xyz; vBC = aBC; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `
        uniform float t, uRefr, uExpo; uniform sampler2D bgTex; uniform vec2 res;
        varying vec3 vN, vP, vBC;
        float fresnelSchlick(float c, float f0){ return f0 + (1.0-f0)*pow(clamp(1.0-c,0.0,1.0),5.0); }
        float ggx(float NdH, float r){ float a2=r*r; float d=NdH*NdH*(a2-1.0)+1.0; return a2/(3.14159*d*d+0.0001); }
        float specH(vec3 N, vec3 V, vec3 L, float r){ vec3 H=normalize(L+V); return ggx(max(dot(N,H),0.0),r)*max(dot(N,L),0.0); }
        float edgeFactor(){ vec3 d=fwidth(vBC); vec3 f=smoothstep(vec3(0.0), d*1.8, vBC); return 1.0-min(min(f.x,f.y),f.z); }
        void main(){
          vec3 N = gl_FrontFacing ? vN : -vN;
          vec3 V = normalize(-vP);
          float NdV = max(dot(N,V), 0.001);
          float edge = edgeFactor();
          float fresnel = fresnelSchlick(NdV, 0.04);
          vec2 uv = gl_FragCoord.xy / res;
          vec3 rR = refract(-V,N,1.0/1.47), rG = refract(-V,N,1.0/1.50), rB = refract(-V,N,1.0/1.53);
          vec3 refl = reflect(-V,N);
          if(length(rR)<0.001) rR=refl; if(length(rG)<0.001) rG=refl; if(length(rB)<0.001) rB=refl;
          float rs = uRefr*(1.0 + edge*0.3);
          vec3 refracted = vec3(
            texture2D(bgTex, clamp(uv + rR.xy*rs*1.04, 0.01, 0.99)).r,
            texture2D(bgTex, clamp(uv + rG.xy*rs, 0.01, 0.99)).g,
            texture2D(bgTex, clamp(uv + rB.xy*rs*0.96, 0.01, 0.99)).b);
          vec3 reflected = texture2D(bgTex, clamp(uv + refl.xy*uRefr*0.7, 0.01, 0.99)).rgb;
          float caustic = pow(max(dot(rG, vec3(0.0,0.0,-1.0)),0.0),4.0)*1.5;
          caustic *= 0.8 + 0.2*sin(t*2.0 + dot(N, vec3(1.7,2.3,0.5))*6.0);
          vec3 L1=normalize(vec3(-0.5,0.85,0.6)), L2=normalize(vec3(0.8,0.3,-0.5)), L3=normalize(vec3(0.0,-0.7,0.7));
          float spec = specH(N,V,L1,0.018)*0.55 + specH(N,V,L2,0.018)*0.30 + specH(N,V,L3,0.018)*0.20;
          spec = min(spec, 0.3);   // flat faces: keep a face lined up with a light from flashing white
          float rim = pow(1.0-NdV, 3.5);
          vec3 rimCol = vec3(0.6,0.66,0.9)*rim*0.65;
          float bevelSpec = edge*(0.3 + 0.5*pow(max(dot(reflect(-L1,N),V),0.0),16.0));
          vec3 bevelCol = vec3(0.75,0.82,1.0)*bevelSpec*0.9;
          vec3 col; float alpha;
          if (gl_FrontFacing) {
            col = refracted*(1.2+caustic*0.5)*(1.0-fresnel*0.5) + reflected*fresnel*0.45 + vec3(0.60,0.65,0.85)*fresnel*0.28
                + vec3(0.80,0.82,0.95)*spec + rimCol + bevelCol + refracted*caustic*0.35 + vec3(0.05,0.08,0.14)*rim*0.3;
            alpha = clamp(mix(0.32,0.85,fresnel) + spec*0.3 + edge*0.35 + caustic*0.1, 0.22, 0.97);
          } else {
            float iF = pow(1.0-NdV, 1.8);
            vec3 bR = refract(-V,N,1.5); if(length(bR)<0.001) bR=refl;
            vec3 back = texture2D(bgTex, clamp(uv + bR.xy*uRefr*0.6, 0.01, 0.99)).rgb;
            col = back*0.65 + reflected*iF*0.3 + vec3(0.10,0.30,0.48)*(1.0-iF)*0.35 + rimCol*0.4 + bevelCol*0.5;
            alpha = clamp(mix(0.18,0.60,iF) + edge*0.25, 0.12, 0.72);
          }
          gl_FragColor = vec4(col*uExpo, alpha);
        }`,
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
      extensions: { derivatives: true },
    });
    const ico = new THREE.Mesh(geo, glassMat);
    ico.renderOrder = 2.5;
    gem.add(ico);


    o.tick = (t) => {
      ico.rotation.set(0.28, 0.4 + t*0.24, 0);
      plasma.rotation.y = t*0.08;
      plasmaMat.uniforms.uT.value = t*0.78;
      glassMat.uniforms.t.value = t;
      gem.position.y = 0.06 + Math.sin(t*0.8)*0.02;
    };
    // two passes like ico.js: everything but the glass into the RT, then the glass reads it
    o.render = () => {
      ico.visible = false; o.shell.visible = false;
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear();
      renderer.render(o.scene, o.camera);
      renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 0);
      ico.visible = true; o.shell.visible = true;
      renderer.render(o.scene, o.camera);
    };
    return o;
  }

  // ── EXPERIENCE: the memory card ──
  function cardTexture() {
    // drawn at 2× so the label stays sharp when the card turns
    const W = 1280, H = 1800, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const paint = () => {
    g.clearRect(0, 0, W, H);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // traces, kept faint so the label reads over them
    g.strokeStyle = 'rgba(150,200,255,0.2)'; g.lineWidth = 5;
    for (let i = 0; i < 26; i++) {
      let x = 120 + rnd()*1040, y = 400 + rnd()*1120; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 3; k++) { if (rnd() < 0.5) x += (rnd()-0.5)*440; else y += (rnd()-0.5)*440; g.lineTo(x, y); }
      g.stroke(); g.fillStyle = 'rgba(170,215,255,0.3)'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill();
    }
    // contacts
    for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) {
      const x = 300 + k*114 + (r%2)*28, y = 100 + r*88;
      const gr = g.createRadialGradient(x-8, y-8, 2, x, y, 30);
      gr.addColorStop(0, '#fff3c4'); gr.addColorStop(0.5, '#d8b15a'); gr.addColorStop(1, '#6a4d18');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, 28, 0, 7); g.fill();
    }
    // label: bright white, thickened a touch (Michroma is thin), with a soft glow
    // sized for a ~100 px icon: big, heavy strokes; the two long lines are
    // narrowed (sx) because Michroma is so wide it would force them tiny
    const text = (str, px, x, y, align = 'center', fill = 'rgb(250,252,255)', sx = 1) => {
      g.save(); g.translate(x, y); g.scale(sx, 1);
      g.font = `400 ${px}px Michroma`; g.textAlign = align;
      g.shadowColor = 'rgba(150,205,255,0.5)'; g.shadowBlur = px * 0.1;
      g.lineJoin = 'round'; g.lineWidth = px * 0.09; g.strokeStyle = fill;
      g.fillStyle = fill; g.fillText(str, 0, 0); g.shadowBlur = 0; g.strokeText(str, 0, 0);
      g.restore();
    };
    const widthAt = (str, px) => { g.font = `400 ${px}px Michroma`; return g.measureText(str).width; };
    const w8 = widthAt('8', 300), wMB = widthAt('MB', 160);
    const gap = 56, x0 = (W - (w8 + gap + wMB)) / 2;
    text('8', 300, x0, 700, 'left');
    text('MB', 160, x0 + w8 + gap, 700, 'left');
    const SX = 0.74;
    const small = Math.floor(Math.min(150, (W * 0.94 / SX) / Math.max(widthAt('MEMORY CARD', 100), widthAt('DIGITAL ARCHIVE', 100)) * 100));
    text('MEMORY CARD', small, W/2, 910, 'center', 'rgb(250,252,255)', SX);
    text('DIGITAL ARCHIVE', small, W/2, 910 + small * 1.35, 'center', 'rgb(250,252,255)', SX);
    // L and S drawn apart with a small gap (canvas letterSpacing isn't everywhere yet)
    const wL = widthAt('L', 230), wS = widthAt('S', 230), gLS = 26, xL = (W - (wL + gLS + wS)) / 2;
    text('L', 230, xL, 1390, 'left');
    text('S', 230, xL + wL + gLS, 1390, 'left');
    text('SECURE DATA', 96, W/2, 1700, 'center', 'rgba(232,241,252,0.95)', SX);
    };
    paint();
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8;
    // If Michroma wasn't in yet (slow connection), the label was drawn in a
    // fallback font: redraw it once the font arrives.
    if (!document.fonts.check("40px 'Michroma'")) {
      document.fonts.load("40px 'Michroma'").then(() => { paint(); tex.needsUpdate = true; }, () => {});
    }
    return tex;
  }
  function buildExp() {
    const o = makeOrb({ kind: 'exp' });
    const w = 1.04, h = 1.46, r = 0.09;
    const s = new THREE.Shape();
    s.moveTo(-w/2 + r, -h/2); s.lineTo(w/2 - r, -h/2); s.quadraticCurveTo(w/2, -h/2, w/2, -h/2 + r);
    s.lineTo(w/2, h/2 - r); s.quadraticCurveTo(w/2, h/2, w/2 - r, h/2); s.lineTo(-w/2 + r, h/2);
    s.quadraticCurveTo(-w/2, h/2, -w/2, h/2 - r); s.lineTo(-w/2, -h/2 + r); s.quadraticCurveTo(-w/2, -h/2, -w/2 + r, -h/2);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 10 });
    geo.center();
    // a hologram like EVE: see-through glass with bright iridescent edges,
    // fine scanlines and the same slow band sweeping up; the label glows in it
    const card = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: Object.assign({ uTex: { value: cardTexture() }, uSize: { value: new THREE.Vector2(w, h) } }, o.U),
      vertexShader: VS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      fragmentShader: `
        uniform sampler2D uTex; uniform vec2 uSize; uniform float uT, uLit; uniform vec3 uGlow;
        varying vec3 vObj, vW, vN, vWN, vV;
        void main(){
          vec3 N = normalize(vN), V = normalize(vV);
          float NdV = abs(dot(N, V));
          float fres = pow(1.0 - NdV, 2.0);
          float hue = fract(dot(normalize(vWN), vec3(0.3, 0.5, 0.2)) + fres * 0.6 + uT * 0.05);
          vec3 irid = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
          irid = mix(irid, vec3(0.45, 0.8, 1.0), 0.58);
          float scan = 0.9 + 0.1 * sin(vW.y * 260.0 - uT * 6.0);   // half EVE's: a flat card shows every line
          float band = pow(1.0 - fract(vW.y * 1.2 - uT * 0.35 + 0.4), 18.0);
          float flicker = 0.94 + 0.06 * sin(uT * 37.0) * sin(uT * 13.0);
          vec2 uv = clamp(vec2(vObj.x / uSize.x + 0.5, vObj.y / uSize.y + 0.5), 0.0, 1.0);
          vec4 t = texture2D(uTex, uv);
          float ink = max(t.r, max(t.g, t.b)) * t.a;
          float face = (gl_FrontFacing && vObj.z > 0.055) ? 1.0 : 0.0;   // label on the front only
          vec3 col = irid * (0.07 + fres * 1.5);
          col += mix(irid, vec3(0.9, 0.97, 1.0), 0.8) * ink * face * 1.3;   // the label, bright enough to read over the water
          col = col * scan + vec3(0.6, 0.9, 1.0) * band * 0.14;   // the sweeping band, softer than on EVE
          // lit from the portal below: the bottom edge catches its light, fading upward
          float up = exp(-max(vW.y - uGlow.y, 0.0) * 5.0);
          col += vec3(0.45, 0.8, 1.0) * up * (0.05 + fres * 0.7) * (0.8 + 0.4 * uLit);
          gl_FragColor = vec4(col * flicker * (0.95 + 0.25 * uLit), 1.0);
        }`,
    }));
    // floats clear of the portal like the iCO (bottom edge ~0.2 above it), bobbing the same way
    card.scale.setScalar(0.74); card.renderOrder = 2.2;
    o.spin.add(card);
    o.tick = (t) => {
      card.rotation.y = Math.sin(t*0.5)*0.1; card.rotation.x = Math.sin(t*0.37)*0.04;
      card.position.y = 0.1 + Math.sin(t*0.8)*0.02;
    };
    return o;
  }


  // Michroma must be in before the memory card's label is drawn.
  try { await Promise.race([document.fonts.load("40px 'Michroma'"), new Promise(r => setTimeout(r, 2500))]); } catch (e) {}
  const orbs = [buildMe(), buildWork(), buildExp()];

  const fit = () => canvases.forEach(c => {
    const s = Math.round((c.clientWidth || 101) * DPR);
    if (s && c.width !== s) { c.width = c.height = s; }
  });
  fit();
  addEventListener('resize', fit);
  const ctxs = canvases.map(c => { const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; return x; });

  // Covered: a panel or popup is open over the menu (it's dimmed behind them).
  const MODALS = ['cert-modal', 'directed-modal', 'htb-modal', 'webpen-modal'].map(id => document.getElementById(id)).filter(Boolean);
  const covered = () =>
    !!document.querySelector('.info-panel.open, #ver-modal.open, #tri-modal.open') ||
    MODALS.some(m => m.style.display === 'flex');

  let lost = false;
  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault(); lost = true;
    boxes.forEach(b => b.classList.remove('has-orb3d'));   // back to the PNGs
  });

  let t = 0, last = 0, drawn = false;
  const FRAME_MS = 1000 / 30;
  function frame(now) {
    requestAnimationFrame(frame);
    if (lost || menuWrap.style.opacity !== '1') return;
    if (drawn && covered()) { last = now; return; }
    if (now - last < FRAME_MS - 2) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    if (!reduce) t += dt;

    let settling = false;
    orbs.forEach((o, i) => {
      const goal = items[i].matches(':hover') || items[i].classList.contains('selected') ? 1 : 0;
      const prev = o.lit;
      o.lit += (goal - o.lit) * Math.min(1, dt * 6 || 1);
      if (Math.abs(o.lit - goal) > 0.002) settling = true;
      o.changed = Math.abs(o.lit - prev) > 0.0005;
    });
    // reduced motion: a still frame, redrawn only while an icon lights up or dims
    if (reduce && drawn && !settling && !orbs.some(o => o.changed)) return;

    orbs.forEach((o, i) => {
      o.U.uT.value = t; o.U.uLit.value = o.lit;
      o.glow.material.opacity = 0.45 + 0.2 * o.lit;
      o.tick(t);
      if (o.render) o.render(); else renderer.render(o.scene, o.camera);
      const c = canvases[i];
      ctxs[i].clearRect(0, 0, c.width, c.height);
      ctxs[i].drawImage(renderer.domElement, 0, 0, c.width, c.height);
    });
    if (!drawn) { drawn = true; boxes.forEach(b => b.classList.add('has-orb3d')); }
  }
  requestAnimationFrame(frame);
})();
