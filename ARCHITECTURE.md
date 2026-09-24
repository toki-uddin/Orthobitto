# Orthobitto v4.0 Architecture

## Product flow
Scan → Understand → Lookup → Save → Learn → Practice → Remember

## Layers
- UI: responsive HTML/CSS components
- Application: scan, translation, learning and navigation orchestration
- Engines: OCR, sentence translation, dictionary, search, review/quiz, speech, PDF
- Storage: IndexedDB for saved learning data and existing history storage
- PWA: service worker with versioned static/dynamic caching
- Data pipeline: Python validation/build tooling

## Dictionary authority
Approved local dictionary is authoritative for word meanings. Generic external word-translation fallback is not used. Unknown words remain unavailable until approved data exists.

## Theme
System / Light / Dark. System follows OS/browser preference through `prefers-color-scheme`; a user override persists locally.

## Future vocabulary
The dictionary file remains versioned and merge-ready for later approved vocabulary expansion without changing the learning/UI layer.
