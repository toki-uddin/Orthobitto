# Orthobitto v4.0.7 — Sentence Visibility & Translation UX Fix

## Fixed
- English sentence cards render immediately before any translation API request.
- Skeleton/loading rows are removed from the user-facing sentence result.
- Each result keeps a complete English sentence visible while Bengali translation is pending.
- Bengali translation replaces the pending state once available.
- Sentence rendering no longer depends on translation-network completion.
- A 7-second per-sentence translation deadline prevents indefinite pending states, especially for local `file://` testing.
- Cache-busting query versions updated to 4.0.7 for app JS/CSS/related assets.
- Service worker cache namespace updated to 4.0.7.

## Product behavior
Every result is presented as:

English
Bengali meaning

OCR line breaks are normalized into sentence text before segmentation.
