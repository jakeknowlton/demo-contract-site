# demo-contract-site

A **reference implementation of the site-side contract** for jkn.dev.

Half of a two-repo test. The other half is
[`demo-contract-wasm`](https://github.com/jakeknowlton/demo-contract-wasm).

**Live:** https://jakeknowlton.github.io/demo-contract-site/

SvelteKit, prerendered to static files with `adapter-static`, deployed to GitHub
Pages by GitHub Actions. It loads a WebAssembly demo built, versioned, and
released by a completely separate repository — without a Rust toolchain
anywhere in its own build.

---

## Reading order

Roughly 350 lines of actual code. Read in this order:

| # | File | What it shows |
|---|---|---|
| 1 | `src/lib/demo/contract.ts` | The contract types. The spec both repos agree on. |
| 2 | `demos.manifest.json` | Which artifact, from which repo, pinned to which tag. |
| 3 | `scripts/fetch-demos.ts` | Downloading pinned artifacts, and generating the metadata module. Includes the private-repo redirect gotcha. |
| 4 | `src/lib/demo/loader.ts` | URL construction and the `@vite-ignore` dynamic import. |
| 5 | `src/lib/demo/DemoHost.svelte` | The lifecycle: preload hints, version check, feature detect, mount, destroy. |
| 6 | `src/routes/demo/+page.svelte` | The entire integration, in one line of markup. |
| 7 | `vite.config.ts` | `adapter-static`, prerendering, and the `paths.relative` trap. |
| 8 | `.github/workflows/deploy.yml` | Build and deploy. Note the absence of Rust. |

`src/lib/demo/generated-manifest.ts` is written by the fetch script and
gitignored. Run `npm run fetch-demos` (or anything with a pre-hook: `dev`,
`build`, `check`) if your editor complains it's missing on a fresh clone.

---

## How it fits together

```
demo-contract-wasm                    demo-contract-site
──────────────────                    ──────────────────
git tag v0.1.0
   │
   ├─ cargo build --target wasm32-unknown-unknown
   ├─ wasm-bindgen  ->  expr.js + expr_bg.wasm
   ├─ + hand-written demo.js  (mount/destroy)
   └─ + generated meta.json
          │
          ▼
   GitHub Release asset
   demo.tar.gz  ───────────────────▶  scripts/fetch-demos.ts
                                      reads demos.manifest.json
                                      unpacks to
                                        static/demos/expr/v0.2.0/
                                      generates
                                        src/lib/demo/generated-manifest.ts
                                              │
                                              ▼
                                      DemoHost.svelte
                                        build time:
                                          1. look up meta (no network)
                                          2. emit modulepreload/preload links
                                             into the prerendered HTML
                                        run time:
                                          3. contractVersion ok?
                                          4. browser features ok?
                                          5. import(demo.js)
                                          6. mount(el, options)
                                          7. destroy() on unmount
```

The site knows exactly two things about the demo: `mount(el, opts)` and
`destroy()`. It does not know the demo is Rust. The contract doesn't even
mention WebAssembly — which is why a Zig project can satisfy it with
hand-written glue, and a TypeScript project can satisfy it with no WASM at all.

---

## Run locally

```sh
npm install
npm run dev          # `predev` fetches artifacts automatically
```

Then http://localhost:5173/demo-contract-site/ — note the base path, which is
present in dev too.

```sh
npm run build && npm run preview    # exercise the real prerendered output
```

## Try the failure path

Deliberately supported, because local dev has to work with no network:

```sh
rm -rf static/demos
npx vite build && npx vite preview   # bypasses the prebuild fetch hook
```

The demo page reports the artifact is missing and explains how to get it,
instead of throwing. That state is a feature, not an oversight.

---

## Loading strategy, and why it's measured

The artifact is fetched at **build time** and shipped as part of the site. At run
time the browser loads it from this origin, lazily — nothing touches GitHub when
a visitor opens the page.

Lazy matters: at 67 KB, the WASM must not be in the initial bundle, or every
visitor to the landing page pays for a demo they didn't ask for. But naive lazy
loading produces a request waterfall, because each file is only *discovered*
once the previous one has downloaded.

Both versions were measured with a logging static server plus headless Chrome
(a throwaway harness, not checked in). Timestamps are ms from the first request,
on loopback, single run — expect a few ms of run-to-run variance:

**Before** — runtime `meta.json` fetch, no hints:

```
 66ms  demos/expr/…/meta.json     138 B
 69ms  demos/expr/…/demo.js       6.9 KB
 71ms  demos/expr/…/expr.js       7.3 KB
 72ms  demos/expr/…/expr_bg.wasm   67 KB
```

**After** — metadata baked in, preload hints in the HTML:

```
 28ms  demos/expr/…/demo.js       6.9 KB   ┐
 28ms  demos/expr/…/expr.js       7.3 KB   ├ parallel, alongside the site's own JS
 30ms  demos/expr/…/expr_bg.wasm   67 KB   ┘
```

Two separate wins:

1. **Four serialized round trips became one parallel burst.** On loopback the
   gaps are only ~2 ms, so the absolute numbers look small — but each gap is a
   full RTT on a real connection. At 100 ms RTT, "before" spends ~400 ms before
   the WASM even starts downloading; "after" spends ~100 ms.
2. **Loading starts 38 ms earlier** (28 ms vs 66 ms) for a more interesting
   reason: the `<link rel="modulepreload">` tags are in the prerendered HTML, so
   the browser starts fetching during initial parse — *before* the framework has
   booted and run `onMount`. The old version couldn't start until hydration
   completed.

Verified: `expr_bg.wasm` is requested **exactly once**. `crossorigin` on a
`rel="preload" as="fetch"` link is not optional — `fetch()` defaults to cors
mode, and a preload whose credentials mode doesn't match is ignored and the file
is downloaded twice.

## Four things that were bugs before they were comments

Each was found by actually building this, and each is commented where it matters:

**`paths.relative` defaults to `true`.** SvelteKit then emits relative URLs and
makes `base` a relative string. Links keep working, but demo loading breaks:
`fetch()` resolves relative URLs against the document, while dynamic `import()`
resolves against the *importing module's* URL — which is
`_app/immutable/chunks/…`, so the demo path lands in the wrong directory. Set
`relative: false`. See `vite.config.ts`.

**`adapter-static` does not write `.nojekyll`**, despite what many guides say.
Verified: it was absent from `build/` until `static/.nojekyll` was added.
Without it, a branch-based Pages deploy silently drops `_app/` and every asset
404s in production while dev works perfectly.

**`browser_download_url` fails on private repos.** It redirects to object
storage, which is already signed via query parameters and rejects a request
that also carries an `Authorization` header — surfacing as a 404 that reads as
"asset doesn't exist." Use the asset API endpoint with
`Accept: application/octet-stream`, follow the redirect manually, and drop the
auth header on the second request. See `scripts/fetch-demos.ts`.

**Dynamic `import()` with a variable specifier needs `@vite-ignore`.** Vite
statically analyses dynamic imports to pre-bundle them; a variable specifier
fails the build. See `src/lib/demo/loader.ts`.

---

## Differences from the real jkn.dev plan

This is deliberately barebones. The real site adds:

- `paths.base` of `''`, because a custom domain serves at the root
- A typed project registry with a non-empty presentation tuple
- A `[slug]` route plus static-route overrides for bespoke demo pages
- Per-project content modules
- A build-time assertion that `demos.manifest.json` and the registry agree on versions

Known omission, deliberate: **the fetch script does not prune stale artifact
directories.** Bump a version and the old one stays in `static/demos/` and gets
deployed. Harmless but wasteful. Left out to keep the script short; worth adding
on the real site, where it's a few lines that read the manifest and delete
anything not in it.
