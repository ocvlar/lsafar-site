/**
 * ME: the neural corridor. The ME panel (#panel-me) is a window onto a
 * corridor of ghost-fibre neurons wired into one pathway; the camera flies
 * from chapter to chapter, each with its own asset (EVE, the Instagram glyph, DNA) above its
 * title. PREV / NEXT, the glass rail (the nav arc laid straight, arc-glass.js's
 * recipe), arrow keys, the wheel and a swipe move between chapters.
 *
 * Built on first open (nothing runs before then); renders only while the panel
 * is open. index.html calls window.meCorridor.open() / .close() from
 * openPanel / closePanel. Prototyped in the "ME Corridor" artifact.
 *
 * Credits: the neuron texture follows React Bits' "Ghost Fibers" (David Haz,
 * MIT + Commons Clause); the face is EVE's head and shoulders ("Low Poly Female
 * Base Mesh" by Mesh-Base, CC BY 4.0). See CREDITS.md.
 */
(() => {
  if (typeof THREE === 'undefined') return;
  let api = null;
  const build = () => {
/* ============================================================
   CHAPTERS — placeholders until the real ones are written
   ============================================================ */
const CHAPTERS = [
  // asset:'name' shows that chapter's object (see ASSETS)
  { index:'CHAPTER 01', name:'The Reboot',       asset:'bsod',
    blurb:"I dropped out of uni, a computer science degree, to go straight into cybersecurity. I already had the skills, and years of lectures felt like a waste of time. It was the middle of COVID, so I trained online through bug bounty programs and tested local businesses' security, helping them close the gaps I found. Along the way I earned CompTIA Security+ and worked toward CySA+, PenTest+ and CEH." },
  { index:'CHAPTER 02', name:'The Shift',         asset:'insta',
    blurb:"While studying for CySA+, I took over my brother's abandoned Instagram page for fun, sharing hidden gems from artists. It grew fast, and soon celebrities wanted commissions. Seeing my work on giant screens, giving thousands a feeling to vibe with, hooked me. I hired artists, built a team, and a community followed. Running it all alone wasn't scalable, but I loved it enough to leave cybersecurity for creating. Then AI arrived. Artists kept telling me they feared being replaced, so I set out to build something that embraces AI without leaving them behind." },
  { index:'CHAPTER 03', name:'The Semantic DNA',  asset:'dna',
    blurb:"Around 2024 I paused the agency side of Polyspheric. I kept serving clients quietly for a while, then referred them to someone else so I could build an actual solution full time. There were a lot of failed blueprints and prototypes, and the frustration grew, but I was determined to find a way for the creator's DNA to live inside the image itself. With AI growing like crazy, especially in design and characters, I wanted to solve ownership. I tested MIT-licensed models and ran a lot of manual generation experiments, until I recently automated them with AI agents." },
  { index:'CHAPTER 04', name:'In Progress',  asset:'fibreloader',
    blurb:"I had no experience setting up a company: incorporation, pitch decks, financial models, cap tables, investor outreach, accelerator applications. The internet taught me all of it. I've had embarrassing meetings where my demo broke mid-pitch, which only pushed me to improvise. Honestly, those moments still haunt me in my sleep. But Semantic DNA, the tech stack, all of it, keeps me determined to go again. This is where I am now. Building the future of IP and ownership in the age of AI." },
];

const TRAVEL_SECONDS = 4.6;   // transit time between chapters
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* seeded random: the corridor is grown the same way on every visit,
   so the layout can be tuned (change SEED to try another corridor) */
const SEED = 20261005;
const rand = (() => { let a = SEED >>> 0; return () => {
  a = (a + 0x6D2B79F5) >>> 0; let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}; })();

/* ============================================================
   SCENE
   ============================================================ */
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.034);

const panel = document.getElementById('me-corridor');
const PW = () => Math.max(1, panel.clientWidth), PH = () => Math.max(1, panel.clientHeight);
const camera = new THREE.PerspectiveCamera(58, PW()/PH(), 0.1, 900);
// Phones: the chapter's text block is tall in the narrow panel and would sit
// over the chapter's object, while the panel's top stayed empty. So the view
// is shifted up (an off-axis projection: same size, same perspective, the
// whole picture raised) and the object sits above its title.
const PHONE_VIEW = matchMedia('(max-width: 768px)');
const PHONE_LIFT = 0.3;   // NDC: about 15% of the panel's height
function project(){
  camera.updateProjectionMatrix();
  if (PHONE_VIEW.matches){
    camera.projectionMatrix.elements[9] = -PHONE_LIFT;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
}
project();

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'high-performance' });
renderer.setSize(PW(), PH(), false);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputEncoding = THREE.sRGBEncoding;
panel.insertBefore(renderer.domElement, panel.firstChild);

/* ============================================================
   THE PATH — a long wandering spine through the dark
   ============================================================ */
const SPINE_PTS = [];
const SPAN = 420;
for (let i = 0; i <= 26; i++){
  const t = i/26;
  SPINE_PTS.push(new THREE.Vector3(
    Math.sin(t*Math.PI*2.4)*34 + Math.sin(t*Math.PI*7.1)*9,
    Math.cos(t*Math.PI*1.9)*22 + Math.sin(t*Math.PI*5.3)*7,
    -t*SPAN
  ));
}
const spine = new THREE.CatmullRomCurve3(SPINE_PTS, false, 'catmullrom', 0.5);

const FRAME_N = 900;
const frames  = spine.computeFrenetFrames(FRAME_N, false);
const framePts = [];
for (let i=0;i<=FRAME_N;i++) framePts.push(spine.getPointAt(i/FRAME_N));

function frameAt(u){
  const i = Math.min(FRAME_N, Math.max(0, Math.round(u*FRAME_N)));
  return { p:framePts[i], n:frames.normals[Math.min(i,FRAME_N-1)], b:frames.binormals[Math.min(i,FRAME_N-1)] };
}
/* hard-cleared travel channel: nothing at all may sit inside this radius */
const CHANNEL_R = 8.5;

function distToPath(p){
  let u = -p.z / SPAN;
  u = u < 0 ? 0 : (u > 1 ? 1 : u);
  const i = Math.round(u*FRAME_N);
  let best = Infinity;
  const lo = Math.max(0, i-14), hi = Math.min(FRAME_N, i+14);
  for (let k=lo;k<=hi;k++){
    const d = framePts[k].distanceToSquared(p);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function offsetPoint(u, angle, radius){
  const f = frameAt(u);
  return f.p.clone()
    .add(f.n.clone().multiplyScalar(Math.cos(angle)*radius))
    .add(f.b.clone().multiplyScalar(Math.sin(angle)*radius));
}

/* chapter stops along the path: a fixed spacing, so removing or adding a
   chapter leaves the others (and their framing and assets) where they are */
const STOP_GAP = 0.195;
const STOPS = CHAPTERS.map((_,i)=> 0.11 + i * STOP_GAP);

/* fibres bow outward near a node so the iCO reads clearly */
function clearance(u){
  let m = 1;
  for (const s of STOPS){
    const d = Math.abs(u - s);
    if (d < 0.055) m = Math.max(m, 1 + (1 - d/0.055) * 2.6);
  }
  return m;
}

/* ============================================================
   NEURAL TISSUE
   volumetric somata -> tapered dendrite tubes -> myelinated axons
   ============================================================ */
/* additive light that leaves the canvas's alpha alone (as arc-glass.js):
   on the transparent canvas the glow simply adds over the frosted glass */
const ADD_LIGHT = { transparent:true, depthWrite:false, blending:THREE.CustomBlending,
  blendSrc:THREE.SrcAlphaFactor, blendDst:THREE.OneFactor,
  blendSrcAlpha:THREE.ZeroFactor, blendDstAlpha:THREE.OneFactor };

const fiberGroup = new THREE.Group();
scene.add(fiberGroup);

const FOG_COLOR   = new THREE.Color(0x000000);
const FOG_DENSITY = 0.034;

const C_DEEP   = new THREE.Color(0x0a1f31);   // shadowed tissue
const C_MID    = new THREE.Color(0x2b62b8);
const C_BRIGHT = new THREE.Color(0xa8e2ff);   // lit membrane
const C_WARM   = new THREE.Color(0xe6f6ff);

/* ---------- tapered tube geometry ---------- */
function taperedTube(curve, r0, r1, tubSeg, radSeg, beads, amp){
  const frames = curve.computeFrenetFrames(tubSeg, false);
  const pos=[], nor=[], idx=[];
  const nv = new THREE.Vector3();
  for (let i=0;i<=tubSeg;i++){
    const u = i/tubSeg;
    const P = curve.getPoint(u);
    const k = Math.min(i, tubSeg-1);
    const N = frames.normals[k], B = frames.binormals[k];
    let r = r0 + (r1-r0)*u;
    if (beads){                                  // varicosities: beads of cytoplasm
      const ph = (r0*53.0 + r1*17.0);
      r *= 1.0 + amp*Math.sin(u*Math.PI*beads + ph);
    }
    for (let j=0;j<=radSeg;j++){
      const v = j/radSeg*Math.PI*2;
      nv.set(0,0,0).addScaledVector(N, Math.cos(v)).addScaledVector(B, Math.sin(v)).normalize();
      pos.push(P.x+nv.x*r, P.y+nv.y*r, P.z+nv.z*r);
      nor.push(nv.x, nv.y, nv.z);
    }
  }
  for (let i=0;i<tubSeg;i++){
    for (let j=0;j<radSeg;j++){
      const a=i*(radSeg+1)+j, b=a+radSeg+1, c=b+1, d=a+1;
      idx.push(a,b,d, b,c,d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(nor,3));
  g.setIndex(idx);
  return g;
}

/* ---------- tissue shader: solid, fog-dissolved, subsurface rim ---------- */
const FOG_CHUNK = `
  uniform vec3 uFogColor; uniform float uFogDensity;
  vec3 applyFog(vec3 col){
    float d = gl_FragCoord.z / gl_FragCoord.w;
    float f = 1.0 - exp(-uFogDensity*uFogDensity*d*d);
    return mix(col, uFogColor, clamp(f,0.0,1.0));
  }
`;
const LIGHT_N = 24;

/* a procedural environment to reflect — there is no envmap in here,
   so the glass gets its reflections from a cheap directional gradient */
const ENV_GLSL = `
  vec3 procEnv(vec3 d){
    float y  = d.y*0.5 + 0.5;
    vec3 lo  = vec3(0.001, 0.002, 0.004);
    vec3 mid = vec3(0.010, 0.024, 0.042);
    vec3 hi  = vec3(0.040, 0.082, 0.130);
    vec3 c   = mix(lo, mid, smoothstep(0.0, 0.55, y));
    c        = mix(c,  hi,  smoothstep(0.52, 1.0, y));
    float b1 = pow(max(dot(d, normalize(vec3( 0.4, 0.8, 0.3))), 0.0), 14.0);
    float b2 = pow(max(dot(d, normalize(vec3(-0.6, 0.3,-0.5))), 0.0), 20.0);
    c += vec3(0.20,0.34,0.50)*b1*0.22;
    c += vec3(0.12,0.22,0.44)*b2*0.14;
    return c;
  }
`;

/* the tissue as ghost fibres (after React Bits' "Ghost Fibers"): each tube
   reads as a thin bright line with a soft glow falling off to either side,
   never as a solid or an outline, and sways slowly like silk in water */
function tissueMaterial(deep, bright, gain){
  return new THREE.ShaderMaterial({
    uniforms:{
      uDeep:{value:deep.clone()}, uBright:{value:bright.clone()},
      uGain:{value:gain}, uTime:{value:0}, uCamPos:{value:new THREE.Vector3()},
      uRim:{value:new THREE.Color(0x4f86d8)},
      uFogColor:{value:FOG_COLOR.clone()}, uFogDensity:{value:FOG_DENSITY},
      uLightPos:{value:Array.from({length:LIGHT_N},()=>new THREE.Vector3(0,0,9999))},
      uLightCol:{value:Array.from({length:LIGHT_N},()=>new THREE.Color(0,0,0))}
    },
    vertexShader:`
      uniform float uTime;
      varying vec3 vW; varying vec3 vWN;
      void main(){
        vec3 p = position;
        // slow sway: the fibre drifts as a whole, a little more far from its anchor
        p += vec3(sin(p.z*0.21 + uTime*0.55), cos(p.x*0.19 + uTime*0.47), sin(p.y*0.23 + uTime*0.38)) * 0.16;
        vW  = p;
        vWN = normalize(normal);
        gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }`,
    fragmentShader:`
      uniform vec3 uDeep; uniform vec3 uBright; uniform float uGain; uniform float uTime;
      uniform vec3 uCamPos; uniform vec3 uRim; uniform float uFogDensity;
      uniform vec3 uLightPos[${LIGHT_N}];
      uniform vec3 uLightCol[${LIGHT_N}];
      varying vec3 vW; varying vec3 vWN;
      void main(){
        vec3 N = normalize(vWN);
        if (!gl_FrontFacing) N = -N;
        vec3 V = normalize(uCamPos - vW);
        // 1 along the line through the tube's middle, 0 at its silhouette
        float c = abs(dot(N, V));
        float core = pow(c, 10.0);                 // the thin bright line
        float glow = exp(-4.0 * (1.0 - c)) * 0.42; // its soft halo, like the fibres' exp(-falloff*d)

        // pulses travelling inside light the strand and its halo
        vec3 lit = vec3(0.0);
        for (int i=0;i<${LIGHT_N};i++){
          vec3  L = uLightPos[i] - vW;
          float d = length(L);
          if (d > 26.0) continue;
          float att = 1.0 / (1.0 + d*d*0.09);
          lit += uLightCol[i] * att * (0.35 + 0.65*pow(max(1.0 - d/26.0, 0.0), 2.0));
        }

        vec3 line = mix(uRim, uBright, 0.35);
        vec3 col = line * (core*1.5 + glow) * 1.6 + lit * (core*1.8 + glow*1.3);
        // a faint shimmer running along each strand
        col *= 0.86 + 0.14*sin(dot(vW, vec3(0.9, 0.7, 0.5)) - uTime*1.3);

        // far strands dissolve into the glass
        float dd = gl_FragCoord.z / gl_FragCoord.w;
        col *= exp(-uFogDensity*uFogDensity*dd*dd) * uGain;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side:THREE.DoubleSide, depthTest:true, ...ADD_LIGHT
  });
}

function sheenMaterial(tint, strength){
  return new THREE.ShaderMaterial({
    uniforms:{
      uTint:{value:tint.clone()}, uStrength:{value:strength},
      uCamPos:{value:new THREE.Vector3()}, uTime:{value:0},
      uFogColor:{value:FOG_COLOR.clone()}, uFogDensity:{value:FOG_DENSITY}
    },
    vertexShader:`
      varying vec3 vW; varying vec3 vWN;
      void main(){
        vW = position; vWN = normalize(normal);
        gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }`,
    fragmentShader:`
      uniform vec3 uTint; uniform float uStrength; uniform vec3 uCamPos; uniform float uTime;
      uniform vec3 uFogColor; uniform float uFogDensity;
      varying vec3 vW; varying vec3 vWN;
      ${ENV_GLSL}
      void main(){
        vec3 N = normalize(vWN);
        vec3 V = normalize(uCamPos - vW);
        float f = pow(1.0 - clamp(dot(N,V),0.0,1.0), 4.2);
        vec3 R = reflect(-V, N);
        vec3 col = mix(uTint, procEnv(R)*2.2, 0.55) * f * uStrength;
        float d = gl_FragCoord.z / gl_FragCoord.w;
        float fg = 1.0 - exp(-uFogDensity*uFogDensity*d*d);
        gl_FragColor = vec4(col * (1.0 - clamp(fg,0.0,1.0)), f*0.85);
      }`,
    blending:THREE.AdditiveBlending, transparent:true,
    depthWrite:false, depthTest:true, side:THREE.FrontSide
  });
}

/* Ghost-fibre neurons: each branch is a camera-facing ribbon carrying the
   Ghost Fibers texture (React Bits, David Haz): a broad soft glow band with
   fine, sharp threads weaving through it; the soma is a small swirl of the
   same fibres in polar form. Exposes window.GhostNeurons. */
(() => {
  const RIBBON_VS = `
    attribute vec3 tangent; attribute vec2 rib;      // rib.x = side (-1..1), rib.y = width
    attribute float along;                            // 0 at the soma end .. 1 at the tip
    attribute float seed; attribute float lfade; attribute float lum; attribute float ht;
    varying float vLum; varying float vHt;
    uniform float uTime; uniform float uWidthK; uniform float uDrift;
    varying float vL;
    varying vec2 vRib; varying float vAlong; varying float vSeed; varying float vDepth;
    void main(){
      vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;          // world space
      vec3 tw = normalize(mat3(modelMatrix) * tangent);
      // slow drift, like the fibres' wave term
      p += vec3(sin(p.y*0.35 + uTime*0.45 + seed), cos(p.z*0.31 + uTime*0.38 + seed*1.3), sin(p.x*0.33 + uTime*0.41)) * 0.18 * along * uDrift;
      vec3 toCam = normalize(cameraPosition - p);
      vec3 side = normalize(cross(tw, toCam));
      p += side * rib.x * rib.y * 0.5 * uWidthK;
      vRib = rib; vAlong = along; vSeed = seed; vL = lfade; vLum = lum; vHt = ht;
      vec4 mv = viewMatrix * vec4(p, 1.0);
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;
  const RIBBON_FS = `
    uniform float uTime; uniform vec3 uLine; uniform vec3 uGlow; uniform float uGain; uniform float uFog; uniform float uSweep;
    varying vec2 vRib; varying float vAlong; varying float vSeed; varying float vDepth; varying float vL; varying float vLum; varying float vHt;
    void main(){
      float v = vRib.x;                               // across the ribbon (-1..1)
      float u = vAlong * 9.0;                         // along it
      float t = uTime * 0.2;
      // velvet: a wide, faint glow reaching the ribbon's edge, gone by it
      float haze = exp(-2.6 * v * v) * (1.0 - v * v);
      // the threads live near the middle, weaving across each other
      float core = exp(-7.0 * v * v);
      vec3 col = uGlow * haze * 0.42;
      for (int i = 0; i < 3; i++){
        float fi = float(i) + 1.0;
        float x = v * (3.0 + fi * 1.6) + sin(u * (0.7 + fi * 0.3) + t * (1.0 + fi * 0.5) + vSeed * fi) * 0.9;
        float lines = pow(max(0.0, 1.0 - abs(sin(x))), 22.0);        // Ghost Fibers' fine line
        col += uLine * lines * core * 1.15 / fi;
        float glow = exp(-10.0 * abs(sin(x * 0.5 + t + fi)));       // and its soft band
        col += uGlow * glow * haze * 0.55 / (fi * 2.0);
      }
      // ends: fade in from the soma, fade out at the tip
      col *= smoothstep(0.0, 0.14, vAlong) * (1.0 - smoothstep(0.7, 1.0, vAlong)) * smoothstep(0.0, 0.3, vL);
      col *= vLum;                                    // the asset's own lighting (1 for the neurons)
      // a slow pass of light rising through a lit asset (off for the neurons)
      if (vHt >= 0.0 && uSweep > 0.0){
        float sw = fract(uTime * 0.07);
        col += mix(uGlow, uLine, 0.7) * exp(-pow((vHt - (sw*1.4 - 0.2)) * 9.0, 2.0)) * core * uSweep;
      }
      col = 1.0 - exp(-col * 1.6);                    // the same soft tone-map
      col *= uGain * exp(-uFog * uFog * vDepth * vDepth);
      col *= 0.25 + 0.75*smoothstep(7.0, 22.0, vDepth);   // the nearest strands drop back, out of focus
      gl_FragColor = vec4(col, 1.0);
    }`;
  // the velvet: the same strands drawn several times wider as a faint soft glow
  const HAZE_FS = `
    uniform vec3 uGlow; uniform float uGain; uniform float uFog; uniform float uHaze;
    varying vec2 vRib; varying float vAlong; varying float vDepth; varying float vL; varying float vLum;
    void main(){
      float v = vRib.x;
      float h = exp(-3.0 * v * v) * (1.0 - v * v);
      h *= smoothstep(0.0, 0.2, vAlong) * (1.0 - smoothstep(0.55, 1.0, vAlong)) * smoothstep(0.0, 0.3, vL);
      vec3 col = uGlow * h * uHaze * uGain * vLum * exp(-uFog * uFog * vDepth * vDepth);
      col *= 0.45 + 0.55*smoothstep(7.0, 22.0, vDepth);
      gl_FragColor = vec4(col, 1.0);
    }`;
  const SOMA_FS = `
    uniform float uTime; uniform vec3 uLine; uniform vec3 uGlow; uniform float uGain; uniform float uFog;
    varying vec2 vUv; varying float vDepth; varying float vSeed;
    mat2 rot(float a){ float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }
    void main(){
      vec2 uv = vUv * 2.0 - 1.0;
      float r0 = length(uv);
      if (r0 > 1.0) discard;
      float t = uTime * 0.2;
      // a slightly irregular cell outline, breathing very slowly
      float ang = atan(uv.y, uv.x);
      float edgeR = 0.42 + 0.035*sin(ang*3.0 + vSeed) + 0.02*sin(ang*5.0 - vSeed*1.7 + t);
      float inside = 1.0 - smoothstep(edgeR - 0.06, edgeR + 0.02, r0);
      float membrane = exp(-pow((r0 - edgeR) / 0.035, 2.0));
      // cytoplasm: the Ghost Fibers loop, faint, winding inside the body
      vec2 p = rot(t * 0.25 + vSeed) * uv * 2.4;
      float fib = 0.0;
      for (int i = 0; i < 3; i++){
        float fi = float(i) + 1.0;
        p += 0.015 * sin(p.yx * fi * 3.0 + t * (0.15 + fi * 0.08));
        float r = length(p), a = atan(p.y, p.x);
        a += sin(r * 5.0 - t * 1.2 + fi) * 0.3;
        p = vec2(cos(a), sin(a)) * r;
        fib += pow(max(0.0, 1.0 - abs(sin(p.x * (5.0 + fi * 2.0) + sin(p.y * 3.0 + t)))), 16.0) / fi;
      }
      // the nucleus: a soft brighter core, slightly off-centre
      vec2 nc = uv - vec2(0.05*sin(vSeed), 0.04*cos(vSeed*1.3));
      float nucleus = exp(-dot(nc, nc) * 60.0);
      vec3 col = uGlow * inside * 0.55
               + uLine * fib * inside * 0.35
               + mix(uGlow, uLine, 0.5) * membrane * 0.42
               + vec3(0.62, 0.8, 1.0) * nucleus * 0.55;
      // a faint halo just outside the membrane
      col += uGlow * exp(-pow(max(r0 - edgeR, 0.0) / 0.22, 2.0)) * (1.0 - inside) * 0.22;
      col = 1.0 - exp(-col * 1.5);
      col *= uGain * exp(-uFog * uFog * vDepth * vDepth);
      col *= 1.0 - smoothstep(38.0, 60.0, vDepth);   // a lone far-off soma would float in the middle of the view
      col *= 0.3 + 0.7*smoothstep(7.0, 22.0, vDepth);
      gl_FragColor = vec4(col, 1.0);
    }`;
  const SOMA_VS = `
    attribute float seed; attribute float size;
    varying vec2 vUv; varying float vDepth; varying float vSeed;
    void main(){
      vUv = uv; vSeed = seed;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      mv.xy += (uv - 0.5) * size;                     // camera-facing quad
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;

  // additive light that leaves the canvas's alpha alone (as arc-glass.js)
  const ADD = { transparent:true, depthWrite:false, depthTest:false, blending:THREE.CustomBlending,
    blendSrc:THREE.SrcAlphaFactor, blendDst:THREE.OneFactor, blendSrcAlpha:THREE.ZeroFactor, blendDstAlpha:THREE.OneFactor };

  function materials(opts){
    const U = {
      uTime:{value:0}, uGain:{value:opts.gain ?? 1}, uFog:{value:opts.fog ?? 0.03}, uWidthK:{value:1}, uHaze:{value:opts.haze ?? 0.16}, uDrift:{value:opts.drift ?? 1}, uSweep:{value:opts.sweep ?? 0},
      uLine:{value:new THREE.Color(opts.line ?? 0x7aa6e6)}, uGlow:{value:new THREE.Color(opts.glow ?? 0x15327f)},
    };
    return {
      U,
      ribbon:new THREE.ShaderMaterial({ uniforms:U, vertexShader:RIBBON_VS, fragmentShader:RIBBON_FS, side:THREE.DoubleSide, ...ADD }),
      haze:new THREE.ShaderMaterial({ uniforms:Object.assign({}, U, { uWidthK:{value:5.0} }), vertexShader:RIBBON_VS, fragmentShader:HAZE_FS, side:THREE.DoubleSide, ...ADD }),
      soma:new THREE.ShaderMaterial({ uniforms:U, vertexShader:SOMA_VS, fragmentShader:SOMA_FS, side:THREE.DoubleSide, ...ADD }),
    };
  }

  /* ribbon geometry for many curves at once: each curve [{pts, w0, w1, seed}] */
  function ribbons(list, segPerUnit){
    const pos=[], tan=[], rib=[], along=[], seed=[], lf=[], lm=[], hh=[], idx=[];
    let base = 0;
    list.forEach(c=>{
      const curve = new THREE.CatmullRomCurve3(c.pts);
      const len = curve.getLength();
      const n = Math.max(8, Math.round(len * (segPerUnit || 3)));
      for (let i=0;i<=n;i++){
        const u = i/n, P = curve.getPointAt(u), T = curve.getTangentAt(u);
        const a = c.a0 + (c.a1 - c.a0)*u;             // 'along' within the whole branch chain
        const w = c.w0 + (c.w1 - c.w0)*u;
        // optional per-point light and height, read along the original points
        const at = arr => { if (!arr) return null; const x = u*(arr.length-1), i0 = Math.floor(x), i1 = Math.min(arr.length-1, i0+1); return arr[i0] + (arr[i1]-arr[i0])*(x-i0); };
        const L = c.lum ? at(c.lum) : 1, Ht = c.ht ? at(c.ht) : -1;
        for (const sd of [-1, 1]){
          pos.push(P.x, P.y, P.z); tan.push(T.x, T.y, T.z);
          rib.push(sd, w); along.push(a); seed.push(c.seed); lf.push(c.daughter ? u : 1); lm.push(L); hh.push(Ht);
        }
        if (i < n){ const k = base + i*2; idx.push(k, k+1, k+2, k+1, k+3, k+2); }
      }
      base += (n+1)*2;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('tangent', new THREE.Float32BufferAttribute(tan,3));
    g.setAttribute('rib', new THREE.Float32BufferAttribute(rib,2));
    g.setAttribute('along', new THREE.Float32BufferAttribute(along,1));
    g.setAttribute('seed', new THREE.Float32BufferAttribute(seed,1));
    g.setAttribute('lfade', new THREE.Float32BufferAttribute(lf,1));
    g.setAttribute('lum', new THREE.Float32BufferAttribute(lm,1));
    g.setAttribute('ht', new THREE.Float32BufferAttribute(hh,1));
    g.setIndex(idx);
    return g;
  }
  function somaQuads(cells){
    const pos=[], uv=[], seed=[], size=[], idx=[];
    cells.forEach((c,i)=>{
      for (const [u,v] of [[0,0],[1,0],[1,1],[0,1]]){ pos.push(c.pos.x, c.pos.y, c.pos.z); uv.push(u,v); seed.push(c.seed); size.push(c.size); }
      const k = i*4; idx.push(k,k+1,k+2, k,k+2,k+3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
    g.setAttribute('seed', new THREE.Float32BufferAttribute(seed,1));
    g.setAttribute('size', new THREE.Float32BufferAttribute(size,1));
    g.setIndex(idx);
    return g;
  }

  /* one neuron as bundles of fine strands. each dendrite is a bundle that
     leaves the soma together (a bright trunk) and peels apart strand by strand,
     so it branches the way Ghost Fibers' lines splay: no joints, tips that
     taper to nothing. the axon is a thin bundle that fans out at its target. */
  function grow(rand, cell, out){
    const unit = () => { const z = rand()*2-1, a = rand()*Math.PI*2, r = Math.sqrt(1-z*z); return new THREE.Vector3(Math.cos(a)*r, z, Math.sin(a)*r); };
    const perp = v => { const p = unit().cross(v); return p.lengthSq() < 1e-6 ? new THREE.Vector3(1,0,0) : p.normalize(); };
    // a smooth flowing spine
    const spineOf = (start, dir, len, steps, curl) => {
      const pts = [start.clone()], d = dir.clone().normalize(), p = start.clone(), dirs = [d.clone()];
      for (let i=0;i<steps;i++){ d.addScaledVector(unit(), curl).normalize(); p.addScaledVector(d, len/steps); pts.push(p.clone()); dirs.push(d.clone()); }
      return { pts, dirs };
    };
    // strands that follow a spine, then peel off it
    const bundle = (sp, strands, w, spread, a0, a1, peelFrom, kind) => {
      const N = sp.pts.length - 1;
      for (let k=0;k<strands;k++){
        const peel = peelFrom + rand()*(1 - peelFrom)*0.8;          // where this strand leaves the bundle
        const off = perp(sp.dirs[0]).multiplyScalar(1);
        const drift = perp(sp.dirs[0]).applyAxisAngle(sp.dirs[0], rand()*Math.PI*2);
        const ph = rand()*6.28, tight = 0.08 + rand()*0.1;
        const pts = [];
        for (let i=0;i<=N;i++){
          const s = i/N;
          const away = Math.max(0, s - peel) / (1 - peel + 1e-3);
          const o = off.clone().applyAxisAngle(sp.dirs[i], ph + s*3.0).multiplyScalar(tight*w*(1 - 0.5*away));   // twisting inside the bundle
          o.addScaledVector(drift, spread * Math.pow(away, 1.35));
          drift.addScaledVector(unit(), 0.12 * away).normalize();
          pts.push(sp.pts[i].clone().add(o));
        }
        const fullLen = 1 - (rand() < 0.5 ? rand()*0.25 : 0);
        const cut = Math.max(3, Math.round(N * fullLen));
        out.push({ pts:pts.slice(0, cut+1), w0:w*(0.45 + rand()*0.25), w1:w*0.04, a0, a1:a0 + (a1 - a0)*fullLen, seed:rand()*10, kind });
      }
    };
    // a pyramidal cell: one long apical dendrite rising from the top of the soma
    // and opening into a tuft, shorter basal dendrites spreading from its base,
    // and a single thin axon leaving from the bottom
    const up = (cell.up || unit()).clone().normalize();
    const r0 = cell.size*0.2;                                   // where branches leave the body
    const apical = spineOf(cell.pos.clone().addScaledVector(up, r0), up, cell.reach*(1.4 + rand()*0.35), 16, 0.15);
    bundle(apical, 5, cell.width*1.0, cell.reach*0.45, 0, 1, 0.42 + rand()*0.12, 'dendrite');
    const basal = 4 + Math.floor(rand()*2);
    const ring = perp(up);
    for (let i=0;i<basal;i++){
      const d = ring.clone().applyAxisAngle(up, (i/basal)*Math.PI*2 + rand()*0.5)
        .multiplyScalar(0.85).addScaledVector(up, -0.3 - rand()*0.45).normalize();
      const sp = spineOf(cell.pos.clone().addScaledVector(d, r0), d, cell.reach*(0.85 + rand()*0.35), 12, 0.13);
      bundle(sp, 3, cell.width*0.8, cell.reach*0.32, 0, 1, 0.22 + rand()*0.15, 'dendrite');
    }
    if (cell.axonTo){
      // the axon: thin and single, leaving the base of the soma, then bending toward its target
      const base = cell.pos.clone().addScaledVector(up, -r0);
      const pts = [base.clone()], dirs = [], p = base.clone();
      const d = up.clone().negate();
      dirs.push(d.clone());
      for (let i=0;i<80;i++){
        const g = cell.axonTo.clone().sub(p), dist = g.length();
        if (dist < cell.reach*0.45) break;
        // steer harder the closer it gets, so it arrives instead of circling its target
        const pull = i < 3 ? 0.03 : Math.min(0.4, 0.08 + 2.5/dist);
        d.lerp(g.normalize(), pull).addScaledVector(unit(), 0.035).normalize();
        p.addScaledVector(d, 0.9); pts.push(p.clone()); dirs.push(d.clone());
      }
      if (pts.length > 4){
        out.push({ pts, w0:cell.width*0.32, w1:cell.width*0.24, a0:0.06, a1:0.82, seed:rand()*10, kind:'axon' });
        // terminal arbor: a few short twigs at the target
        const end = pts[pts.length-1], ed = dirs[dirs.length-1];
        for (let k=0;k<4;k++){
          const tw = spineOf(end, ed.clone().addScaledVector(unit(), 0.9).normalize(), cell.reach*0.32, 5, 0.25);
          out.push({ pts:tw.pts, w0:cell.width*0.22, w1:cell.width*0.04, a0:0.5, a1:1, seed:rand()*10, kind:'axon', daughter:true });
        }
      }
    }
  }

  window.GhostNeurons = { materials, ribbons, somaQuads, grow };
})();

/* ---------- neurons, drawn as ghost fibres ----------
   (GhostNeurons, above). cells sit around the corridor, never in it: any
   strand reaching the travel channel ends just short of it. */
const CORE_CLEAR = 12.0;
const WORLD_DOWN = new THREE.Vector3(0,-1,0);
const dendriteCurves = [];   // pulse paths, tip -> soma (dendrites carry signals inward)
const axonCurves     = [];   // pulse paths, soma -> terminals
const somata         = [];
const terminals      = [];
const GN = GhostNeurons.materials({ fog:0.021, gain:0.78, haze:0.12 });

function randUnit(){
  const z = rand()*2 - 1, a = rand()*Math.PI*2, r = Math.sqrt(1 - z*z);
  return new THREE.Vector3(Math.cos(a)*r, z, Math.sin(a)*r);
}
function placeCell(u, rMin, rMax, floorBias){
  const sp = spine.getPointAt(u), tan = spine.getTangentAt(u);
  const d = randUnit();
  if (rand() < floorBias) d.y = -Math.abs(d.y) - 0.7;
  d.addScaledVector(tan, -d.dot(tan)).normalize();       // across the path, not along it
  const r = Math.max(CORE_CLEAR + 2, (rMin + rand()*(rMax - rMin)) * (0.8 + 0.2*clearance(u)));
  return sp.clone().addScaledVector(d, r);
}
{
  /* one pathway: a single chain of cells, each cell's axon reaching the next,
     carrying the signal forward from chapter to chapter. it is threaded through
     two anchors per chapter, set from that chapter's own view: a near one off to
     the side in the upper half, and a far one receding toward the middle, so
     from every chapter the pathway visibly leads on ahead. sides alternate. */
  const HOLD_BACK = 0.040;                             // = APPROACH: where the camera stops
  const anchors = [], views = [];
  STOPS.forEach((st, si)=>{
    const cam = new THREE.PerspectiveCamera(58, 1.2, 0.1, 900);   // the desktop panel's proportions
    cam.position.copy(spine.getPointAt(st - HOLD_BACK));
    cam.lookAt(spine.getPointAt(st).addScaledVector(new THREE.Vector3(0,1,0), -2.5));
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    views.push(cam);
    const side = si % 2 ? 1 : -1;
    const at = (nx, ny, depth) => cam.position.clone().addScaledVector(
      new THREE.Vector3(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize(), depth);
    if (si === 0) anchors.push(at(side*0.95, 0.05, 6));    // the trail starts beside the first view
    anchors.push(at(side*0.62, 0.3, 24));
    anchors.push(at(side*0.26, 0.34, 52));
  });
  anchors.push(spine.getPointAt(0.995).addScaledVector(new THREE.Vector3(0,1,0), 14));
  /* keeping views tidy. Nothing here regrows anything (the same cells grow from the
     same seed); some are just not drawn:
     - a chapter's object stays clear (EVE in THE REBOOT, the loader in IN PROGRESS):
       a cell with a dendrite over it, in front or behind, is left out whole, and an
       axon over it is dropped whole, so no cut stubs or stray long lines remain
     - the cells right in front of THE REBOOT's camera (they only ever showed as long
       cut lines along its edge) are left out */
  const pq = new THREE.Vector3();
  const clearOf = [
    { v:views[0], centre:spine.getPointAt(STOPS[0]).add(new THREE.Vector3(0, 0.93*2.2, 0)), r:0.2 },      // EVE (her middle; she's slim)
    { v:views[STOPS.length - 1], centre:spine.getPointAt(STOPS[STOPS.length - 1]).add(new THREE.Vector3(0, -0.37*2.2, 0)), r:0.42 },   // the loader
  ];
  clearOf.forEach(c => { c.fwd = c.v.getWorldDirection(new THREE.Vector3()); c.at = c.centre.clone().project(c.v); });
  const overObject = q => clearOf.some(c => {
    const ahead = pq.copy(q).sub(c.v.position).dot(c.fwd);
    if (ahead < 1 || ahead > 160) return false;             // only what that view looks at
    pq.copy(q).project(c.v);
    return Math.hypot((pq.x - c.at.x)*1.2, pq.y - c.at.y) < c.r;
  });
  const firstFwd = views[0].getWorldDirection(new THREE.Vector3());
  const besideFirstCam = q => { const a = pq.copy(q).sub(views[0].position).dot(firstFwd); return a > -6 && a < 15; };
  const route = new THREE.CatmullRomCurve3(anchors, false, 'catmullrom', 0.5);
  const routeLen = route.getLength();
  const chain = [];
  const nearOnPath = p => { let best = Infinity, bp = framePts[0];
    framePts.forEach(q=>{ const d = q.distanceToSquared(p); if (d < best){ best = d; bp = q; } }); return bp; };
  for (let d = 0; d <= routeLen; d += 13.5){
    const pos = route.getPointAt(d / routeLen);
    pos.add(randUnit().multiplyScalar(1.5));
    // the trail never crosses the corridor: held out at its wall
    const c = nearOnPath(pos);
    if (pos.distanceTo(c) < CHANNEL_R + 6){
      const out = pos.clone().sub(c);
      if (out.lengthSq() < 1e-4) out.set(0, 1, 0);
      pos.copy(c).addScaledVector(out.normalize(), CHANNEL_R + 6);
    }
    // the apical dendrite points away from the corridor and a little upward
    const up = pos.clone().sub(nearOnPath(pos)).normalize().multiplyScalar(0.7).add(new THREE.Vector3(0, 0.6, 0)).add(randUnit().multiplyScalar(0.3)).normalize();
    const cell = { pos, up, far:false, size:5.5, width:1.5, reach:7, seed:rand()*10, axonIn:0, chain:true };
    chain.push(cell); somata.push(cell);
  }
  // each cell's axon runs to the next one down the line
  chain.forEach((c, i)=>{ if (i < chain.length-1) c.axonTo = chain[i+1].pos; });

  const list = [];
  somata.forEach(c => { const from = list.length; GhostNeurons.grow(rand, c, list); for (let i=from;i<list.length;i++) list[i].cell = c; });
  const kept = [];
  // a cell that would lose most of its branches to the corridor isn't drawn at all
  somata.forEach(c => { c.left = list.filter(st => st.cell === c && st.pts.findIndex(q => distToPath(q) < CHANNEL_R) === -1).length; });
  // keeping views tidy (above): whole cells out, whole axons out
  list.forEach(st => { if (st.kind !== 'axon' && st.pts.some(overObject)) st.cell.left = 0; });
  somata.forEach(c => { if (overObject(c.pos) || besideFirstCam(c.pos)) c.left = 0; });
  const shown = somata.filter(c => c.left >= 6);
  let dropTwigs = false;
  list.forEach(st=>{
    if (st.cell.left < 6) return;
    // an axon over a chapter's object is dropped whole, with the twigs at its end
    if (st.kind === 'axon' && !st.daughter) dropTwigs = st.pts.some(overObject);
    if (st.kind === 'axon' && dropTwigs) return;
    const cut = st.pts.findIndex(q => distToPath(q) < CHANNEL_R);
    if (cut !== -1 && cut < 4) return;
    if (cut !== -1){
      const f = cut / (st.pts.length - 1);
      st.a1 = st.a0 + (st.a1 - st.a0)*f; st.w1 = st.w0 + (st.w1 - st.w0)*f;
      st.pts = st.pts.slice(0, cut);
    }
    kept.push(st);
    const curve = new THREE.CatmullRomCurve3(st.pts);
    if (st.kind === 'axon') axonCurves.push(curve);
    else dendriteCurves.push(new THREE.CatmullRomCurve3(st.pts.slice().reverse()));
    terminals.push(st.pts[st.pts.length-1].clone());
  });
  const rg = GhostNeurons.ribbons(kept, 3);
  const haze = new THREE.Mesh(rg, GN.haze), lines = new THREE.Mesh(rg, GN.ribbon);
  const cells = new THREE.Mesh(GhostNeurons.somaQuads(shown), GN.soma);
  [haze, lines, cells].forEach(m => { m.frustumCulled = false; fiberGroup.add(m); });
}

/* ---------- sprite texture (used only for glow, never as a star) ---------- */
function softSprite(){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,   'rgba(255,255,255,1)');
  g.addColorStop(0.18,'rgba(220,238,255,0.85)');
  g.addColorStop(0.46,'rgba(140,196,255,0.24)');
  g.addColorStop(1,   'rgba(140,196,255,0)');
  x.fillStyle = g; x.fillRect(0,0,128,128);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}
const SPRITE = softSprite();


/* ---------- suspended matter in the fluid, close range only ---------- */
{
  const N = 700, pos = new Float32Array(N*3);
  for (let i=0;i<N;i++){
    const p = offsetPoint(rand(), rand()*Math.PI*2, 4+rand()*26);
    pos[i*3]=p.x; pos[i*3+1]=p.y; pos[i*3+2]=p.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({
    size:0.24, map:SPRITE, transparent:true, opacity:0.06,
    blending:THREE.AdditiveBlending, depthWrite:false, sizeAttenuation:true
  })));
}

/* ---------- action potentials: coloured, trailed, and they light the tissue ---------- */
const PULSE_PALETTE = [
  // the site's ice-blue range: deep blue -> blue -> ice cyan (no violet)
  0x1f4fd0, 0x2f6fd0, 0x3c8cff, 0x4a7cff,
  0x5a9cff, 0x82bfff, 0xa8d8ff, 0xbfe3ff
];
const PULSE_N = 260;
const TRAIL   = 9;
const pulses  = [];
var pulseAttr, pulseColAttr;

/* pool every conductive path with its midpoint, so a recycled pulse can be
   placed near the camera instead of somewhere in the other half of the corridor */
const PATHS = [];
dendriteCurves.forEach(c => PATHS.push({ c, mid:c.getPoint(0.5), axon:false }));
axonCurves.forEach(c     => PATHS.push({ c, mid:c.getPoint(0.5), axon:true  }));

const SPAWN_RADIUS2 = 52*52;

function assignPath(p){
  let hit = null;
  for (let k=0;k<64;k++){
    const cand = PATHS[(rand()*PATHS.length)|0];
    if (cand.mid.distanceToSquared(camera.position) < SPAWN_RADIUS2){ hit = cand; break; }
  }
  if (!hit) hit = PATHS[(rand()*PATHS.length)|0];

  p.curve = hit.c;
  if (hit.axon){ p.speed = 0.20 + rand()*0.30; p.trailGap = 0.020; }
  else         { p.speed = 0.42 + rand()*0.70; p.trailGap = 0.050; }
  p.color.set(PULSE_PALETTE[(rand()*PULSE_PALETTE.length)|0]);
  p.energy = 0.8 + rand()*0.8;
}

{
  for (let i=0;i<PULSE_N;i++){
    const p = { t:rand(), color:new THREE.Color(), pos:new THREE.Vector3(),
                energy:1, speed:0.4, trailGap:0.03, curve:null };
    assignPath(p);
    pulses.push(p);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PULSE_N*TRAIL*3), 3));
  g.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(PULSE_N*TRAIL*3), 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({
    size:1.0, map:SPRITE, vertexColors:true, transparent:true, opacity:0.32,
    blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false,
    sizeAttenuation:true
  })));
  pulseAttr    = g.attributes.position;
  pulseColAttr = g.attributes.color;
}

/* ---------- synapses: terminals that fire, flicker and go quiet again ---------- */
const SYN_N = 1100;
const synapses = [];
var synAttr, synColAttr;
{
  const pos = new Float32Array(SYN_N*3);
  for (let i=0;i<SYN_N;i++){
    const src = terminals.length
      ? terminals[(rand()*terminals.length)|0]
      : somata[(rand()*somata.length)|0].pos;
    const sp = src.clone();
    synapses.push({
      pos: sp,
      color: new THREE.Color(PULSE_PALETTE[(rand()*PULSE_PALETTE.length)|0]),
      t: rand()*4,
      period: 1.1 + rand()*3.6,
      peak: 0.45 + rand()*0.85,
      inten: 0
    });
    pos[i*3]=sp.x; pos[i*3+1]=sp.y; pos[i*3+2]=sp.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  g.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(SYN_N*3),3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({
    size:0.7, map:SPRITE, vertexColors:true, transparent:true, opacity:0.4,
    blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false,
    sizeAttenuation:true
  })));
  synAttr = g.attributes.position; synColAttr = g.attributes.color;
}

/* ---------- vesicles: the puff released when a pulse reaches a terminal ---------- */
const BURST_N = 900;
const bursts  = [];
var burstAttr, burstColAttr, burstCursor = 0;
{
  for (let i=0;i<BURST_N;i++){
    bursts.push({ pos:new THREE.Vector3(0,0,-99999), vel:new THREE.Vector3(),
                  color:new THREE.Color(), life:0, max:1 });
  }
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(BURST_N*3);
  for (let i=0;i<BURST_N;i++) pos[i*3+2] = -99999;
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  g.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(BURST_N*3),3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({
    size:0.55, map:SPRITE, vertexColors:true, transparent:true, opacity:0.38,
    blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false,
    sizeAttenuation:true
  })));
  burstAttr = g.attributes.position; burstColAttr = g.attributes.color;
}

function releaseVesicles(at, color){
  const n = 5 + ((rand()*4)|0);
  for (let i=0;i<n;i++){
    const b = bursts[burstCursor];
    burstCursor = (burstCursor+1) % BURST_N;
    b.pos.copy(at);
    b.vel.set(rand()-0.5, rand()-0.5, rand()-0.5)
         .normalize().multiplyScalar(0.5 + rand()*1.5);
    b.color.copy(color);
    b.max  = 0.45 + rand()*0.55;
    b.life = b.max;
  }
}

const tissueMats = [];   // the ghost-fibre neurons don't take point lights
const allMats    = [];

/* ============================================================
   iCO — glass icosahedron with FBM plasma core
   ============================================================ */
const NOISE_GLSL = `
  float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453123); }
  float vnoise(vec3 p){
    vec3 i=floor(p), f=fract(p);
    f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i+vec3(0.,0.,0.)),hash(i+vec3(1.,0.,0.)),f.x),
                   mix(hash(i+vec3(0.,1.,0.)),hash(i+vec3(1.,1.,0.)),f.x),f.y),
               mix(mix(hash(i+vec3(0.,0.,1.)),hash(i+vec3(1.,0.,1.)),f.x),
                   mix(hash(i+vec3(0.,1.,1.)),hash(i+vec3(1.,1.,1.)),f.x),f.y),f.z);
  }
  float fbm(vec3 p){
    float v=0.0, a=0.5;
    for(int i=0;i<5;i++){ v += a*vnoise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

/* ============================================================
   CHAPTER ASSETS
   each chapter names its own object (CHAPTERS[i].asset). they all share one
   glass language: a plasma core, a fresnel shell that reads from its edges,
   and fine bright edge lines, so different objects still feel like one set.
   every asset returns a Group whose userData lists its cores / shells /
   lines (dimmed and brightened together) and a tick(t, dt) for its motion.
   ============================================================ */
const ICE_LINE = 0xdff4ff;
const CORE_A = 0x1a4fe0, CORE_B = 0x8cc8ff;     // deep blue -> ice, the Status iCO

function coreMat(colA, colB){
  return new THREE.ShaderMaterial({
    uniforms:{ uTime:{value:0}, uGain:{value:1},
               uColA:{value:new THREE.Color(colA)}, uColB:{value:new THREE.Color(colB)} },
    vertexShader:`
      varying vec3 vP; varying vec3 vN;
      void main(){ vP = position; vN = normalize(normalMatrix*normal);
        gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`
      uniform float uTime; uniform float uGain;
      uniform vec3 uColA; uniform vec3 uColB;
      varying vec3 vP; varying vec3 vN;
      ${NOISE_GLSL}
      void main(){
        vec3 q = vP*1.9;
        float f = fbm(q + vec3(0.0, uTime*0.22, uTime*0.13));
        float g = fbm(q*2.4 - vec3(uTime*0.16, 0.0, uTime*0.09));
        float d = pow(abs(f - g)*2.4, 1.5);
        float rim = pow(1.0 - abs(dot(normalize(vN), vec3(0.0,0.0,1.0))), 1.6);
        float m = clamp(d*1.35, 0.0, 1.0);
        vec3 col = mix(uColA, uColB, m);
        col = mix(col*0.45, col, clamp(f*1.6, 0.0, 1.0));
        col += mix(uColB, vec3(1.0), 0.28) * rim * 0.40;
        gl_FragColor = vec4(col * (0.34 + d*0.78) * uGain, 1.0);
      }`,
    blending:THREE.AdditiveBlending, transparent:true, depthWrite:false
  });
}
function shellMat(accent, power){
  return new THREE.ShaderMaterial({
    uniforms:{ uAccent:{value:new THREE.Color(accent)}, uGain:{value:1}, uPow:{value:power||2.4} },
    vertexShader:`
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 mv = modelViewMatrix*vec4(position,1.0);
        vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix*mv; }`,
    fragmentShader:`
      uniform vec3 uAccent; uniform float uGain; uniform float uPow;
      varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPow);
        vec3 col = mix(uAccent, vec3(1.0), 0.35);
        gl_FragColor = vec4(col * f * 0.80 * uGain, f * 0.48 * uGain);
      }`,
    blending:THREE.AdditiveBlending, transparent:true,
    depthWrite:false, side:THREE.DoubleSide
  });
}
const lineMat = () => new THREE.LineBasicMaterial({
  color:new THREE.Color(ICE_LINE), transparent:true, opacity:0.9,
  blending:THREE.AdditiveBlending, depthWrite:false });

/* a new asset: parts are registered so the loop can dim/brighten them */
function assetKit(){
  const g = new THREE.Group();
  g.userData = { cores:[], shells:[], lines:[], tick:null,
    spin:new THREE.Vector3((rand()-0.5)*0.1, 0.13+rand()*0.07, (rand()-0.5)*0.1) };
  const u = g.userData;
  return {
    g,
    core(geo, parent){ const m = new THREE.Mesh(geo, coreMat(CORE_A, CORE_B)); (parent||g).add(m); u.cores.push(m.material); return m; },
    shell(geo, parent, power){ const m = new THREE.Mesh(geo, shellMat(CORE_B, power)); (parent||g).add(m); u.shells.push(m.material); return m; },
    edges(geo, parent){ const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), lineMat()); (parent||g).add(l); u.lines.push(l); return l; },
    lines(geo, parent, weight){ const l = new THREE.LineSegments(geo, lineMat()); l.userData.weight = weight||1; (parent||g).add(l); u.lines.push(l); return l; },
  };
}
function circlePts(r, n, plane){            // a circle as line-segment pairs
  const pts = [];
  for (let i=0;i<n;i++){
    const a0 = i/n*Math.PI*2, a1 = (i+1)/n*Math.PI*2;
    pts.push(plane(Math.cos(a0)*r, Math.sin(a0)*r), plane(Math.cos(a1)*r, Math.sin(a1)*r));
  }
  return pts;
}
const linesFrom = pts => new THREE.BufferGeometry().setFromPoints(pts);

/* chapter assets are being made separately. add one here as
   ASSETS.name = (R, ch) => { const k = assetKit(); ...; return k.g; }
   and give its chapter asset:'name'. a chapter without one holds an empty slot. */
const ASSETS = {};

/* DNA in the neurons' texture: the same helix, but every strand and base pair
   is a ghost-fibre ribbon (GhostNeurons): fine weaving threads in a soft
   velvet glow. Each backbone is a small bundle of fibres twisting around the
   helix line, like a nerve fibre. Same tilt and slow motion as the hologram DNA. */
window.makeDNAFibre = function makeDNAFibre(R){
  const H = R*2.35, RAD = R*0.46, TURNS = 2.0;
  const g = new THREE.Group();
  const M = GhostNeurons.materials({ fog:0.021, gain:1, haze:0.13, drift:0.06, line:0xa6cbff, glow:0x2450c0 });
  const P = (t, ph) => new THREE.Vector3(
    Math.cos(t*TURNS*Math.PI*2 + ph)*RAD, (t - 0.5)*H, Math.sin(t*TURNS*Math.PI*2 + ph)*RAD);
  const list = [];
  const PHASES = [0, Math.PI];
  // backbones: three fibres twisting round each helix line
  PHASES.forEach(ph=>{
    for (let k=0;k<3;k++){
      const pts = [];
      for (let i=0;i<=120;i++){
        const t = i/120, c = P(t, ph), n = P(t + 0.004, ph).sub(c).normalize();
        const side = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0,1,0)).normalize();
        const up = new THREE.Vector3().crossVectors(side, n);
        const a = k*2.094 + t*14.0;
        pts.push(c.addScaledVector(side, Math.cos(a)*R*0.05).addScaledVector(up, Math.sin(a)*R*0.05));
      }
      // 'along' kept inside the ribbon's bright range so the ends don't fade early
      list.push({ pts, w0:R*0.1, w1:R*0.1, a0:0.16, a1:0.66, seed:k*3.1 + ph, kind:'axon', daughter:false });
    }
  });
  // base pairs: one fibre from each strand toward the middle, with a small gap
  const RUNGS = 24;
  for (let i=0;i<RUNGS;i++){
    const t = 0.04 + 0.92*i/(RUNGS-1);
    const a = P(t, PHASES[0]), b = P(t, PHASES[1]), mid = a.clone().lerp(b, 0.5);
    [[a, mid], [b, mid]].forEach(([p, m])=>{
      const end = m.clone().lerp(p, 0.08);
      const pts = [];
      for (let j=0;j<=6;j++) pts.push(p.clone().lerp(end, j/6));
      list.push({ pts, w0:R*0.075, w1:R*0.055, a0:0.2, a1:0.62, seed:i*1.7, kind:'axon', daughter:false });
    });
  }
  const rg = GhostNeurons.ribbons(list, 10);
  const helixG = new THREE.Group();
  const haze = new THREE.Mesh(rg, M.haze), lines = new THREE.Mesh(rg, M.ribbon);
  [haze, lines].forEach(m => { m.frustumCulled = false; helixG.add(m); });
  const tilt = new THREE.Group();
  tilt.rotation.set(0, 0, 0);          // upright
  tilt.add(helixG);
  g.add(tilt);
  // the corridor's loop drives uTime / uGain on cores (M.ribbon shares its uniforms with M.haze)
  g.userData = { cores:[M.ribbon], shells:[], lines:[], spin:new THREE.Vector3(0,0,0),
    tick:(t)=>{
      helixG.rotation.y = t*0.2;
      tilt.position.y = R*0.4 + Math.sin(t*0.45)*R*0.04;   // just above its chapter title (tuned to a 7-line paragraph)
    } };
  return g;
};
/* EVE's head and shoulders (eve-mesh.js cropped below the shoulders, recentred:
   base of the bust at y=0). "Low Poly Female Base Mesh" by Mesh-Base, CC BY 4.0. */
window.BUST_MESH = {"n": 3140, "i": 10119, "min": [-0.1295202725762823, 0.0, -0.19143566123415315], "rng": [0.2590405451525646, 0.395226748973561, 0.3828713224683063], "b": "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GgAnACAAFwAjABsAGAAZACEADgAeABwAGQAYAAgAAgAOABwAEwAjABcACgASAA8ACAAWABkAEQAHAA0ACwAUAAEABwASAAoACQALAAAAAQAOAAIAAAALAAEAAwAJAAAADQAHAAYABwAKAAQABQAGAAQA3gDdANcApgDDAMIABgEFAQEBdwB4AIsARwFKAUsBRAFJAUEBSAFHAUsBRQFLAUYBRgFLAUkBRQFIAUsBQgFGAUkBQgFJAS8BLwFJAUQBQwFAAUQBPwFCAS8BRAFAATcBPgE/AS8BPAE+AS8BOAE8AS8BOgEWATMBOQE2AToBNQE4AS8BOgE2ARYBNQEvATABMwEWAS0BNgEyARYBMgEpARYBLAEwARkBMAEvARkBLQEWAS4BJQEsARkBFgEkAS4BKAEWASkBJwEmARkBJgElARkBLwERARkBJAH+ACABIgEhASMBIwEhARYBJAEWAf4AIQEeARYBHgEaARYBHwEdAR4BHgEdARoBHQEZARoBIAH+ABcB8wAZAREBBwERARAB/gATARcBGQHzABoBFwETARQB/gAWAfMAFgEaAfMAEgH0AA4B/gAKARMBEgENAfQAEQEHAfMADQEMAfQADgH0AAQB/gADAQoB/gD1AAMBDAECAfQA8wAHAfgABAH0AP8ABwH9APgATAEGAQEBAgH7APQA/wD0APkA/gDzAPUA+QD0AO0A7QD0ANkA9ADnANkA9ADwAOcA8gDoAOYA2QDiAO0A3ADZAM8A5wDRANkA3ADDAN0A3QDEANcAwwDEAN0A3ADPAMMAuwC8AMgAwwDPAMIAwQC6AK0AwQC/ALoAwACsALUAvQDFAK4AvQCuALgAvACuAMUApgC2AMMAwQCtAKYArACMALUApwC3ALEArgC3AKcApQCPAKwAogCuAKcAjwCDAKwArACDAIwAmACJAI8AoQCaAJsAmgCUAJYAgwCAAIEAiQCDAI8AgwCFAIcAgwCBAIQAiQB+AIMAewB9AIkAiQB9AHwAeAB6AHsAgwB+AH8ARAFBAUMBNwFAAT0BMQE7ATQBLwFEARwBHAFEATcBKwExATQBCwErATQBGAE0ASoBIwEWASgBHQEnARkBEQEvARwBEQEcARABCwE0ARgBFQEYARsBGAEVAQEBAQEVAQ8BAQEPAQgBCQEHARABBQELAQEBCwEYAQEBAQEIAQAB7AABAQAB9wBMAQEB9QDzAPIA9wABAewA5QDsAAAB5QAAAfwA5QD8APYA7wD3AOwA5QD2AO4A+gD1AOYA5gD1APIA8wD4APEA8QDyAPMA7wDsAM4A6QDlAO4AzgDqAO8A0wDOAOwA4ADqAM4A4ADrAOoA0wDsAOUA4wDlAOkA5ADjAOkA4QDmAOgA3ADiANkA1ADgAM4A2wDlAOMA0wDlANsA3wDbAOMA0gDaAMsA2gDeANcAwgDZANEAuQDOANMAuQDTALIAswDSAMsAywDaANcAwgDPANkAsgDTANsA0ADSALMAwQDRANgAsgDbAM0AzQDbANYA1wDEAMsAzADVANQAwgDRAMEAzADUAMoAygDUAM4AuwDIANAAuwDQALMAsgDNAMkAuQDKAM4AxQDGALwAvADGAMgAtgDLAMQAtACyAMkArgC8ALsAxADDALYAvwDBAMcArgC7ALcApgDCAMEAwADKAKwApQDKALkAtADJAL4AtwC7ALEArADKAKUAsQC7ALMAsgCwALkAqgC4AK4AmAC5ALAAsACyAKsAoQCxALMAoAC1AIwAmAClALkAsgC0AK8AqgCuAKIAoQCzAMsAoQDLALYAqwCyAK8AngCnALEApgCtAJUApACwAKsApgCaALYAjwClAJgAoQC2AJoAqACkAKsAngCxAKEAnACgAIwAqACpAKQAowCkAKkAnwCiAKcAnwCnAJ4AmgCmAJMAnQCkAKMAngChAJsAkwCmAJUAmACwAKQAlACaAJMAkgCTAJUAnQCXAKQAmQCcAIwAlwB4AKQAkQCZAIwApAB4AJgAkACRAIwAkACMAI0AjACDAIcAiQCYAHsAewCYAHgAjQCMAIoAjgB4AJcAiACMAIYAhgCMAIcAeACOAIsAigCMAIgAdgCAAIMAhQCDAIQAggB7AHoAegB4AHkAfwB2AIMAfgCJAHwAuwHSAdABUAJcAlsC+AHIAf0ByAG0AdUBwwGRAcQBzAHtAaYBagF6AXUBUgFfAVEBWgFhAWABWQI5AmcCVQJBAl4CUgJTAl0CTwJQAlsCVQJUAkECWAJRAjYCWAI2Ak4CTwJIAlACUgJOAlMCUQJNAjYCUAJIAk0CTgJAAlMCTwJLAkgCNgJAAk4CUwIwAkkCUwJAAjACTQJIAjYCSwJFAkgCRQI/AkgCQAIsAjACPwI8AkgCPAI6AkgCSAI6AjYCOgI4AjYCOAI0AjYCNgImAiwCNAImAjYCMgImAjQCMgIrAiYCJgIfAiwCLAIYAhsCIgIfAiYCJQImAisCLAIfAhoCbwIFAh4CIQIFAm8CBQIMAh4CJwIKAjECDALgARcCCAIJAicCBQLgAQwCAwLgAQUC7wHgAQMC3gHuAfQB8QHWAewB4AHvAeUB0QGwAdwB6gHkAfQB0gGyAdMB2gGgAdEB5QHGAeABsAHUAdwBxAGRAbMBmgHWAcsB0wGyAaMB0wGjAbEB0wGxAbwBsQGVAbwBsgGrAaMBlQGfAbwBnQGpAbgBmgGBAdYBmAGKAZYBqwGWAaMBkAGRAcMBpAF6AYMBmgGLAYEBjwGQAaIBmQGKAZgBcAKHAaoBgQGMAdYBiQGOAYIBgwF9AXECmwFyAWYBbQGbAYUBegF9AYMBmwFtAXIBewFwAZABegFqAX0BZwFXAXkBeQFXAVkBZQFyAW0BXQFTAVYBXAFbAWABVwFeAVkBVQFUAV0BVAFTAV0BVAFQAVMBaQJuAm0CTAJtAmgCQgJrAmoCQgJqAmwCQgJsAmICZAJrAkICWgJpAm0CWgJtAkwCaAJkAkICZgJlAjkCOQJlAmECTAJoAkICQgJiAmcCOQJZAmYCQgJnAjkCRwI5AmECRwJhAl8CRwJjAlcCQQJWAl4CRwJXAmACRwJgAlYCRwJWAkECMQJMAkICKAJCAjkCSgJMAjECRgJJAjACQwJKAjECOQJHAkECPgJDAjECQQJEAj0CNwJGAjACPgIxAjsCMQJCAigCLgI5AkECQQI9Ai4CNQI7AjECQAI2AiwCJwI5Ai4CLQI1AjECKAI5AicCMwI3AjACGwIwAiwCLwItAioCLQIxAgsCMwIwAhQCMAITAhQCEwIwAhsCKgItAgsCGAIsAhoCHQIpAioCHQIqAgsCBwIjAjMCJAIpAh0CFgILAjECIAIjAgcCBwIzAhQCEQIdAgsCMQIoAicCDwInAhwCDgIHAhQCAgILAhYCCgIWAjECEgITAhsCGAISAhsC9AELAgICEAInAg8CAAIVAhkC7gERAgsCCQIKAicCBwIOAgYCCAInAhACDQL9AQQC9gEXAuAB9AHuAQsC5gEVAgAC9AECAvMB+wG2AfwB+QEVAuYBBALyAf4B/QHhAQQC/wHmAQACyAHhAf0B5wG2AfsB4gHnAfoByAH4AfYB9AHdAd4BtgH3AQECAQL8AbYB4QHyAQQC4wH3AbYB4AHIAfYB3wHuAd4B3QH0AeQB6AHqAfQB5wHiAbYB7AG/Ae0B2QGyAdIB6QH1AeMB6wHwAeEBqwGyAdkB2wHpAc8BqwHZAbkB2QHSAbsBzwHpAc0BzQHpAeMB2AG2AeIB/wHXAeYB7QHXAf8B1QHrAeEByAHVAeEB0AHTAbwBuQHZAbsBtgHNAeMBzAHXAe0BvwGbAe0BmwG/AewBxwHJAbQByAHHAbQB0gHTAdABoAGwAdEBwgGrAcEBlAHNAbYBrQG2AdgBvQHIAeABvQHHAcgBxgG9AeABpQHFAbMBwgGYAasBwQGrAbkBwQG5AcABwAG5AbsBtwHOAZQBlAHOAc0BmgHLAcoBqwGYAZYBqAG3AZQBpwG2Aa0BrAGaAcoBrAHKAb4BtQGsAb4BpQGzAZEBoQGwAaABhgGkAa8BngG6Aa4BngGuAZwBfwGoAZQB7QGbAaYBlAG2AacBjAGbAewBjQGhAaABhgF6AaQBmwGSAaYBjAGFAZsBjAHsAdYBlwGPAaIBWAF/AZQBWAGnAZMBkgGbAWYBdwGRAZABgAGIAYkBpwFYAZQBbgFYAZMBdwGEAZEBggGAAYkBdwF+AYQBjwF7AZABWAF0AX8BZQF8AXgBkAFwAXcBaAF0AVgBcwF8AWUBcAFxAXcBbwF0AWgBdgFqAXUBaAFYAVEBWAFuAVEBZQF4AXIBawFsAWoBagFjAWsBdgFpAWABdgFgAWoBUQFfAWgBYgFkAVwBYgFcAWABagFhAWMBaQFiAWABYAFhAWoBUQFuAZMBUQGTAVYBUwFRAVYBTgFRAVMBTwFSAVEBTgFPAVEBUAFOAVMBTQFPAU4BswLCAr0CSQNNA08DSgNNA0kDOwNLA0gDSgNJA0UDTgNLAzsDRgM7A0cDOwNIA0cDRgNKA0ADQANKA0MDQwNKA0UDOwNMA04DQQNDA0QDPwNGA0ADQQNAA0MDPwM7A0YDOwM/Az4DOQNAAzwDPwNAAzkDLwNCA0wDLwMzA0IDPQM5AzwDOAM+Az8DLwNMAzsDLwMlAzMDNwMuAzEDNwMtAy4DMAM6AzUDOgM0AzUDPgMvAzsDMQMuAzIDLQMsAxUDOgMwAyoDJAMVAywDLQMrAy4DFQMrAy0DNgM6AygDOgMqAygDJwNQAzYDJgM+AzgDKwMVAyMDBwMvAz4DJQMNAxADKQMVAyQDFQMeAyMDJwM2AxsDNgMoAxsDGwMoAyIDIQMYAycDIAM+AyYDFQMdAx4DGwMhAycDGwMiAxkDFwMgAyYDDQMvAwcDHwMMAykDKQMMAxUDHQMVAxwDFQMWAxwDEQMbAxoDGgMbAxkDIQMPAxgDIAMHAz4DBwP4Ag0DFQMUAxYDFQMhAxsDFQMTAxQDFQMbAxMDGwMSAxMDGwMRAxIDDQMGAxADHwMOAwwDFQMMAyEDIQMLAw8DDQP3AgYDDgMJAwwD+AL3Ag0DCQP+AgwDAQMLAyEDAwMHAwoDCAMEAwkDDAMBAyEDAwP7AgcD+wL4AgcD9wL6AgYDDAP+AvUCDAMAAwEDAgP/AgUD/wLvAgUDBAPzAgkDDAP1AgAD8wL+AgkD/AIAA/UC/QL5AvsC+QL4AvsC+ALrAvcC7ALvAv8C/gLyAvUC9QL2AvwC+QLrAvgC6wLqAvcC9wLqAvQC9wL0AvoC7ALDAu8CUQPfAvAC+QLwAusC8gL+Au4CUQPxAt8C8ALfAusC9ALqAtsC2QLIAugC/gLjAu4C6wLVAuoC7wLDAuQC8wLmAv4C5gLjAv4C1QLeAuoC7ALpAskC7ALJAsMC8QLiAt8C6wLfAtUC6gLcAtsC6QLlAtgC6QLYAskC6ALIAtoC2QLAAsgC6gLeAtwC5ALDAtcC4gLRAt8C4gLTAtEC3wLQAtYC3wLWAtUC3QLHAs0C2gLJAtgC4ALUAr0CyQK3AsMC2QLCAsAC3wLRAtAC1ALLAr0CxwLFAs0CwwK8AtcC0gLBArsCzwK7As4CzQLFAswCywK+Ar0C2gLIAskCzgK7AscCwAK/AsgCxwKsAsUCxAK6AsYCxgK6ArkCwgKzAsACwQKiArsCuwKiApgCyQK4ArcCwwK3ArICwwKyArwCwAKzAr8CvgKlAr0CvAKyArECugKrArkCtwK2ArICvAKxArACtAKrAroCvQKlArMCuAKuArcCuwKaAqwCrQKmArQCVAO1AlIDuwKYApoCrAKoAq8CpgKrArQCswKqAq4CVAOpArUCqQJTA7UCrAKaAp8CrQKnAqYCvgKhAqUCpgKhAqsCpQKkAqoCqQKgAlMDoAKiAlMDrAKfAqgCpwKeAqYCowKgAqkCmgKUAp8CngKhAqYCoQKcAqUCowJVA6ACoAKYAqICmAKKApoCngKdAqECoQKdApwCpQKcApsCpQKbAqQCoAJVA5YCmgKVApQCoAKIApgCpAKbApkCVQOXApYCoAKNAogCiAKKApgCmgKKAnsCmgJ7ApUCoAKWAo8CoAKOAo0CoAKPAo4CigKEAnsClgKQAo8CjQKLAogCiAKHAooClQKMApECiwKJAogCigJ/AoQChAJ4AnsCewKMApUCigKAAn8ChwKBAoAChwKAAooCfwJ9AoQChAJ8AngCewJ1AowChAJ9AnwCfAJ6AngCewJ4AnUCdQJzAn4CfgJzAnYCcgJ0AncCDQMlAy8DCgMHAyAD5wLoAtoC4QLnAtoC7QLgAr0C2QLtAr0CwgLZAr0CywLKAsYCuQLLAsYCvgLLArkCyQLIAr8CxwK7AqwCyQK/Aq4CuALJAq4CvgK5AqsCrgK/ArMCoQK+AqsCswKlAqoClAKVApICkwKUApICkgKVApEChgKDAoUCfgKMAnUChgKCAoMCggJ2AoMCgwJ2AnkCdwJ5AnICdgJyAnkCdgJzAnICfgMXBHkDEAQUBA8EFAQTBA8EEgQPBBMEEgQRBA8EEQQOBA8ECwQQBAgECAQQBA8EDwT3A/kDDwT8A/cDDgQNBA8EDQQMBA8EDwQMBPwDDAQKBPwDCgQGBPwDBwT/AwYEBQQJBAsEBQQLBAgEDwT5AwgEBgT/A/wDAwQIBAAEAwQFBAgEBAQCBP8DAgQBBP8DAQT9A/8D/gMABPAD8AMABAgECAT5A/QD/APtA/cD/QP7A/8D+gP+A/AD/AP/A+0D+wP4A/8D8AMIBPQD+QPyA/QD+QP3A/ID/wPuA+0D+AP1A/8D9gP6A/AD8gP3A+8D/wPxA+4D/wP1A/ED9wPtA+8D8wP2A/AD9APyA+ED6wPzA/AD7gPsA+0D7APqA+0D7QPqA+kD6wPwA+cD9APhA+ID7wPtA84D6QPOA+0D6QPdA84D6APrA+cD5gPwA+ID4gPhA9YD7wPOA8sD4wMVBLgD4APmA+ID3gPlA98D3wPjA7gDuAMVBNkD4gPXA9wD8gPLA8MD3gPfA9oDzAPfA7gD2gPfA8wDwwPLA7YD3QPUA84DzgPRA8UDygPPA8wD0APWA80DtgPLA5oD1gPDA6YDugO7A7ADrAOzA7oDugOwA6IDswO7A7oDvAO1A7EDmAO3A5cDrAOqA7MDrAO6A6IDrQOzA6oDrAOjA6oDrAMXBKMDoQOVA6kDrAN5AxcEkQOgA5gDpAN4A4kDpAOJA68DkwOIA5kDgwN0A30DiANzA5QDiANyA3MDeQNrA2IDeAN0A4kDdANrA4kDdANzA2sDWwNdA2ID8AP0A+ID5gPnA/ADwwPhA/IDywPyA+8D5APdA+kD1wPiA9YD1gPhA8MDtwPZA9sDtwPbA9gD1QPaA8wD0APXA9YDuAPZA7cDtwPYA9MD0QPOA9QDzwPSA8wDywPOA5oDtwPTA8kDmgPOA74DuAPKA8wDxgPNA9YDpgPGA9YDtwPJA8gDvgPOA8UDxwPKA7gDpgPDA7YDtwPIA8IDvwPGA6YDxAPHA7gDwQPEA7gDvAOaA74DdgO2A5oDvQPBA7gDtwPCAxYEfwO/A6YDfwPAA78DmAO9A7gDuQO9A5gDlwO3AxYEpQOaA7wDrgPAA38DtQO8A7QDmAO4A7cDlwMWBLIDogOwA68DpgO2A4QDhAO2A3YDpQO8A6sDqwO8A7EDqAO5A5gDpwOuA38DdQN2A5oDqQOkA68DqQOvA7ADlwOyA5wDjgOYA5cDmwOaA6UDfQOkA6kDoAOoA5gDnQOnA38DfwOmA4QDlQN9A6kDeQOsA6IDmwOlA58DjwOYA44DjgOXA40DeAOkA30DjAONA5cDiwOcA54DcwOVA6EDcwOhA5QDkgOgA5EDigOdA38DdQOaA5YDiQN5A6IDiQOiA68DlQODA30DlgOaA5sDgwOVA3MDkAOYA48DggOXA5wDggOcA4sDfAN/A3sDjAOXA4cDiAOUA5kDhwOXA4YDgAN/A3wDfwOEA3cDhgOXA4IDgQOCA4sDgQOLA4UDgAOKA38DewN/A3oDbgOEA3YDdwOEA3EDaAN2A3UDYgN+A3kDeAN9A3QDdAODA3MDbQOEA24DegN/A3cDcQOEA3ADcAOEA28DbwOEA20DawN5A4kDZwN+A2IDZgNzA3IDaQNuA3YDaQN2A2oDagN2A2gDawNzA2YDZQNoA2QDYQNsA2ADYANsA2cDZANoA3UDXwNgA2cDYgNrA2YDYwNsA2EDXANiA2YDXwNnA14DXgNnA2IDWANiA1wDXQNeA2IDWgNiA1kDWANZA2IDWANcA1YDVwNYA1YDKwQgBCoEKAQgBCcEKQQgBCgEJQQaBCkEKwQnBCAEKQQaBCAEJgQkBCUEJQQjBBoEJQQkBCMEIwQiBBoEHwQeBBoEHAQaBBsEGgQiBCEEGgQhBB8EGgQeBB0EGwQaBB0EGgQcBBkEGgQZBBgEfwSBBJUEPQREBDQEVAVTBU4FUwVKBU4FUgVNBTQFUgU0BUgFUQVOBTwFUQU8BU0FUAVEBUEFUAVBBU8FTwVBBUwFSQU8BUoFTgVKBTwFPAU0BU0FTAVBBUcFNAUzBUgFSwU4BUAFSQVFBTwFSAUzBUQFRQU+BTwFRAUzBUEFQAUsBUYFQwUyBUIFQwVGBTIFQgUyBT0FLgU/BTIFMwU7BUEFQAU4BSwFPQUyBT8FNgU8BT4FNwUkBTkFRgX+BDIFOgUuBTcFLgUkBTcFNgUvBTwFMwUpBTsFMgX7BC4FJAUrBTUFRgUsBf4EMgX+BPsEPAUSBTQFJgU8BS8FLQUwBSoFLAUUBf4EJAUiBSsFKwUiBTAFKgUwBSgFNAUSBTMFVQUjBSwFMAUiBSgFLgX7BCQFJwUhBSYFJgUSBTwFJgUhBRIFMwUgBSkFJAX7BCIFKQUgBSUFJQUgBR8FIwUZBSwFIQUcBRIFMwUWBSAFGQUUBSwFIAUaBR8F+wTkBCIFIgXkBB0F5AQbBR0FEgURBTMFHgULBRkFFAXzBP4E5AQTBRsFGAUGBRwFHAUGBRIFEgUNBREFMwURBRcFMwUQBRYFMwUXBRAFGQULBRQFGAUJBQYFEgUOBQ0F5AQABRMFBgUFBRIFEgUEBQ4FDAUIBVYFVgUIBQ8FDwUIBRUFBQUEBRIFDgUEBQMFFAULBfkEFAX5BPEECgX6BAcF/wTrBAIFAgXrBAEFAQXrBPwEDAX8BO0E/gTVBPsE+wTVBOQE5AT9BAAFBwX6BO8EDAXtBAgFCAXtBPcEFAXxBPME5AT4BP0E+gTwBO8E5ATyBPgE/ATrBO0E/gTzBNUE7wS0BPYE9wTtBO4E9wTuBPUE9gS0BOsE5AToBPIE9ATqBPEE6gTpBPEE8QTpBPME5ATVBMQE7wTgBLQE6wS0BO0E7AThBO8E7wThBOAE8wSyBNUE8wTpBMAEwATWBPME5ATjBOcE5ATnBOgE4QTcBOAEtATfBO0E7QTfBOUE5gTeBOIE5ATEBOME4gTeBN0EtATgBMsE6QSbBMAE2wSbBOkE8wTWBLIE3gTDBN0E0wS7BNkE2ATXBMgE2ATIBMwE3wSTBNAE3gTHBMME3QRXBdIE2QS7BNEEtASTBN8EwASbBK0E4wTEBL8E4wS/BNQEwwS+BN0E3QS+BFcF0wS8BKoEVwWpBNIE0gS6BNoEwASLBNYE1QSyBMQEyATGBMwE0gSpBLoEtAS1BGgEkwTFBNAEwAStBIsEyASvBMYEvAR7BKoEuwSnBMIEqQSxBLoEyQSwBMEEsASvBMEEtARoBJMEkwSSBMUEsgSfBMQEvwTEBKQEvAS9BHsEfwSVBLkEpQS4BJYEygR3BJsE1gSfBLIEqwSaBL0EqgR7BHEExASfBKQEqgRxBH8EygScBHcErQSbBHYEiwSDBKAEmgSMBL0EvQSMBIIEvQSCBHsEngSOBIgEngSIBJgEmASHBKEEkwSGBJIEeAR3BJwEmASIBIcEkwRoBIYEkgSGBIUEoASDBIoEhgR5BIUEmwRhBHYEggRrBHsEmwR3BGEEigSDBIAEggR8BGsEXQRfBH8EfwR1BIEEhAR2BGIEcQRdBH8EfwRfBHUEfgR6BGgEeARvBGQEeAR0BHcEawRqBHsEewRqBHEEQwRHBIYERwR5BIYEeARkBHQEfQQ5BHMEYQRiBHYEegRpBGgEcQRqBF0EeQRHBGUEbwRwBGQEcwRaBG4EaQQ7BGgEWwRQBGcEhgRWBEMEXAROBGYEcARVBGQEXQRXBF8EcwQ5BFoEXQRRBFcEWQVGBDkEagRUBF0EaARWBIYEZgQ/BFUEWwQ8BEkERwRDBEIEWwRHBDwETgRABD8EWgQ5BD4ETgRPBEAEOARCBEMETQRFBEwEaAQ7BFYEVgQ4BEMESQQ8BEEERwRCBDwERgQ6BDkEMwQyBDoEOgQyBDkEPgQ5BDUEOQQyBDUEWgUwBDMEVgQtBDgENQU5BSQFMAUtBTEF7wTwBOwEzwTaBLoE0QS7BM4EyATNBMEEmwTbBMoEzgS7BMIEzQTJBMEEtATLBLUEyATBBK8E0wSqBLsE1gSLBKAEpwS5BLcEuwSqBH8EuwR/BKcEpwR/BLkEWAWXBLYEaAS1BK4ElwSmBLYErgSdBGgEqwSsBJoEmQSjBKIEnQSUBH4EygSzBJwEnwTWBKAEjwSoBKMEjwSjBJkEiwStBHYEnwSQBKQEaASdBH4EoASKBJEEnwSgBJEEiQSPBJkEjQSfBJEEnwSNBJAEiwR2BIMEgwR2BIAEgAR2BIQEYQR3BGwEbQRsBHIEZQRbBGcEYQRsBG0EYQRtBF4EXgRtBGMEawRgBGoERwRbBGUEcARmBFUEYQReBGIEUARbBEkEZgROBD8EWQRUBGoEXQRTBFgEUQRdBFgEXQRUBEsEXQRLBFMEVARNBEwEVARMBEsEPQRSBEoEPQRKBEQEPgQ3BEgELQQ9BDQEOwQ9BC0ENwQ+BDYENgQ+BDUEVgQ7BC0EMwQwBDIEMQQtBDQELQQxBC8EMAQsBDIELQQvBC4EJgYtBicGKgYtBiYGKgYsBi0GLAYqBisGKgYpBisGKgYkBiUGKgYlBikGJgYnBigGKgYjBiQGKgYiBiMGKgYUBiIGFAYhBiIGIQYUBh4GEgYgBhwGEgYfBiAGGQYfBhIGGwYqBiYGKgYYBhQGFAYdBh4GEgYcBhoGGwYuBioGKgYuBhgGGAYCBhQGHQYUBhcGFgYSBhoGBwYZBhIGFAYQBhcGFQYSBhYGFAYOBhAGEgYVBhMGDwYYBi4GGAb+BQIGBwYRBhkGDwb6BRgGFAYCBgYGFAYJBg4GDgYJBgsGDgYLBgwGEwYNBhIG6wUDBhEG+gX+BRgGFAYGBgUGBQYKBhQGFAYKBgkGDAYLBggGEgYNBgQG6wURBgcGBgYCBgEGAAYSBgQG6wX/BQMG+wUBBgIGEgYABvkF+QUABv0F+gXtBf4F8gUHBhIG/AX/BesFLwbtBfoF9gX8BesF/gXgBQIG8gUSBvkF7gUHBvIF+AXtBS8GAgb1BfsF+QX9BfcF5AXrBQcG8AXtBfgF7QXbBf4F7gXkBQcG9gXrBekF/gXbBeAFAgbgBfUF7AX0BfMF9QXoBe8FwQX0BewF4QXtBfAF4AXoBfUF6wXkBecF5wXpBesF2QUwBvEF6gXkBe4F5gXoBeAFwQXZBfQF2QXjBeUF4gXnBeQF4QXdBcsF4AXbBboF3AXmBeAF1QXLBd0F4QXLBe0FywXHBe0FxwXbBe0F4AXXBdwFwQXfBdoF4AW6BdcF1gXkBd4FugXTBdcF2QWiBdgF5AXWBdIF5AXSBeIFzAXBBdoF1QXPBcsFzgXNBdEFugXIBdMF1AWYBdAFtAXOBdEFzQXGBdEF2AWiBZgFxgXJBdEFugXEBcgFmAW9BdAFxwWVBdsFzgW0BbwFzQW8BbsFwQXMBcUFzgW8Bc0FygW7Bb8FxAW6BcMFwgXBBcUFuwWlBb8FvwWlBbUFwAW+BbgFugW4BcMFlgXBBbcFtwXBBcIFvAWmBbsFugW5BbgFtgWwBcsFtAXABbkFfAWzBb0FqQXHBcsFvAWsBaYFuwWyBaUFpQWvBbUFlgW3BbEFsAWpBcsF2wWhBboFugWhBbkFfAWuBbMFlQWhBdsFqQWVBccFrgV8BaoFpAWeBa0FrQWeBacFqgV8BZ8FpQWeBaQFngWjBacFlgWoBaAFmwV7BakFqQV7BZUFsgWdBaUFpQWXBZ4FpQWdBZcFngWcBaMFlQV7BWkFjAV5BaIFlQVuBaEFsgWmBZ0FlwWTBZ4FfAWOBZ8FMQZ7BZsFoQVuBZEFlAWQBawFrAWQBaYFngWaBZwFnQWmBZcFngWTBZoFaQVuBZUFmAV1BXwFlwWmBZAFjwWaBZMFfAV2BY4FlwWQBZMFkAWKBZMFkwWKBY8FkQVuBYoFjwWKBY0FjQWKBYkFdQV0BXwFjAV9BXoFeQV4BXUFdQV4BXcFfAV0BXMFewVrBWkFigVeBYkFfAVzBXIFewWLBWsFaQVnBW4FbgVeBYoFiQVeBW0FfAVyBXYFdgVvBXEFawVqBWkFdgVyBXAFdgVwBW8FXgVoBW0FcQVvBWwFbgVjBV4FZwVmBW4FbgVkBWMFXgVlBWgFbgVmBWQFYwViBV4FXgVdBWUFYgVhBV4FXgVhBWAFXgVfBVwFXgVgBV8FXgVbBV0F2QXlBTAG3wXBBewF2QXxBfQF2AXjBdkFmAXUBdgFygXNBbsFzQXKBcYFwAXRBckFxgXKBb8FwAW0BdEFfAW9BZgFuQXABbgFvAW0BawFsgW7BaYF2QXBBZYFrwWlBaQFuQWhBbQFrwWkBa0FjAXZBZYFjAWiBdkFrAW0BaEFlgWxBasFlgWrBagFlAWsBaEFkQWUBaEFmAWiBXkFgwWWBZkFmQWWBaAFhgWZBZIFdQWYBXkFjAWWBYIFigWUBZEFkAWUBYoFgwWZBYYFhgWSBYQFgwWCBZYFegV5BYwFgQWMBYAFgAWMBYIFfwWMBX4FfQWMBX8FhwWDBYYFgQV+BYwFiAWDBYcFhQWGBYQFRgZKBkkGNwZIBkUGSgZBBkQGSgZEBkcGSgZGBj4GSgY+Bj0GSgY9BkAGQAZDBkIGQAZCBkEGSgZABkEGOgY/BjcGOwY8BjkGOQY8BjoGOQY6BjYGNgY6BjcGOAY5BjYGNAY2BjcGNQY2BjQGMgYzBjQGHgfeBiMH+AfVB+UH8wcqB+wH+QfrB9UH0wdZB+IH5QfUB+QH6Af3B9MH4QdeB+AH4gdZB+EH3Ae7ByoH6wfHB9UH4QdZB14H4AdeB9YH2gelB64H6wfOB8cH9wdZB9MHzwepB5sH0AeuB5MHxAdZB/cHyAeUB80HsAd+B7gH1gdeB8sHywdeB5EHvAejB4QHvAeEB4MHtgeQB7cHtAebB4QHtAeEB6MHxAeMB1kHrAeDB50HrAedB6cHsAfNB34HpQeTB64HgweSB50HlAd/B34HlAd+B80HoAdXB6UHpQdXB5MHqQd7B5sHgweCB5IHXgdxB5EHmwd4B4QHjAd9B1kHXgdZB/UGgweEB1wHgwdcB1sHfwdLB34HkQdxB3wHewdiB5sHgwdbB4IHfgcvB2UHmwdiB3gHbwfzBlYHSwcvB34HXQctB1cHkwctB2MHbwdoB/MGfQdUB1kHVwctB5MHYwctB/MGYwfzBmgHXAdOB1sHUwctB10H8wZSB1YHLwdAB2UHXgf1Bj8HWQcWB/UGUwdJBy0HSQc5By0HVAcWB1kHUgc3BzwHUgcwBzcHPwf1BjUHNQf1Bv0GOQcVBy0HUgfzBjAHIQclByoHMAfzBh0HGQf/BvIGFQcNBy0H8wYtB70GFgcLB/UG8wYABx0HGQfyBhcHCwfxBvUGDQe9Bi0H/Qb8BgEH8gb2BhcH9QbuBv0GDQfoBr0GAgj0BugGAAfzBvgG7gb5Bv0G/Qb5BvwG8wa9BuYG9QbxBu0G9QbkBu4G4wbNBvQG9AbNBugG8wbmBvgG8gbMBvYG9QbtBuQG7gbkBuoG4wYDCMEGAwjfBsEGvQbcBuYGwQbJBuMG4wbJBs0GzQa+BugG6Aa+Br0G5wbYBt0G4gbVBtQGzgbBBt8GvQbDBtwG1gZ8BtoG1wacBnwGzAa7BukG6Qa7BsoG0Aa6Bs4GzwatBrkGwQbABskGvgaxBr0G0wa3BswGzAa3BrYGyAaZBscGxwaZBqgGvQaxBqYGvQamBqMGvQajBsMGwgawBqsGvAZvBrUGuQatBn8GuQZ/BpkGowamBqUGqAZ/BqcGBAikBpUGmQZ/BqgGpwZ/BnEGpwZxBp0GnQZxBqQGpAZxBpUGiAaDBpYGcQaCBo0GggZxBn0GfQZxBm0GXgZTBk4GigcACPsHuwf6B/wH5gcACIoH+wf/B4oHigf/B/4Higf9B/IH3Af6B7sHKgfzB/AH1Qf4B/kHqwffB90HqgfxB/UHKgfwB9wHqgf1B/QHqgf0B9sHigfuB+YHpgfvB+0HjQfsByoH9gfuB8oHygfuB4oHuwf8B+cH3QfxB6oHyQfvB6YH2AfsB40H3gfqB8YHpgftB94H1AflB9UHxgfpB8UHdwfyB9kHqwfdB6oHdAfjB8MHqwfZB98HqgfbB7EHjQcFCNgHpgfeB8YHdAfFB+MHdwfZB6sHwwfXB5cHoQfSB9EHoQfRB74HigfyB3cHbQcqB7sHsgeqB7EHOge9B8IHOgfCB8EHdAfGB8UHlwd0B8MHvgfMBzoHuQerB6oHmAfJB6YHOgfMB70HOgfBB8AHOgfAB5YHlgfAB78HOgehB74HkAe2B6QHiwfKB4oHmQe6B7MHpgfGB3QHkAevB7cHlQekB7UHmQezB5wHkAekB5UHRwetB3oHmQecB4gHcwd0B5cHcAeVB0cHegeoB3kHbgefB54HmgeeB6IHQgeKB3cHmAemB3UHpgeHB3UHmgduB54HaQd0B3MHcAeQB5UHjwefB24HiQeZB4gHZgemB3QHcgehBzoHOgeWB2QHgQeLB4oHWgd3B4AHKweJB4gHjwduBzEHgQeKB0IHDAdfB44HDAeOB4YHDAeGB2wHageNByoHawdmB3QHawd0B2kHZweBB0IHKweIB18HCgdyBzoHWgdCB3cHWgeAB2AHWAdwB0cHRwd6B3kHRwd5Bz4HKgdtB0YHagcqB00HSgcpB1AHYQdaB2AHKwdfBwwHUAeFB0oHIQdGB3YHIQd2B0QHOgdkB0gHQgdaB0UHGwcGCFUHDAdsB0EHWAdHB0MHMQduB94G3gZuB08HGwdVBysHKgdGByEHOwdNByoHQQdMBykHAgc6B0gHTwdRBz0HLgdyBwoHPgdDB0cH3gZPBz0HMgdCB0UHAgdIBzgH3gY9BywHNAdDBz4HNgchB0QHMwdCBzIHQAcvB/8GOwcqBycHAgc4BxQHLgcKByAHAgcKBzoH2wYrBwwH4QYpB0oHGQdAB/8GJgchBzYHJgc2BygHGwcrB9sGJwcqByUH4QZBBykH3gYUBzEH3gYsByMHEQclByEHGAfhBkoHIAcKBxIHGgckBwEIDAdBB+EG/wYkBxoHCQciB9sGEAcfBwkHEwccByUHJQcRBxMH/gYYBw4HBwfeBh4H2wYiBxsHnAYQBwkH8gYaBw8H+wbeBgcHBQcQB5wG8gb/BhoH4QYYB/4GEgcKB+8GvwYCBxQH8gYPBwQHmgYKBwIH2wYMB5QGnAYJB9sG7wYDBxIHmgbvBgoHmgYCB78GvwYUB94G+wYHBwYH+gYEBwgH8gYEB/oG4Qb+BqIG6wbyBvoGlAYMB+EGogb+BvAG7AbeBvsG9wYFB5wG9wacBtcG4AbvBpoGogbwBtIG2QbgBpoG3QbeBuwGjAbbBpQG4gbyBusG6Qb2BswG8gbiBtQGvwbeBsYG3QbsBucG0wbyBtQGlAbhBqIG5AbtBuUG3wbQBs4GzAbyBtMGoQaiBtIGnAbbBowGfAbWBtcGswahBtIGxgbeBt0GrAYHCMUG0QazBtIGiAasBsUGsAbaBnwGyga7BqkGsga/BsYGiAbFBrgGuAbFBsQGtQbLBrwGqgaiBqEGtAbKBqkGmga/BrIGrgahBrMGvAarBm8GqwawBnwGoAahBq4GfwatBooGkQbZBpoGmgayBpgGnwaYBrIGngasBogGegaUBqIGiga1Bm8GfAacBowGbwarBnwGhwaiBqoGkQabBtkGegaiBocGrwabBokGiQabBpEGjwaaBpgGlgaXBogGiAaXBp4GaAZ8BowGhgYICK8GjwaRBpoGgwaIBo4GlQZxBo0GjAaUBnoGkwaSBoEGhgaSBggIgwZ7BpYGiwaGBq8GiwavBokGhgaBBpIGdAaQBnsGaAaMBnoGdwZ6BocGdgaABoUGeAaEBnQGfwaKBm8GdgZ5BoAGCQh4BnQGdAZ7BmcGZwZ7BoMGegZ3BmAGdwZ5BnYGfQZtBnUGbwZ8BmgGYAZ3BnYGYAZ2BnIGfwZvBl4GcQZ/Bl4GbAZnBoMGbAaDBn4GbAZ+BnMGaAZ6BmAGbgZgBnIGcAZsBnMGZwYJCHQGbwZoBlMGXgZvBlMGYwZrBgkIYwYJCGcGZAZgBm4GcQZeBmoGbQZxBmoGUwZoBmAGYAZkBl8GWQZjBmcGWQZnBmwGWQZsBmUGZQZsBmkGagZcBloGZgZqBloGYgZZBmUGZgZaBmEGVAZZBmIGUwZgBl8GUgZTBl8GTQZRBlkGXAZqBl4GWwZdBkwGWwZMBlYGVgZMBlUGWAZbBlYGVwZVBlkGVwZZBlQGUwZSBlAGUAZOBlMGTwZNBkwGXAZeBk4GXAZOBksGVQZMBk0GVQZNBlkGPgg7CDwIugi2CLsIugi5CLYItgi1CLsIuwi1CKgItQizCKgIqAizCKkItAi3CKYItwinCKYItQixCLIItQiyCLMItAimCLAItQivCLEIgQi7CKgIrgisCLsIuwisCLoIrQijCKsIowi4CKsIowi3CLgIlAioCJkIqAiiCJkIqAiqCKIItwifCKcIpwilCKYIpwibCKUImgikCLsIpAiuCLsIowihCLcIoQifCLcIoAiYCJ4ImAidCJ4ImAiWCJ0InQiWCJwIlQiaCLsIqAiUCI4IjgiUCJMImAiSCJYIkgiXCJYIjwiVCLsIjgiTCI0IkQiQCLsIkQi7CIEIkAiPCLsIqAiOCIEIigiQCJEIhgiBCIkIgQiOCIkIjAiECIUIhAiMCIsIiAiRCIcIiAiKCJEIvAiFCIIIgwiICIcIggiFCHAIhQiECIAIkQh/CIcIfwiRCGwIhQiACHAIbAiRCIEIgQiGCH4IfQiCCHAIfQhwCHwIgQh+CHoIgAh7CHAIeQh/CGwIcgiBCHgIgQh6CHgIcAh7CHcIdghsCG4Idgh5CGwIbAiBCHIIdQh8CHEIfAhwCHEIcAh3CHQIbghsCGsIawhsCGgIcAh0CHMIcAhzCG8IcQhwCGkIaghxCGkIZAhrCGgIcghtCFwIcAhvCGUIYQhsCFEIbAhyCFEIYAhkCGgIbQhnCFwIXAhnCGMIWAhwCGYIaAhsCGEIUQhyCFwIcAhiCGkIWAhmCF4IYAhoCF0IXAhjCF8ISwhoCGEISwhdCGgIXAhfCFsIYghwCFIIVAhdCEsIVAhXCF0IWQhdCFcIUwhSCDcIUghwCFYIRAhRCFwIUAhUCEsISAhRCEQISQhYCEwIWAhVCEwITwhUCEoITwhOCFQIRQhTCDcILQhWCFgISghUCFAIRwhKCFAIRwhQCEYIVggzCDcIMwhWCC0ISAhECEIILQhYCDYINghYCEkISQhDCDYIPwhECDwIPAhECD4INghDCDgIOAhACD0IOwg+CDoIOQg3CCsINQg8CDsINQg7CDQILQg2CDIILQgyCDAILAgtCDAIKggtCCkIZghwCGUIVghwCFgIWAheCFoIRAhcCE0INwhSCFYIOQhBCEUIOQhFCDcIQghECD8IOAhDCEAIJwgrCDcIJwg3CDMIIwgzCC0ILwgxCC4ILgg5CCIIIgg5CCsIKAgvCC4IKgglCC0ILAgpCC0IJwgzCCMIJQgjCC0IIggoCC4IIAgjCCQIJAgjCCUIJgglCCoIHwgiCCsIHwgrCBsIGwgrCCcIHQgjCCAIIQggCCQIGggnCCMIFggfCBsIHggaCCMIHggjCB0IFggcCB8IGQgbCCcIGQgnCBgIGAgnCBoIFwgcCBYIGQgWCBsIFAgZCBgIFwgWCA8IEggZCBUIFQgZCBQIEwgXCA8IDwgWCA4IEQgWCBkIDggWCBEIEQgZCBAIDQgPCA4IEggQCBkICwgPCAoIDAgPCA0ICggPCAwIEgkUCQcJAQkNCQcJFQkTCfMIFQnzCPIIEQkOCfMIEAnjCAkJAQnXCPgI4wjGCPMI4wjdCMYIyQjLCM8IzgjECMgIEwkRCfMIEgkHCQ0JDgkJCfMI4wgPCQsJ4wgQCQ8J4wgKCf0IBwnyCNcI4wgFCQoJ4wgLCQUJ8wgJCeMI5AgICQMJ/AgDCQIJAQkHCdcI6Qj/CAwJ/gjpCAwJ5AgDCfwI7wj7CPoI6QgGCQAJ5Aj9CAQJ5gj2CPsI6QgACf8I9wjpCP4I4wj9COQI5gj8CPYI5gj7CO8I4Aj1CPQI1wjxCPgI7QjuCPkI8gjzCNcI4Aj0COwI7gjtCMAIzQjsCOkI6Qj3CPAI6wjxCOgI6AjxCNcI6gjpCPAI3QjjCOQIwAjtCOAIzAjpCOoI5QjuCMAIzQjpCMwI4AjsCM0IzAjqCOcI3QjkCPwI3Qj8COYIzAjnCNwI3QjmCNsI2AjlCMAI1QjoCNcI4QjiCOgI4QjoCNUI3wjhCNUI1wjzCMYIwAjgCM0I2gjfCNUI3AjZCMwI0gjdCNsI0wjeCNgI1gjaCNUI0wjYCMAIzwjXCMkI1QjXCM8I1AjWCNUIyQjXCMYI1AjVCNEIxwjTCMAI3QjSCNAI3QjQCMoIxgjdCMoIxwjACL0IxQjGCMoIvQjDCMcIxgjFCMIIvgjDCL0IvwjBCL4IeQmNCYwJiAmNCXkJeQmMCYsJiwl/CXkJiwmKCX8JigmJCX8JiQmHCX8JeQl/CXsJhwmGCX8JfwmGCYQJgQmICXkJfwmECYIJgQmFCYgJgQmDCYUJgAmDCYEJfwmCCX4JgQl9CYAJfwl+CXoJYgmBCXkJfwl6CW4JeQl7CXYJcwl7CXQJdAl7CW4Jewl/CW4JeAmBCXwJeAl9CYEJdwl9CXgJdgl7CXMJcgl4CXwJdAl1CXAJdAlvCXUJdAluCW8JYgl5CXYJbglcCWwJbQl0CXEJdAlwCXEJXAlrCWwJXAloCWsJdglzCWQJYwl0CWYJZQl8CWAJZgl0CWoJZQlpCXwJdAltCWoJXAlnCWgJcwl0CWMJYAl8CV4JXgmBCWIJTQliCXYJZAlzCUwJTAlzCWMJXgliCUAJXQlgCV4JTAlhCV8JTAljCWEJRgl2CWQJWwlMCV8JQAlVCV4JWAleCVcJWgldCV4JTAlbCVkJVQlXCV4JTAlZCVYJTAlWCVQJTQlACWIJQAlRCVUJUglVCVEJTQl2CUYJUAlNCUYJTwlUCVMJTglRCUAJTAlUCUUJRQlUCU8JSwlOCUAJSAlACU0JRQlPCUoJSQlLCUAJRQlKCUcJRAlDCUAJRQlHCUIJUAlGCTgJSAlNCVAJPwk9CUQJRQlCCUEJKglICVAJPglFCUEJNwk4CUYJRQk+CTwJKgkiCUgJOglFCTwJKglQCTgJNQlGCS0JRglFCS0JRQk6CTsJSAkiCSsJNwlGCTUJRQk7CTYJLgkzCTQJLQlFCS8JLwlFCTYJLwk2CTIJMAkqCTgJMQkrCSkJMAkoCSoJKgkoCSYJKgkmCSIJJQknCSkJIgklCSsJIgkfCSUJIgkmCSAJJQkfCSQJHwkjCSQJHwkhCSMJIAkfCSIJHwkcCR4JHgkcCR0JIAkbCR8JHwkZCRwJGwkZCR8JGQkaCRwJGwkYCRkJGwkXCRgJFgkXCRsJXgl8CYEJRQlkCUwJRAlACT8JQwlJCUAJKwlACUgJKwk/CUAJRglkCUUJPQk/CTEJOQk9CTEJMQk/CSsJLAkxCSkJJQkpCSsJIQkfCR4JlQmYCZIJmAmPCZIJlwmVCZYJlgmVCZMJlQmSCZMJlAmOCY8JkgmQCZEJtgm1CbQJswmyCbAJsQmvCa4JrQmsCaoJqgmsCaMJqwmqCaMJrAmcCaMJqwmjCakJqAmpCaMJpwmoCaMJowmcCZ4JpQmmCaQJpgmjCaQJowmhCaIJpQmkCZ8JpAmjCaIJoQmjCaAJowmeCaAJngmcCZ0JnAmbCZ0JnAmaCZsJnAmZCZoJ9Qn4CfIJaQpsCmMKVQpqCmkKZwpqCmUKZQpqClUKVQppCmMKZgplClUKYgpmClUKVQpjClkKXwpiClUKXgpcClkKVQpKCj8KKQofCigKIgofCiEKIAodCh8KGwocCh8KHQoXCg4KHwoRChAKDgoRCh8K+gnmCfwJBgrmCf4J/wnwCeMJ+gnpCeYJ8gnnCegJ6QnXCeYJ5gnbCeAJ5gnXCdsJbgpvCm0KawpuCm0KYwpuCmsKYwprCmgKWQpjCmgKWQpoCmQKYQpZCmQKVQpgCl8KVwpgClUKWQphCl4KQwpbCl0KSgpVClkKQwpdClgKQwpaClsKWQpcClYKUwpaCkMKWApXCj8KPwpXClUKWQpWCk8KQQpUClEKQQpOClQKQwpRClMKSQpPClAKQwpBClEKQApYCj8KOwpZCk8KQQpNCkwKOwpPCkkKQQpMClIKUgpOCkEKQwpYCkAKSgpZCjsKPApLCk0KOwpJCkgKRwpGCjwKRgpLCjwKPApNCjQKNApNCkEKOwo/CkoKPApECkcKOwpICkUKQgpECjwKMwpBCkMKOQo7CkUKKwpACj8KQwpACjMKKwo/CjsKPQpCCjIKPQoyCjUKMgpCCjwKNQo+Cj0KNApBCjMKLwo7CjkKOgo+CjUKNQo3CjoKJwo0CjMKKwo7Ci8KLwo5CjgKMgo8CjQKMApACisKLwo4Ci4KNgo3CjUKLAo1CjIKMAozCkAK/wksCjIKJgoyCjQKMQo2CjUKJgo0CicKJwozChYKFgozCggKCAozCjAKMQo1CioKMAorChkKKwovChUKKgo1CiwK/wkyCiYKFQouCi0KFQovCi4K9AksCv8JFQotCiUKDAoWCggK/wkmCgsKCAowChkKCQonChYKCwomCgkKJAoqCgIKKAofCiMKJgonCgkKGQorChUKIwofCiIKBAoZChUKFAoVCiUKAgoNCiQKKQogCh8K8QkqCiwKIQofCvwJHgohCvwJAQoMCggKAgoqCvEJ/AkfChwK8QksCvQJDwoeCvwJHQoOCh8KHAobChoK8wkWCgwKHAoaCvoJ+gkaCg0K/AkcCvoJFwoSCg4KHwoTChsK8An/CQsKCQoWCvMJDwr8CQYKCgoUChgKHwoQChMKDAoBCvkJ9gkZCgQKBAoVChQKBAoUCgoK+gkNCgIK8AkLCgkKCAoZCvYJ8wkMCvkJ6QkCCvEJ2AnxCfQJ4Qn5CQEKBQoHCgYK8AkJCvMJ9An/CeMJAQoICvYJBQoGCv4JAwoECgoKBgr8CeYJAAoFCv4J9gkECvsJ+wkECgMK+gkCCukJ/Qn7CQMK8gn+CeYJ+An+CfIJ8AnzCe0J7QnzCdoJ+QnhCewJ+wn9CfcJAQr2CeUJ8wn5CewJ5Qn2CfsJ2gnzCewJ+wn3Ce4J6QnxCdgJ2An0CeMJ4QkBCuUJ8gnmCecJ7QnaCcwJ5Qn7Ce4J4wnwCe0J6wnvCfIJ6wnyCegJ5QnuCeoJ4wntCcwJywnsCeEJ5AnlCeoJ6QnYCdcJ3wnhCeUJtwnsCcsJ2AnjCc4J4gnmCeAJywnhCd0J3wnlCd4J3gnlCeQJzgnjCcwJwAnMCdoJ4QnfCd0JywndCcEJ0wnXCdgJzQnOCcwJxwnMCcUJvgnACdoJ1gnfCd4JwQndCdIJ0gndCdEJ0QndCdwJzwnYCc4J1QnTCdgJ7Am+CdoJuAnsCbcJ3QnfCdYJ2QndCdYJ3AndCdkJ1AnYCc8J1QnYCdQJ1AnPCdAJxgnHCcUJxQnMCcAJygnNCcwJygnMCckJvwnACb4JugnsCbkJyAnMCccJxQnACcQJvQm+CewJwwnLCcIJwgnLCcEJvAm9CewJvAnsCbsJuwnsCboJuAm5CewJtwnLCcMJ2wrsCvwK1AraCt8K1wrWCtAKgAuDC4ELfQuBC4ILfQuAC4ELfwt9C4ILfQt/C34Lewt+C3wLewt9C34Lewt8C3oLewt5C30Lewt6C3gLewt3C3YLdQt5C3sLewt2C3QLcwt7C3QLcgt7C3MLZQt1C3sLZQtxC3ULZQtuC3ELcAt7C3ILbgtlC2wLbQtwC28LawtsC2ULbQtcC3ALawtlC2kLcAthC3sLVAtmC2ALZQthC1sLXgtiC1sLYQtKC1sLXAtQC0oLXgtbC1oLWAtTC1cLWwtNC1oLWgtNC1ILWgtSC1ULVgtTC1gLVgtRC1MLWwtOC00LWwtKC0MLWwtJC0wLWwtMC04LWwtDC0kLTws8C0YLRQtBC0sLSwtBCz4LKgs1C0oLSgtAC0MLRwtICzwLRgs8Cz8LRQtEC0ELNQs7C0oLSAsQCzwLSgs7C0ALOQs4C0ILPAsQCy0LPAstCz8LSAszCxALOQsmCzgLQQs3Cz4LJwsvCyoLKgsvCzULPQsQCy4LMwsuCxALOAsmCysLMAsDCykLNAspCxALNAsQCz0LKAsxCzcLMgsdCzoLOgsdCywLLAsdCyYLLQsQCwkLLQsJCxkLJgsYCysLJgsdCxgLIwv/ChELCQsPCxkLFQsOCx0LHQsOCxgLGwsTCxYLGAsOCwcLFQsGCw4LAwvzChALDQsTCwoLEAvzCgkLDwsJCwsLDgv8CgcLCQvzCvAKCQvwCgsLCwvwCgILBgv6CvkKAgvwCv0K+grjCvkK9grwCvUK9wrqCucK8gr1Cu8K8QrlCs4K8QrOCvoK8AqyCvUK+grOCuMKsgrmCu4K5wrLCugKvwrcCuQK5wquCssK5gqyCr4K4wrDCt8K4gqbCq0K4wrOCsQK4wrECsMKwwrUCt8K4QrTCuAKhAvSCs4KwwrBCtQKywqXCpsK3grKCt0K3QqrCscKzgrSCsYK3QrHCtAKzgrGCrsKzgq7Cs8KzAqvCpIKzgrPCsQKqwq9CscKxQq3Cp0KxQqdCrYKsgqtCqEKvgqyCqwKywquCogKoQqmCrIKsgqmCqwKqwqpCr0KhQudCq8KqwqqCqkKywqICpcKmAqaCq0KrQqeCqEKrQqaCp4KlwqNCpAKiAqMCnwKlwqHCooKdwt7C3gLYQtlC3sLVAttC2oLVAtqC2cLXAttC1QLVAtoC2YLVAtnC2gLYQtwC1wLWwtkC2kLWwtpC2ULWwtiC2QLYAtjC1kLSgthC1wLVAtgC1kLUAtcC1QLXwtdC1MLWQtfC1MLUwtdC1cLUAtUCzYLSgtQCyoLMQtUC1kLMQtZC1MLNgtUCzELKAs2CzELKgtQCzYLPgtRC0sLUwtRCz4LMQtTCz4LJwsqCyELNwsxCz4LKgs2CyQLJAs2CygLJQskCygLJQsoCxsLHAs3Cx8LHAsoCzcLIQsqCyILGwsoCxMLIgsqCyQLEAspCwMLEwsoCxwLIwuGC/8KAwsgCxoL/wqGCx4LMAsgCwMLFwv/Ch4LAwsaCxELDAsYCwcLEwscCxQLCAsTCxQLDQsWCxMLEgv/ChcLAwsRC/8K7QoBCwwL7QoMCwcLAAsSCwULDgsGC/kKBAsKCxMLBAsTCwgL/AoOC/kKBwv8CuwK/woSCwALAwv/CugK7QoHC+wK8woDC+gK/Ar5CtsK/goBC/gK+AoBC+0K6Ar/CgAL5woAC/sK2wr5CuMK7QrsCr8K/QrwCvYK9Ar4Cu0K5wr7CvcK5wroCgAL6wr0Cu0K8wroCuIK8ArzCuIK7wr1CrIK7wqyCu4K7ArbCr8KsgrwCq0K6wrtCr8K2wrjCt8K6QrrCr8K5wrqCuAKrQrwCuIKuQq/CtsK4groCpsK6Qq/CuQK5wrgCq4KywqbCugKuQrbCt8K3Aq/CtUKrgrgCtMK1grdCtAKpQrdCtYKqArZCskK2ArZCqgK0QrYCqgKyAreCt0KpQrWCsIKpQrCCpMKwgrWCs0K1Qq/CroKugq/CrEK0wrACq4KpQrICt0Kvwq5CrEK3QrKCqsKqArJCsgKqArICqUKvArRCqgKkwrCCrUKrgrACrQKkgq4CrMKmwqXCpQKvAqoCrcKsAqxCrkKnwq4CpIKhQu2Cp0Kkwq1CqQKrgq0CpwKnAq0CqcKsAq5CqMKrQqbCpgKhAqoCqUKtwqoCoQKhAqlCpMKnQq3CoQKjwqTCqQKnAqnCqIKnAqiCqAKkgqvCp0KiAquCpwKiAqcCowKmQqfCoYKhgqfCpIKmwqUCpYKmAqbCpYKeAqSCp0KjwqVCoMKkAqUCpcKeAqdCoQKhAqTCo8KhgqSCngKgwqVCpEKgwqRCo4KlwqICoIKjQqXCooKhAqPCoMKgwqOCokKhwqXCoUKfAqMCosKiAp8Cn8KhQqXCoIKcQqECoMKggqICn8KeAqECnEKdgpxCoMKfgqBCoYKdQqDCnkKeQqDCoAKfgqGCnsKfQqBCn4KdwqGCngKegp2CoMKegqDCnUKcgpzCngKcgp4CnEKdwp4CnQKewqGCncKcApxCnYK+Qv2C/oL9gv4C+0L+Av1C+0L9Av3C/oL+gv2C+0L9QvzC+0L9Av6C/EL8wvyC/AL8Qv6C+4L+gvtC+oL8wvwC+0L+gvqC+4L7gvqC+wL7AvqC+sL6gvpC+sL6AvpC+oL6AvqC+0L6AvtC+QL7QvhC+QL5wvoC+YL5QvmC+gL6AvkC90L5QvoC+ML4QvbC+QL4QvZC9sL5AvbC90L4gvoC+AL3wvoC90L4AvoC98L3QvbC9ML3AvTC9oLzgvTC9ILlguJC5kLlwuLC4gL7wvuC+wL4gvjC+gL3QveC98L0wvcC94L0wveC90L0wvbC9YL1gvbC9kL2gvTC9gL1wvYC9ML0wvWC9IL0gvWC8wL1QvXC9ML1AvVC9ML1AvTC84L0QvUC84LzgvSC8gL0gvMC8UL0AvRC84LywvMC88LygvOC8gLvQvIC9ILxQvMC8cLxwvMC8sLyQvNC8ALvQvSC8ULwAv7C8kLxAvFC8cLxgvIC70LxAu9C8ULwwvAC64LwgvGC70Lugu9C8QLvwvCC70LwQvCC78LvgvDC64LvAu/C70Ltwu9C7oLuwu9C7cLtAu6C7MLuQu8C70LtAu3C7oLsQu+C64Luwu5C70LtQu2C7gLsQuuC68LrQuvC64LrAu2C7ULrAu1C6cLpwu1C7ILqQutC64LpwuyC7ALpwuwC/wL/AurC6oLqAusC6cLowv8C6oLowunC/wLowuqC6ULoQumC6cLoQunC6MLowukC6ILoAujC6ILmwueC6ELowubC6ELmgujC50LnQujC6ALnAufC/0LkAubC6MLlQujC5oLkQuSC5gLlQuQC6MLiguXC5YLjwuKC5YLlAuNC5ULkwuSC5ELhwuMC5ALlQuHC5ALlguXC4kLjguHC5ULjguVC40LiAuLC4wLiAuMC4cLlwuIC4kLAQwADAIMAQz/CwAM/wv+CwAMLwwuDC0MOAxDDD4MOAxCDEMMOAw1DEEMOAxBDEIMNQw9DEEMQAw5DDgMQAw4DD4MQAw+DD8MPQw1DDsMOgw4DDkMOgw8DDgMNww2DDoMNgw8DDoMNgw0DDwMMgw0DDYMMgw2DDMMMQwvDDIMLww0DDIMNAwrDDAMKww0DC8MLQwrDC8MKwwpDDAMLAwrDC0MLAwqDCsMKwwlDCkMKAwrDCoMKwwoDCYMKAwnDCYMKQwlDCMMJgwkDCsMKwwkDCUMJAwfDCUMJQwfDCMMIwwfDCEMJAwiDB8MIgwgDB8MHwwdDCEMIAweDB8MHwwYDB0MHgwcDB8MGAwaDB0MHwwcDBgMHAwZDBgMGwwZDBwMGAwWDBoMGQwXDBgMFwwWDBgMFgwUDBoMFQwUDBYMFQwTDBQMEwwSDBQMEgwQDBQMEgwRDBAMFAwQDA8MDQwJDAsMDAwKDA0MDQwKDAkMCgwIDAkMCgwHDAgMBwwFDAgMBgwEDAcMBwwEDAUMBgwDDAQMDwwMDA0MDAwPDA4M"};
/* The face in the neurons' texture: the reference's wireframe grid laid on
   EVE's head and shoulders (BUST_MESH), every grid line a ghost-fibre ribbon
   (GhostNeurons): rings up the bust and meridians around it, traced on the
   surface by casting rays in toward the bust's axis. A faint dark body keeps
   the far side from reading at full strength; the cut at the shoulders fades. */
window.makeBustFibre = function makeBustFibre(R, camPos){
  const B = window.BUST_MESH;
  const g = new THREE.Group();
  if (!B) return g;
  const raw = Uint8Array.from(atob(B.b), c => c.charCodeAt(0)).buffer;
  const q = new Uint16Array(raw, 0, B.n*3);
  const idx = new Uint16Array(raw.slice(B.n*9, B.n*9 + B.i*2));
  const pos = new Float32Array(B.n*3);
  for (let k=0;k<B.n*3;k++){ const a = k % 3; pos[k] = B.min[a] + q[k]/65535*B.rng[a]; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const H = R*2.85, k = H / B.rng[1];        // its lower fifth fades out: what shows matches the DNA's height
  geo.scale(k, k, k);
  geo.translate(0, -H*0.5, 0);
  geo.computeVertexNormals();
  geo.computeBoundingBox();

  // trace the grid on the surface: a ray from outside, aimed horizontally at the
  // bust's vertical axis, lands on the outermost skin at that height and angle
  const probe = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side:THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  const FAR = R*4;
  const hit = (h, ang) => {
    const y = -H*0.5 + h*H;
    const dir = new THREE.Vector3(-Math.cos(ang), 0, -Math.sin(ang));
    ray.set(new THREE.Vector3(Math.cos(ang)*FAR, y, Math.sin(ang)*FAR), dir);
    const r = ray.intersectObject(probe, false);
    if (!r.length) return null;
    const q = r[0].point.addScaledVector(r[0].face.normal, R*0.006); q.n = r[0].face.normal.clone(); return q;
  };
  const fadeAt = h => 0.36 + 0.6*(1 - THREE.MathUtils.smoothstep(h, 0.08, 0.42));   // 'along': near 1 fades out
  const list = [];
  // cinematic light, baked per point: a soft key from the face's left and a
  // little above, the far side of the head sunk to a dim glow (it reads solid,
  // not as a flat net), and the shoulders falling off toward the cut
  const FRONT = new THREE.Vector3(Math.cos(175*Math.PI/180), 0, Math.sin(175*Math.PI/180));
  const SIDE = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), FRONT);
  const KEY = FRONT.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, 0.45, 0)).addScaledVector(SIDE, 0.7).normalize();
  const sm3 = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0)/(e1 - e0))); return t*t*(3 - 2*t); };
  const lumOf = (q, h) => {
    if (!q.n) return 1;
    const key = Math.pow(Math.max(q.n.dot(KEY), 0), 1.2);
    const facing = sm3(-0.35, 0.25, q.n.dot(FRONT));
    return (0.5 + 0.8*key) * (0.36 + 0.64*facing) * (0.6 + 0.4*sm3(0.05, 0.5, h));
  };
  const lit = run => ({ lum:run.map(s => lumOf(s.p, s.h)), ht:run.map(s => s.h) });
  // a grid line is broken wherever the surface jumps (an ear, the chin, a
  // shoulder blade) instead of drawing a straight chord across the gap
  const pushRuns = (samples, maxGap, make) => {
    let run = [];
    const flush = () => { if (run.length >= 5) make(run); run = []; };
    samples.forEach(s=>{
      if (!s.p){ flush(); return; }
      if (run.length && run[run.length-1].p.distanceTo(s.p) > maxGap) flush();
      run.push(s);
    });
    flush();
  };
  // rings
  const RINGS = 18, SEG = 72;
  for (let i=1;i<=RINGS;i++){
    const h = i/(RINGS + 1.2), a = fadeAt(h);
    const samples = [];
    for (let j=0;j<=SEG;j++) samples.push({ p:hit(h, j/SEG*Math.PI*2), h });
    pushRuns(samples, R*0.14, run => list.push(Object.assign({ pts:run.map(s=>s.p), w0:R*0.05, w1:R*0.05, a0:a, a1:a, seed:i*1.3, kind:'axon', daughter:false }, lit(run))));
  }
  // the crown: its top is nearly flat, where level rays skim past, so there the
  // surface is found by rays straight down from above, around the crown point
  const pa = geo.attributes.position, topY = geo.boundingBox.max.y;
  let cx = 0, cz = 0, cn = 0;
  for (let i=0;i<pa.count;i++) if (pa.getY(i) > topY - H*0.03){ cx += pa.getX(i); cz += pa.getZ(i); cn++; }
  cx /= cn || 1; cz /= cn || 1;
  const down = (x, z) => {
    ray.set(new THREE.Vector3(x, topY + R, z), new THREE.Vector3(0, -1, 0));
    const r = ray.intersectObject(probe, false);
    if (!r.length) return null;
    const q = r[0].point.addScaledVector(r[0].face.normal, R*0.006); q.n = r[0].face.normal.clone(); return q;
  };
  // meridians: bottom to crown and on over the top to the crown point
  const MER = 26, STEPS = 48;
  const rims = [];
  for (let i=0;i<MER;i++){
    const ang = i/MER*Math.PI*2;
    const samples = [];
    for (let j=0;j<=STEPS;j++){ const h = 0.02 + 0.96*j/STEPS; samples.push({ p:hit(h, ang), h }); }
    // close over the top: from the last level hit, inward to the crown point
    let last = null;
    for (let j=samples.length-1;j>=0;j--) if (samples[j].p){ last = samples[j]; break; }
    if (last && last.h > 0.8){
      while (samples.length && !samples[samples.length-1].p) samples.pop();
      const dx = last.p.x - cx, dz = last.p.z - cz, rho = Math.hypot(dx, dz);
      rims.push(rho);
      // stopping just short of the crown point, so 26 lines don't pile into a hot spot there
      for (let k=1;k<=8;k++){
        const f = 1 - k/10, q = down(cx + dx*f, cz + dz*f);
        if (q) samples.push({ p:q, h:1 });
      }
    }
    pushRuns(samples, R*0.12, run => list.push(Object.assign({ pts:run.map(s=>s.p), w0:R*0.05, w1:R*0.04,
      a0:fadeAt(run[0].h), a1:fadeAt(run[run.length-1].h), seed:i*2.1, kind:'axon', daughter:false }, lit(run))));
  }
  // two small rings close the cap
  const rimR = rims.length ? rims.reduce((a, b) => a + b, 0) / rims.length : 0;
  [0.62, 0.27].forEach((f, n)=>{
    const samples = [];
    for (let j=0;j<=48;j++){ const a = j/48*Math.PI*2; samples.push({ p:down(cx + Math.cos(a)*rimR*f, cz + Math.sin(a)*rimR*f), h:1 }); }
    pushRuns(samples, R*0.14, run => list.push(Object.assign({ pts:run.map(s=>s.p), w0:R*0.05, w1:R*0.05, a0:0.36, a1:0.36, seed:40 + n, kind:'axon', daughter:false }, lit(run))));
  });

  const M = GhostNeurons.materials({ fog:0.021, gain:1, haze:0.1, drift:0, sweep:0.28, line:0xb4d4ff, glow:0x2a5ad0 });
  const rg = GhostNeurons.ribbons(list, 14);
  const turn = new THREE.Group();
  const body = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms:{ uH:{value:H} }, transparent:true, depthWrite:false,
    vertexShader:`varying float vH; uniform float uH; void main(){ vH = (position.y + uH*0.5)/uH; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`varying float vH; void main(){ gl_FragColor = vec4(0.004, 0.012, 0.04, 0.45 * smoothstep(0.42, 0.66, vH)); }`,
  }));
  body.renderOrder = 2.19;
  const haze = new THREE.Mesh(rg, M.haze), lines = new THREE.Mesh(rg, M.ribbon);
  [haze, lines].forEach(m => { m.frustumCulled = false; m.renderOrder = 2.2; });
  // the face's measured front (nose and symmetry plane) points 175 deg round
  // from +x; this turns it to +z, so turn.lookAt() can aim it squarely
  const face = new THREE.Group();
  face.rotation.y = THREE.MathUtils.degToRad(175 - 90);
  face.add(body, haze, lines);
  turn.add(face);
  g.add(turn);
  let aimed = false;
  g.userData = { cores:[M.ribbon], shells:[], lines:[], spin:new THREE.Vector3(0,0,0), still:true,
    tick:(t)=>{
      // still, sitting just above the chapter title and looking straight into the
      // camera where it stops for this chapter (turned and pitched, never rolled)
      turn.position.y = R*0.71;                       // tuned to chapter 2's copy (7 lines): just above its title
      if (!aimed && camPos && turn.parent){
        turn.parent.updateWorldMatrix(true, false);
        turn.lookAt(camPos);
        aimed = true;
      }
    } };
  return g;
};
/* where the camera stops for a chapter: the face looks straight into it */
const holdCamPos = ch => {
  const i = CHAPTERS.indexOf(ch);
  return i < 0 ? null : spine.getPointAt(STOPS[i] - 0.040);   // 0.040 = APPROACH
};
ASSETS.face = (R, ch) => makeBustFibre(R, holdCamPos(ch));

/* The Instagram glyph (OPERATOR's icon) for chapter 2 (THE SHIFT), a touch
   smaller than the DNA, just above its title. A solid object: the frame a
   rounded tube, the lens a torus, the flash a small sphere, all wearing EVE's
   neuron skin (fine ghost-fibre threads flowing over it, a velvet glow at its
   edges, drifting specks) in the corridor neurons' blues. Lit like a film
   still: a hard key from the top left falling into shadow at the bottom right,
   and a slow glint sliding across it. Always turned square to the camera. */
window.makeInstaFibre = function makeInstaFibre(R){
  const g = new THREE.Group();
  // the glyph's 32-unit viewBox (ink spans 4..28): 24 units = a touch under the
  // DNA's height (it's square, so at full height it reads bigger than the others)
  const S = R*2.0/24;
  const at = (x, y) => new THREE.Vector3((x - 16)*S, (16 - y)*S, 0);
  // the frame's centreline, a rounded square (stroke ~2.3 units)
  const H = 10.85, RC = 6.1, path = [];
  [[1,1],[-1,1],[-1,-1],[1,-1]].forEach(([sx, sy], q) => {
    for (let i=0;i<=16;i++){
      const a = (q + i/16)*Math.PI/2;
      path.push(at(16 + sx*(H - RC) + Math.cos(a)*RC, 16 + sy*(H - RC) + Math.sin(a)*RC));
    }
  });
  const frameCurve = new THREE.CatmullRomCurve3(path, true, 'centripetal');
  const frame = new THREE.TubeGeometry(frameCurve, 260, 1.15*S, 28, true);
  const ring = new THREE.TorusGeometry(4.85*S, 1.05*S, 28, 120);
  ring.translate(0, -0.05*S, 0);
  const dot = new THREE.SphereGeometry(1.4*S, 28, 20);
  dot.translate((22.3 - 16)*S, (16 - 9.8)*S, 0);
  // uv in glyph units: x along the stroke, y around it, so the threads can run
  // along each bar (like a nerve's fibres) instead of across it
  // aRun: 0..1 once round the stroke, for the light pulses travelling along it
  // (dir 1); -1 marks the flash dot (it pulses instead), -2 the lens ring (no light)
  const unitsUv = (geo, along, around, dir) => {
    const uv = geo.attributes.uv, run = new Float32Array(uv.count);
    for (let i=0;i<uv.count;i++){
      run[i] = dir > 0 ? uv.getX(i) : dir;
      uv.setXY(i, uv.getX(i)*along, uv.getY(i)*around);
    }
    geo.setAttribute('aRun', new THREE.BufferAttribute(run, 1));
  };
  unitsUv(frame, frameCurve.getLength()/S, 2*Math.PI*1.15, 1);
  unitsUv(ring, 2*Math.PI*4.85, 2*Math.PI*1.05, -2);
  unitsUv(dot, 2*Math.PI*1.4, Math.PI*1.4, -1);

  const U = { uS:{value:S}, uR:{value:R}, uTime:{value:0}, uGain:{value:1},
              uLine:{value:new THREE.Color(0x6f9be8)}, uGlow:{value:new THREE.Color(0x1a3aa8)},
              uKey:{value:new THREE.Vector3(-0.62, 0.62, 0.48).normalize()} };
  const skin = new THREE.ShaderMaterial({
    uniforms:U, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:`
      attribute float aRun;
      varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vON; varying vec2 vUv; varying float vRun;
      void main(){
        vP = position; vON = normal; vUv = uv; vRun = aRun;
        vec4 mv = modelViewMatrix*vec4(position,1.0);
        vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader:`
      uniform float uTime; uniform float uGain; uniform float uR; uniform float uS;
      uniform vec3 uLine; uniform vec3 uGlow; uniform vec3 uKey;
      varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vON; varying vec2 vUv; varying float vRun;
      ${NOISE_GLSL}
      // a pulse of light travelling round a stroke: a bright head, a tail fading behind it
      float pulse(float run, float head){
        float d = fract(head - run + 0.5) - 0.5;        // + behind the head, - ahead of it
        float tail = exp(-max(d, 0.0)*16.0);
        float lead = exp(-d*d/(0.018*0.018));           // a soft glowing front, no hard edge
        return d >= 0.0 ? max(tail*0.85, lead) : lead;
      }
      // one layer of ghost fibres (EVE's recipe), laid along the stroke: a = along
      // it, c = around it (glyph units), each thread wandering a little as it runs
      float fibres(float a, float c, float freq, float sharp, float t, float sd){
        float w = fbm(vec3(a*0.18 - t, c*0.4, sd))*1.1;
        float x = c*freq + w + sin(a*0.35 + t*1.7 + sd)*0.3;
        float d = abs(fract(x) - 0.5)*2.0;
        return pow(1.0 - d, sharp);
      }
      void main(){
        vec3 p = vP/uR*2.4;
        float t = uTime*0.12;
        float a = vUv.x, c = vUv.y;
        float f1 = fibres(a, c, 1.1, 14.0, t, 0.0);
        float f2 = fibres(a*1.1 + 3.0, c + 0.37, 1.4, 16.0, -t*0.8, 4.1);
        float f3 = fibres(a*0.8 + 7.0, c + 0.11, 1.2, 6.0, t*0.5, 9.7);
        float threads = max(f1, f2*0.8);
        // velvet edge: the strands crowd at the outline like a bundle's haze
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        vec3 sp = floor(p*26.0 + vec3(0.0, uTime*0.9, 0.0));
        float speck = step(0.99, hash(sp)) * (0.5 + 0.5*sin(uTime*3.0 + hash(sp + 7.0)*30.0));
        // film light: a hard key from the top left on the tube's real curvature,
        // and the whole glyph falling off into shadow toward the bottom right
        vec3 n = normalize(vON);
        float key = pow(max(dot(n, uKey), 0.0), 1.3);
        float diag = clamp(((vP.x - vP.y)/(24.0*uS)) + 0.5, 0.0, 1.0);   // 0 top left .. 1 bottom right
        float fall = mix(1.25, 0.3, smoothstep(0.0, 1.0, diag));
        // light travelling round the frame like a signal down a nerve (two pulses
        // chasing); the lens ring has none; the flash dot pulses with a glow
        float run = 0.0;
        if (vRun >= 0.0){
          float h = uTime*0.07;
          run = pulse(vRun, h) + pulse(vRun, h + 0.5);
        } else if (vRun > -1.5){
          run = 0.25 + 1.1*pow(0.5 + 0.5*sin(uTime*1.4), 2.0);
        }
        // rich and solid: a deep body colour carries it, the threads ride faintly on top
        vec3 col = uGlow*(0.38 + 0.35*f3 + 0.8*rim + 0.75*key)
                 + uLine*(threads*(0.18 + 0.42*key) + rim*0.3 + key*0.12)
                 + vec3(0.6,0.75,1.0)*speck*0.45;
        col *= fall;
        col += (mix(uGlow, uLine, 0.6)*0.8 + uLine*threads*0.6) * run;   // subtle: a shimmer, not a flare
        col += vec3(0.75, 0.88, 1.0) * pow(run, 3.0) * 0.12;
        gl_FragColor = vec4(col * uGain, 1.0);
      }`,
  });
  // a dark body first, as under EVE: the tube's far side and the corridor behind don't show through
  const shadeMat = new THREE.MeshBasicMaterial({ color:0x01030a, transparent:true, opacity:0.9, depthWrite:true });
  const inner = new THREE.Group();
  [frame, ring, dot].forEach(geo => {
    const shade = new THREE.Mesh(geo, shadeMat); shade.renderOrder = 2.18;
    const body = new THREE.Mesh(geo, skin); body.renderOrder = 2.2;
    inner.add(shade, body);
  });
  // the velvet: a fatter, soft copy of each part glowing outward like the
  // ribbons' haze, brightest over the stroke and gone by its edge
  const velvet = new THREE.ShaderMaterial({
    uniforms:{ uGain:U.uGain, uGlow:U.uGlow, uLine:U.uLine, uS:U.uS, uTime:U.uTime, uDot:{value:0} }, transparent:true, depthWrite:false, depthTest:false,
    // additive light that leaves the canvas's alpha alone (as the ribbons do),
    // or the page behind shows through darker around it
    blending:THREE.CustomBlending, blendEquation:THREE.AddEquation,
    blendSrc:THREE.OneFactor, blendDst:THREE.OneFactor, blendSrcAlpha:THREE.ZeroFactor, blendDstAlpha:THREE.OneFactor,
    vertexShader:`varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position,1.0);
        vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader:`uniform float uGain; uniform vec3 uGlow; uniform vec3 uLine; uniform float uS; uniform float uTime; uniform float uDot;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.4);
        float diag = clamp(((vP.x - vP.y)/(24.0*uS)) + 0.5, 0.0, 1.0);
        vec3 col = uGlow * f * 0.22 * mix(1.2, 0.45, diag);
        // the flash dot's halo swells and fades with its pulse
        float beat = pow(0.5 + 0.5*sin(uTime*1.4), 2.0);
        col += mix(uGlow, uLine, 0.4) * f * uDot * (0.15 + 0.85*beat) * 0.9;
        gl_FragColor = vec4(col * uGain, 1.0);
      }`,
  });
  const halo = [
    new THREE.TubeGeometry(frameCurve, 160, 2.4*S, 16, true),
    new THREE.TorusGeometry(4.85*S, 2.2*S, 16, 80).translate(0, -0.05*S, 0),
    new THREE.SphereGeometry(3.2*S, 24, 16).translate((22.3 - 16)*S, (16 - 9.8)*S, 0),
  ];
  const dotVelvet = velvet.clone();
  dotVelvet.uniforms = Object.assign({}, velvet.uniforms, { uDot:{value:1} });   // shares uTime / uGain
  halo.forEach((geo, n) => { const m = new THREE.Mesh(geo, n === 2 ? dotVelvet : velvet); m.renderOrder = 2.17; inner.add(m); });
  const turn = new THREE.Group();
  turn.add(inner);
  g.add(turn);
  // the loop drives uTime / uGain on cores
  g.userData = { cores:[skin], shells:[], lines:[], spin:new THREE.Vector3(0,0,0), still:true,
    tick:(t)=>{
      // placed like the DNA: just above its chapter title (chapter 2's copy is 7 lines too),
      // floating gently and facing straight into the camera
      turn.position.y = R*0.225 + Math.sin(t*0.45)*R*0.04;   // bottom edge where the DNA's is
      // aimed at the real camera every frame (where it actually stops, not the
      // planned hold point), so it always meets it square-on
      if (turn.parent){
        turn.parent.updateWorldMatrix(true, false);
        turn.lookAt(camera.position);
      }
    } };
  return g;
};
ASSETS.insta = (R) => makeInstaFibre(R);

/* Chapter 4 (IN PROGRESS) candidates, built like the Instagram glyph: solid
   tubes in the neuron skin, rich and lit from the top left. makeNeuronIcon
   takes the parts (geometry, its stroke length / girth in units, and an aRun
   per vertex) and a GLSL snippet that sets 'run' (extra light) and 'dim'. */
function makeNeuronIcon(R, S, parts, runGLSL, extra){
  const U = { uS:{value:S}, uR:{value:R}, uTime:{value:0}, uGain:{value:1}, uGlitch:{value:0},
              uLine:{value:new THREE.Color(0x6f9be8)}, uGlow:{value:new THREE.Color(0x1a3aa8)},
              uKey:{value:new THREE.Vector3(-0.62, 0.62, 0.48).normalize()} };
  parts.forEach(pt => {
    const uv = pt.geo.attributes.uv, run = new Float32Array(uv.count);
    for (let i=0;i<uv.count;i++){
      run[i] = pt.run(uv.getX(i), uv.getY(i));
      uv.setXY(i, uv.getX(i)*pt.along, uv.getY(i)*pt.around);
    }
    pt.geo.setAttribute('aRun', new THREE.BufferAttribute(run, 1));
  });
  const skin = new THREE.ShaderMaterial({
    uniforms:U, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:`
      attribute float aRun;
      varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vON; varying vec2 vUv; varying float vRun;
      void main(){
        vP = position; vON = normal; vUv = uv; vRun = aRun;
        vec4 mv = modelViewMatrix*vec4(position,1.0);
        vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader:`
      uniform float uTime; uniform float uGain; uniform float uR; uniform float uS; uniform float uGlitch;
      uniform vec3 uLine; uniform vec3 uGlow; uniform vec3 uKey;
      varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vON; varying vec2 vUv; varying float vRun;
      ${NOISE_GLSL}
      float pulse(float run, float head){
        float d = fract(head - run + 0.5) - 0.5;
        float tail = exp(-max(d, 0.0)*16.0);
        float lead = exp(-d*d/(0.018*0.018));
        return d >= 0.0 ? max(tail*0.85, lead) : lead;
      }
      float fibres(float a, float c, float freq, float sharp, float t, float sd){
        float w = fbm(vec3(a*0.18 - t, c*0.4, sd))*1.1;
        float x = c*freq + w + sin(a*0.35 + t*1.7 + sd)*0.3;
        float d = abs(fract(x) - 0.5)*2.0;
        return pow(1.0 - d, sharp);
      }
      void main(){
        vec3 p = vP/uR*2.4;
        float t = uTime*0.12;
        float a = vUv.x, c = vUv.y;
        float f1 = fibres(a, c, 1.1, 14.0, t, 0.0);
        float f2 = fibres(a*1.1 + 3.0, c + 0.37, 1.4, 16.0, -t*0.8, 4.1);
        float f3 = fibres(a*0.8 + 7.0, c + 0.11, 1.2, 6.0, t*0.5, 9.7);
        float threads = max(f1, f2*0.8);
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        vec3 sp = floor(p*26.0 + vec3(0.0, uTime*0.9, 0.0));
        float speck = step(0.99, hash(sp)) * (0.5 + 0.5*sin(uTime*3.0 + hash(sp + 7.0)*30.0));
        vec3 n = normalize(vON);
        float key = pow(max(dot(n, uKey), 0.0), 1.3);
        float diag = clamp(((vP.x - vP.y)/(24.0*uS)) + 0.5, 0.0, 1.0);
        float fall = mix(1.25, 0.3, smoothstep(0.0, 1.0, diag));
        float run = 0.0, dim = 1.0;
        ${runGLSL}
        vec3 col = uGlow*(0.38 + 0.35*f3 + 0.8*rim + 0.75*key)
                 + uLine*(threads*(0.18 + 0.42*key) + rim*0.3 + key*0.12)
                 + vec3(0.6,0.75,1.0)*speck*0.45;
        col *= fall * dim;
        col += (mix(uGlow, uLine, 0.6)*0.8 + uLine*threads*0.6) * run;
        col += vec3(0.75, 0.88, 1.0) * pow(run, 3.0) * 0.12;
        gl_FragColor = vec4(col * uGain, 1.0);
      }`,
  });
  const shadeMat = new THREE.MeshBasicMaterial({ color:0x01030a, transparent:true, opacity:0.9, depthWrite:true });
  const velvet = new THREE.ShaderMaterial({
    uniforms:{ uGain:U.uGain, uGlow:U.uGlow, uS:U.uS }, transparent:true, depthWrite:false, depthTest:false,
    blending:THREE.CustomBlending, blendEquation:THREE.AddEquation,
    blendSrc:THREE.OneFactor, blendDst:THREE.OneFactor, blendSrcAlpha:THREE.ZeroFactor, blendDstAlpha:THREE.OneFactor,
    vertexShader:`varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position,1.0);
        vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader:`uniform float uGain; uniform vec3 uGlow; uniform float uS;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.4);
        float diag = clamp(((vP.x - vP.y)/(24.0*uS)) + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(uGlow * f * 0.22 * mix(1.2, 0.45, diag) * uGain, 1.0);
      }`,
  });
  const inner = new THREE.Group();
  parts.forEach(pt => {
    const shade = new THREE.Mesh(pt.geo, shadeMat); shade.renderOrder = 2.18;
    const body = new THREE.Mesh(pt.geo, skin); body.renderOrder = 2.2;
    inner.add(shade, body);
    if (pt.halo){ const h = new THREE.Mesh(pt.halo, velvet); h.renderOrder = 2.17; inner.add(h); }
  });
  if (extra) extra(inner, U);
  const turn = new THREE.Group();
  turn.add(inner);
  const g = new THREE.Group();
  g.add(turn);
  return { g, turn, inner, U, skin };
}
const faceCamera = turn => {
  if (turn.parent){ turn.parent.updateWorldMatrix(true, false); turn.lookAt(camera.position); }
};
// chapter 4's copy is 6 lines: its title sits lower than chapter 2's / 3's
const CH4_BOTTOM = -1.3;

