<script lang="ts">
	import DemoHost from '$lib/demo/DemoHost.svelte';
	import ExprDemo from '$lib/content/projects/expr/Demo.svelte';
	import type { ExprApi } from '$lib/content/projects/expr/api';
</script>

<svelte:head>
	<title>expr — demo contract test</title>
</svelte:head>

<h1>expr</h1>

<p>
	An arithmetic expression compiler written in Rust and compiled to WebAssembly. Lexer →
	parser → evaluator. Built and released by
	<a href="https://github.com/jakeknowlton/demo-contract-wasm">demo-contract-wasm</a>, which
	ships <em>only</em> a <code>create()</code> function — no markup, no styling. Everything
	you can see below is this site's.
</p>

<!--
	The whole integration. DemoHost does the identical-for-every-demo work
	(preload hints, version check, feature detection, create/destroy) and hands
	the API to the UI component, which lives with the project's other content.

	`slug` and `version` must match an entry in demos.manifest.json -- the
	version appears in both places, which is a real drift risk worth a
	build-time assertion on the production site.
-->
<DemoHost slug="expr" version="v0.3.0">
	{#snippet children(api)}
		<!--
			The one place the site asserts an artifact's shape. The module is
			imported from a runtime URL, so there is nothing for TypeScript to
			resolve; ExprApi in ./api.ts is the hand-written declaration, and this
			cast is where it gets applied. Exactly the assertion a frontend makes
			about a backend's response type.
		-->
		<ExprDemo api={api as ExprApi} />
	{/snippet}
</DemoHost>

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
