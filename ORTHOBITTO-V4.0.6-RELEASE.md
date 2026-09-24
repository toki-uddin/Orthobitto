# Orthobitto v4.0.6 — Complete Sentence Rendering Fix

## Fixes

- Sentence results are rendered deterministically after translation completes.
- English sentence and Bengali translation are rendered as complete paired blocks.
- OCR newline/visual wrapping no longer creates fake sentence boundaries.
- Native `Intl.Segmenter` is preferred with abbreviation protection.
- Final translation render removes all temporary loading placeholders.
- Defensive re-render prevents a blank translation panel if a DOM race occurs.
- Versioned service-worker and asset cache references updated to 4.0.6.

## Intended behavior

Each result should show:

1. Complete English sentence with clickable words.
2. Complete Bengali sentence meaning.
3. Pronunciation control.

A sentence is no longer rendered as a broken OCR line fragment merely because the source image contains a visual line break.