/* 3: a progress ring that never closes. A solid neuron ring, lit from the top
   (12 o'clock) clockwise up to a slowly creeping front that never reaches the
   top again; a soft light runs through the lit part toward the front. */
window.makeProgressFibre = function makeProgressFibre(R){
  const S = R*2.0/24, RR = 9.4, TR = 1.55;
  const ring = new THREE.TorusGeometry(RR*S, TR*S, 32, 180);
  const halo = new THREE.TorusGeometry(RR*S, 3.0*S, 16, 90);
  const ic = makeNeuronIcon(R, S, [{ geo:ring, halo, along:2*Math.PI*RR, around:2*Math.PI*TR,
    run:(u) => ((0.25 - u) % 1 + 1) % 1 }], `
        // the fill creeps on and eases back, never closing the ring
        float L = 0.66 + 0.24*(0.5 + 0.5*sin(uTime*0.16 - 1.5));
        float filled = smoothstep(L + 0.004, L - 0.012, vRun);
        float head = exp(-pow((vRun - L)/0.022, 2.0));
        dim = mix(0.13, 1.0, filled);                    // the unfilled part: a faint track
        run = filled*(0.12 + 0.5*pulse(vRun/max(L, 0.01), uTime*0.12)) + head*1.8;`);
  ic.g.userData = { cores:[ic.skin], shells:[], lines:[], spin:new THREE.Vector3(0,0,0), still:true,
    tick:(t)=>{
      ic.turn.position.y = R*(CH4_BOTTOM + (RR + TR)/12) + Math.sin(t*0.45)*R*0.04;
      faceCamera(ic.turn);
    } };
  return ic.g;
};

