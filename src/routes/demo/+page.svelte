<script lang="ts">
	import DemoHost from '$lib/demo/DemoHost.svelte';
	import ExprDemo from '$lib/content/projects/expr/Demo.svelte';
</script>

<svelte:head>
	<title>expr — demo contract test</title>
</svelte:head>

<h1>expr</h1>

<p>
	An arithmetic expression compiler written in Rust and compiled to WebAssembly, published
	to npm as
	<code>@jakeknowlton/expr</code> by
	<a href="https://github.com/jakeknowlton/demo-contract-wasm">demo-contract-wasm</a>. This
	site consumes it as an ordinary dependency; every pixel below is the site's.
</p>

<!--
	The whole integration, and it is deliberately unremarkable: a dynamic import
	of an npm package, and a component that uses it.

	The thunk matters. `import('@jakeknowlton/expr')` evaluated eagerly at module
	scope would run during prerendering, where there is no browser. Passing it as
	a function defers it to onMount, and also lets Vite code-split the package
	into its own chunk so the 67 KB WASM stays out of the initial bundle.

	Measured cost of doing it this way: the WASM request starts at ~52ms instead
	of the ~30ms the old hand-built preload hints achieved, because a lazy chunk
	cannot begin until the route's JS has booted, whereas a <link rel=preload> in
	the prerendered HTML starts during parse. Hoisting the import to module scope
	behind a `browser` guard recovers only ~5ms, which isn't worth the awkwardness.
	SvelteKit doesn't expose Vite's hashed chunk URLs to components, so there is no
	clean way to preload a lazy dependency from the HTML.
-->
<DemoHost load={() => import('@jakeknowlton/expr')}>
	{#snippet children(expr)}
		<ExprDemo {expr} />
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
