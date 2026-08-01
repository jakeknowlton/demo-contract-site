<script lang="ts">
	import { base } from '$app/paths';
</script>

<svelte:head>
	<title>demo contract test</title>
	<meta
		name="description"
		content="A SvelteKit site on GitHub Pages running a Rust/WASM demo consumed as an ordinary npm package."
	/>
</svelte:head>

<h1>Packaging a WASM project conventionally</h1>

<p>
	Two repos. One publishes a Rust compiler to npm and GitHub Releases the way any library is
	published. This site — SvelteKit, prerendered to static files, served from GitHub Pages —
	is just a downstream consumer.
</p>

<h2>The data flow</h2>

<pre class="flow">demo-contract-wasm                    demo-contract-site
──────────────────                    ──────────────────
git tag v0.4.0
   │
   ├─ wasm-pack --target bundler
   │     expr.js + expr_bg.wasm + expr.d.ts
   │     package.json generated from Cargo.toml
   │
   ├─ npm publish --provenance ─────▶ npm install @jakeknowlton/expr
   │                                        │
   ├─ cargo build (3 targets)               ▼
   │     └─▶ GitHub Release           import('@jakeknowlton/expr')
   │         + SHA256SUMS                   │
   │                                        ▼
   └─ (crates.io: same crate)         Demo.svelte
                                      all markup + styling,
                                      typed from the package's .d.ts</pre>

<h2>What it demonstrates</h2>

<ul>
	<li>
		<strong>No bespoke contract.</strong> An earlier version invented one — a manifest
		pinning git tags, a fetch script, a <code>contractVersion</code>, a hand-written
		interface declaration. All of it reimplemented things npm already does. Deleting it
		removed 439 lines here.
	</li>
	<li>
		<strong>Integrity comes free, and matters.</strong> Git tags are <em>mutable</em>, so
		pinning by tag was never as reproducible as it looked. A lockfile records an integrity
		hash per dependency.
	</li>
	<li>
		<strong>Types come free.</strong> wasm-bindgen generates a <code>.d.ts</code> from the
		Rust doc comments, so <code>compile</code> is typed and documented on hover — and a
		signature change becomes a build error here.
	</li>
	<li>
		<strong>The library is the product.</strong> <code>wasm-bindgen</code> is target-gated
		in the crate, so a Rust consumer pulls in no JS glue, and the CLI, the tests, and the
		browser build all share one implementation.
	</li>
	<li>
		<strong>The site owns every pixel.</strong> The package exports a function and builds
		no DOM, so demos inherit the theme, dark mode works, and restyling is one place.
	</li>
	<li>
		<strong>It costs about 20 ms.</strong> A lazily-imported chunk starts later than a
		preload hint in prerendered HTML. Measured, documented in the README, and worth it.
	</li>
</ul>

<p><a href="{base}/demo">See the demo →</a></p>

<style>
	.flow {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.75rem;
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