/* 5: the pitch that glitched. A 16:9 screen, its bezel a neuron tube, showing
   a slide (a title, bullet lines, a rising bar chart) drawn in light; every few
   seconds it glitches (bands tear sideways, the colours split, the bezel
   flickers and jolts) and recovers. */
window.makeGlitchFibre = function makeGlitchFibre(R){
  const S = R*1.9/24, W = 13.5, H = 7.6, RC = 1.6, TR = 0.95;
  const path = [];
  [[1,1],[-1,1],[-1,-1],[1,-1]].forEach(([sx, sy], q) => {
    for (let i=0;i<=10;i++){
      const a = (q + i/10)*Math.PI/2;
      path.push(new THREE.Vector3((sx*(W - RC) + Math.cos(a)*RC)*S, (sy*(H - RC) + Math.sin(a)*RC)*S, 0));
    }
  });
  const curve = new THREE.CatmullRomCurve3(path, true, 'centripetal');
  const bezel = new THREE.TubeGeometry(curve, 240, TR*S, 24, true);
  const halo = new THREE.TubeGeometry(curve, 160, 2.2*S, 12, true);
  const ic = makeNeuronIcon(R, S, [{ geo:bezel, halo, along:curve.getLength()/S, around:2*Math.PI*TR, run:(u) => u }], `
        run = pulse(vRun, uTime*0.06)*0.8;
        float fl = step(0.5, fract(sin(floor(uTime*24.0)*91.7)*437.1));
        run += uGlitch*(0.35 + 0.9*fl);
        dim = 1.0 - uGlitch*0.35*(1.0 - fl);`,
    (inner, U) => {
      const geo = new THREE.PlaneGeometry((W - 0.9)*2*S, (H - 0.9)*2*S);
      const mat = new THREE.ShaderMaterial({
        uniforms:{ uTime:U.uTime, uGain:U.uGain, uGlitch:U.uGlitch, uLine:U.uLine, uGlow:U.uGlow },
        transparent:true, depthWrite:false,
        blending:THREE.CustomBlending, blendEquation:THREE.AddEquation,
        blendSrc:THREE.OneFactor, blendDst:THREE.OneFactor, blendSrcAlpha:THREE.ZeroFactor, blendDstAlpha:THREE.OneFactor,
        vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader:`uniform float uTime; uniform float uGain; uniform float uGlitch; uniform vec3 uLine; uniform vec3 uGlow;
          varying vec2 vUv;
          float h1(float n){ return fract(sin(n*127.1)*43758.5453); }
          float box(vec2 uv, vec2 a, vec2 b, float soft){
            vec2 d = max(a - uv, uv - b);
            return 1.0 - smoothstep(0.0, soft, max(d.x, d.y));
          }
          float slide(vec2 uv){
            float v = 0.0;
            v += box(uv, vec2(0.08, 0.78), vec2(0.52, 0.85), 0.006)*1.0;         // title
            v += box(uv, vec2(0.08, 0.69), vec2(0.32, 0.715), 0.004)*0.55;       // subtitle
            for (int i=0;i<3;i++){                                               // bullets
              float y = 0.52 - float(i)*0.12;
              v += box(uv, vec2(0.08, y), vec2(0.105, y + 0.035), 0.004)*0.8;
              v += box(uv, vec2(0.14, y + 0.008), vec2(0.40 - float(i)*0.05, y + 0.027), 0.004)*0.5;
            }
            for (int i=0;i<4;i++){                                               // the chart: rising bars
              float x = 0.55 + float(i)*0.1, top = 0.22 + float(i)*0.13;
              float bar = box(uv, vec2(x, 0.14), vec2(x + 0.065, top), 0.004);
              float cap = box(uv, vec2(x, top - 0.02), vec2(x + 0.065, top), 0.003);
              v += bar*0.32 + cap*0.8;
            }
            v += box(uv, vec2(0.52, 0.135), vec2(0.94, 0.142), 0.003)*0.5;      // axis
            return v;
          }
          void main(){
            vec2 uv = vUv;
            float g = uGlitch;
            float band = floor(uv.y*18.0), tk = floor(uTime*22.0);
            float tear = step(0.55, h1(band*3.1 + tk)) * (h1(band + tk*1.7) - 0.5) * 0.22 * g;
            uv.x += tear;
            float split = 0.018*g;
            float r = slide(uv + vec2(split, 0.0)), m = slide(uv), b = slide(uv - vec2(split, 0.0));
            vec3 col = uLine*m*0.75 + uGlow*0.5*m;
            col += g*(vec3(0.5, 0.15, 0.6)*r*0.45 + vec3(0.1, 0.5, 1.0)*b*0.55);
            // the screen's own faint glow and scanlines
            col += uGlow*0.07;
            col *= 0.86 + 0.14*sin(uv.y*420.0 + uTime*3.0);
            // blocks of noise while it glitches
            vec2 blk = floor(vUv*vec2(26.0, 14.0));
            float nz = step(0.93, h1(blk.x*7.3 + blk.y*13.1 + tk));
            col += uLine*nz*g*0.45;
            col *= 1.0 - g*0.3*step(0.5, h1(tk*5.3));          // it flickers
            // fade at the bezel
            float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
            col *= smoothstep(0.0, 0.04, e);
            gl_FragColor = vec4(col*uGain*0.85, 1.0);
          }`,
      });
      const screen = new THREE.Mesh(geo, mat); screen.renderOrder = 2.19;
      inner.add(screen);
    });
  ic.g.userData = { cores:[ic.skin], shells:[], lines:[], spin:new THREE.Vector3(0,0,0), still:true,
    tick:(t)=>{
      // a glitch every 6 s, ~0.8 s long, stuttering on and off
      const ph = t % 6.0;
      const on = ph > 4.6 && ph < 5.4 ? (Math.sin(t*47.0) > -0.3 ? 1 : 0.35) : 0;
      ic.U.uGlitch.value = on;
      ic.inner.position.x = on ? (Math.sin(t*93.0)*0.5)*R*0.04 : 0;
      ic.turn.position.y = R*(CH4_BOTTOM + (H + TR)*1.9/24) + Math.sin(t*0.45)*R*0.04;
      faceCamera(ic.turn);
    } };
  return ic.g;
};
ASSETS.progress = (R) => makeProgressFibre(R);
ASSETS.glitch = (R) => makeGlitchFibre(R);

