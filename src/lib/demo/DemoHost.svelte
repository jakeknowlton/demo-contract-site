<!--
  DemoHost -- the only place the site touches a demo artifact.

  Responsibilities, in order:
    1. read meta.json
    2. refuse politely if the contract version is too new
    3. refuse politely if the browser lacks a required feature
    4. import demo.js and call mount()
    5. call destroy() on unmount, exactly once, without throwing

  Steps 2 and 3 are why meta.json is read *before* demo.js is imported. Once
  you've imported and mounted, it's too late to decline gracefully.
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { CONTRACT_VERSION, detectMissingFeatures, type DemoHandle } from './contract';
	import { fetchMeta, loadDemo } from './loader';

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
			// --- meta.json -----------------------------------------------------
			const meta = await fetchMeta(slug, version);

			// null means 404, which is the ordinary "nobody ran the fetch script"
			// case -- someone cloned the repo and ran `npm run dev` offline. It is
			// not an error and must not look like one.
			if (!meta) {
				phase = 'missing';
				return;
			}

			// --- contract version ----------------------------------------------
			if (meta.contractVersion > CONTRACT_VERSION) {
				phase = 'error';
				detail = `artifact requires contract v${meta.contractVersion}, this site speaks v${CONTRACT_VERSION}`;
				return;
			}

			// --- browser capabilities ------------------------------------------
			const missing = detectMissingFeatures(meta.features);
			if (missing.length > 0) {
				phase = 'unsupported';
				detail = missing.join(', ');
				return;
			}

			// --- mount ----------------------------------------------------------
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
