<script lang="ts">
	import { base } from '$app/paths';
</script>

<svelte:head>
	<title>demo contract test</title>
	<meta
		name="description"
		content="Two-repo reference implementation of a WASM demo contract, deployed to GitHub Pages."
	/>
</svelte:head>

<h1>Demo contract test</h1>

<p>
	A two-repo reference implementation. This site is built with SvelteKit, prerendered to
	static files, and served from GitHub Pages. It loads a WebAssembly demo that is built,
	versioned, and released by an entirely separate repository.
</p>

<h2>The data flow</h2>

<pre class="flow">demo-contract-wasm            demo-contract-site
──────────────────            ──────────────────
Rust source
    │ cargo + wasm-bindgen
    ▼
expr_bg.wasm + expr.js
    │ + hand-written demo.js
    ▼
demo.tar.gz  ──────────────▶  scripts/fetch-demos.ts
  (GitHub Release, tag        reads demos.manifest.json,
   v0.1.0, asset name         downloads the pinned tag into
   is always demo.tar.gz)     static/demos/expr/v0.1.0/
                                          │
                                          ▼
                              DemoHost.svelte
                              reads meta.json, checks the
                              contract version and browser
                              features, then imports demo.js
                              and calls mount(el, options)</pre>

<h2>What it demonstrates</h2>

<ul>
	<li>
		<strong>The site never compiles the demo.</strong> No Rust toolchain in the site's CI.
		It downloads a pinned release artifact, so build times don't grow as projects are added.
	</li>
	<li>
		<strong>The contract is language-agnostic.</strong> It mentions only
		<code>mount(el, opts)</code> and <code>destroy()</code> — not Rust, not wasm-bindgen,
		not even WebAssembly. Zig or C would satisfy it with hand-written glue; a TypeScript
		project would satisfy it with no WASM at all.
	</li>
	<li>
		<strong>Versions are pinned.</strong> The tag is part of the URL path, so builds are
		reproducible and demo assets are immutable and cacheable forever.
	</li>
	<li>
		<strong>Failure is graceful.</strong> If the artifact hasn't been fetched, the demo page
		says so instead of breaking. Try it: delete <code>static/demos/</code> and run
		<code>npm run dev</code>.
	</li>
</ul>

<p><a href="{base}/demo">See the demo →</a></p>

<style>
	.flow {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.78rem;
		line-height: 1.5;
		overflow-x: auto;
		padding: 1rem;
		border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
		border-radius: 8px;
	}

	li {
		margin-bottom: 0.6rem;
	}
</style>