/* Chapter 4 (IN PROGRESS): the Status iCO with its plasma as a comet loader
   ("ICO Loader Studies" artifact, study 01). The glass refracts what is behind
   it, so like the Status popup's iCO it has its own small renderer: a canvas
   pinned over this chapter's slot, following the camera and fading with the
   chapter like the other assets. Its shaders are ico.js's own (NOISE,
   plasmaFrag, glassVert, glassFrag: classic-script globals). The comet runs on
   the CSS loader's timing: 1.7 s, 'ease', its tail of dots stretching out
   through the turn and snapping back into the head. */
const LOADER_DUR = 1.7;
const LOADER_KEYS = [                       // tail angles (deg) behind the head at each keyframe
  [0.00, [0, 0, 0, 0]], [0.05, [0, 0, 0, 0]], [0.10, [6.0, 12.0, 17.9, 21.0]],
  [0.20, [24.0, 42.0, 53.9, 65.6]], [0.38, [27.0, 51.0, 69.0, 83.8]],
  [0.59, [6.0, 12.0, 17.9, 21.0]], [0.95, [0, 0, 0, 0]], [1.00, [0, 0, 0, 0]],
];
const LOADER_DOTS = 18, LOADER_REACH = 2.0;
const lerpArr = (arr, u) => { const i = Math.min(arr.length - 2, Math.floor(u)); return arr[i] + (arr[i+1] - arr[i])*(u - i); };
const LOADER_SIZE = Array.from({ length:LOADER_DOTS }, (_, i) => lerpArr([1.0, 0.8, 0.6, 0.4, 0.23], i/(LOADER_DOTS - 1)*4));
function cssEase(x){                        // cubic-bezier(0.25, 0.1, 0.25, 1)
  const bx = t => 3*(1-t)*(1-t)*t*0.25 + 3*(1-t)*t*t*0.25 + t*t*t;
  const by = t => 3*(1-t)*(1-t)*t*0.1 + 3*(1-t)*t*t + t*t*t;
  let lo = 0, hi = 1;
  for (let i=0;i<24;i++){ const m = (lo + hi)/2; if (bx(m) < x) lo = m; else hi = m; }
  return by((lo + hi)/2);
}
function loaderAngles(t){
  const f = (((t % LOADER_DUR) + LOADER_DUR) % LOADER_DUR)/LOADER_DUR;
  const head = 360*cssEase(f);
  let k = 0; while (k < LOADER_KEYS.length - 2 && LOADER_KEYS[k+1][0] <= f) k++;
  const [f0, a0] = LOADER_KEYS[k], [f1, a1] = LOADER_KEYS[k+1];
  const e = cssEase(f1 > f0 ? (f - f0)/(f1 - f0) : 0);
  const curve = [0, ...a0.map((v, i) => v + (a1[i] - v)*e)];
  return Array.from({ length:LOADER_DOTS }, (_, i) => head - lerpArr(curve, i/(LOADER_DOTS - 1)*4)*LOADER_REACH);
}

