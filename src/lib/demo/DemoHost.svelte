<!--
  DemoHost -- lazily loads a WASM package in the browser and hands the module
  to your UI, with shared loading and error states.

  That is the entire job now. Compare with what this file used to contain:
  a manifest lookup, a contract-version check, browser feature detection,
  hand-built preload hints, and a create/destroy lifecycle. All of that existed
  because demos were delivered as bespoke release artifacts. Consuming them as
  ordinary npm packages deletes it:

    version pinning      -> package.json + lockfile (with integrity hashes)
    artifact integrity   -> lockfile integrity hashes
    preload hints        -> Vite emits modulepreload for dynamic-import chunks
    content hashing      -> Vite
    contract versioning  -> semver
    metadata fetch       -> nothing to fetch; it's a dependency

  What's left is the part npm genuinely doesn't do: keep a 67 KB WASM module out
  of the initial bundle, and out of the server during prerendering.

  Usage:

    <DemoHost load={() => import('@jakeknowlton/expr')}>
      {#snippet children(expr)}
        <ExprDemo {expr} />
      {/snippet}
    </DemoHost>
-->
<script lang="ts" generics="TMod">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	let {
		load,
		children
	}: {
		/**
		 * A dynamic import of the package. Must be a thunk, not a promise:
		 * calling `import()` eagerly at module scope would run during
		 * prerendering, where there is no browser and the WASM module's
		 * top-level start call has nothing to attach to.
		 *
		 * Keeping it a dynamic import is also what makes Vite code-split the
		 * package into its own chunk instead of the main bundle.
		 */
		load: () => Promise<TMod>;
		/** Your UI. Receives the loaded module once it is ready. */
		children: Snippet<[TMod]>;
	} = $props();

	let mod = $state<TMod | null>(null);
	let error = $state('');

	// onMount only runs in the browser, which is exactly the guard needed: the
	// WASM package must never be imported during prerendering.
	onMount(async () => {
		try {
			mod = await load();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			console.error('demo failed to load', err);
		}
	});

	// Note there is no teardown here. DemoHost does not know the module's shape,
	// so it cannot know what needs releasing. A library that allocates -- an
	// emulator holding a framebuffer, a renderer holding a WebGL context --
	// exposes its own dispose method, and the component that uses it calls that
	// in its own onDestroy.
</script>

{#if mod}
	{@render children(mod)}
{:else}
	<p class="status" class:error>
		{#if error}
			<strong>Failed to load.</strong>
			{error}
		{:else}
			Loading demo…
		{/if}
	</p>
{/if}

<style>
	.status {
		margin: 0;
		padding: 1rem;
		border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
		border-radius: 10px;
		font-size: 0.9rem;
		opacity: 0.8;

		/* Reserve roughly the height the demo will occupy, so swapping it in
		   doesn't shove the page down. The UI can't be prerendered -- it needs the
		   module -- so some placeholder is unavoidable. */
		min-height: 12rem;
		box-sizing: border-box;
	}

	.error {
		color: #c0392b;
		opacity: 1;
	}
</style>
