# Orthobitto v4.0.5 — Progress Completion Reliability Fix

## Root cause
The vocabulary rows were rendered successfully, but `buildVocabulary()` called `updateMobileBadges()`. The compact mobile navigation did not include the optional badge elements `nav-sentence-badge` and `nav-vocab-badge`, so the function could throw a `TypeError` after vocabulary rendering. Because `startTranslation()` awaited `buildVocabulary()`, execution never reached the 100% progress state.

## Fixes
- Optional mobile badges are now null-safe.
- Vocabulary errors are non-blocking.
- Progress is finalized in a `finally` block so the flow reaches 100%.
- History persistence errors no longer block completion.
- Existing dictionary allowlist and vocabulary matching behavior are unchanged.

## Expected result
After vocabulary rows render (for example, 108 words), the progress state advances from 85% → 100%, the Vocabulary step becomes complete, and the Translate button returns to its normal state.
