<!--
  DemoHost -- the only place the site touches a demo artifact.

  Responsibilities, in order:
    1. look up build-time metadata (no network)
    2. emit preload hints into the prerendered HTML
    3. refuse politely if the contract version is too new
    4. refuse politely if the browser lacks a required feature
    5. import demo.js and call mount()
    6. call destroy() on unmount, exactly once, without throwing

  Steps 3 and 4 happen before the import, because once you have imported and
  mounted, it is too late to decline gracefully.
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { CONTRACT_VERSION, detectMissingFeatures, type DemoHandle } from './contract';
	import { DEMO_META } from './generated-manifest';
	import { artifactUrl, loadDemo } from './loader';

	let {
		slug,
		version,
		options = {}
	}: {
		slug: string;
		version: string;
		/** Passed straight through to the demo's mount(). */
		options?: Record<string, unknown>;
	} = $props();

	type Phase = 'loading' | 'ready' | 'missing' | 'unsupported' | 'error';

	// Metadata is known at BUILD time, so this is a synchronous lookup rather
	// than a fetch. Two things fall out of that:
	//   - one fewer network round trip before the demo can start loading
	//   - the entry/preload filenames are known during prerender, so the hints
	//     below can be baked into the static HTML
	const meta = $derived(DEMO_META[`${slug}@${version}`]);

	// Preload hints, computed during prerender. `demo.js` gets modulepreload;
	// whatever the artifact declared in `preload` gets the appropriate hint.
	//
	// Without these, the browser can only discover each file after the previous
	// one has downloaded:  demo.js -> expr.js -> expr_bg.wasm. With them, all
	// three start during initial HTML parse, in parallel with the site's own JS.
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

	let container: HTMLDivElement;
	let phase = $state<Phase>('loading');
	let detail = $state('');

	let handle: DemoHandle | null = null;

	// Set by onDestroy. Needed because mount() is async: a fast navigation can
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

			// --- mount --------------------------------------------------------------
			const mod = await loadDemo(slug, version, meta.entry);
			const mounted = await mod.mount(container, options);

			// The race guard. Without this, a demo that finished mounting after the
			// user navigated away keeps running forever -- an invisible emulator
			// burning CPU for the rest of the session, with no way to reach it.
			if (disposed) {
				try {
					mounted.destroy();
				} catch {
					// Nothing useful to do; the component is already gone.
				}
				return;
			}

			handle = mounted;
			phase = 'ready';
		} catch (err) {
			phase = 'error';
			detail = err instanceof Error ? err.message : String(err);
			console.error(`demo "${slug}" failed to mount`, err);
		}
	});

	onDestroy(() => {
		disposed = true;

		// Wrapped because a throwing teardown would propagate out of onDestroy and
		// break the navigation that triggered it -- turning a demo bug into a
		// broken site.
		try {
			handle?.destroy();
		} catch (err) {
			console.error(`demo "${slug}" destroy() threw`, err);
		}
		handle = null;
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

<div class="host">
	{#if phase !== 'ready'}
		<p class="status" data-state={phase}>
			{#if phase === 'loading'}
				Loading demo…
			{:else if phase === 'missing'}
				<strong>Artifact not present.</strong> Run <code>npm run fetch-demos</code> to
				download <code>{slug}@{version}</code>. The site is working correctly — this is
				the expected offline state.
			{:else if phase === 'unsupported'}
				<strong>Unsupported browser.</strong> This demo needs: {detail}
			{:else}
				<strong>Failed to load.</strong> {detail}
			{/if}
		</p>
	{/if}

	<!--
		The container is ALWAYS rendered and never hidden, for two reasons:
		  - it must exist in the DOM before mount() is called
		  - a hidden element has zero dimensions, so any demo that measures its
		    container (any canvas, so: most graphics demos) would size itself to
		    nothing. Never mount into a display:none element.
	-->
	<div class="mount" bind:this={container}></div>
</div>

<style>
	.host {
		border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
		border-radius: 10px;
		padding: 1rem;
	}

	.status {
		margin: 0 0 0.75rem;
		font-size: 0.9rem;
		line-height: 1.5;
		opacity: 0.8;
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
