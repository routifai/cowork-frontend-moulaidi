/**
 * PulsePresence — the Hypatia chat avatar.
 *
 * A radial waveform ring (96 bars + inner hairline torus): part cardiogram,
 * part market tape. It follows DOM anchor elements every frame, so it can
 * "fly" between the composer, a thinking row, and a message avatar, and it
 * scrolls with the thread for free.
 *
 * Peer deps: three (tested against r128 API surface), gsap.
 *
 * Usage:
 *   const presence = new PulsePresence({ three: THREE, gsap });
 *   document.body.appendChild(presence.canvas);      // fixed, pointer-events:none
 *   presence.setAnchor(document.querySelector('#composer-orb-slot'));
 *   presence.start();
 *
 *   presence.setMode('thinking');   // rest | thinking | speaking | settled
 *   presence.glitch(0.8);           // ~300ms burst
 *   presence.dispose();             // on unmount
 *
 * React: create once in a ref inside useEffect, expose the imperative API
 * through a hook. Never drive it from React state per frame.
 */
export class PulsePresence {
    static MODES = {
        rest:     { chaos: 0.08, speed: 0.9, energy: 0.0  },
        thinking: { chaos: 0.50, speed: 3.2, energy: 1.0  },
        speaking: { chaos: 0.22, speed: 1.8, energy: 0.5  },
        settled:  { chaos: 0.05, speed: 0.7, energy: 0.15 },
    };

    constructor({ three, gsap, bars = 96, r0 = 0.85 } = {}) {
        if (!three || !gsap) throw new Error('PulsePresence needs { three, gsap }');
        this.THREE = three;
        this.gsap = gsap;
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.PULSE = { bars, r0 };
        this.params = { chaos: 0.08, speed: 0.9, energy: 0, glitch: 0 };
        this.mode = 'rest';
        this.anchorEl = null;
        this.anchorBoost = 1;
        this._rafId = null;

        this._buildRenderer();
        this._buildScene();
        this._onResize = () => this._resize();
        this._onVisibility = () => document.hidden ? this.stop() : this.start();
        window.addEventListener('resize', this._onResize);
        document.addEventListener('visibilitychange', this._onVisibility);
    }

