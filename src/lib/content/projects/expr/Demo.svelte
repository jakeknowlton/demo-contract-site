<!--
  The `expr` demo UI. Owned entirely by the site.
  Lives next to the project's other content, so [slug] can render it generically.

  Compare this with what the artifact used to ship in contractVersion 1: the
  same interface, but built by hand out of document.createElement, wired with
  addEventListener, torn down by hand, and styled by an injected <style> block
  that knew nothing about this site's theme.

  Everything below inherits the site's custom properties, so dark mode works for
  free and restyling every demo is one place. And there is no teardown code at
  all -- Svelte owns this DOM, which removes the whole leaked-listener /
  stray-timer bug class from every demo I will ever write.
-->
<script lang="ts">
	import type { ExprApi } from './api';

	let { api }: { api: ExprApi } = $props();

	let source = $state('1 + 2 * (3 - 1)');

	// Straight into WASM on every keystroke. This compiler takes microseconds,
	// so there is no debounce -- and note that the v1 UI needed a hand-rolled
	// setTimeout debounce plus matching clearTimeout in its teardown. If a demo
	// ever were expensive, this is where a debounced $derived would go.
	const report = $derived(api.compile(source));

	// Two valid, two that exercise error paths. Worth showing that a bad input
	// produces a message and the instance keeps working afterwards.
	const examples = ['1 + 2 * (3 - 1)', '-4 + 10 / 2', '2 * (1 + ', '1 / 0'];
</script>

<div class="demo">
	<label for="expr-src">Expression</label>
	<input id="expr-src" type="text" spellcheck="false" bind:value={source} />

	<div class="examples">
		{#each examples as example (example)}
			<button type="button" onclick={() => (source = example)}>{example}</button>
		{/each}
	</div>

	<pre class="output">{report}</pre>
</div>

<style>
	.demo {
		border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
		border-radius: 10px;
		padding: 1rem;
	}

	label {
		display: block;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		opacity: 0.6;
		margin-bottom: 0.35rem;
	}

	input {
		width: 100%;
		box-sizing: border-box;
		padding: 0.6rem 0.7rem;
		/* Inherits the page's colours rather than declaring its own -- this is
		   what makes dark mode work without the demo knowing dark mode exists. */
		font: inherit;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		color: inherit;
		background: transparent;
		border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
		border-radius: 6px;
	}

	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.examples {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}

	button {
		font: inherit;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85rem;
		padding: 0.35rem 0.7rem;
		color: inherit;
		background: transparent;
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 999px;
		cursor: pointer;
	}

	button:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.output {
		margin: 0.9rem 0 0;
		padding: 0.8rem;
		min-height: 10rem;
		/* Long token lists must scroll inside the box, never widen the page. */
		overflow-x: auto;
		white-space: pre-wrap;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85rem;
		line-height: 1.5;
		border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
		border-radius: 6px;
		opacity: 0.9;
	}
</style>
