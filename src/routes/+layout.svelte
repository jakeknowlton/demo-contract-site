<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	// `base` is the GitHub Pages project-site prefix ('/demo-contract-site').
	// Every internal link must go through it. A bare href="/demo" works in dev
	// and 404s in production.
	import { base } from '$app/paths';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="shell">
	<nav>
		<a href="{base}/">contract test</a>
		<a href="{base}/demo">demo</a>
	</nav>

	<main>
		{@render children()}
	</main>

	<footer>
		Reference implementation ·
		<a href="https://github.com/jakeknowlton/demo-contract-site">site repo</a> ·
		<a href="https://github.com/jakeknowlton/demo-contract-wasm">wasm repo</a>
	</footer>
</div>

<style>
	/* Hand-written CSS, no framework. Custom properties make the light/dark
	   split a two-line change rather than a refactor. */
	:global(:root) {
		--fg: #16181d;
		--bg: #fbfbfa;
		--accent: #2b5fd9;
		color-scheme: light dark;
	}

	@media (prefers-color-scheme: dark) {
		:global(:root) {
			--fg: #e6e6e3;
			--bg: #13151a;
			--accent: #8ab4ff;
		}
	}

	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--fg);
		font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
		line-height: 1.6;
	}

	:global(a) {
		color: var(--accent);
	}

	:global(h1, h2) {
		line-height: 1.25;
	}

	:global(code) {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.9em;
	}

	.shell {
		max-width: 46rem;
		margin: 0 auto;
		padding: 2rem 1.25rem 4rem;
	}

	nav {
		display: flex;
		gap: 1.25rem;
		font-size: 0.9rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent);
	}

	footer {
		margin-top: 3rem;
		padding-top: 1.25rem;
		border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent);
		font-size: 0.85rem;
		opacity: 0.7;
	}
</style>
