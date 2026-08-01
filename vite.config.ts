import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// NOTE: in this version of SvelteKit there is no svelte.config.js -- the kit
// configuration lives here, passed straight to the sveltekit() plugin.

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-static turns the whole site into plain files.
			//
			// `fallback` is deliberately left UNSET. Setting it would emit a single
			// index.html SPA shell instead of real HTML per route, which defeats
			// prerendering. With it unset, every route becomes its own .html file
			// containing real content on first paint.
			adapter: adapter(),

			paths: {
				// This test site is served from
				//   https://jakeknowlton.github.io/demo-contract-site/
				// which is a GitHub Pages *project* site, so everything lives under a
				// subdirectory. Every internal link and asset URL must include this
				// prefix, which is why the code imports `base` from '$app/paths'
				// rather than hardcoding '/'.
				//
				// On the real site this stays '' because a custom domain (jkn.dev)
				// serves at the root -- that is the whole reason the domain was
				// treated as load-bearing rather than cosmetic.
				base: '/demo-contract-site',

				// IMPORTANT, and subtle. This defaults to `true`, which makes
				// SvelteKit emit relative URLs ('./demo', './_app/...') and makes
				// `base` a relative string like '.' or '..'. That is great for
				// portability of links, but it breaks demo loading:
				//
				//   fetch('./demos/...')  resolves against the DOCUMENT url
				//   import('./demos/...') resolves against the IMPORTING MODULE's url
				//
				// Our loader lives in a bundled chunk under _app/immutable/chunks/,
				// so a relative specifier would resolve to
				// _app/immutable/chunks/demos/... and 404.
				//
				// Setting this false makes `base` the absolute '/demo-contract-site',
				// so fetch() and import() agree. On the real site with base '' it
				// makes no difference -- but leave it explicit so nobody
				// reintroduces the bug when adding a base path.
				relative: false
			}
		})
	]
});
