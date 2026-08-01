// Download pinned demo artifacts into static/demos/<slug>/<tag>/ and generate
// src/lib/demo/generated-manifest.ts from their meta.json files.
//
// Run:  node --experimental-strip-types scripts/fetch-demos.ts
//
// Node 22 strips TypeScript types at load time, so this runs with no build step
// and no dependencies -- everything used here is either a Node builtin or the
// `tar` binary that ships with macOS and Linux.
//
// Wired into `predev`, `prebuild` and `precheck` in package.json, so it runs
// automatically and is safe to run repeatedly: artifacts already on disk are
// skipped, and only the generated file is rewritten.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface DemoEntry {
	slug: string;
	repo: string;
	tag: string;
	asset: string;
}

interface DemoMeta {
	contractVersion: number;
	name: string;
	entry: string;
	buildTag: string;
	sourceCommit: string;
	features?: string[];
	preload?: string[];
}

/** Must match CONTRACT_VERSION in src/lib/demo/contract.ts. */
const CONTRACT_VERSION = 1;

const MANIFEST = 'demos.manifest.json';
const OUT_ROOT = join('static', 'demos');
const GENERATED = join('src', 'lib', 'demo', 'generated-manifest.ts');

// A token is OPTIONAL for public repos. It is required only for private ones
// (your `compilers` repo), where it must be a fine-grained PAT with
// Contents: Read-only -- the default GITHUB_TOKEN in Actions is scoped to the
// repository it runs in and cannot read another private repo's releases.
const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';

function apiHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
		'User-Agent': 'demo-contract-site-fetch'
	};
	if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
	return headers;
}

/**
 * Download a release asset's bytes.
 *
 * This is the single most obscure part of the whole pipeline, so it's worth
 * being explicit about why it isn't just `fetch(browser_download_url)`.
 *
 * For a PUBLIC repo, browser_download_url works fine. For a PRIVATE repo it
 * does not: it redirects to object storage, and the storage URL is already
 * signed via query parameters. If the request still carries an Authorization
 * header, the storage backend rejects it -- and the failure surfaces as a 404,
 * which reads as "the asset doesn't exist" and sends you looking in entirely
 * the wrong place.
 *
 * The supported path is the asset API endpoint with an octet-stream Accept
 * header, following the redirect manually so the Authorization header can be
 * dropped before the second request. This works for public repos too, so
 * there's no reason to special-case.
 */
async function downloadAsset(repo: string, tag: string, assetName: string): Promise<Buffer> {
	// 1. Look up the release by tag to find the asset's numeric id.
	const relRes = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, {
		headers: apiHeaders()
	});
	if (!relRes.ok) {
		throw new Error(
			`could not read release ${repo}@${tag}: ${relRes.status} ${relRes.statusText}` +
				(relRes.status === 404 && !TOKEN ? ' (private repo? set GITHUB_TOKEN)' : '')
		);
	}

	const release = (await relRes.json()) as { assets: Array<{ id: number; name: string }> };
	const asset = release.assets.find((a) => a.name === assetName);
	if (!asset) {
		const found = release.assets.map((a) => a.name).join(', ') || '(none)';
		throw new Error(`release ${repo}@${tag} has no asset "${assetName}"; found: ${found}`);
	}

	// 2. Ask for the bytes, but do NOT auto-follow the redirect.
	const url = `https://api.github.com/repos/${repo}/releases/assets/${asset.id}`;
	const res = await fetch(url, {
		headers: { ...apiHeaders(), Accept: 'application/octet-stream' },
		redirect: 'manual'
	});

	// 3. If redirected, re-request WITHOUT the Authorization header.
	if (res.status >= 300 && res.status < 400) {
		const location = res.headers.get('location');
		if (!location) throw new Error(`redirect with no Location header for ${assetName}`);
		const followed = await fetch(location);
		if (!followed.ok) {
			throw new Error(`asset download failed: ${followed.status} ${followed.statusText}`);
		}
		return Buffer.from(await followed.arrayBuffer());
	}

	if (!res.ok) throw new Error(`asset download failed: ${res.status} ${res.statusText}`);
	return Buffer.from(await res.arrayBuffer());
}

