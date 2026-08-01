// The demo contract -- the agreement between this site and every project repo
// that ships a demo.
//
// This file is the spec. When you implement a demo in another repo, you are
// implementing these types. Keep it small: everything added here has to be
// satisfied by every language you ever want to demo from.
//
// THE ARTIFACT IS A LIBRARY, NOT A PAGE. It exposes methods; it builds no DOM
// and injects no CSS. The relationship is frontend/backend -- this site is the
// frontend, it knows the interface, and it owns every pixel.

/** Bump when the shape below changes incompatibly. */
export const CONTRACT_VERSION = 2;

/**
 * The minimum every demo API must provide.
 *
 * Real APIs extend this with project-specific methods -- `compile(src)` for a
 * compiler, `loadRom(bytes)`/`step()` for an emulator. The site knows those
 * per demo, exactly as a frontend knows its backend's endpoints.
 */
export interface DemoApi {
	/**
	 * Release resources the API holds. Called by DemoHost on unmount.
	 *
	 * Note this is NOT about DOM: the artifact never created any. It is for
	 * WASM-side state -- a WebGL context, a running rAF loop, an audio node, an
	 * allocated framebuffer. Forgetting is the classic "invisible emulator still
	 * burning CPU after you navigated away" bug.
	 */
	destroy(): void;
}

/** The module shape of a demo's entry file (conventionally api.js). */
export interface DemoModule<TApi extends DemoApi = DemoApi> {
	/**
	 * Instantiate the demo and return its API. Async because WASM
	 * instantiation is async.
	 */
	create(options?: Record<string, unknown>): Promise<TApi>;
}

/**
 * meta.json, shipped inside the artifact and baked into the build by
 * scripts/fetch-demos.ts. Never fetched at runtime.
 */
export interface DemoMeta {
	contractVersion: number;
	name: string;
	/** Which file to import. Conventionally "api.js". */
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
	 * toolchain built the artifact. Without them you get a request waterfall,
	 * because each file is only discovered once the previous one has downloaded.
	 *
	 * Added while contractVersion was 1, WITHOUT a bump, because it is optional
	 * in both directions: a site that ignores it still works, and an artifact
	 * that omits it still works.
	 *
	 * Contrast with the v1 -> v2 change, which removed a `mount()` export and
	 * therefore DID require a bump: a v1 site would call a function that no
	 * longer exists.
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
