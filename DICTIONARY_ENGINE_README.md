# Orthobitto Local Dictionary Engine v1.1 / App v2.3

## What changed
- Word meaning is local-only. It never calls MyMemory or LibreTranslate.
- High-priority grammar/function words are included locally: auxiliary verbs, pronouns, determiners, question words, conjunctions and prepositions.
- Unknown words are not guessed and are not translated.
- A safety gate runs before sentence text reaches any external translation service.
- Vocabulary lookup applies an allowlist and a second output safety gate.
- OCR punctuation is preserved by the existing Unicode-aware cleanup path.

## Important quality rule
The app deliberately prefers **no meaning** over a potentially wrong meaning. A large low-quality dictionary would recreate the original problem, so future 10k–20k expansion should be done through the included CSV import pipeline using a licensed, reviewed source.

## Recommended data source for expansion
AI4Bharat Indic Glossaries reports 102,855 English-Bengali glossary records and the repository is MIT licensed, but the collected datasets have their own provenance/terms and should be reviewed before redistribution.

Open English WordNet 2025 is CC-BY 4.0 and is useful as an English lexical validation layer, not as the Bengali meaning source.