/** Download and unpack one artifact, unless it is already on disk. */
async function ensurePresent(entry: DemoEntry): Promise<void> {
	const dest = join(OUT_ROOT, entry.slug, entry.tag);

	// Idempotence: this is what makes the script safe to run on every `npm run
	// dev`. Because the tag is in the path, a bumped version is simply a
	// different directory -- there is no cache to invalidate.
	if (existsSync(join(dest, 'meta.json'))) {
		console.log(`  ${entry.slug}@${entry.tag}  already present`);
		return;
	}

	console.log(`  ${entry.slug}@${entry.tag}  downloading from ${entry.repo}…`);
	const bytes = await downloadAsset(entry.repo, entry.tag, entry.asset);

	// Extract via the system tar. Writing to a temp file first keeps this simple
	// and means a partially-downloaded artifact never lands in static/.
	const tmpFile = join(tmpdir(), `demo-${entry.slug}-${entry.tag}.tar.gz`);
	writeFileSync(tmpFile, bytes);
	mkdirSync(dest, { recursive: true });
	try {
		execFileSync('tar', ['-xzf', tmpFile, '-C', dest]);
	} finally {
		rmSync(tmpFile, { force: true });
	}

	console.log(`  ${entry.slug}@${entry.tag}  ok (${(bytes.length / 1024).toFixed(0)} KB)`);
}

/**
 * Read every artifact's meta.json off disk and validate it.
 *
 * Deliberately reads from DISK rather than from whatever was just downloaded,
 * so the generated file is correct whether or not anything was fetched this
 * run. An artifact that failed to download simply has no entry, which is what
 * DemoHost renders as the "missing" state.
 */
function collectMeta(entries: DemoEntry[]): Record<string, DemoMeta> {
	const out: Record<string, DemoMeta> = {};

	for (const entry of entries) {
		const metaPath = join(OUT_ROOT, entry.slug, entry.tag, 'meta.json');
		if (!existsSync(metaPath)) continue;

		const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as DemoMeta;

		// Validate at build time rather than letting a mismatch surface at runtime
		// as a demo that mounts and then misbehaves in ways that look like a bug
		// in the site.
		if (meta.contractVersion > CONTRACT_VERSION) {
			console.warn(
				`  WARN ${entry.slug}@${entry.tag} requires contract v${meta.contractVersion}, ` +
					`this site speaks v${CONTRACT_VERSION} -- skipping`
			);
			continue;
		}

		out[`${entry.slug}@${entry.tag}`] = meta;
	}

	return out;
}

/**
 * Write src/lib/demo/generated-manifest.ts.
 *
 * Why generate a module instead of letting the browser fetch meta.json at
 * runtime: meta.json is known at build time, so fetching it costs a network
 * round trip that buys nothing, AND it delays the demo import until after that
 * round trip completes. Baking it in lets DemoHost decide everything
 * synchronously and start the import immediately -- and lets it emit preload
 * hints into the prerendered HTML, which it could not do if the filenames were
 * only discoverable at runtime.
 *
 * ALWAYS writes, even when empty. If this file were sometimes absent, an import
 * of it would fail and break the build on a fresh clone.
 */
function writeGenerated(meta: Record<string, DemoMeta>): void {
	const body = `// GENERATED FILE -- do not edit.
// Written by scripts/fetch-demos.ts from each artifact's meta.json.
// Gitignored: regenerated by predev / prebuild / precheck.

import type { DemoMeta } from './contract';

/**
 * Metadata for every demo artifact present in this build, keyed by
 * \`\${slug}@\${version}\`.
 *
 * A missing key means the artifact was not fetched -- normal when working
 * offline -- and DemoHost renders its "missing" state for it.
 */
export const DEMO_META: Record<string, DemoMeta> = ${JSON.stringify(meta, null, 2)};
`;

	writeFileSync(GENERATED, body);
	const count = Object.keys(meta).length;
	console.log(`  wrote ${GENERATED} (${count} demo${count === 1 ? '' : 's'})`);
}

async function main(): Promise<void> {
	const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { demos: DemoEntry[] };
	console.log(`fetch-demos: ${manifest.demos.length} demo(s)${TOKEN ? '' : ' (no token set)'}`);

	mkdirSync(OUT_ROOT, { recursive: true });

	for (const entry of manifest.demos) {
		try {
			await ensurePresent(entry);
		} catch (err) {
			// WARN AND CONTINUE -- deliberately not a hard failure.
			//
			// Local development must work with no network and no token, and
			// DemoHost's `missing` state exists precisely so an absent artifact is
			// survivable. Exiting non-zero here would make `npm run dev` unusable
			// offline.
			//
			// On the real site, consider failing hard when process.env.CI is set, so
			// a broken artifact can't ship silently to production.
			console.warn(`  WARN ${entry.slug}@${entry.tag}: ${(err as Error).message}`);
		}
	}

	writeGenerated(collectMeta(manifest.demos));
}

await main();
