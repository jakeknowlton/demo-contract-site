# demo-contract-site

Reference implementation for [jkn.dev](https://jkn.dev): a SvelteKit site,
prerendered to static files, deployed to GitHub Pages, that runs a WASM demo
built by a separate repo — **consumed as an ordinary npm package**.

Companion repo: [`demo-contract-wasm`](https://github.com/jakeknowlton/demo-contract-wasm),
published as `@jakeknowlton/expr`.

---

## ⚠ This branch is not finished

The demo is consumed from npm, but **the package isn't published yet**, so
`package.json` points at a local path:

```json
"@jakeknowlton/expr": "file:../demo-contract-wasm/pkg"
```

That works locally with both repos cloned side by side and
`wasm-pack build --target bundler --scope jakeknowlton --out-dir pkg --release`
run in the wasm repo. It **cannot work in CI**.

To finish:

1. Add an `NPM_TOKEN` secret to `demo-contract-wasm` and tag it — the release
   workflow publishes `@jakeknowlton/expr` with provenance.
2. Here: `npm i @jakeknowlton/expr@^0.4.0` (replaces the `file:` dep and writes a
   real lockfile entry with an integrity hash).
3. Merge. CI goes green.

Until then `main` holds the previous, working, artifact-based version.

---

## How it works

```
demo-contract-wasm                      demo-contract-site
──────────────────                      ──────────────────
git tag v0.4.0
   │
   ├─ wasm-pack --target bundler
   └─ npm publish --provenance  ──────▶ npm install @jakeknowlton/expr
                                              │
                                              ▼
                                        demo/+page.svelte
                                        <DemoHost load={() =>
                                          import('@jakeknowlton/expr')}>
                                              │
                                              ▼
                                        content/projects/expr/Demo.svelte
                                        all markup, all styling,
                                        site theme + dark mode
```

The site is a plain downstream consumer. There is no contract, no manifest, no
fetch script — just a dependency and a dynamic import.

---

## Reading order

About 200 lines of actual code.

| # | File | What it shows |
|---|---|---|
| 1 | `src/routes/demo/+page.svelte` | The whole integration: one dynamic import |
| 2 | `src/lib/demo/DemoHost.svelte` | Lazy browser-only loading + loading/error states |
| 3 | `src/lib/content/projects/expr/Demo.svelte` | The UI. Site-owned, themed, typed from the package's `.d.ts` |
| 4 | `vite.config.ts` | `vite-plugin-wasm`, `adapter-static`, and the `paths.relative` trap |
| 5 | `.github/workflows/deploy.yml` | Build and deploy. No Rust anywhere |

---

## What consuming conventionally deleted

The previous version invented a delivery mechanism: a `demos.manifest.json`
pinning git tags, a fetch script that downloaded release tarballs from the
GitHub API, a generated metadata module, a `contractVersion` negotiation, and
hand-built preload hints. **439 lines**, all replaced by `npm install`:

| Was | Now |
|---|---|
| `contractVersion` check | semver |
| manifest pinning a git tag | `package.json` + lockfile |
| artifact integrity — *nothing* | lockfile integrity hashes |
| hand-written `api.ts` interface | the package's generated `.d.ts` |
| `scripts/fetch-demos.ts` + PAT | `npm install` |
| generated-manifest module | — |
| content hashing of the `.wasm` | Vite |

The integrity row matters most: **git tags are mutable.** The old scheme claimed
reproducibility it didn't have — a force-pushed tag would silently change the
"pinned" artifact. A lockfile integrity hash can't.

---

## What it cost: measured

Honest trade. Lazy-loading an npm dependency starts later than a
`<link rel="modulepreload">` in prerendered HTML, because the chunk can't begin
until the route's JS has booted. Measured with a logging server and headless
Chrome, ms from first request, loopback:

| | WASM request starts |
|---|---|
| Bespoke artifacts + hand-built preload hints | **~30 ms** (during HTML parse) |
| npm package, lazily imported | **~52 ms** (after route JS boots) |

Hoisting the import to module scope behind a `browser` guard recovers ~5 ms —
not worth the awkwardness. SvelteKit doesn't expose Vite's content-hashed chunk
URLs to components, so there's no clean way to preload a lazy dependency from
the HTML.

~20 ms on loopback, one or two round trips on a real connection, in exchange for
439 fewer lines, real integrity hashes, free types, and a package anyone can
use. Worth it.

---

## Run locally

```sh
# in ../demo-contract-wasm
wasm-pack build --target bundler --scope jakeknowlton --out-dir pkg --release

# here
npm install
npm run dev      # http://localhost:5173/demo-contract-site/
```

---

## Gotchas, all hit while building this

**`vite-plugin-top-level-await` breaks the build on Vite 8.** Every guide pairs
it with `vite-plugin-wasm`, but it depends on `rollup`, which Vite 8 no longer
ships (it uses rolldown) — you get `Cannot find module 'rollup'`. It also isn't
needed: top-level await is natively supported across Vite's default browser
target. Use `vite-plugin-wasm` alone.

**Never import the WASM package at module scope.** SvelteKit imports route
modules in Node during prerendering. Keep it inside a thunk that `onMount` calls.

**`paths.relative` defaults to `true`.** SvelteKit then emits relative URLs and
makes `base` a relative string. Links still work, but anything resolving a URL
at runtime breaks subtly. Set `relative: false`.

**`adapter-static` does not write `.nojekyll`**, despite what many guides claim.
Verified — absent from `build/` until `static/.nojekyll` was added. Without it a
branch-based Pages deploy silently drops `_app/` and every asset 404s.

**Don't name a Svelte variable `state`.** It collides with the `$state` rune's
typing and produces three confusing errors.

---

## Differences from the real jkn.dev plan

Deliberately barebones. The real site adds:

- `paths.base` of `''`, because a custom domain serves at the root
- A typed project registry with a non-empty presentation tuple
- A `[slug]` route rendering each project's own `Demo.svelte`
- Feature detection (WebGL2/WebGPU) before loading a demo that needs it
