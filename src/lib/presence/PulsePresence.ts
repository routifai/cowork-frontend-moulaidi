/**
 * PulsePresence — the living chat avatar from the V3 design language.
 *
 * A radial waveform ring (96 bars + inner hairline torus): part cardiogram,
 * part market tape. It renders on its own full-viewport transparent canvas
 * and every frame chases a DOM anchor element, so it can "fly" between the
 * composer and a thinking dock and it tracks layout/scroll for free.
 *
 * Lives entirely outside React's render cycle — React talks to it only
 * through the imperative API (setAnchor / setMode / glitch / ripple).
 * See new-design/INSTRUCTIONS.md for the full design spec.
 */
import gsap from "gsap";
import * as THREE from "three";

export type PresenceMode = "rest" | "thinking" | "speaking" | "settled";

interface ModePreset {
	chaos: number;
	speed: number;
	energy: number;
}

const MODES: Record<PresenceMode, ModePreset> = {
	rest: { chaos: 0.08, speed: 0.9, energy: 0.0 },
	thinking: { chaos: 0.5, speed: 3.2, energy: 1.0 },
	speaking: { chaos: 0.22, speed: 1.8, energy: 0.5 },
	settled: { chaos: 0.05, speed: 0.7, energy: 0.15 },
};

const BARS = 96;
const R0 = 0.85;
/** Visual diameter in world units at scale 1 (r0 + bar peaks). */
const WORLD_DIAMETER = 2.6;

export class PulsePresence {
	readonly canvas: HTMLCanvasElement;
	mode: PresenceMode = "rest";

	private renderer: THREE.WebGLRenderer;
	private scene = new THREE.Scene();
	private camera: THREE.PerspectiveCamera;
	private clock = new THREE.Clock();
	private group = new THREE.Group();
	private geo = new THREE.BufferGeometry();
	private lineMat: THREE.LineBasicMaterial;
	private innerGeo: THREE.TorusGeometry;
	private innerMat: THREE.MeshBasicMaterial;

	private params = { chaos: 0.08, speed: 0.9, energy: 0, glitch: 0 };
	private anchorEl: HTMLElement | null = null;
	private anchorBoost = 1;
	private rafId: number | null = null;
	private rippleTween: gsap.core.Tween | null = null;
	private readonly reducedMotion: boolean;

	private readonly onResize = () => {
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(window.innerWidth, window.innerHeight);
	};
	private readonly onVisibility = () => {
		if (document.hidden) this.stop();
		else this.start();
	};

	constructor() {
		this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		this.canvas = document.createElement("canvas");
		Object.assign(this.canvas.style, {
			position: "fixed",
			inset: "0",
			pointerEvents: "none",
			zIndex: "40",
		});
		this.canvas.setAttribute("aria-hidden", "true");
		this.canvas.dataset.testid = "presence-canvas";

		// Throws in environments without WebGL (jsdom) — callers catch and
		// run without a presence.
		this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.setSize(window.innerWidth, window.innerHeight);

		this.camera = new THREE.PerspectiveCamera(
			45,
			window.innerWidth / window.innerHeight,
			0.1,
			100,
		);
		this.camera.position.set(0, 0, 9);

		this.geo.setAttribute(
			"position",
			new THREE.BufferAttribute(new Float32Array(BARS * 2 * 3), 3),
		);
		const colors = new Float32Array(BARS * 2 * 3);
		const cBlue = new THREE.Color("#0051a5");
		const cMid = new THREE.Color("#1a66ff");
		const cGold = new THREE.Color("#e8a821");
		for (let i = 0; i < BARS; i++) {
			const c = i % 16 === 0 ? cGold : i % 2 === 0 ? cBlue : cMid;
			for (let k = 0; k < 2; k++) {
				colors[(i * 2 + k) * 3] = c.r;
				colors[(i * 2 + k) * 3 + 1] = c.g;
				colors[(i * 2 + k) * 3 + 2] = c.b;
			}
		}
		this.geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

		this.lineMat = new THREE.LineBasicMaterial({
			vertexColors: true,
			transparent: true,
			opacity: 0.9,
		});
		this.group.add(new THREE.LineSegments(this.geo, this.lineMat));

		this.innerGeo = new THREE.TorusGeometry(R0 - 0.04, 0.01, 8, 128);
		this.innerMat = new THREE.MeshBasicMaterial({
			color: 0x0d0d0f,
			transparent: true,
			opacity: 0.28,
		});
		this.group.add(new THREE.Mesh(this.innerGeo, this.innerMat));
		this.scene.add(this.group);

		window.addEventListener("resize", this.onResize);
		document.addEventListener("visibilitychange", this.onVisibility);
	}

	/** Point the presence at a DOM element. It flies there and matches its size. */
	setAnchor(el: HTMLElement, boost = 1) {
		this.anchorEl = el;
		this.anchorBoost = boost;
	}

