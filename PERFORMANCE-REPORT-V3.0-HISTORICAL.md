# Orthobitto v3.0 Performance & Compatibility Report

## Confirmed code/build changes

- Lazy-loaded `pdf-generator.js`; it is no longer part of the initial HTML script load and is fetched only when PDF generation is actually requested.
- Initial Google Fonts payload reduced to the UI fonts (`Inter` + `Hind Siliguri`). Additional PDF-only font families load when the PDF feature is opened.
- PDF engine and PDF fonts therefore do not consume first-load work unless the user uses PDF export.
- Local dictionary fetch now uses a versioned cacheable URL and `force-cache` instead of `no-store`.
- Service worker version bumped to 3.0.0 and registration uses `updateViaCache: 'none'`.
- Service-worker cache-first static assets no longer perform an unnecessary background refresh on every hit.
- Precache list reduced to essential runtime assets and only the icon sizes needed for the normal PWA install path.
- New Orthobitto icon PNGs were losslessly-ish palette-optimized to 256 colors for much smaller files while preserving the visual icon design.
- Release backups and duplicate legacy 10k lexicon copy were removed from the production upload bundle; Python dictionary tooling remains available.
- OCR worker reuse, idle warm-up, iOS-specific image-size cap, sentence translation concurrency, translation memory, local allowlist dictionary and iOS camera fallback from v2.9 remain intact.

## Measured raw payload changes

| Measurement | v2.9 | v3.0 | Change |
|---|---:|---:|---:|
| Release bundle | 1,798,409 B | 938,124 B | **47.8% smaller** |
| Service-worker precache | 968,184 B | 496,064 B | **48.8% smaller** |
| Eager local JS (PDF excluded in v3.0) | 79,453 B | 65,473 B | **17.6% smaller** |
| Key icon set (48/96/180/192/512) | 322,965 B | 127,828 B | **60.4% smaller** |

## Dictionary/CPU measurements

Current approved runtime dictionary: 669 entries.

On the build environment, parsing the 167,721-byte JSON took about 1.5–1.7 ms and 200,000 Python dictionary lookups took about 11 ms. These are developer-machine measurements, not Android/iPhone timings, and should not be treated as mobile latency numbers.

A separate native C++ micro-benchmark was compiled only as a developer diagnostic. C++ is **not inserted into the browser runtime** because the measured bottleneck is OCR/WASM setup and network translation rather than dictionary lookup. Adding a C++/WASM layer here would add deployment and compatibility complexity without a demonstrated user-visible benefit.

## What is improved

The strongest measurable improvement is the amount of work and data required on the first install/start path. PDF processing is now completely off the critical path, service-worker installation downloads roughly half the previous static payload, and the icon set is substantially smaller.

OCR remains the main CPU-heavy step. Tesseract.js guidance recommends worker reuse and pre-initialization, and v2.9/v3.0 already use a reusable worker with idle warm-up. Further OCR speed gains should be tested with real Android and iPhone images before changing recognition settings because faster models can trade accuracy for speed.

## What is not claimed

No exact claim such as “OCR is 40% faster on iPhone” is made here. A real device benchmark needs the same image set and repeated measurements on representative Android and iOS devices; the current execution environment cannot complete a browser device test and reports `ERR_BLOCKED_BY_ADMINISTRATOR` for local browser navigation.

## Next performance targets

1. Real-device benchmark matrix: iPhone Safari/PWA + Android Chrome, with 5–10 representative images per device class.
2. Measure OCR-only, image preprocessing, translation-only, and complete pipeline separately.
3. Compare Tesseract standard English model vs the upstream fast language-data option only after accuracy testing.
4. Consider stronger image preprocessing/worker tuning only if it improves median latency without lowering OCR accuracy.
5. Keep C++/WASM out of production until a profiler shows a specific hot path where native/WASM code wins materially.
