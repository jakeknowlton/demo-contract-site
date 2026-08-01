// Prerender everything.
//
// Setting this in the ROOT layout makes it the default for every route, so each
// page becomes a real .html file containing real content at build time. First
// paint shows text rather than a blank frame, and crawlers and link-preview
// bots see something useful. Navigation after that is still client-side, so it
// still feels like an SPA.
//
// The discipline this requires: no route may touch `window` or `document` at
// module scope, because this code runs in Node during the build. Anything
// browser-only goes in onMount -- which is where the demo loading lives anyway.
export const prerender = true;
