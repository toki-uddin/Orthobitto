# Orthobitto

Premium English-to-Bengali OCR reading, vocabulary and sentence-learning PWA.

## Current test build

- Local-first English -> Bengali dictionary
- Synonym and antonym relations where a safe curated relation is available
- OCR sentence segmentation with sentence-level translation
- Word and sentence result flows
- A4 PDF export with height-aware pagination
- Clickable Omar Mohammad Chowdhury / Facebook profile footer links in exported PDFs
- PWA/service-worker packaging

## GitHub upload

This archive is already **repository-root ready**: there is no extra project folder inside the archive.

1. Extract this ZIP on your computer.
2. Create an empty GitHub repository.
3. Upload the extracted files to the repository root, or use Git/GitHub Desktop.
4. For GitHub Pages, use the repository root as the published site.

GitHub's browser interface has a per-file upload limit, while Git itself allows larger files up to GitHub's hard single-object limit; this project keeps its current dictionary assets below that hard limit. See GitHub's repository limits documentation for current details.

## Notes

- `orthobitto-dictionary.json` is the primary structured dictionary asset.
- `dictionary-inline.js` is the offline/file:// fallback payload.
- `pdf-generator.js` contains the PDF layout, pagination and link-annotation logic.
- Do not commit generated ZIP archives back into the repository unless they are intentionally being used as release artifacts.

## Maintainer

Omar Mohammad Chowdhury

Facebook: https://www.facebook.com/OmarMohammadChowdhury
