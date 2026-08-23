/**
 * Global type augmentation for Presenton-ported code that references
 * `window.electron` — a Desktop Electron API that Presenton injected as a
 * preload script. In Hypatia the Tauri presenting engine handles these
 * operations; the ported code checks `window.electron?.method` before calling
 * it, so these paths are dead at runtime. This declaration just makes the
 * TypeScript compiler accept the references.
 */
interface ElectronBridge {
	readFile?: (path: string) => Promise<string>;
	exportPresentation?: (args: unknown) => Promise<unknown>;
	[key: string]: unknown;
}

interface Window {
	electron?: ElectronBridge;
}