/* study 02's shell: the iCO as neuron tissue, its seams glowing fibre (kept dim,
   so the comet inside reads through) */
const neuronShellVert = `attribute vec3 aBC; varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vBC; varying vec3 vON;
  void main(){ vP = position; vON = normal; vBC = aBC; vN = normalize(normalMatrix*normal);
    vec4 mv = modelViewMatrix*vec4(position,1.0); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`;
const neuronShellFrag = `
  uniform float uT; uniform vec3 uLine; uniform vec3 uGlow; uniform float uFace;
  varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vBC; varying vec3 vON;
  ${NOISE_GLSL}
  float fibres(vec3 p, float freq, float sharp, float t){
    float w = fbm(vec3(p.x*0.9, p.y*0.22 - t, p.z*0.9))*0.9;
    float x = (p.x + p.z)*freq + w + sin(p.y*2.1 + t*1.7)*0.35;
    float d = abs(fract(x) - 0.5)*2.0;
    return pow(1.0 - d, sharp);
  }
  void main(){
    vec3 p = vP*3.2;
    float t = uT*0.12;
    float th = max(fibres(p, 1.6, 9.0, t), fibres(p*1.37 + 4.1, 2.1, 10.0, -t*0.8)*0.8);
    float f3 = fibres(p*0.8 + 9.7, 2.0, 6.0, t*0.5);
    // edges: a bundle of light along each seam of the icosahedron
    vec3 d = fwidth(vBC);
    float e = min(min(vBC.x/d.x, vBC.y/d.y), vBC.z/d.z);
    // seams-only (uFace 0) keep their glow tight to the edge, so the glass stays glass
    float edge = uFace > 0.95 ? exp(-e*0.55) + 0.35*exp(-e*0.12) : exp(-e*0.6) + 0.12*exp(-e*0.3);
    vec3 n = normalize(vON);
    float key = pow(max(dot(n, normalize(vec3(-0.6, 0.65, 0.45))), 0.0), 1.2);
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
    float front = gl_FrontFacing ? 1.0 : 0.45;
    // kept dim, so the comet inside reads through the tissue
    vec3 col = (uGlow*(0.04 + 0.07*f3 + 0.16*rim + 0.10*key) + uLine*(th*(0.03 + 0.10*key) + rim*0.05))*uFace;
    // the seams carry the fibre threads too, so they read as nerve, not neon
    col += (uLine*(0.45 + 0.6*th) + uGlow*0.45)*edge*(0.35 + 0.35*key)*(uFace > 0.95 ? 1.0 : 1.35);
    gl_FragColor = vec4(col*front, 1.0);
  }`;

