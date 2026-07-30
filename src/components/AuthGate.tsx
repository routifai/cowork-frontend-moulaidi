import type { OrbPresence } from "@/lib/presence/OrbPresence";
import gsap from "gsap";
/**
 * AuthGate — V3 dummy auth screen + "Starting up" metamorphosis (Phase 4/5).
 *
 * Visuals are a faithful port of new-design/reference/v3-concept.html and
 * transition-v3.html: fixed light editorial palette (Playfair Display serif,
 * Inter, JetBrains Mono, ink #0d0d0f on #fbfbfc, RBC blue/gold accents),
 * deliberately independent of the app theme — dark mode never touches it.
 *
 * The login is a dummy: any click on "Open Workspace" runs the transition —
 *
 *   1. auth panel slides out, the orb flies to center stage
 *   2. splash: "Starting up." + status cycle + progress hairline
 *   3. metamorphosis: orb overcharges, white flash, implodes/dissolves
 *   4. overlay fades away revealing the chat, whose Pulse presence is
 *      already resting in the composer
 *
 * Shown once per browser session (sessionStorage), skipped entirely in
 * tests; when WebGL is unavailable the orb is simply absent — the timeline
 * still runs on the DOM.
 */
import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "hypatia-auth-gate-done";

const STATUSES = [
	"Authenticating credentials…",
	"Restoring sessions…",
	"Warming local engine…",
	"Synchronizing context…",
];

export function shouldShowAuthGate(): boolean {
	if (import.meta.env.MODE === "test") return false;
	try {
		return sessionStorage.getItem(SESSION_KEY) !== "1";
	} catch {
		return true;
	}
}

interface AuthGateProps {
	onDone: () => void;
}

