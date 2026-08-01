// The demo contract -- the agreement between this site and every project repo
// that ships a demo.
//
// This file is the spec. When you implement a demo in another repo, you are
// implementing these types. Keep it small: everything added here has to be
// satisfied by every language you ever want to demo from.

/** Bump when the shape below changes incompatibly. */
export const CONTRACT_VERSION = 1;

/** Returned by mount(). The site calls destroy() on navigation away. */
export interface DemoHandle {
	destroy(): void;
}

/** The module shape of a demo's entry file (conventionally demo.js). */
export interface DemoModule {
	/**
	 * Mount the demo into `element`, which the demo may treat as empty and its
	 * own. Allowed to be async, because WASM instantiation is async -- forcing it
	 * to be synchronous would push an awkward two-phase init onto every demo.
	 */
	mount(
		element: HTMLElement,
		options?: Record<string, unknown>
	): DemoHandle | Promise<DemoHandle>;
}

/**
 * meta.json, shipped inside the artifact and read BEFORE demo.js is imported.
 * Reading it first is what lets the site refuse politely instead of mounting
 * something it may mis-drive.
 */
export interface DemoMeta {
	contractVersion: number;
	name: string;
	/** Which file to import. Conventionally "demo.js". */
	entry: string;
	buildTag: string;
	sourceCommit: string;
	/** Browser capabilities the demo requires, e.g. ["webgl2"], ["webgpu"]. */
	features?: string[];
	/**
	 * Extra files the site should start fetching early, relative to the
	 * artifact directory -- typically the wasm-bindgen glue and the .wasm.
	 *
	 * The site cannot guess these: they are an implementation detail of whatever
	 * toolchain built the artifact. Without them you get a four-deep request
	 * waterfall, because each file is only discovered once the previous one has
	 * downloaded.
	 *
	 * Added AFTER contractVersion 1 shipped, without a version bump, because it
	 * is optional in both directions: a site that ignores it still works, and an
	 * artifact that omits it still works. Only incompatible changes need a bump.
	 */
	preload?: string[];
}

/**
 * Feature detection for the `features` field.
 *
 * Without this, a WebGPU demo on an unsupported browser renders a blank canvas
 * and looks broken. With it, the site can say which capability is missing.
 */
export function detectMissingFeatures(features: string[] = []): string[] {
	const checks: Record<string, () => boolean> = {
		webgl2: () => {
			try {
				return !!document.createElement('canvas').getContext('webgl2');
			} catch {
				return false;
			}
		},
		webgpu: () => 'gpu' in navigator,
		'shared-array-buffer': () => typeof SharedArrayBuffer !== 'undefined'
	};

	return features.filter((f) => {
		const check = checks[f];
		// An unknown feature name is treated as missing rather than silently
		// passing -- a typo in meta.json should be loud, not invisible.
		return check ? !check() : true;
	});
}