window.makeIcoLoader = function makeIcoLoader(R, opts = {}){
  const neuron = opts.shell === 'neuron';
  const ICO_POSE = [12, -36, -6];             // held still in this pose (Euler XYZ, deg)
  const ICO_SEE = 0.5;                         // the glass's opacity (1 = the Status iCO's)
  const ICO_HOLO = 0.22;                       // the holographic sheen's strength (subtle; 0 = plain glass)
  const ICO_FROST = 0.4;                       // neuron frosting on the glass's faces (0..0.9; 1 = study 02's tissue)
  const g = new THREE.Group();
  if (typeof glassFrag === 'undefined' || typeof plasmaFrag === 'undefined') return g;   // ico.js missing
  // where the iCO sits: just above chapter 4's title, its height a touch under the DNA's
  const anchor = new THREE.Object3D();
  anchor.position.y = R*(CH4_BOTTOM + 1.0);
  g.add(anchor);

  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;opacity:0;will-change:transform,opacity;';
  const cvs = document.createElement('canvas');
  cvs.style.cssText = 'display:block;width:100%;height:100%;';
  box.appendChild(cvs);
  panel.insertBefore(box, renderer.domElement.nextSibling);   // over the corridor, under its text

  const rr = new THREE.WebGLRenderer({ canvas:cvs, antialias:true, alpha:true, premultipliedAlpha:false });
  const dpr = Math.min(devicePixelRatio, 2);
  rr.setPixelRatio(dpr);
  rr.toneMapping = THREE.ACESFilmicToneMapping;
  rr.toneMappingExposure = 0.9;
  const sc = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  cam.position.z = 4.2;
  const ICO_FRAC = 0.62;                    // the iCO's share of its canvas, at this camera

  // the comet: plasma beads sampling one flowing field in world space
  // bare (no shell): the loader alone, its loop and dots scaled up together so it spans
  // about 2 units, the iCO's own size here: the same on-screen size as the other chapters' objects
  const bare = !!opts.bare;
  const ORBIT = bare ? 0.85 : 0.22, HEAD = bare ? 0.16 : 0.042;
  const beadMat = new THREE.ShaderMaterial({
    uniforms:{ uT:{value:0}, uPulse:{value:0},
      // the corridor neurons' blues (GN): deep glow, mid, and the fibre line for its brights
      uCD:{value:GN.U.uGlow.value.clone().multiplyScalar(0.45)}, uCM:{value:GN.U.uGlow.value.clone()}, uCB:{value:GN.U.uLine.value.clone()} },
    vertexShader:`varying vec3 vPos,vN,vV;void main(){vPos=(modelMatrix*vec4(position,1.)).xyz*0.8;vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
    fragmentShader:plasmaFrag
      .replace('float alpha=smoothstep(0.05,.7,t);', 'float alpha=0.45+0.55*smoothstep(0.05,.7,t);')
      // its peaks go to the neurons' line blue, not white, and it burns less hot
      .replace('col=mix(col,vec3(1.),smoothstep(.85,1.,t));', 'col=mix(col,uCB,smoothstep(.85,1.,t));')
      .replace('gl_FragColor=vec4(col*2.4,', 'gl_FragColor=vec4(col*0.95,'),   // below 1: blue, never clipped to white
    transparent:true, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false });
  const haloC = document.createElement('canvas'); haloC.width = haloC.height = 128;
  const hg = haloC.getContext('2d'), gr = hg.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  hg.fillStyle = gr; hg.fillRect(0, 0, 128, 128);
  const haloTex = new THREE.CanvasTexture(haloC);
  const beadGeo = new THREE.SphereGeometry(1, 24, 18);
  const beads = LOADER_SIZE.map((s, i) => {
    const m = new THREE.Mesh(beadGeo, beadMat);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map:haloTex, color:GN.U.uLine.value.clone(), transparent:true, toneMapped:false,
      opacity:0.55*(1 - i/LOADER_DOTS*0.6), blending:THREE.AdditiveBlending, depthWrite:false }));
    const b = new THREE.Group(); b.add(halo, m); sc.add(b);
    halo.scale.setScalar(HEAD*s*3.2);
    return { b, m, s, px:0, py:0, st:0 };
  });

  // the glass, exactly as the Status iCO builds it
  const geo = new THREE.IcosahedronGeometry(1.0, 0).toNonIndexed();
  const pa = geo.attributes.position.array, na = new Float32Array(pa.length);
  for (let i=0;i<pa.length;i+=9){
    const ax=pa[i],ay=pa[i+1],az=pa[i+2],bx=pa[i+3],by=pa[i+4],bz=pa[i+5],cx=pa[i+6],cy=pa[i+7],cz=pa[i+8];
    let nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay), ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az), nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
    const l=Math.hypot(nx,ny,nz); nx/=l; ny/=l; nz/=l;
    for (let j=0;j<3;j++){ na[i+j*3]=nx; na[i+j*3+1]=ny; na[i+j*3+2]=nz; }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(na, 3));
  const nv = pa.length/3, bary = new Float32Array(nv*3);
  for (let i=0;i<nv;i+=3){ bary[i*3]=1; bary[(i+1)*3+1]=1; bary[(i+2)*3+2]=1; }
  geo.setAttribute('aBC', new THREE.BufferAttribute(bary, 3));
  const glassMat = neuron
    ? new THREE.ShaderMaterial({
        uniforms:{ uT:{value:0}, uLine:{value:GN.U.uLine.value.clone()}, uGlow:{value:GN.U.uGlow.value.clone()}, uFace:{value:1} },
        vertexShader:neuronShellVert, fragmentShader:neuronShellFrag, transparent:true, side:THREE.DoubleSide,
        blending:THREE.AdditiveBlending, depthWrite:false, extensions:{ derivatives:true } })
    : new THREE.ShaderMaterial({
        uniforms:{ t:{value:0}, uPulse:{value:0}, bgTex:{value:null}, res:{value:new THREE.Vector2(1, 1)}, uSee:{value:ICO_SEE}, uHolo:{value:ICO_HOLO} },
        // ico.js's glass, made more see-through here (uSee scales its opacity) so the
        // comet inside and the corridor behind read through it
        vertexShader:glassVert, fragmentShader:'uniform float uSee; uniform float uHolo;' + glassFrag
          // holographic film: an iridescent sheen that shifts with the viewing angle, pulled toward
          // the neurons' blues, with a faint slow shimmer. It lives at the rims and turned faces and
          // fades out where the glass faces the viewer, so the loader stays clear (uHolo: its strength)
          .replace('gl_FragColor = vec4(col, alpha);', 'float hg = pow(1.0 - NdV, 1.6); float hph = NdV*1.7 + dot(N, vec3(0.6, 0.35, 0.2))*0.9 + t*0.035; vec3 hcol = 0.5 + 0.5*cos(6.2832*(hph + vec3(0.0, 0.33, 0.67))); hcol = mix(hcol, vec3(0.32, 0.55, 1.0), 0.45); float hband = 0.75 + 0.25*sin((gl_FragCoord.y*0.045 + gl_FragCoord.x*0.02) - t*1.1); col += hcol*hg*hband*uHolo; alpha = min(alpha + hg*uHolo*0.25, 1.0); gl_FragColor = vec4(col, alpha*uSee);')
          // its edge and rim light tinted the neurons' blue, so the fibre seams stay their colour
          .replace('vec3(0.65, 0.70, 0.88)', 'vec3(0.30, 0.52, 0.92)')
          .replace('vec3(0.55, 0.58, 0.82)', 'vec3(0.25, 0.45, 0.90)'),
        transparent:true, side:THREE.DoubleSide });
  const ico = new THREE.Mesh(geo, glassMat);
  ico.renderOrder = 10;
  if (!bare) sc.add(ico);
  // study 03: neuron fibre along the glass's seams, drawn over it (edges only)
  let seams = null;
  if (opts.seams && !neuron && !bare){
    seams = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      // uFace: a faint frosting of neuron fibre across the glass's faces (0 = seams only)
      // the corridor neurons' own colours (GN), as they are: matched by eye against the
      // neurons beside it on a real screen (a boost read far too hot there)
      uniforms:{ uT:{value:0}, uLine:{value:GN.U.uLine.value.clone()}, uGlow:{value:GN.U.uGlow.value.clone()}, uFace:{value:ICO_FROST} },
      vertexShader:neuronShellVert, fragmentShader:neuronShellFrag, transparent:true, side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false, extensions:{ derivatives:true } }));
    seams.scale.setScalar(1.003);
    seams.renderOrder = 11;
    sc.add(seams);
  }
  const rt = new THREE.WebGLRenderTarget(4, 4, { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter });

  let sizePx = 0, lastT = null, opacity = 0;
  const proj = new THREE.Vector3(), up = new THREE.Vector3();
  // the loop drives uGain on cores: a stand-in that tells this canvas how lit the chapter is
  const gainProbe = { uniforms:{ uTime:{value:0}, uGain:{value:0.2} } };
  g.userData = { cores:[gainProbe], shells:[], lines:[], spin:new THREE.Vector3(0,0,0), still:true,
    tick:(t)=>{
      const dt = lastT === null ? 0.016 : Math.min(0.05, t - lastT); lastT = t;
      // fade with the chapter: hidden while idle, in as the camera settles on it
      const goal = Math.max(0, Math.min(1, (gainProbe.uniforms.uGain.value - 0.2)/0.42));
      opacity += (goal - opacity)*Math.min(1, dt*4);
      // pin the canvas over the anchor, sized so the iCO is about the DNA's height
      g.updateWorldMatrix(true, false);
      anchor.getWorldPosition(proj);
      up.copy(proj).addScaledVector(camera.up, R);
      camera.updateMatrixWorld();          // this frame's camera, or the canvas trails the scene a frame
      proj.project(camera); up.project(camera);
      const W = PW(), H = PH();
      const behind = proj.z > 1 || proj.z < -1;
      const cx = (proj.x*0.5 + 0.5)*W, cy = (-proj.y*0.5 + 0.5)*H;
      const pxR = Math.hypot((up.x - proj.x)*0.5*W, (up.y - proj.y)*0.5*H);
      const want = Math.round(Math.min(900, (2*pxR)/ICO_FRAC));   // the iCO 2R across, like the Instagram glyph
      box.style.opacity = behind ? 0 : opacity.toFixed(3);
      if (behind || opacity < 0.01 || want < 8) return;
      if (!sizePx || Math.abs(want - sizePx) > sizePx*0.2){   // re-render size only on big changes
        sizePx = want;
        rr.setSize(sizePx, sizePx, false);
        box.style.width = box.style.height = sizePx + 'px';
        if (!neuron){ rt.setSize(sizePx*dpr, sizePx*dpr); glassMat.uniforms.res.value.set(sizePx*dpr, sizePx*dpr); }
      }
      const k = want/sizePx;                // the exact size, smoothly, without re-allocating
      box.style.transform = `translate(${(cx - sizePx/2).toFixed(2)}px, ${(cy - sizePx/2).toFixed(2)}px) scale(${k.toFixed(4)})`;

      // the comet, on the loader's clock
      const ang = loaderAngles(t);
      beads.forEach((bd, i) => {
        const a = ang[i]*Math.PI/180, x = Math.sin(a)*ORBIT, y = Math.cos(a)*ORBIT;
        bd.b.position.set(x, y, 0.05);
        // stretch along the direction of travel, volume kept
        const vx = (x - bd.px)/dt, vy = (y - bd.py)/dt; bd.px = x; bd.py = y;
        const sp = Math.hypot(vx, vy);
        bd.st += (Math.min(sp*0.12, 0.3) - bd.st)*Math.min(1, dt*10);
        if (sp > 1e-3) bd.m.rotation.z = Math.atan2(vy, vx);
        const sx = 1 + bd.st, sy = 1/Math.sqrt(sx), sz = HEAD*bd.s;
        bd.m.scale.set(sz*sx, sz*sy, sz*sy);
      });
      beadMat.uniforms.uT.value = t*0.78;
      // the iCO holds still in the chosen pose (Euler XYZ, deg: matched to a reference
      // render with the pose study in the "ICO Loader Studies" artifact); the comet loops inside
      ico.rotation.set(ICO_POSE[0]*Math.PI/180, ICO_POSE[1]*Math.PI/180, ICO_POSE[2]*Math.PI/180);
      if (seams){ seams.rotation.copy(ico.rotation); seams.material.uniforms.uT.value = t; }
      if (neuron || bare){                  // no glass to refract through: one pass
        if (neuron) glassMat.uniforms.uT.value = t;
        rr.setClearColor(0, 0);
        rr.render(sc, cam);
        return;
      }
      glassMat.uniforms.t.value = t;
      // two passes, as ico.js: the comet into the target, then the glass reading it
      ico.visible = false; if (seams) seams.visible = false;
      rr.setRenderTarget(rt); rr.setClearColor(0x000000, 1); rr.clear(); rr.render(sc, cam);
      rr.setRenderTarget(null);
      ico.visible = true; if (seams) seams.visible = true;
      glassMat.uniforms.bgTex.value = rt.texture;
      rr.setClearColor(0, 0);
      rr.render(sc, cam);
    } };
  return g;
};
ASSETS.icoloader = (R) => makeIcoLoader(R);
ASSETS.icoloader2 = (R) => makeIcoLoader(R, { shell:'neuron' });   // study 02
ASSETS.icoloader3 = (R) => makeIcoLoader(R, { seams:true });        // study 03
ASSETS.loader = (R) => makeIcoLoader(R, { bare:true });             // the comet loader alone, no iCO

/* Chapter 4 (IN PROGRESS): the loader drawn in the corridor's own ghost fibre
   ("In Progress Loader" artifact, option 02). The comet is a short bundle of
   fibre strands, thin at the tail and full at the head, running the CSS
   loader's motion (loaderAngles: 1.7 s, 'ease', the tail stretching out and
   snapping back) over a faint three-strand track. It lives in the corridor's
   scene like the DNA, turned to face the camera. */
window.makeFibreLoader = function makeFibreLoader(R){
  const g = new THREE.Group();
  const turn = new THREE.Group();
  g.add(turn);
  const RAD = R*0.86;
  // brighter than the corridor's neurons (line and glow run hotter), so it holds the eye
  const M = GhostNeurons.materials({ fog:0.021, gain:1, haze:0.2, drift:0, line:0x7aa6e6, glow:0x15327f });
  M.U.uLine.value.multiplyScalar(1.45); M.U.uGlow.value.multiplyScalar(1.45);
  // a dark, see-through disc filling the ring: the fibre reads against it, the corridor shows through
  const FIBRE_INNER = 0;                     // its opacity (0 clear .. 1 solid)
  const dc = document.createElement('canvas'); dc.width = dc.height = 256;
  const dx = dc.getContext('2d'), dg = dx.createRadialGradient(128, 128, 0, 128, 128, 128);
  dg.addColorStop(0, 'rgba(255,255,255,1)'); dg.addColorStop(0.8, 'rgba(255,255,255,1)'); dg.addColorStop(0.9, 'rgba(255,255,255,0.5)'); dg.addColorStop(1, 'rgba(255,255,255,0)');
  dx.fillStyle = dg; dx.fillRect(0, 0, 256, 256);
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map:new THREE.CanvasTexture(dc), color:0x000000, transparent:true, opacity:FIBRE_INNER, depthWrite:false, depthTest:false, fog:false }));
  // black, inside the ring only; drawn after the loader's haze (so its glow doesn't tint
  // the centre) and before its fibre strands
  disc.scale.setScalar((RAD - R*0.1)*2/0.9); disc.renderOrder = 2.205; disc.visible = FIBRE_INNER > 0; turn.add(disc);
  const at = (deg, r, z) => { const a = deg*Math.PI/180; return new THREE.Vector3(Math.sin(a)*r, Math.cos(a)*r, z || 0); };
  // the track: three faint strands weaving round the whole circle (lum keeps it quiet)
  const track = [];
  for (let k=0;k<3;k++){
    const pts = [];
    for (let i=0;i<=120;i++){ const d = i/120*360; pts.push(at(d, RAD + Math.sin(d*Math.PI/180*7 + k*2.1)*R*0.025, Math.cos(d*Math.PI/180*5 + k)*R*0.02)); }
    track.push({ pts, lum:pts.map(() => 0.5), w0:R*0.07, w1:R*0.07, a0:0.2, a1:0.62, seed:k*3.3, kind:'axon', daughter:false });
  }
  const tg = GhostNeurons.ribbons(track, 8);
  [new THREE.Mesh(tg, M.haze), new THREE.Mesh(tg, M.ribbon)].forEach((m, i) => { m.frustumCulled = false; m.renderOrder = i ? 2.21 : 2.2; turn.add(m); });
  // the comet: rebuilt each frame from the loader's head and tail
  const cHaze = new THREE.Mesh(new THREE.BufferGeometry(), M.haze), cLine = new THREE.Mesh(new THREE.BufferGeometry(), M.ribbon);
  [cHaze, cLine].forEach((m, i) => { m.frustumCulled = false; m.renderOrder = i ? 2.215 : 2.2; turn.add(m); });
  g.userData = { cores:[M.ribbon], shells:[], lines:[], spin:new THREE.Vector3(0,0,0), still:true,
    tick:(t)=>{
      // centred where the iCO sat: just above the title, about the DNA's size
      turn.position.y = R*(CH4_BOTTOM + 0.93) + Math.sin(t*0.45)*R*0.03;
      if (turn.parent){ turn.parent.updateWorldMatrix(true, false); turn.lookAt(camera.position); }
      disc.material.opacity = FIBRE_INNER*Math.min(1, M.U.uGain.value/0.5);   // fully set well before the chapter is fully lit   // fades with the chapter
      const ang = loaderAngles(t), head = ang[0], tail = Math.min(ang[LOADER_DOTS - 1], head - 8);   // never shorter than a dash
      const list = [];
      for (let k=0;k<3;k++){
        const pts = [], N = 40;
        for (let i=0;i<=N;i++){
          const u = i/N, d = tail + (head - tail)*u;
          const wob = Math.sin(u*9 + k*2.1 + t*1.3)*R*0.03*(1 - u);
          pts.push(at(d, RAD + wob, Math.cos(u*7 + k)*R*0.02));
        }
        list.push({ pts, w0:R*0.03, w1:R*(0.16 - k*0.03), a0:0.02, a1:0.6, seed:k*2.7, kind:'axon', daughter:false });
      }
      const geo = GhostNeurons.ribbons(list, 10);
      cLine.geometry.dispose();
      cHaze.geometry = geo; cLine.geometry = geo;
    } };
  return g;
};
ASSETS.fibreloader = (R) => makeFibreLoader(R);

/* Chapter 4 (IN PROGRESS): the PS2 boot orb ("In Progress Loader" artifact,
   option 05). Glowing dots ride a ring on an unseen sphere that tumbles in 3D,
   bunching into two groups and spreading out evenly in turn; a faint rim shows
   the sphere, and a dark, see-through disc sits inside it so the dots read
   against it while the corridor still shows through. Lives in the corridor's
   scene (sprites face the camera on their own). */
window.makePs2Orb = function makePs2Orb(R){
  const g = new THREE.Group(), turn = new THREE.Group();
  g.add(turn);
  const RAD = R*0.82, N = 8;
  const ORB_INNER = 0.55;                    // the centre disc's opacity (0 clear .. 1 solid)
  const radial = (stops) => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'), gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach(([o, a]) => gr.addColorStop(o, `rgba(255,255,255,${a})`));
    x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  };
  const dotTex = radial([[0, 1], [0.16, 0.95], [0.3, 0.35], [0.62, 0.07], [1, 0]]);
  const rimTex = radial([[0, 0], [0.72, 0.03], [0.84, 0.22], [0.9, 0.05], [1, 0]]);
  const discTex = radial([[0, 1], [0.7, 1], [0.82, 0.6], [0.9, 0]]);
  const ADDM = (opts) => new THREE.SpriteMaterial(Object.assign({ transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false }, opts));
  // the dark inner disc (normal blending: it darkens what is behind, partly)
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map:discTex, color:0x020510, transparent:true, opacity:ORB_INNER, depthWrite:false, depthTest:false }));
  disc.scale.setScalar(RAD*2/0.82); disc.renderOrder = 2.18; turn.add(disc);
  const rim = new THREE.Sprite(ADDM({ map:rimTex, color:0x3f74e0, opacity:0.75 }));
  rim.scale.setScalar(RAD*2/0.84); rim.renderOrder = 2.19; turn.add(rim);
  const DOT = new THREE.Color(0xb4d4ff), GLOW = new THREE.Color(0x4a80ee);
  const dots = Array.from({ length:N }, () => {
    const core = new THREE.Sprite(ADDM({ map:dotTex, color:DOT })), halo = new THREE.Sprite(ADDM({ map:dotTex, color:GLOW }));
    core.renderOrder = halo.renderOrder = 2.2;
    turn.add(halo, core);
    return { core, halo };
  });
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), camL = new THREE.Vector3();
  const probe = { uniforms:{ uTime:{value:0}, uGain:{value:0.2} } };   // how lit the chapter is (0.2 idle .. 0.62 on)
  g.userData = { cores:[probe], shells:[], lines:[], spin:new THREE.Vector3(0,0,0), still:true,
    tick:(t)=>{
      turn.position.y = R*(CH4_BOTTOM + 0.93) + Math.sin(t*0.45)*R*0.03;
      if (turn.parent){ turn.parent.updateWorldMatrix(true, false); turn.lookAt(camera.position); }
      const lit = Math.min(1, probe.uniforms.uGain.value/0.62);
      e.set(0.35 + Math.sin(t*0.45)*0.25, t*1.25, Math.sin(t*0.3)*0.4);
      q.setFromEuler(e);
      const spread = 0.5 - 0.5*Math.cos(t*1.1), base = t*0.9;
      rim.material.opacity = 0.75*lit; disc.material.opacity = ORB_INNER*lit;
      dots.forEach((d, i) => {
        const grp = i < N/2 ? 0 : 1, k = i % (N/2);
        const bunched = grp*Math.PI + (k - 1.5)*0.32, even = i*2*Math.PI/N;
        const a = base + bunched + (even - bunched)*spread;
        v.set(Math.cos(a)*RAD, Math.sin(a)*RAD, 0).applyQuaternion(q);
        const near = (v.z/RAD + 1)/2;
        d.core.position.copy(v); d.halo.position.copy(v);
        const sz = R*(0.12 + 0.08*near);
        d.core.scale.setScalar(sz); d.halo.scale.setScalar(sz*3.4);
        d.core.material.opacity = (0.6 + 0.4*near)*lit;
        d.halo.material.opacity = (0.28 + 0.4*near)*lit;
      });
    } };
  return g;
};
ASSETS.ps2orb = (R) => makePs2Orb(R);

ASSETS.dna = (R) => makeDNAFibre(R);

function bsodScreen(w, h, rowsOf){
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv);
  // she is ~200px tall on screen: mipmaps keep the letters from aliasing into noise
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 8;
  // a Windows stop error: short codes with gaps between them, so she reads as
  // a screen, not a wall of text
  const LINES = [':(', '', 'STOP', '0x7B', '', 'IRQL', '', '0xD1', 'F78D', '', '0x50', '', 'FAULT',
    '', '0xEF', 'C0000', '', '', 'DUMP', '0x0A', '', 'WHEA', ''];
  const ROWS = 18, LH = h/ROWS, FS = Math.round(LH*0.72);
  const font = `600 ${FS}px Consolas, "Share Tech Mono", "Lucida Console", monospace`;
  const small = `600 ${Math.round(FS*0.78)}px Consolas, "Share Tech Mono", "Lucida Console", monospace`;
  const HEX = '0123456789ABCDEF';
  const hash = n => { const x = Math.sin(n*127.1 + 311.7)*43758.5453; return x - Math.floor(x); };
  // where her body is on each row (rowsOf: the median across and the bins her
  // skin fills). The typed word sits on the median; small hex pairs fill out
  // from it to both sides wherever there is skin, so they reach her arms
  const ROWINFO = [];
  for (let r=0;r<ROWS;r++) ROWINFO.push(rowsOf ? rowsOf(1 - (r + 0.5)/ROWS) : null);
  const cx = r => (ROWINFO[r] ? ROWINFO[r].med : 0.5)*w;
  c.font = font; const cwM = c.measureText('0').width;
  c.font = small; const cwS = c.measureText('0').width;
  const SLOTS = ROWINFO.map(ri => {
    if (!ri) return [];
    const out = [], B = ri.occ.length;
    const skin = u => { for (const d of [-1, 0, 1]){ const bi = Math.floor((u + d*cwS/w)*B); if (bi < 0 || bi >= B || !ri.occ[bi]) return false; } return true; };
    const first = (2.5*cwM + 1.8*cwS)/w, step = 3.4*cwS/w;    // clear of a 5-letter word, then every few letters
    for (const dir of [-1, 1]) for (let u = ri.med + dir*first; u > 0 && u < 1; u += dir*step) if (skin(u)) out.push(u);
    return out;
  });
  const lineAt = j => LINES[((j % LINES.length) + LINES.length) % LINES.length];
  // typing runs top to bottom and wraps to the top again; the rows below the
  // cursor keep the previous pass, so the whole body always carries text
  const CPS = 24;
  const starts = [0];
  LINES.forEach((l, j) => starts.push(starts[j] + l.length + 2));   // +2: a beat at each line's end
  const PASS = starts[LINES.length];
  let last = -1;
  const draw = t => {
    const typed = Math.floor(t*CPS) + PASS*ROWS;          // start mid-stream: the screen opens full
    const rep = Math.floor(typed / PASS), rem = typed % PASS;
    let j = 0; while (starts[j+1] <= rem) j++;
    const li = rep*LINES.length + j, n = Math.min(lineAt(li).length, rem - starts[j]);
    const blink = Math.floor(t*2.4) % 2;
    const tick = Math.floor(t*7);                         // flicker clock for the hex and the glitches
    const key = (typed*2 + blink)*100000 + tick;
    if (key === last) return;
    last = key;
    c.fillStyle = '#0a2a9e'; c.fillRect(0, 0, w, h);
    c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillStyle = '#ffffff';
    const cur = ((li % ROWS) + ROWS) % ROWS;
    for (let r=0;r<ROWS;r++){
      if (r === cur + 1) continue;                         // one blank row just under the cursor
      const g = li - ((cur - r + ROWS) % ROWS);           // the newest line that landed on this row
      // now and then a row jumps sideways for a moment, like a failing display
      const jx = hash(r*13.7 + tick*0.71) < 0.06 ? (hash(r + tick) - 0.5)*FS*0.9 : 0;
      c.font = font;
      c.fillText(g === li ? lineAt(g).slice(0, n) : lineAt(g), cx(r) + jx, (r + 0.5)*LH);
      c.font = small;
      SLOTS[r].forEach((u, k) => {
        const slot = Math.floor(t*(1.5 + hash(r*5.1 + k)*2.5) + hash(r*3.3 + k*7.7)*10);   // each changes on its own beat
        const v = hash(r*31.7 + k*17.3 + slot*1.37);
        if (v < 0.35) return;                               // some stay blank: sparse
        c.fillText(HEX[Math.floor(hash(v*91.3)*16)] + HEX[Math.floor(hash(v*57.9)*16)], u*w + jx, (r + 0.5)*LH);
      });
    }
    if (blink){
      c.font = font;
      const full = lineAt(li), part = full.slice(0, n);
      const x0 = cx(cur) - c.measureText(full).width/2 + c.measureText(part).width;
      c.fillRect(x0 + FS*0.06, (cur + 0.5)*LH - FS*0.42, FS*0.5, FS*0.84);
    }
    tex.needsUpdate = true;
  };
  draw(0);
  return { tex, draw };
}

/* EVE, full body, for chapter 1 (THE REBOOT), the DNA's size. Her skin is the
   neurons' texture drawn as a surface shader (at this size a grid of fibre
   ribbons only reads as noise): fine ghost-fibre threads flowing up her body
   and weaving, a velvet glow at her edges and drifting specks, in the
   corridor's blues. Over it a stop error types itself out, white on blue,
   top to bottom without end (bsodScreen), projected on from the front. */
window.makeEveFibre = function makeEveFibre(R, camPos){
  const E = window.EVE_MESH;
  const g = new THREE.Group();
  if (!E) return g;
  const raw = Uint8Array.from(atob(E.b), c => c.charCodeAt(0)).buffer;
  const q = new Uint16Array(raw, 0, E.n*3), nq = new Int8Array(raw, E.n*6, E.n*3);
  const idx = new Uint16Array(raw.slice(E.n*9, E.n*9 + E.i*2));
  const H = R*2.5, k = H / E.rng[1];           // on screen about the DNA's height
  const pos = new Float32Array(E.n*3), nrm = new Float32Array(E.n*3);
  for (let i=0;i<E.n*3;i++){
    const a = i % 3;
    pos[i] = (E.min[a] + q[i]/65535*E.rng[a]) * k;
    nrm[i] = nq[i]/127;
  }
  // centre her: x/z on the bounding box, feet at -H/2
  let mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9];
  for (let i=0;i<E.n;i++) for (let a=0;a<3;a++){ const v = pos[i*3+a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
  const off = [-(mn[0]+mx[0])/2, -mn[1] - H/2, -(mn[2]+mx[2])/2];
  for (let i=0;i<E.n;i++) for (let a=0;a<3;a++) pos[i*3+a] += off[a];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  // her front, as measured on the bust (the same mesh): 175 deg round from +x
  const FRONT = new THREE.Vector3(Math.cos(175*Math.PI/180), 0, Math.sin(175*Math.PI/180));
  const SIDE = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), FRONT);
  let sMin = 1e9, sMax = -1e9;
  for (let i=0;i<E.n;i++){ const s = pos[i*3]*SIDE.x + pos[i*3+2]*SIDE.z; if (s < sMin) sMin = s; if (s > sMax) sMax = s; }

  // her body across each height: which of 64 bins her front-facing skin fills,
  // and its median (she walks: the hips sway off the centre line)
  const BINS = 64;
  const rowsOf = hh => {
    const occ = new Uint8Array(BINS), ss = [];
    for (let i=0;i<E.n;i++){
      const h = (pos[i*3+1] + H/2)/H;
      if (Math.abs(h - hh) > 0.025 || nrm[i*3]*FRONT.x + nrm[i*3+2]*FRONT.z < 0.2) continue;
      const u = (pos[i*3]*SIDE.x + pos[i*3+2]*SIDE.z - sMin)/(sMax - sMin);
      occ[Math.min(BINS - 1, Math.floor(u*BINS))] = 1; ss.push(u);
    }
    if (!ss.length) return null;
    ss.sort((a, b) => a - b);
    return { med:ss[ss.length >> 1], occ };
  };
  const scr = bsodScreen(Math.max(256, Math.round(2048*(sMax - sMin)/H)), 2048, rowsOf);
  const U = { uH:{value:H}, uR:{value:R}, uTex:{value:scr.tex}, uSide:{value:SIDE}, uFront:{value:FRONT},
              uS0:{value:sMin}, uSR:{value:sMax - sMin}, uTime:{value:0}, uGain:{value:1},
              uLine:{value:new THREE.Color(0xa6cbff)}, uGlow:{value:new THREE.Color(0x2450c0)} };
  const skin = new THREE.ShaderMaterial({
    uniforms:U, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:`
      uniform float uH; uniform vec3 uSide; uniform float uS0; uniform float uSR;
      varying float vH; varying vec2 vUv; varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vON;
      void main(){
        vH = (position.y + uH*0.5)/uH;
        vUv = vec2((dot(position, uSide) - uS0)/uSR, vH);
        vP = position; vON = normal;
        vec4 mv = modelViewMatrix*vec4(position,1.0);
        vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader:`
      uniform sampler2D uTex; uniform vec3 uFront; uniform float uTime; uniform float uGain; uniform float uR;
      uniform vec3 uLine; uniform vec3 uGlow;
      varying float vH; varying vec2 vUv; varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vON;
      ${NOISE_GLSL}
      // one layer of ghost fibres: fine threads running up the body, bent by noise
      float fibres(vec3 p, float freq, float sharp, float t){
        float w = fbm(vec3(p.x*0.9, p.y*0.22 - t, p.z*0.9))*0.9;
        float x = (p.x + p.z)*freq + w + sin(p.y*2.1 + t*1.7)*0.35;
        float d = abs(fract(x) - 0.5)*2.0;
        return pow(1.0 - d, sharp);
      }
      void main(){
        vec3 p = vP/uR*2.4;
        float t = uTime*0.12;
        // fine bright threads weaving over a soft glow band (the ribbons' recipe)
        float f1 = fibres(p, 1.6, 7.0, t);
        float f2 = fibres(p*1.37 + 4.1, 2.1, 8.0, -t*0.8);
        float f3 = fibres(p*0.8 + 9.7, 2.0, 6.0, t*0.5);
        float threads = max(f1, f2*0.8);
        // velvet edge: the strands crowd at her outline like a bundle's haze
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        // specks drifting through, as on the DNA
        vec3 sp = floor(p*26.0 + vec3(0.0, uTime*0.9, 0.0));
        float speck = step(0.993, hash(sp)) * (0.5 + 0.5*sin(uTime*3.0 + hash(sp + 7.0)*30.0));
        // a slow light pass rising up her, like the face
        float sweep = smoothstep(0.12, 0.0, abs(vH - fract(uTime*0.07)*1.3 + 0.15));
        vec3 col = uGlow*(0.1 + 0.3*f3 + 1.1*rim) + uLine*(threads*(0.45 + 0.5*sweep) + rim*0.55) + vec3(0.8,0.9,1.0)*speck*0.8;
        // the stop error: white letters on a faint blue screen, facing the camera
        vec3 c = texture2D(uTex, vUv, -0.6).rgb;        // a touch sharper than the mip level
        // letters are white on a blue whose green is 0.165: any green above that is ink
        float ink = clamp((c.g - 0.17)/0.6, 0.0, 1.0);
        ink = sqrt(ink);
        float facing = smoothstep(-0.2, 0.6, dot(normalize(vON), uFront));
        float scan = 1.0;
        col = mix(col + vec3(0.04, 0.16, 0.62)*0.22*facing, vec3(1.15), ink*(0.35 + 0.65*facing));
        float feet = smoothstep(0.0, 0.1, vH);
        gl_FragColor = vec4(col * feet * uGain, 1.0);
      }`,
  });
  // a dark body first, so her far side and the corridor behind don't show through the letters
  const shade = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color:0x01030a, transparent:true, opacity:0.75, depthWrite:true }));
  shade.renderOrder = 2.18;
  const body = new THREE.Mesh(geo, skin);
  body.renderOrder = 2.2;

  const turn = new THREE.Group(), inner = new THREE.Group();
  inner.rotation.y = THREE.MathUtils.degToRad(175 - 90);    // her front to +z, so turn.lookAt() aims it
  inner.add(shade, body);
  turn.add(inner);
  g.add(turn);
  let aimed = false;
  // the loop drives uTime / uGain on cores
  g.userData = { cores:[skin], shells:[], lines:[], spin:new THREE.Vector3(0,0,0), still:true,
    tick:(t)=>{
      scr.draw(t);
      // her feet just above chapter 1's title, floating very gently
      turn.position.y = R*EVE_Y + Math.sin(t*0.75)*R*0.13;
      inner.rotation.z = Math.sin(t*0.55 + 1.1)*0.03;
      if (!aimed && camPos && turn.parent){
        turn.parent.updateWorldMatrix(true, false);
        turn.lookAt(camPos);
        aimed = true;
      }
    } };
  return g;
};
const EVE_Y = -0.32;          // lifted a touch so her lowest float clears the title
ASSETS.bsod = (R, ch) => makeEveFibre(R, holdCamPos(ch));

