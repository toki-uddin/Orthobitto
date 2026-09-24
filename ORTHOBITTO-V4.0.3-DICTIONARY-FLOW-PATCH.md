# Orthobitto v4.0.3 — Dictionary Flow Reliability Patch

## Problem

When `index.html` was opened directly with a `file://` URL, the local dictionary JSON could not be reliably loaded through `fetch()`. Modern browsers treat `file:` documents with opaque origins, so this can fail under browser security rules.

## Fix

- Added `dictionary-inline.js` as a packaged local fallback payload.
- `dictionary-engine.js` now uses the inline dictionary when the app is opened via `file://`.
- HTTP/HTTPS dictionary loading has a bounded timeout.
- If the JSON load fails or times out, the packaged fallback is attempted.
- Vocabulary building is fail-open: dictionary failure can never stall the scan/translation completion pipeline.
- Service worker and release version updated to v4.0.3.

## Behavior

- Approved matches are still shown normally.
- Unknown/unapproved words are simply omitted from the vocabulary match list.
- The app will no longer remain stuck indefinitely at “Building Vocabulary…”.
- The solution remains compatible with future vocabulary expansion; the inline payload is generated from the same approved dictionary source during the release build.
