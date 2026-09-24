# Orthobitto Performance Optimization v2.8

This performance pass keeps the existing UI/feature behavior intact while targeting runtime bottlenecks.

## Changes

- Reuses one Tesseract OCR worker instead of invoking the convenience `Tesseract.recognize()` path for every scan.
- Warms the OCR worker during browser idle time to reduce first-scan initialization latency.
- Upgrades the browser Tesseract CDN from v5 to v6. The upstream project documents lower runtime and memory usage in v6.
- Limits OCR preprocessing to a practical maximum dimension (2600px long side) to reduce CPU/memory cost on very large phone photos.
- Translates up to 3 sentences concurrently instead of waiting for every request serially.
- Adds a small persistent local translation-memory cache to avoid repeating identical sentence requests.
- Builds the vocabulary table with a `DocumentFragment` instead of appending every row directly to the live DOM.
- Stops eagerly loading jsPDF/html2canvas/html2pdf on initial page load; PDF libraries are already lazy-loaded by `pdf-generator.js`.
- Bumps the service-worker cache version to v2.8.0.

## Intentionally not changed

- Existing UI layout and visual design.
- Camera/torch/switch-camera behavior.
- PDF format/settings behavior.
- Local dictionary safety model.
- Sentence-vs-word translation separation.

## Validation

Run JavaScript syntax checks before deployment and test on at least one desktop Chrome session and one Android Chrome session because OCR performance varies by device.
