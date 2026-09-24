# Orthobitto v4.1.1-test2

## Dictionary
- Rebuilt from all available supplied vocabulary text sources.
- Latest occurrence is primary; alternate supplied Bengali meanings are retained in `meanings_bn`.
- Every entry now carries `synonyms` and `antonyms` arrays.
- Conservative curated relations are populated where available; no guessed relation is inserted.
- POS is populated using function-word knowledge, curated overrides, and conservative morphology.

## Sentence Translation
- Translation unit is one complete sentence.
- `, ; :` never split a sentence.
- `. ? !` are terminal boundaries.
- OCR whitespace/newlines inside a sentence are normalized.
- Repeated/stray punctuation is cleaned.
- Offline mode no longer fabricates a misleading word-by-word sentence translation.

## QA
- See `DICTIONARY-QA-REPORT.md`.
- See `orthobitto-relations.json` for the relation pack.
