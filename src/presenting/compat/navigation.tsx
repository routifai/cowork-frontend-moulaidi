/**
 * next/navigation compat shim for the presenting sub-tree.
 *
 * Presenton components used `useRouter` (push/back navigation) and
 * `useSearchParams` (reading URL params like `?mode=present&slide=2`).
 *
 * In the Embedded Panel there is no URL router. This shim replaces both
 * hooks with panel-state equivalents that must be provided via
 * `NavigationProvider` before any component that calls them renders.
 *
 * Replacement contract:
 *   - `useRouter()` → `{ push: (panelView, params?) => void, back: () => void }`
 *     Use `useNavigationRouter()` to consume.
 *   - `useSearchParams()` → map-like object over a plain `Record<string,string>`
 *     that is set explicitly via `NavigationProvider`.
 *   - `usePathname()` → current panel view name string.
 */

import React, { createContext, useContext } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PanelRouter {
	push(view: string, params?: Record<string, string>): void;
	replace(view: string, params?: Record<string, string>): void;
	back(): void;
}

export type PanelSearchParams = Record<string, string>;

interface NavigationContextValue {
	router: PanelRouter;
	searchParams: PanelSearchParams;
	pathname: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const NOOP_ROUTER: PanelRouter = {
	push: () => {},
	replace: () => {},
	back: () => {},
};

const NavigationContext = createContext<NavigationContextValue>({
	router: NOOP_ROUTER,
	searchParams: {},
	pathname: "",
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface NavigationProviderProps {
	router?: PanelRouter;
	searchParams?: PanelSearchParams;
	pathname?: string;
	children: React.ReactNode;
}

export function NavigationProvider({
	router = NOOP_ROUTER,
	searchParams = {},
	pathname = "",
	children,
}: NavigationProviderProps) {
	return <NavigationContext.Provider value={{ router, searchParams, pathname }}>{children}</NavigationContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hooks — drop-in replacements
// ---------------------------------------------------------------------------

/** Drop-in for `next/navigation` `useRouter()`. */
export function useRouter(): PanelRouter {
	return useContext(NavigationContext).router;
}

/** Drop-in for `next/navigation` `useSearchParams()`. Returns an object with
 * `.get(key)` to mirror the URLSearchParams API. */
export function useSearchParams(): { get: (key: string) => string | null } {
	const { searchParams } = useContext(NavigationContext);
	return {
		get: (key: string) => searchParams[key] ?? null,
	};
}

/** Drop-in for `next/navigation` `usePathname()`. */
export function usePathname(): string {
	return useContext(NavigationContext).pathname;
}
