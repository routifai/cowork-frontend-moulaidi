import "@testing-library/jest-dom";

// jsdom doesn't implement scrollIntoView — provide a no-op
Element.prototype.scrollIntoView = () => {};

// jsdom doesn't implement ResizeObserver — ScaledSlideStage (presenting slide
// preview scaling) reads it via a real hook, not just a type.
if (typeof window.ResizeObserver !== "function") {
	class ResizeObserverStub {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom doesn't implement matchMedia — several components read the app's
// dark/light theme mode (lib/themes.ts's getThemeMode) via this.
if (typeof window.matchMedia !== "function") {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: (query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		}),
	});
}