const NODE_R = 2.2;
const nodes = STOPS.map((u,i) => {
  const ch = CHAPTERS[i];
  const make = ASSETS[ch.asset] || (() => assetKit().g);
  const inner = make(NODE_R, ch);
  const holder = new THREE.Group();            // sits on the path; the asset turns inside it
  holder.add(inner);
  holder.position.copy(spine.getPointAt(u));
  holder.userData = Object.assign({ inner, gain:1 }, inner.userData);
  scene.add(holder);
  return holder;
});

/* ============================================================
   POST — straight render, no glow
   ============================================================ */
/* no bloom: a glow smeared over a transparent surface reads as solid white */


/* ============================================================
   JOURNEY STATE MACHINE
   ============================================================ */
const APPROACH = 0.040;             // how far before a node the camera stops
let   stopIndex = 0;                // the chapter on screen (or being left)
let   target    = 0;                // the chapter being travelled to
let   phase     = 'hold';           // 'hold' | 'travel'
let   phaseTime = 0;
let   camU      = STOPS[0] - APPROACH;
let   fromU     = camU, travelDur = TRAVEL_SECONDS;
let   lookBlend = 1;                // 0 = look down the corridor, 1 = look at node

const elChapter = document.getElementById('mc-chapter');
const elIndex   = document.getElementById('mc-chIndex');
const elName    = document.getElementById('mc-chName');
const elBlurb   = document.getElementById('mc-chBlurb');
const elTransit = document.getElementById('mc-transit');
const elTrack   = document.getElementById('mc-track');
const elCounter = document.getElementById('mc-counter');
const prevBtn   = document.getElementById('mc-prev');
const nextBtn   = document.getElementById('mc-next');
const pad2 = n => String(n).padStart(2,'0');

