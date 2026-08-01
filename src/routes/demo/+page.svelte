<script lang="ts">
	import DemoHost from '$lib/demo/DemoHost.svelte';
</script>

<svelte:head>
	<title>expr — demo contract test</title>
</svelte:head>

<h1>expr</h1>

<p>
	An arithmetic expression compiler written in Rust and compiled to WebAssembly. Lexer →
	parser → evaluator. Built and released by
	<a href="https://github.com/jakeknowlton/demo-contract-wasm">demo-contract-wasm</a>; this
	page only knows how to <code>mount()</code> it.
</p>

<!--
	The whole integration. `slug` and `version` must match an entry in
	demos.manifest.json -- the version appears in both places, which is a real
	drift risk worth a build-time assertion on the production site.

	`options` is passed straight through to the demo's mount(), which is how
	per-page configuration reaches a demo without the demo knowing anything
	about this site.
-->
<DemoHost slug="expr" version="v0.1.0" options={{ initial: '1 + 2 * (3 - 1)' }} />

<p class="note">
	Try <code>2 * (1 +</code> or <code>1 / 0</code> to see an error path, then run a valid
	expression again. It still works — because the Rust side returns errors as values instead
	of panicking. A panic in WASM aborts and poisons the module instance, so every later call
	would fail until you reloaded the page.
</p>

<style>
	.note {
		margin-top: 1.25rem;
		font-size: 0.9rem;
		opacity: 0.75;
	}
</style>
