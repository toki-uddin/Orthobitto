# Orthobitto v4.0 — iOS + Android compatibility/performance

## What changed

- Service Worker registration bumped to `v4.0.0`; Vercel is configured so `sw.js` is always revalidated.
- iOS camera startup now checks HTTPS/media-device support, uses iOS-safe constraints, explicitly calls `video.play()`, and falls back to the device photo picker when camera access fails.
- Torch UI is only shown when the active camera track reports torch support.
- Tesseract.js remains on v6 and is loaded after the main HTML so first paint is not blocked by the OCR bundle.
- OCR image size is capped more conservatively on iOS to reduce memory pressure.
- Translation concurrency is limited to 2 on iOS and 3 on other devices.
- Translation-memory writes are debounced instead of synchronously serializing localStorage after every sentence.
- iOS PWA meta tags are present for standalone home-screen use.
- Vercel response headers explicitly allow same-origin camera access and prevent stale service-worker delivery.

## Important limitation

Browser OCR is still CPU/WASM work on the phone. A faster network only helps the sentence-translation phase; OCR time depends mainly on the phone's CPU, image dimensions and Tesseract model.
