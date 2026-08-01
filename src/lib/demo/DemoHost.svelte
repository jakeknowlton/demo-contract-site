<!--
  DemoHost -- loads a demo artifact and hands its API to your UI.

  It renders NO demo UI of its own. Its whole job is the boring,
  identical-for-every-demo part:

    build time:  emit preload hints into the prerendered HTML
    run time:    check contract version
                 check browser features
                 import api.js and call create()
                 render your snippet with the API
                 call destroy() on unmount, once, without throwing

  Presentation lives in a per-project component under
  src/lib/content/projects/<slug>/Demo.svelte. That is what makes demos
  themeable, responsive, and restyleable from one place -- and it means Svelte
  owns the DOM, so leaked listeners and stray timers stop being a per-demo
  hazard entirely.

  Usage:

    <DemoHost slug="expr" version="v0.3.0">
      {#snippet children(api)}
        <ExprDemo {api} />
      {/snippet}
    </DemoHost>
-->
<script lang="ts" generics="TApi extends DemoApi">
	import type { Snippet } from 'svelte';
	import { onDestroy, onMount } from 'svelte';
	import { CONTRACT_VERSION, detectMissingFeatures, type DemoApi } from './contract';
	import { DEMO_META } from './generated-manifest';
	import { artifactUrl, loadDemo } from './loader';

	let {
		slug,
		version,
		options = {},
		children
	}: {
		slug: string;
		version: string;
		/** Passed straight through to the artifact's create(). */
		options?: Record<string, unknown>;
		/** Your UI. Receives the loaded API once it is ready. */
		children: Snippet<[TApi]>;
	} = $props();

	type Phase = 'loading' | 'ready' | 'missing' | 'unsupported' | 'error';

	// Metadata is known at BUILD time, so this is a synchronous lookup rather
	// than a fetch. Two things fall out of that:
	//   - one fewer network round trip before the demo can start loading
	//   - the entry/preload filenames are known during prerender, so the hints
	//     below can be baked into the static HTML
	const meta = $derived(DEMO_META[`${slug}@${version}`]);

	// Preload hints, computed during prerender. Without them the browser can
	// only discover each file after the previous one has downloaded:
	// api.js -> expr.js -> expr_bg.wasm. With them, all three start during
	// initial HTML parse, in parallel with the site's own JS -- before the
	// framework has even booted.
	const hints = $derived.by(() => {
		if (!meta) return { modules: [] as string[], buffers: [] as string[] };

		const modules = [artifactUrl(slug, version, meta.entry)];
		const buffers: string[] = [];

		for (const file of meta.preload ?? []) {
			const url = artifactUrl(slug, version, file);
			// .js is an ES module the browser will import; anything else (.wasm,
			// data files) is fetched, so it needs `as="fetch"` instead.
			if (file.endsWith('.js')) modules.push(url);
			else buffers.push(url);
		}

		return { modules, buffers };
	});

	let phase = $state<Phase>('loading');
	let detail = $state('');
	let api = $state<TApi | null>(null);

	// Set by onDestroy. Needed because create() is async: a fast navigation can
	// unmount this component while the promise is still in flight, and the
	// promise will still resolve afterwards.
	let disposed = false;

	onMount(async () => {
		try {
			// --- build-time metadata ---------------------------------------------
			// No entry means the artifact was not fetched -- the ordinary "cloned
			// the repo and ran npm run dev offline" case. Not an error, and it must
			// not look like one.
			if (!meta) {
				phase = 'missing';
				return;
			}

			// --- contract version -------------------------------------------------
			// fetch-demos.ts already rejects artifacts that are too new, so this is
			// a second line of defence. Cheap, and it keeps DemoHost correct even if
			// someone hand-drops files into static/demos/.
			if (meta.contractVersion > CONTRACT_VERSION) {
				phase = 'error';
				detail = `artifact requires contract v${meta.contractVersion}, this site speaks v${CONTRACT_VERSION}`;
				return;
			}

			// --- browser capabilities ---------------------------------------------
			// Must stay in onMount: it touches navigator/document, which do not
			// exist during prerendering.
			const missing = detectMissingFeatures(meta.features);
			if (missing.length > 0) {
				phase = 'unsupported';
				detail = missing.join(', ');
				return;
			}

			// --- instantiate --------------------------------------------------------
			const mod = await loadDemo<TApi>(slug, version, meta.entry);
			const instance = await mod.create(options);

			// The race guard. Without this, a demo that finished loading after the
			// user navigated away keeps whatever it allocated forever -- an
			// invisible emulator burning CPU for the rest of the session.
			if (disposed) {
				try {
					instance.destroy();
				} catch {
					// Nothing useful to do; the component is already gone.
				}
				return;
			}

			api = instance;
			phase = 'ready';
		} catch (err) {
			phase = 'error';
			detail = err instanceof Error ? err.message : String(err);
			console.error(`demo "${slug}" failed to load`, err);
		}
	});

	onDestroy(() => {
		disposed = true;

		// Wrapped because a throwing teardown would propagate out of onDestroy and
		// break the navigation that triggered it -- turning a demo bug into a
		// broken site.
		try {
			api?.destroy();
		} catch (err) {
			console.error(`demo "${slug}" destroy() threw`, err);
		}
		api = null;
	});
</script>

<svelte:head>
	{#each hints.modules as href (href)}
		<link rel="modulepreload" {href} />
	{/each}
	{#each hints.buffers as href (href)}
		<!--
			`as="fetch"` because wasm-bindgen retrieves the binary with fetch(),
			not via <script>. `crossorigin` is required even same-origin: fetch()
			uses cors mode by default, and a preload whose credentials mode does
			not match the eventual request is ignored and downloaded twice.
		-->
		<link rel="preload" {href} as="fetch" type="application/wasm" crossorigin="anonymous" />
	{/each}
</svelte:head>

{#if phase === 'ready' && api}
	{@render children(api)}
{:else}
	<p class="status" data-state={phase}>
		{#if phase === 'loading'}
			Loading demo…
		{:else if phase === 'missing'}
			<strong>Artifact not present.</strong> Run <code>npm run fetch-demos</code> to
			download <code>{slug}@{version}</code>. The site is working correctly — this is the
			expected offline state.
		{:else if phase === 'unsupported'}
			<strong>Unsupported browser.</strong> This demo needs: {detail}
		{:else}
			<strong>Failed to load.</strong> {detail}
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
		line-height: 1.5;
		opacity: 0.8;

		/* Reserve roughly the height the demo will occupy, so swapping the status
		   for the real UI doesn't shove the rest of the page down. The demo UI is
		   never prerendered -- it can't be, it needs the API -- so some placeholder
		   is unavoidable; an approximate one beats a visible jump. Not exact, and
		   it doesn't need to be. */
		min-height: 12rem;
		box-sizing: border-box;
	}

	.status[data-state='error'] {
		color: #c0392b;
		opacity: 1;
	}

	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85em;
		padding: 0.1em 0.35em;
		border-radius: 4px;
		background: color-mix(in srgb, currentColor 12%, transparent);
	}
</style>