	setMode(mode: PresenceMode) {
		if (this.mode === mode) return;
		this.mode = mode;
		const m = MODES[mode];
		const speedScale = this.reducedMotion ? 0.25 : 1;
		gsap.to(this.params, {
			chaos: m.chaos,
			speed: m.speed * speedScale,
			energy: m.energy,
			duration: 1.2,
			ease: "power2.inOut",
		});
	}

	/** Short digital-corruption burst — state transitions only, never looped. */
	glitch(strength = 1) {
		if (this.reducedMotion) return;
		gsap.fromTo(
			this.params,
			{ glitch: strength },
			{ glitch: 0, duration: 0.32, ease: "steps(4)" },
		);
	}

	/** Brief volatility kick — wire to composer keystrokes while at rest. */
	ripple() {
		if (this.mode !== "rest" || this.reducedMotion) return;
		this.rippleTween?.kill();
		this.rippleTween = gsap.fromTo(
			this.params,
			{ chaos: MODES.rest.chaos + 0.14 },
			{ chaos: MODES.rest.chaos, duration: 0.5, ease: "power2.out" },
		);
	}

	/** Snap instantly to the current anchor (call once after first layout). */
	snapToAnchor() {
		if (!this.anchorEl) return;
		const t = this.anchorTarget();
		this.group.position.copy(t.pos);
		this.group.scale.setScalar(t.scale);
	}

	start() {
		if (this.rafId !== null) return;
		this.clock.getDelta();
		const loop = () => {
			this.rafId = requestAnimationFrame(loop);
			this.frame(this.clock.getElapsedTime());
		};
		loop();
	}

	stop() {
		if (this.rafId === null) return;
		cancelAnimationFrame(this.rafId);
		this.rafId = null;
	}

	dispose() {
		this.stop();
		window.removeEventListener("resize", this.onResize);
		document.removeEventListener("visibilitychange", this.onVisibility);
		this.geo.dispose();
		this.innerGeo.dispose();
		this.lineMat.dispose();
		this.innerMat.dispose();
		this.renderer.dispose();
		this.canvas.remove();
	}

	private anchorTarget() {
		const el = this.anchorEl as HTMLElement;
		const r = el.getBoundingClientRect();
		const cx = r.left + r.width / 2;
		const cy = r.top + r.height / 2;
		const nx = (cx / window.innerWidth) * 2 - 1;
		const ny = -(cy / window.innerHeight) * 2 + 1;
		const v = new THREE.Vector3(nx, ny, 0.5).unproject(this.camera);
		const dir = v.sub(this.camera.position).normalize();
		const t = -this.camera.position.z / dir.z;
		const pos = this.camera.position.clone().add(dir.multiplyScalar(t));

		const worldH = 2 * Math.tan((this.camera.fov * Math.PI) / 180 / 2) * this.camera.position.z;
		const scale = (r.height * this.anchorBoost * (worldH / window.innerHeight)) / WORLD_DIAMETER;
		return { pos, scale };
	}

	private frame(t: number) {
		const p = this.geo.attributes.position.array as Float32Array;
		const { chaos, speed, glitch } = this.params;

		for (let i = 0; i < BARS; i++) {
			const a = (i / BARS) * Math.PI * 2;
			const wave = Math.sin(a * 3 + t * speed) * 0.5 + 0.5;
			const jitter = Math.sin(a * 17.0 + t * speed * 7.3) * chaos;
			let h = 0.06 + wave * 0.16 + Math.abs(jitter) * 0.6;
			if (glitch > 0.001) {
				const g = Math.sin(i * 91.7 + Math.floor(t * 24) * 7.3) * 43758.5453;
				const frac = g - Math.floor(g);
				if (frac > 0.8) h += glitch * 0.5;
				else if (frac < 0.12) h *= 1.0 - glitch;
			}
			const cx = Math.cos(a);
			const cy = Math.sin(a);
			p[i * 2 * 3] = cx * R0;
			p[i * 2 * 3 + 1] = cy * R0;
			p[i * 2 * 3 + 2] = 0;
			p[(i * 2 + 1) * 3] = cx * (R0 + h);
			p[(i * 2 + 1) * 3 + 1] = cy * (R0 + h);
			p[(i * 2 + 1) * 3 + 2] = 0;
		}
		this.geo.attributes.position.needsUpdate = true;
		this.group.rotation.z = t * 0.05;
		this.innerMat.opacity = 0.2 + this.params.energy * 0.25;

		if (this.anchorEl?.isConnected) {
			const target = this.anchorTarget();
			const chase = this.mode === "thinking" ? 0.1 : 0.14;
			this.group.position.lerp(target.pos, chase);
			const s = this.group.scale.x + (target.scale - this.group.scale.x) * chase;
			this.group.scale.setScalar(s);
		}

		this.renderer.render(this.scene, this.camera);
	}
}
