// The `expr` artifact's interface, declared site-side.
//
// This is the frontend/backend split made literal: the artifact is the backend,
// and this file is the frontend's declaration of the endpoints it calls. The
// site has to know this. That is not a leak of abstraction -- it is the point.
//
// Why hand-written rather than imported: the artifact is fetched at runtime
// from static/, so TypeScript has nothing to resolve at compile time.
// wasm-pack does emit a pkg/expr.d.ts you can copy from, and for a Zig project
// you would write it from scratch. Either way it is a handful of lines, and
// keeping it here means a mismatch shows up as a type error in the component
// that uses it.

import type { DemoApi } from '$lib/demo/contract';

export interface ExprApi extends DemoApi {
	/**
	 * Compile and evaluate an arithmetic expression.
	 *
	 * Returns a human-readable report: token list, s-expression AST, result.
	 * Never throws -- lex/parse/eval failures come back as text inside the
	 * report, because a Rust panic compiled to WASM aborts and poisons the
	 * module instance for every subsequent call.
	 */
	compile(source: string): string;
}