    _buildRenderer() {
        const THREE = this.THREE;
        this.canvas = document.createElement('canvas');
        Object.assign(this.canvas.style, {
            position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '40',
        });
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 0, 9);
        this.clock = new THREE.Clock();
    }

    _buildScene() {
        const THREE = this.THREE;
        const { bars } = this.PULSE;

        this.group = new THREE.Group();

        this.geo = new THREE.BufferGeometry();
        this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bars * 2 * 3), 3));

        const colors = new Float32Array(bars * 2 * 3);
        const cBlue = new THREE.Color('#0051a5');
        const cMid  = new THREE.Color('#1a66ff');
        const cGold = new THREE.Color('#e8a821');
        for (let i = 0; i < bars; i++) {
            const c = i % 16 === 0 ? cGold : (i % 2 === 0 ? cBlue : cMid);
            for (let k = 0; k < 2; k++) {
                colors[(i * 2 + k) * 3]     = c.r;
                colors[(i * 2 + k) * 3 + 1] = c.g;
                colors[(i * 2 + k) * 3 + 2] = c.b;
            }
        }
        this.geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        this.lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 });
        this.group.add(new THREE.LineSegments(this.geo, this.lineMat));

        this.innerGeo = new THREE.TorusGeometry(this.PULSE.r0 - 0.04, 0.01, 8, 128);
        this.innerMat = new THREE.MeshBasicMaterial({ color: 0x0d0d0f, transparent: true, opacity: 0.28 });
        this.group.add(new THREE.Mesh(this.innerGeo, this.innerMat));

        this.scene.add(this.group);
    }

    /** Point the presence at a DOM element. It flies there and matches its size. */
    setAnchor(el, boost = 1) {
        this.anchorEl = el;
        this.anchorBoost = boost;
    }

    /** rest | thinking | speaking | settled */
    setMode(mode) {
        const m = PulsePresence.MODES[mode];
        if (!m || this.mode === mode) return;
        this.mode = mode;
        const speedScale = this.reducedMotion ? 0.25 : 1;
        this.gsap.to(this.params, {
            chaos: m.chaos,
            speed: m.speed * speedScale,
            energy: m.energy,
            duration: 1.2, ease: 'power2.inOut',
        });
    }

    /** Short digital-corruption burst. Fire on state transitions only. */
    glitch(strength = 1) {
        if (this.reducedMotion) return;
        this.gsap.fromTo(this.params,
            { glitch: strength },
            { glitch: 0, duration: 0.32, ease: 'steps(4)' });
    }

    /** Brief chaos kick — wire to composer keystrokes while mode === 'rest'. */
    ripple() {
        if (this.mode !== 'rest' || this.reducedMotion) return;
        if (this._rippleTween) this._rippleTween.kill();
        this._rippleTween = this.gsap.fromTo(this.params,
            { chaos: PulsePresence.MODES.rest.chaos + 0.14 },
            { chaos: PulsePresence.MODES.rest.chaos, duration: 0.5, ease: 'power2.out' });
    }

    start() {
        if (this._rafId !== null) return;
        this.clock.getDelta();
        const loop = () => {
            this._rafId = requestAnimationFrame(loop);
            this._frame(this.clock.getElapsedTime());
        };
        loop();
    }

    stop() {
        if (this._rafId === null) return;
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
    }

    _anchorTarget() {
        const THREE = this.THREE;
        const r = this.anchorEl.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const nx = (cx / window.innerWidth) * 2 - 1;
        const ny = -(cy / window.innerHeight) * 2 + 1;
        const v = new THREE.Vector3(nx, ny, 0.5).unproject(this.camera);
        const dir = v.sub(this.camera.position).normalize();
        const t = -this.camera.position.z / dir.z;
        const pos = this.camera.position.clone().add(dir.multiplyScalar(t));

        const worldH = 2 * Math.tan((this.camera.fov * Math.PI / 180) / 2) * this.camera.position.z;
        // Visual diameter ≈ 2.6 world units at scale 1 (r0 + bar peaks)
        const scale = (r.height * this.anchorBoost * (worldH / window.innerHeight)) / 2.6;
        return { pos, scale };
    }

    _frame(t) {
        const { bars, r0 } = this.PULSE;
        const p = this.geo.attributes.position.array;
        const { chaos, speed, glitch } = this.params;

        for (let i = 0; i < bars; i++) {
            const a = (i / bars) * Math.PI * 2;
            const wave = Math.sin(a * 3 + t * speed) * 0.5 + 0.5;
            const jitter = Math.sin(a * 17.0 + t * speed * 7.3) * chaos;
            let h = 0.06 + wave * 0.16 + Math.abs(jitter) * 0.6;
            if (glitch > 0.001) {
                const g = Math.sin(i * 91.7 + Math.floor(t * 24) * 7.3) * 43758.5453;
                const frac = g - Math.floor(g);
                if (frac > 0.8) h += glitch * 0.5;
                else if (frac < 0.12) h *= 1.0 - glitch;
            }
            const cx = Math.cos(a), cy = Math.sin(a);
            p[(i * 2) * 3]     = cx * r0;
            p[(i * 2) * 3 + 1] = cy * r0;
            p[(i * 2) * 3 + 2] = 0;
            p[(i * 2 + 1) * 3]     = cx * (r0 + h);
            p[(i * 2 + 1) * 3 + 1] = cy * (r0 + h);
            p[(i * 2 + 1) * 3 + 2] = 0;
        }
        this.geo.attributes.position.needsUpdate = true;
        this.group.rotation.z = t * 0.05;
        this.innerMat.opacity = 0.2 + this.params.energy * 0.25;

        if (this.anchorEl) {
            const target = this._anchorTarget();
            const chase = this.mode === 'thinking' ? 0.10 : 0.14;
            this.group.position.lerp(target.pos, chase);
            const s = this.group.scale.x + (target.scale - this.group.scale.x) * chase;
            this.group.scale.setScalar(s);
        }

        this.renderer.render(this.scene, this.camera);
    }

    /** Snap instantly to the current anchor (call once after first layout). */
    snapToAnchor() {
        if (!this.anchorEl) return;
        const t = this._anchorTarget();
        this.group.position.copy(t.pos);
        this.group.scale.setScalar(t.scale);
    }

    _resize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    dispose() {
        this.stop();
        window.removeEventListener('resize', this._onResize);
        document.removeEventListener('visibilitychange', this._onVisibility);
        this.geo.dispose();
        this.innerGeo.dispose();
        this.lineMat.dispose();
        this.innerMat.dispose();
        this.renderer.dispose();
        this.canvas.remove();
    }
}
