// Loading a demo artifact at runtime.
//
// Demo artifacts live in static/, which Vite copies verbatim and never
// processes. They are therefore NOT part of the site's bundle -- they are files
// fetched over the network at runtime, exactly like an image.
//
// That laziness is deliberate: someone reading the landing page should not
// download a 67 KB emulator. Keeping demos out of the bundle means the site's
// initial payload does not grow as projects are added.
//
// Note there is no meta.json fetch here. Metadata is baked into
// generated-manifest.ts at build time, which removes a round trip and lets
// DemoHost decide everything synchronously.

import { base } from '$app/paths';
import type { DemoApi, DemoModule } from './contract';

/**
 * Where a demo's files live.
 *
 * The version is part of the path, which gives two things for free:
 *   - two versions can coexist, so a page can pin an older build
 *   - the URL is immutable, so it can be cached forever
 *
 * `base` must be included: on this test site it is '/demo-contract-site'.
 * Hardcoding '/demos/...' works locally and 404s in production -- one of the
 * most common GitHub Pages project-site mistakes.
 */
export function demoBaseUrl(slug: string, version: string): string {
	return `${base}/demos/${slug}/${version}`;
}

/** URL of one file inside an artifact. */
export function artifactUrl(slug: string, version: string, file: string): string {
	return `${demoBaseUrl(slug, version)}/${file}`;
}

/**
 * Dynamically import a demo's entry module.
 *
 * The `@vite-ignore` annotation on the import below is REQUIRED and easy to
 * overlook. Vite statically analyses dynamic imports so it can pre-bundle them;
 * when the specifier is a variable it cannot, and the build fails. The
 * annotation tells Vite to leave this import alone and emit it as a genuine
 * runtime import.
 */
export async function loadDemo<TApi extends DemoApi>(
	slug: string,
	version: string,
	entry: string
): Promise<DemoModule<TApi>> {
	const url = artifactUrl(slug, version, entry);
	return (await import(/* @vite-ignore */ url)) as DemoModule<TApi>;
}