/* where each chapter sits on the rail: spread over its middle 60% */
const railPos = i => 0.2 + 0.6 * (CHAPTERS.length > 1 ? i/(CHAPTERS.length-1) : 0.5);
/* rail ticks: one per chapter */
const ticks = STOPS.map((u,i)=>{
  const b = document.createElement('button');
  b.className = 'tick';
  b.style.left = (railPos(i)*100) + '%';
  b.setAttribute('aria-label', 'Go to ' + CHAPTERS[i].name);
  b.addEventListener('click', ()=> goTo(i));
  b.appendChild(document.createElement('canvas'));
  elTrack.appendChild(b);
  return b;
});

/* etched, like the site's ONLINE / LIVE (etched.js): PREV / NEXT as etched
   chips, and each chapter's notch as an orb socket cut into the glass, the
   orb lit in the ring's blue for the chapter on screen */
const ETCH_RGB = [0.45, 0.66, 1.0];
function drawSocket(cv, lit){
  if (!window.etchedUI) return;
  const sr = 3.3, pad = Math.ceil(sr*4) + 2, ss = Math.min(devicePixelRatio || 1, 2) * 2;
  const W = pad*2, H = pad*2;
  cv.width = Math.ceil(W*ss); cv.height = Math.ceil(H*ss);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const g = cv.getContext('2d');
  g.setTransform(ss, 0, 0, ss, 0, 0); g.clearRect(0, 0, W, H);
  const rgb = ETCH_RGB.map(v => Math.round(v*255)).join(',');
  window.etchedUI.paintEtched(g, { sx:pad, sy:pad, sr, tx:pad, ty:pad, textW:0, text:'', font:'9px Michroma', ls:0, rgb, lit });
  // the orb in the socket: lit, a white-hot core into the blue; unlit, a dim grey bead
  const orbR = sr*0.95, grad = g.createRadialGradient(pad, pad, 0, pad, pad, orbR);
  const base = lit ? ETCH_RGB : [0.59, 0.62, 0.67];
  const tone = (white, lum) => `rgb(${base.map(v => Math.min(255, Math.round((v*(1 - white) + white)*lum*255))).join(',')})`;
  if (lit){ grad.addColorStop(0, tone(0.8, 1.15)); grad.addColorStop(0.3, tone(0.5, 1.05)); grad.addColorStop(0.55, tone(0.12, 0.95)); grad.addColorStop(0.8, tone(0, 0.7)); grad.addColorStop(1, tone(0, 0.3)); }
  else { grad.addColorStop(0, tone(0.1, 0.42)); grad.addColorStop(0.6, tone(0, 0.26)); grad.addColorStop(1, tone(0, 0.08)); }
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = grad; g.beginPath(); g.arc(pad, pad, orbR, 0, Math.PI*2); g.fill();
  g.globalCompositeOperation = 'source-over';
}
// A word cut into the glass exactly as etched.js cuts ONLINE / LIVE's (dark
// wall above, lit lip below, frosted face), no orb: the chapter names
function drawEtchedWord(host, text, fs = 9.5, lspEm = 0.28){
  const lsp = lspEm*fs, font = `400 ${fs}px Michroma, "Share Tech Mono", sans-serif`;
  const k = Math.max(1, fs/14);                                // the cut deepens a little with the size
  if (document.fonts && !document.fonts.check(font)) document.fonts.load(font).then(() => drawEtchedWord(host, text, fs, lspEm), () => {});
  let cv = host.querySelector('canvas');
  if (!cv){ cv = document.createElement('canvas'); host.appendChild(cv); }
  const g0 = cv.getContext('2d'); g0.font = font;
  let textW = 0; for (const ch of text) textW += g0.measureText(ch).width + lsp;
  textW -= lsp;
  const pad = 3, w = Math.ceil(textW) + pad*2, h = Math.ceil(fs*1.5) + pad*2, ss = Math.min(devicePixelRatio || 1, 2) * 2;
  cv.width = Math.ceil(w*ss); cv.height = Math.ceil(h*ss);
  Object.assign(cv.style, { width: w + 'px', height: h + 'px', display: 'block' });
  const g = cv.getContext('2d');
  g.setTransform(ss, 0, 0, ss, 0, 0); g.clearRect(0, 0, w, h);
  g.font = font; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const ty = h/2;
  const paint = (dy, stroke) => { let x = pad; for (const ch of text){ g.fillText(ch, x, ty + dy); if (stroke) g.strokeText(ch, x, ty + dy); x += g.measureText(ch).width + lsp; } };
  g.fillStyle = 'rgba(0,0,0,0.8)';          paint(-0.7*k);   // shadowed upper wall
  g.fillStyle = 'rgba(205,222,245,0.32)';   paint(0.8*k);    // lit lower lip
  const face = g.createLinearGradient(pad, 0, pad + textW, 0);
  face.addColorStop(0, 'rgba(176,190,210,0.8)'); face.addColorStop(0.35, 'rgba(184,200,222,0.86)'); face.addColorStop(1, 'rgba(176,192,215,0.82)');
  g.fillStyle = g.strokeStyle = face; g.lineWidth = 0.3*k;
  paint(0, true);                                              // frosted face
}

/* ============================================================
   RAIL GLASS — arc-glass.js (the menu's nav arc) as a straight tube
   ============================================================ */
const railGlass = (() => {
  const track = elTrack, glowCv = document.getElementById('mc-railGlow');
  const TOUCH = matchMedia('(hover: none)');
  let selU = null, lit = 0, W = 0, H = 0, g2 = glowCv.getContext('2d');

  let renderer = null;
  try { renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'low-power' }); } catch (e) {}
  if (!renderer) return { frame(){}, };
  const cvs = renderer.domElement;
  cvs.setAttribute('aria-hidden', 'true');
  track.insertBefore(cvs, glowCv.nextSibling);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(0, 1, 0, -1, -50, 50);
  const rt = new THREE.WebGLRenderTarget(1, 1, { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter });
  const desat = (rgb, k) => { const l = 0.2126*rgb[0] + 0.7152*rgb[1] + 0.0722*rgb[2]; return rgb.map(v => l + (v-l)*k); };
  const U = {
    uT:{value:0}, uSelU:{value:0}, uSelOn:{value:0},
    uColA:{value:new THREE.Vector3().fromArray(desat([0.39,0.59,1.0], 0.75))},
    uColB:{value:new THREE.Vector3().fromArray(desat([0.78,0.88,1.0], 0.75))},
  };
  const VERT = `
    varying vec2 vUv; varying vec3 vN;
    void main(){ vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const COMMON = `
    uniform float uT, uSelU, uSelOn; uniform vec3 uColA, uColB;
    varying vec2 vUv; varying vec3 vN;
    float facing(){ return abs(normalize(vN).z); }
    float ends(){ return smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x); }
    float selLight(float u){
      float h = u - uSelU;
      return uSelOn * (exp(-h * h * 1500.0) * 1.5 + exp(-h * h * 140.0) * 0.35);
    }
  `;
  const additive = { transparent:true, depthWrite:false, blending:THREE.CustomBlending,
    blendSrc:THREE.SrcAlphaFactor, blendDst:THREE.OneFactor, blendSrcAlpha:THREE.ZeroFactor, blendDstAlpha:THREE.OneFactor };
  const coreMat = new THREE.ShaderMaterial({ uniforms:U, vertexShader:VERT, ...additive, fragmentShader: COMMON + `
    void main(){
      float l = selLight(vUv.x);
      vec3 c = uColA * 0.5 + mix(vec3(0.2, 0.46, 1.0), vec3(0.55, 0.78, 1.0), clamp(l * 0.45, 0.0, 1.0)) * 2.6 * l;
      c *= (0.5 + 0.5 * facing()) * 0.6 * ends();
      gl_FragColor = vec4(c, 1.0);
    }` });
  const glowMat = new THREE.ShaderMaterial({ uniforms:U, vertexShader:VERT, ...additive, fragmentShader: COMMON + `
    void main(){
      float l = selLight(vUv.x);
      vec3 c = uColA * 0.2 * 1.4 + vec3(0.16, 0.4, 1.0) * 1.6 * l;
      gl_FragColor = vec4(c * pow(facing(), 2.0) * 0.6 * ends(), 1.0);
    }` });
  const glassMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, { bgTex:{value:rt.texture}, res:{value:new THREE.Vector2(1,1)}, uRefrPx:{value:6} }),
    transparent:true, depthWrite:false, vertexShader:VERT,
    blending:THREE.CustomBlending, blendSrc:THREE.SrcAlphaFactor, blendDst:THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha:THREE.OneFactor, blendDstAlpha:THREE.OneMinusSrcAlphaFactor,
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
        float e = smoothstep(0.05, 0.2, vUv.x) * smoothstep(0.95, 0.8, vUv.x);
        gl_FragColor = vec4(col, alpha * e * e);
      }`,
  });

  let meshes = [];
  function build(){
    const r = track.getBoundingClientRect();
    W = Math.max(2, Math.round(r.width)); H = Math.max(2, Math.round(r.height));
    const pr = Math.min(Math.max(devicePixelRatio || 1, 2), 3);   // >= 2x so the thin tube's edge stays clean
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
    rt.setSize(Math.round(W*pr), Math.round(H*pr));
    glassMat.uniforms.res.value.set(W*pr, H*pr);
    cam.left = 0; cam.right = W; cam.top = 0; cam.bottom = -H; cam.updateProjectionMatrix();
    glowCv.width = Math.round(W*pr); glowCv.height = Math.round(H*pr);
    g2.setTransform(pr, 0, 0, pr, 0, 0);
    meshes.forEach(m => { scene.remove(m); m.geometry.dispose(); });
    const y = -H/2;
    const line = new THREE.LineCurve3(new THREE.Vector3(0, y, 0), new THREE.Vector3(W, y, 0));
    const rad = innerWidth <= 768 ? 2.8 : 4.2;    // the arc's tube radius in px
    const shell = new THREE.Mesh(new THREE.TubeGeometry(line, 200, rad, 48, false), glassMat);
    const glow  = new THREE.Mesh(new THREE.TubeGeometry(line, 200, rad*0.78, 24, false), glowMat);
    const core  = new THREE.Mesh(new THREE.TubeGeometry(line, 200, rad*0.26, 12, false), coreMat);
    shell.renderOrder = 10;
    glow.layers.enable(1); core.layers.enable(1);   // layer 1: what the glass refracts
    meshes = [shell, glow, core];
    scene.add(shell, glow, core);
  }
  new ResizeObserver(build).observe(track);
  build();

  // the arc's wide blue glow and the light's bloom past the glass (index.html _drawNavArc)
  function drawGlow(){
    g2.clearRect(0, 0, W, H);
    const fade = g2.createLinearGradient(0, 0, W, 0);
    fade.addColorStop(0, 'rgba(60,140,255,0)'); fade.addColorStop(0.18, 'rgba(60,140,255,0.1)');
    fade.addColorStop(0.82, 'rgba(60,140,255,0.1)'); fade.addColorStop(1, 'rgba(60,140,255,0)');
    g2.strokeStyle = fade; g2.lineWidth = 20; g2.lineCap = 'butt';
    g2.beginPath(); g2.moveTo(0, H/2); g2.lineTo(W, H/2); g2.stroke();
    if (lit > 0.01){
      const x = selU*W, rr = innerWidth <= 768 ? 18 : 28;
      const b = g2.createRadialGradient(x, H/2, 0, x, H/2, rr);
      b.addColorStop(0, `rgba(90,160,255,${0.38*lit})`);
      b.addColorStop(0.4, `rgba(50,110,255,${0.16*lit})`);
      b.addColorStop(1, 'rgba(40,100,255,0)');
      g2.fillStyle = b; g2.fillRect(x-rr, H/2-rr, rr*2, rr*2);
    }
  }

  return {
    // called every frame: the light eases toward the chapter being shown or
    // travelled to by the nav dot's own step (12% of the gap a frame, 22% on
    // phones), and fades in the way the arc lights on hover
    frame(t){
      const goal = railPos(target);
      if (selU === null) selU = goal;            // first frame: start on the chapter, like the dot's first snap
      const step = innerWidth <= 768 ? 0.22 : 0.12;
      selU = REDUCED ? goal : selU + (goal - selU)*step;
      lit += (1 - lit) * (REDUCED ? 1 : 0.12);
      drawGlow();
      U.uT.value = REDUCED ? 0 : t;
      U.uSelU.value = selU; U.uSelOn.value = lit;
      cam.layers.set(1);
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam);
      cam.layers.set(0);
      renderer.setRenderTarget(null); renderer.clear(); renderer.render(scene, cam);
    },
  };
})();

function paintChapter(i){
  // the title, cut into the glass like PREV / NEXT (etched.js's letter recipe)
  elName.setAttribute('aria-label', CHAPTERS[i].name);
  elName.textContent = '';
  // phones: 14px, the phone's title size (EXPERIENCE's section titles too)
  drawEtchedWord(elName, CHAPTERS[i].name.toUpperCase(), innerWidth <= 768 ? 14 : Math.max(15, Math.min(21, innerWidth*0.017)), 0.16);
  elBlurb.textContent = CHAPTERS[i].blurb;
  if (elCounter) elCounter.textContent = pad2(i+1) + ' / ' + pad2(CHAPTERS.length);   // no counter on the site
  ticks.forEach((t,k)=>{
    t.classList.toggle('active', k===i);
    drawSocket(t.querySelector('canvas'), k===i);
    t.classList.toggle('past',   k<i);
    if (k===i) t.setAttribute('aria-current','step'); else t.removeAttribute('aria-current');
  });
}

function enterHold(i){
  stopIndex = target = i; phase='hold'; phaseTime=0;
  camU = STOPS[i] - APPROACH;
  paintChapter(i);
  elChapter.classList.add('show');
  elTransit.classList.remove('show');
}
/* travel from wherever the camera is to chapter i, forwards or back */
function goTo(i){
  i = Math.max(0, Math.min(STOPS.length-1, i));
  if (i === target && (phase === 'travel' || i === stopIndex)) return;
  if (REDUCED){ lookBlend = 1; enterHold(i); return; }
  target = i; fromU = camU; phase = 'travel'; phaseTime = 0;
  const steps = Math.abs((STOPS[i] - APPROACH) - camU) / (STOPS[1] - STOPS[0]);
  travelDur = TRAVEL_SECONDS * Math.max(0.5, Math.sqrt(steps));
  elChapter.classList.remove('show');
  elTransit.classList.add('show');
}
const next = () => goTo(Math.min(target+1, STOPS.length-1));
const prev = () => goTo(target-1);

// the click sound WORK's arrows make (index.html's _bufHover)
const navSound = () => { if (typeof playSound === 'function' && typeof _bufHover !== 'undefined') playSound(_bufHover); };
prevBtn.addEventListener('click', () => { navSound(); prev(); });
nextBtn.addEventListener('click', () => { navSound(); next(); });
addEventListener('keydown', e=>{
  if (!panelOpen) return;
  if (e.key==='ArrowRight' || e.key==='ArrowDown' || e.key==='PageDown') { e.preventDefault(); next(); }
  if (e.key==='ArrowLeft'  || e.key==='ArrowUp'   || e.key==='PageUp')   { e.preventDefault(); prev(); }
});
/* the wheel and a swipe move one chapter per gesture */
let wheelLock = 0;
panel.addEventListener('wheel', e=>{
  const now = performance.now();
  if (Math.abs(e.deltaY) < 8 || now < wheelLock) return;
  wheelLock = now + 900;
  e.deltaY > 0 ? next() : prev();
}, { passive:true });
let touchY = null, touchX = null;
panel.addEventListener('touchstart', e=>{ touchY = e.touches[0].clientY; touchX = e.touches[0].clientX; }, { passive:true });
panel.addEventListener('touchend', e=>{
  if (touchY === null) return;
  const dy = touchY - e.changedTouches[0].clientY, dx = touchX - e.changedTouches[0].clientX;
  const d = Math.abs(dy) > Math.abs(dx) ? dy : dx;
  if (Math.abs(d) > 40) d > 0 ? next() : prev();
  touchY = touchX = null;
}, { passive:true });

/* gentle parallax */
let mx=0, my=0, tmx=0, tmy=0;
panel.addEventListener('pointermove', e=>{
  if (e.pointerType !== 'mouse') return;
  const r = panel.getBoundingClientRect();
  tmx = ((e.clientX - r.left)/r.width  - 0.5) * 2;
  tmy = ((e.clientY - r.top)/r.height - 0.5) * 2;
});
panel.addEventListener('pointerleave', ()=>{ tmx = tmy = 0; });

/* the site opens and closes the ME panel (index.html openPanel / closePanel);
   nothing renders while it's shut */
let panelOpen = false, loopOn = false;
function startLoop(){ if (loopOn) return; loopOn = true; clock.getDelta(); requestAnimationFrame(tick); }

const easeInOut = t => t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;

/* ============================================================
   LOOP
   ============================================================ */
const CAND_MAX = 420;
let candN = 0;
const candPos = Array.from({length:CAND_MAX}, ()=> new THREE.Vector3());
const candCol = Array.from({length:CAND_MAX}, ()=> new THREE.Color());
const lightOrder = [];
const lightPos = Array.from({length:LIGHT_N}, ()=> new THREE.Vector3(0,0,9999));
const lightCol = Array.from({length:LIGHT_N}, ()=> new THREE.Color(0,0,0));

const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
const upVec = new THREE.Vector3(0,1,0);
const nodeAim = new THREE.Vector3();

function tick(){
  if (!panelOpen){ loopOn = false; return; }
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t  = clock.elapsedTime;
  if (document.hidden || !panelOpen) return;

  phaseTime += dt;
  if (phase === 'hold'){
    lookBlend += (1 - lookBlend) * Math.min(1, dt*2.2);
  } else {
    const k  = Math.min(1, phaseTime / travelDur);
    const to = STOPS[target] - APPROACH;
    camU = fromU + (to-fromU)*easeInOut(k);
    lookBlend += (0 - lookBlend) * Math.min(1, dt*2.0);
    if (k >= 1) enterHold(target);
  }

  /* camera */
  const base   = spine.getPointAt(Math.min(Math.max(camU,0),1));
  const f      = frameAt(Math.min(Math.max(camU,0),1));
  mx += (tmx-mx)*0.04; my += (tmy-my)*0.04;
  const drift  = Math.sin(t*0.37)*0.5;
  const drift2 = Math.cos(t*0.29)*0.4;

  camera.position.copy(base)
    .add(f.n.clone().multiplyScalar(mx*1.5 + drift))
    .add(f.b.clone().multiplyScalar(-my*1.2 + drift2));

  const ahead = spine.getPointAt(Math.min(camU + 0.02, 1));
  const node  = nodes[phase === "travel" ? target : stopIndex].position;
  // aim a little below the node so it sits in the upper half, clear of the chapter text
  camTarget.copy(ahead).lerp(nodeAim.copy(node).addScaledVector(upVec, -NODE_R*1.15), lookBlend);
  camera.up.copy(upVec);
  camera.lookAt(camTarget);

  /* chapter assets: the one on screen brightens, the rest idle */
  nodes.forEach((n, i)=>{
    const u = n.userData, inner = u.inner;
    inner.rotation.x += u.spin.x*dt;
    inner.rotation.y += u.spin.y*dt;
    inner.rotation.z += u.spin.z*dt;
    if (u.tick) u.tick(t, dt);

    const on   = (i === stopIndex && phase === 'hold');
    const goal = on ? 0.62 : 0.20;
    const g    = u.gain = u.gain + (goal - u.gain)*Math.min(1, dt*1.6);
    u.cores.forEach(m => { m.uniforms.uTime.value = t; m.uniforms.uGain.value = g; });
    u.shells.forEach(m => { m.uniforms.uGain.value = g; });
    u.lines.forEach(l => { l.material.opacity = (0.14 + g*0.42) * (l.userData.weight || 1); });

    // assets breathe and grow a touch when on screen, except one that must hold still
    if (!u.still){
      const breathe = 1 + Math.sin(t*0.8 + i)*0.014;
      n.scale.setScalar(breathe * (0.9 + g*0.1));
    }
  });

  GN.U.uTime.value = REDUCED ? 0 : t;

  allMats.forEach(m => {
    if (!m) return;
    m.uniforms.uTime.value = t;
    m.uniforms.uCamPos.value.copy(camera.position);
  });

  /* action potentials: head plus a fading trail behind it */
  const arr = pulseAttr.array, carr = pulseColAttr.array;
  const tv = new THREE.Vector3();
  for (let i=0;i<PULSE_N;i++){
    const p = pulses[i];
    p.t += p.speed*dt;
    if (p.t > 1){
      p.curve.getPoint(1, tv);          // arrived at a terminal
      releaseVesicles(tv, p.color);
      p.t = 0; assignPath(p);
    }
    p.curve.getPoint(Math.min(p.t,1), p.pos);

    const env = Math.sin(Math.min(Math.max(p.t,0),1)*Math.PI);
    for (let k=0;k<TRAIL;k++){
      const tt = Math.max(0, p.t - k*p.trailGap);
      p.curve.getPoint(tt, tv);
      const o = (i*TRAIL + k)*3;
      arr[o]=tv.x; arr[o+1]=tv.y; arr[o+2]=tv.z;
      const fade = Math.pow(1 - k/TRAIL, 2.1) * env * p.energy;
      carr[o]=p.color.r*fade; carr[o+1]=p.color.g*fade; carr[o+2]=p.color.b*fade;
    }
  }
  pulseAttr.needsUpdate = true;
  pulseColAttr.needsUpdate = true;

  /* synaptic firing: sharp attack, quick decay, then a quiet interval */
  const sArr = synAttr.array, sCol = synColAttr.array;
  for (let i=0;i<SYN_N;i++){
    const sy = synapses[i];
    sy.t += dt;
    if (sy.t > sy.period){
      sy.t = 0;
      sy.period = 0.8 + rand()*3.4;
      sy.peak   = 0.45 + rand()*0.9;
      if (rand() < 0.22)
        sy.color.set(PULSE_PALETTE[(rand()*PULSE_PALETTE.length)|0]);
    }
    // main spike plus a smaller rebound, so it reads as a discharge not a fade
    const a  = Math.exp(-sy.t*7.5);
    const b2 = 0.42*Math.exp(-Math.max(0, sy.t-0.09)*13.0);
    sy.inten = sy.peak * (a + b2) * (0.85 + 0.15*Math.sin(t*37.0 + i));
    sCol[i*3]   = sy.color.r*sy.inten;
    sCol[i*3+1] = sy.color.g*sy.inten;
    sCol[i*3+2] = sy.color.b*sy.inten;
  }
  synColAttr.needsUpdate = true;

  /* vesicles drifting away from the terminal that released them */
  const bArr = burstAttr.array, bCol = burstColAttr.array;
  for (let i=0;i<BURST_N;i++){
    const b = bursts[i];
    if (b.life <= 0){ bCol[i*3]=bCol[i*3+1]=bCol[i*3+2]=0; continue; }
    b.life -= dt;
    b.vel.multiplyScalar(0.94);
    b.pos.addScaledVector(b.vel, dt*3.0);
    const k = Math.max(0, b.life/b.max);
    bArr[i*3]=b.pos.x; bArr[i*3+1]=b.pos.y; bArr[i*3+2]=b.pos.z;
    const f = k*k;
    bCol[i*3]=b.color.r*f; bCol[i*3+1]=b.color.g*f; bCol[i*3+2]=b.color.b*f;
  }
  burstAttr.needsUpdate = true; burstColAttr.needsUpdate = true;

  /* the brightest nearby pulses and synapses become real point lights */
  candN = 0;
  for (let i=0;i<PULSE_N && candN<CAND_MAX;i++){
    const p = pulses[i];
    const env = Math.sin(Math.min(Math.max(p.t,0),1)*Math.PI);
    if (env < 0.05) continue;
    candPos[candN].copy(p.pos);
    candCol[candN].copy(p.color).multiplyScalar(env * p.energy * 0.62);
    candN++;
  }
  for (let i=0;i<SYN_N && candN<CAND_MAX;i++){
    const sy = synapses[i];
    if (sy.inten < 0.12) continue;
    candPos[candN].copy(sy.pos);
    candCol[candN].copy(sy.color).multiplyScalar(sy.inten * 0.55);
    candN++;
  }

  lightOrder.length = 0;
  for (let i=0;i<candN;i++) lightOrder.push(i);
  lightOrder.sort((a,b)=>
    candPos[a].distanceToSquared(camera.position) -
    candPos[b].distanceToSquared(camera.position));

  for (let k=0;k<LIGHT_N;k++){
    if (k < lightOrder.length){
      const c = lightOrder[k];
      lightPos[k].copy(candPos[c]);
      lightCol[k].copy(candCol[c]);
    } else {
      lightPos[k].set(0,0,99999);
      lightCol[k].setRGB(0,0,0);
    }
  }
  tissueMats.forEach(m=>{
    if (!m) return;
    const lp = m.uniforms.uLightPos.value, lc = m.uniforms.uLightCol.value;
    for (let k=0;k<LIGHT_N;k++){ lp[k].copy(lightPos[k]); lc[k].copy(lightCol[k]); }
  });

  /* rail: the light slides to the chapter like the menu's nav dot */
  railGlass.frame(t);

  renderer.render(scene, camera);
}

new ResizeObserver(()=>{
  camera.aspect = PW()/PH();
  project();
  renderer.setSize(PW(), PH(), false);
}).observe(panel);

/* ============================================================
   START
   ============================================================ */
enterHold(0);
clock.start();
return {
  open(){ panelOpen = true; startLoop(); },
  close(){ panelOpen = false; },
};


  };
  window.meCorridor = {
    open(){ if (!api) api = build(); api.open(); },
    close(){ if (api) api.close(); },
  };
})();
