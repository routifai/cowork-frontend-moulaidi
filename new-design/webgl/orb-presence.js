/**
 * OrbPresence — the Hypatia auth/landing hero.
 *
 * "Royal Gloss": a simplex-displaced icosphere with a chrome-sapphire
 * fragment shader — deep RBC blue core, ice-white liquid streaks, glitch
 * bursts as band-tearing + scanline shimmer. The exact material approved
 * in reference/v3-concept.html (skin 01 in reference/orb-ideas.html).
 *
 * Peer deps: three (tested against r128 API surface), gsap.
 *
 * Usage:
 *   const orb = new OrbPresence({ three: THREE, gsap });
 *   document.body.appendChild(orb.canvas);
 *   orb.placeNDC(0.5, 0.05, 1);   // x,y in NDC (-1..1), scale
 *   orb.start();
 *
 *   orb.setMode('listening');     // idle | listening | thinking | settled
 *   orb.glitch(1);
 *   orb.flyToNDC(0, 0.52, 0.3);   // animated travel (auth → workspace)
 *   orb.dispose();
 */

const SNOISE = /* glsl */ `
vec3 mod289(vec3 x){return x - floor(x * (1.0/289.0)) * 289.0;}
vec4 mod289(vec4 x){return x - floor(x * (1.0/289.0)) * 289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

const VERTEX = SNOISE + /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uFreq;
uniform float uSpeed;
uniform float uGlitch;
varying vec3 vNormal;
varying vec3 vViewDir;
varying float vDisp;

float displace(vec3 dir, float t) {
  // Low frequency, single octave dominant: liquid chrome, not organic lumps.
  float n1 = snoise(dir * uFreq + vec3(t * 0.7, t * 0.55, t * 0.4));
  float n2 = snoise(dir * uFreq * 2.0 + vec3(-t * 0.5, t * 0.7, t * 0.4)) * 0.15;
  return (n1 + n2) * uAmp;
}

vec3 orthogonal(vec3 v) {
  return normalize(abs(v.x) > abs(v.z)
    ? vec3(-v.y, v.x, 0.0)
    : vec3(0.0, -v.z, v.y));
}

void main() {
  float t = uTime * uSpeed;
  float radius = length(position);
  vec3 dir = normalize(position);

  float d = displace(dir, t);
  vec3 displaced = dir * (radius + d);

  // Normal from two displaced neighbours so lighting follows deformation.
  float eps = 0.08;
  vec3 tangent = orthogonal(dir);
  vec3 bitangent = normalize(cross(dir, tangent));
  vec3 nDir1 = normalize(dir + tangent * eps);
  vec3 nDir2 = normalize(dir + bitangent * eps);
  vec3 p1 = nDir1 * (radius + displace(nDir1, t));
  vec3 p2 = nDir2 * (radius + displace(nDir2, t));
  vec3 newNormal = normalize(cross(p1 - displaced, p2 - displaced));

  // Glitch burst: horizontal band tearing, time-quantized.
  if (uGlitch > 0.001) {
    float bandId = floor((dir.y + 1.0) * 7.0);
    float frameQ = floor(uTime * 24.0);
    float tear = step(0.62, fract(sin(bandId * 91.7 + frameQ * 7.31) * 43758.5453));
    displaced.x += uGlitch * tear * 0.16 * sin(bandId * 3.0 + frameQ);
  }

  vDisp = d;
  vNormal = normalize(normalMatrix * newNormal);
  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
uniform float uGlitch;
varying vec3 vNormal;
varying vec3 vViewDir;
varying float vDisp;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, 2.2);

  // Chrome sapphire: deep royal blue core, electric blue mid, ice streaks.
  vec3 deep = vec3(0.02, 0.07, 0.38);
  vec3 mid  = vec3(0.10, 0.32, 0.92);
  vec3 ice  = vec3(0.86, 0.94, 1.00);

  float band = 0.5 + 0.5 * sin(vDisp * 9.0 + ndv * 4.0 + uTime * 0.15);
  vec3 film = mix(mid, ice, smoothstep(0.35, 0.95, band));

  vec3 color = mix(deep, film, 0.25 + fresnel * (0.6 + uEnergy * 0.2));

  float streak = smoothstep(0.10, 0.30, vDisp) * (0.5 + 0.5 * ndv);
  color = mix(color, ice, streak * 0.55);

  vec3 keyDir = normalize(vec3(0.5, 0.8, 0.6));
  float keySpec = pow(max(dot(reflect(-keyDir, N), V), 0.0), 60.0);
  color += vec3(1.0) * keySpec * 1.1;

  vec3 rimDir = normalize(vec3(-0.7, -0.3, 0.4));
  float rimSpec = pow(max(dot(reflect(-rimDir, N), V), 0.0), 28.0);
  color += vec3(0.7, 0.85, 1.0) * rimSpec * 0.35;

  color += mix(mid, ice, 0.6) * pow(1.0 - ndv, 4.0) * 0.45;

  if (uGlitch > 0.001) {
    float scan = sin(gl_FragCoord.y * 1.7 + uTime * 90.0);
    color += vec3(0.08, 0.25, 0.85) * uGlitch * scan * 0.14;
    float skew = sin(gl_FragCoord.y * 0.6);
    color.r += uGlitch * skew * 0.10;
    color.b -= uGlitch * skew * 0.07;
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

export class OrbPresence {
    static MODES = {
        idle:      { amp: 0.22, speed: 0.32, energy: 0.0  },
        listening: { amp: 0.12, speed: 0.55, energy: 0.35 },
        thinking:  { amp: 0.42, speed: 1.05, energy: 1.0  },
        settled:   { amp: 0.15, speed: 0.22, energy: 0.15 },
    };

    constructor({ three, gsap, detail = 96, radius = 1.55 } = {}) {
        if (!three || !gsap) throw new Error('OrbPresence needs { three, gsap }');
        this.THREE = three;
        this.gsap = gsap;
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.mode = 'idle';
        this._rafId = null;

        const THREE = three;
        this.canvas = document.createElement('canvas');
        Object.assign(this.canvas.style, {
            position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2',
        });
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 0, 9);
        this.clock = new THREE.Clock();

        this.uniforms = {
            uTime:   { value: 0 },
            uAmp:    { value: 0.22 },
            uFreq:   { value: 0.95 },
            uSpeed:  { value: this.reducedMotion ? 0.08 : 0.32 },
            uEnergy: { value: 0 },
            uGlitch: { value: 0 },
        };

        this.geometry = new THREE.IcosahedronGeometry(radius, detail);
        this.material = new THREE.ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: this.uniforms,
        });
        this.group = new THREE.Group();
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.group.add(this.mesh);
        this.scene.add(this.group);

        this._mouse = { x: 0, y: 0 };
        this._onMouse = (e) => {
            this._mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this._mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
        };
        this._onResize = () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        };
        this._onVisibility = () => document.hidden ? this.stop() : this.start();
        document.addEventListener('mousemove', this._onMouse);
        window.addEventListener('resize', this._onResize);
        document.addEventListener('visibilitychange', this._onVisibility);
    }

    _ndcToWorld(nx, ny) {
        const THREE = this.THREE;
        const v = new THREE.Vector3(nx, ny, 0.5).unproject(this.camera);
        const dir = v.sub(this.camera.position).normalize();
        const t = -this.camera.position.z / dir.z;
        return this.camera.position.clone().add(dir.multiplyScalar(t));
    }

    /** Instantly place the orb at an NDC position (x,y in -1..1) and scale. */
    placeNDC(nx, ny, scale = 1) {
        this.group.position.copy(this._ndcToWorld(nx, ny));
        this.group.scale.setScalar(scale);
    }

    /** Animated travel — use inside the auth → workspace timeline. */
    flyToNDC(nx, ny, scale = 1, duration = 1.6) {
        const world = this._ndcToWorld(nx, ny);
        this.gsap.to(this.group.position, { x: world.x, y: world.y, z: world.z, duration, ease: 'power3.inOut' });
        this.gsap.to(this.group.scale, { x: scale, y: scale, z: scale, duration, ease: 'power3.inOut' });
    }

    /** idle | listening | thinking | settled */
    setMode(mode) {
        const m = OrbPresence.MODES[mode];
        if (!m || this.mode === mode) return;
        this.mode = mode;
        const speedScale = this.reducedMotion ? 0.25 : 1;
        this.gsap.to(this.uniforms.uAmp,    { value: m.amp, duration: 1.4, ease: 'power2.inOut' });
        this.gsap.to(this.uniforms.uSpeed,  { value: m.speed * speedScale, duration: 1.4, ease: 'power2.inOut' });
        this.gsap.to(this.uniforms.uEnergy, { value: m.energy, duration: 1.4, ease: 'power2.inOut' });
    }

    /** Short corruption burst — state transitions only. */
    glitch(strength = 1) {
        if (this.reducedMotion) return;
        this.gsap.fromTo(this.uniforms.uGlitch,
            { value: strength },
            { value: 0, duration: 0.32, ease: 'steps(4)' });
    }

    start() {
        if (this._rafId !== null) return;
        this.clock.getDelta();
        const loop = () => {
            this._rafId = requestAnimationFrame(loop);
            const t = this.clock.getElapsedTime();
            this.uniforms.uTime.value = t;
            if (!this.reducedMotion) {
                this.group.rotation.y += ((this._mouse.x * 0.35) - this.group.rotation.y) * 0.03;
                this.group.rotation.x += ((this._mouse.y * 0.2) - this.group.rotation.x) * 0.03;
            }
            this.mesh.rotation.y = t * 0.05;
            this.renderer.render(this.scene, this.camera);
        };
        loop();
    }

    stop() {
        if (this._rafId === null) return;
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
    }

    dispose() {
        this.stop();
        document.removeEventListener('mousemove', this._onMouse);
        window.removeEventListener('resize', this._onResize);
        document.removeEventListener('visibilitychange', this._onVisibility);
        this.geometry.dispose();
        this.material.dispose();
        this.renderer.dispose();
        this.canvas.remove();
    }
}