export function AuthGate({ onDone }: AuthGateProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const authRef = useRef<HTMLDivElement>(null);
	const splashRef = useRef<HTMLDivElement>(null);
	const flashRef = useRef<HTMLDivElement>(null);
	const progressRef = useRef<HTMLDivElement>(null);
	const pctRef = useRef<HTMLDivElement>(null);
	const orbRef = useRef<OrbPresence | null>(null);
	const startedRef = useRef(false);
	const [phase, setPhase] = useState<"auth" | "splash">("auth");
	const [status, setStatus] = useState(STATUSES[0]);
	const [title, setTitle] = useState("Starting up.");

	// Mount the orb (lazy chunk; fail-soft without WebGL).
	useEffect(() => {
		let disposed = false;
		import("@/lib/presence/OrbPresence")
			.then(({ OrbPresence: Orb }) => {
				if (disposed || !rootRef.current) return;
				const orb = new Orb();
				rootRef.current.prepend(orb.canvas);
				orb.placeNDC(0.5, 0.05, 1);
				orb.start();
				orbRef.current = orb;
			})
			.catch((err) => console.warn("[auth-gate] WebGL unavailable — orb disabled", err));
		return () => {
			disposed = true;
			orbRef.current?.dispose();
			orbRef.current = null;
		};
	}, []);

	const finish = () => {
		try {
			sessionStorage.setItem(SESSION_KEY, "1");
		} catch {
			/* private mode — gate will just show again */
		}
		onDone();
	};

	const begin = () => {
		if (startedRef.current) return;
		startedRef.current = true;

		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const orb = orbRef.current;

		if (reduced) {
			// Reduced motion: brief splash, no charge/flash, quick crossfade.
			setPhase("splash");
			setStatus("Ready.");
			gsap.to(rootRef.current, { opacity: 0, duration: 0.4, delay: 0.8, onComplete: finish });
			return;
		}

		const tl = gsap.timeline();

		// ── Act 1: auth exits, orb travels to center stage ──
		tl.add(() => orb?.glitch(0.8), 0.15);
		tl.to(
			authRef.current,
			{ xPercent: -100, opacity: 0, duration: 0.9, ease: "power3.inOut" },
			0.3,
		);
		tl.add(() => {
			if (orb) {
				const w = orb.ndcToWorld(0, 0.28);
				gsap.to(orb.group.position, {
					x: w.x,
					y: w.y,
					z: w.z,
					duration: 1.4,
					ease: "power3.inOut",
				});
				gsap.to(orb.group.scale, {
					x: 0.62,
					y: 0.62,
					z: 0.62,
					duration: 1.4,
					ease: "power3.inOut",
				});
			}
		}, 0.35);
		tl.add(() => {
			setPhase("splash");
			orb?.setMode("thinking");
		}, 1.1);

		// Splash entrance + progress
		tl.add(() => {
			if (splashRef.current) {
				gsap.fromTo(splashRef.current, { opacity: 0 }, { opacity: 1, duration: 0.6 });
			}
			const pct = { v: 0 };
			gsap.to(pct, {
				v: 100,
				duration: 4.2,
				ease: "power1.inOut",
				onUpdate: () => {
					if (progressRef.current) progressRef.current.style.width = `${pct.v}%`;
					if (pctRef.current)
						pctRef.current.textContent = String(Math.round(pct.v)).padStart(2, "0");
				},
			});
		}, 1.15);

		// ── Act 2: status cycle ──
		STATUSES.slice(1).forEach((s, i) => {
			tl.add(() => setStatus(s), 1.6 + (i + 1) * 0.9);
		});

		// ── Act 3: metamorphosis ──
		tl.add(() => {
			if (!orb) return;
			gsap.to(orb.uniforms.uAmp, { value: 0.55, duration: 0.5, ease: "power2.in" });
			gsap.to(orb.uniforms.uFreq, { value: 1.6, duration: 0.5, ease: "power2.in" });
			gsap.to(orb.group.scale, { x: 0.5, y: 0.5, z: 0.5, duration: 0.5, ease: "power2.in" });
		}, 4.2);

		tl.add(() => {
			orb?.glitch(1);
			if (flashRef.current) {
				gsap.fromTo(
					flashRef.current,
					{ opacity: 0, scale: 0.6 },
					{
						opacity: 1,
						scale: 1.15,
						duration: 0.18,
						ease: "power2.out",
						onComplete: () => {
							gsap.to(flashRef.current, {
								opacity: 0,
								scale: 1.5,
								duration: 0.6,
								ease: "power2.out",
							});
						},
					},
				);
			}
			if (orb) {
				gsap.to(orb.group.scale, { x: 0.3, y: 0.3, z: 0.3, duration: 0.4, ease: "power3.in" });
				gsap.to(orb.uniforms.uFade, { value: 0, duration: 0.4, ease: "power2.in" });
			}
		}, 4.7);

		tl.add(() => {
			setTitle("Welcome back.");
			setStatus("Ready.");
		}, 5.3);

		// ── Act 4: reveal the app ──
		tl.add(() => {
			gsap.to(rootRef.current, {
				opacity: 0,
				duration: 0.7,
				ease: "power2.inOut",
				onComplete: finish,
			});
		}, 6.1);
	};

	return (
		<div
			ref={rootRef}
			data-testid="auth-gate"
			className="v3-gate fixed inset-0 z-50 overflow-hidden"
		>
			{/* Soft blue glow behind the orb; slides to center for the splash */}
			<div
				className="v3-glow"
				style={{ left: phase === "auth" ? "75%" : "50%", top: phase === "auth" ? "47%" : "36%" }}
				aria-hidden="true"
			/>

			{/* Flash for the metamorphosis moment */}
			<div
				ref={flashRef}
				className="pointer-events-none absolute left-1/2 top-[36%] z-30 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
				style={{
					background:
						"radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(190,215,255,0.55) 35%, rgba(26,102,255,0.18) 60%, rgba(255,255,255,0) 75%)",
				}}
				aria-hidden="true"
			/>

			{/* ── Auth layout (reference: v3-concept.html) ── */}
			{phase === "auth" && (
				<>
					<div
						ref={authRef}
						className="relative z-10 flex h-full w-1/2 flex-col justify-center px-16 lg:px-24"
					>
						<div className="absolute left-10 top-10 flex items-center gap-3">
							<div className="h-6 w-6 rounded-full" style={{ background: "#0d0d0f" }} />
							<span className="text-lg font-semibold tracking-tight">Hypatia</span>
						</div>

						<div className="mb-10 flex items-center gap-3">
							<span
								className="h-1.5 w-1.5 animate-pulse rounded-full"
								style={{ background: "#e8a821" }}
							/>
							<span
								className="v3-mono text-[11px] uppercase tracking-[0.3em]"
								style={{ color: "#a3a3a8" }}
							>
								Always-on agent workspace
							</span>
						</div>

						<div className="mb-10">
							<h1 className="v3-serif text-6xl leading-[1.12]">Your work done.</h1>
							<h1 className="v3-serif text-6xl italic leading-[1.12]" style={{ color: "#a3a3a8" }}>
								With Hypatia.
							</h1>
						</div>

						<p
							className="mb-12 max-w-md text-lg font-light leading-relaxed"
							style={{ color: "#6b7280" }}
						>
							An always-on intelligence layer across your email, models and project files —
							returning review-ready analysis in one calm workspace.
						</p>

						<div className="max-w-[320px] space-y-4">
							<input
								type="text"
								placeholder="Enterprise ID"
								className="w-full rounded-xl border bg-white px-5 py-4 text-sm outline-none transition-colors"
								style={{ borderColor: "#e7e7e9", color: "#0d0d0f" }}
								onFocus={(e) => {
									e.currentTarget.style.borderColor = "#0d0d0f";
								}}
								onBlur={(e) => {
									e.currentTarget.style.borderColor = "#e7e7e9";
								}}
							/>
							<input
								type="password"
								placeholder="Password"
								className="w-full rounded-xl border bg-white px-5 py-4 text-sm outline-none transition-colors"
								style={{ borderColor: "#e7e7e9", color: "#0d0d0f" }}
								onFocus={(e) => {
									e.currentTarget.style.borderColor = "#0d0d0f";
								}}
								onBlur={(e) => {
									e.currentTarget.style.borderColor = "#e7e7e9";
								}}
							/>
							<button
								type="button"
								onClick={begin}
								data-testid="auth-gate-open"
								className="mt-2 flex w-full items-center justify-between rounded-xl px-5 py-4 font-medium text-white transition-colors"
								style={{ background: "#0d0d0f" }}
								onMouseEnter={(e) => {
									e.currentTarget.style.background = "#26262b";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background = "#0d0d0f";
								}}
							>
								<span>Open Workspace</span>
								<span aria-hidden="true">→</span>
							</button>
						</div>
					</div>

					<div
						className="v3-vertical-label v3-mono absolute right-10 top-1/2 z-10 -translate-y-1/2 text-[11px] uppercase"
						style={{ color: "#d4d4d8" }}
						aria-hidden="true"
					>
						Always on
					</div>
				</>
			)}

			{/* ── Splash layout (reference: transition-v3.html) ── */}
			{phase === "splash" && (
				<div
					ref={splashRef}
					className="relative z-10 flex h-full flex-col items-center justify-center"
				>
					{/* The orb floats in the reserved space above the title */}
					<div className="h-[46vh]" aria-hidden="true" />
					<h2 className="v3-serif mb-6 text-5xl" style={{ color: "#0d0d0f" }}>
						{title}
					</h2>
					<div className="v3-shimmer mb-8 h-5 text-sm font-light">{status}</div>
					<div
						className="mb-4 h-px w-[220px] overflow-hidden rounded-full"
						style={{ background: "rgba(13,13,15,0.08)" }}
					>
						<div
							ref={progressRef}
							className="h-full w-0"
							style={{ background: "linear-gradient(to right, #e8a821, #0051a5)" }}
						/>
					</div>
					<div
						ref={pctRef}
						className="v3-mono text-[10px] tracking-[0.25em]"
						style={{ color: "#a3a3a8" }}
					>
						00
					</div>
				</div>
			)}

			{/* Film grain on top of everything in the gate */}
			<div className="v3-grain z-40" aria-hidden="true" />
		</div>
	);
}
