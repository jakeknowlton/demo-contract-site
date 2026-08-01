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
| 3 | `scripts/fetch-demos.ts` | Downloading pinned release artifacts. Includes the private-repo redirect gotcha. |
| 4 | `src/lib/demo/loader.ts` | URL construction and the `@vite-ignore` dynamic import. |
| 5 | `src/lib/demo/DemoHost.svelte` | The lifecycle: version check, feature detect, mount, destroy. |
| 6 | `src/routes/demo/+page.svelte` | The entire integration, in one line of markup. |
| 7 | `vite.config.ts` | `adapter-static`, prerendering, and the `paths.relative` trap. |
| 8 | `.github/workflows/deploy.yml` | Build and deploy. Note the absence of Rust. |

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
                                      static/demos/expr/v0.1.0/
                                              │
                                              ▼
                                      DemoHost.svelte
                                        1. GET meta.json
                                        2. contractVersion ok?
                                        3. browser features ok?
                                        4. import(demo.js)
                                        5. mount(el, options)
                                        6. destroy() on unmount
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
