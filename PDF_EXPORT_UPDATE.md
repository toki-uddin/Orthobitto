# PDF Export Update - v4.1.2

## Sentence PDF
- Separate sentence-only PDF export.
- Pure white page and crisp black text.
- Protected footer zone.
- Multi-page A4 output.

## Vocabulary PDF
- Separate vocabulary-only PDF export.
- No CSV dependency for the learning export.
- Pure white page and crisp black text.
- English and Bengali fonts can be selected independently.

## English font choices
### Handwriting
- Caveat
- Indie Flower

### Computer
- Inter
- Arial
- Georgia

## Bengali font choices
### Handwriting / display style
- Atma
- Mina
- Galada

### Computer / clean
- Noto Sans Bengali
- Hind Siliguri

## Download reliability
The PDF generator now:
1. Ensures jsPDF and html2canvas are loaded.
2. Waits for the selected web fonts.
3. Renders the PDF pages at high resolution.
4. Creates a Blob from the generated PDF.
5. Starts a real browser download through a temporary download anchor.
6. Shows a visible error toast when a dependency or rendering step fails.


## v2.7.0 Reliability Fix
- PDF generation now shows a user-gesture download panel after async rendering.
- Best-effort automatic download is attempted, with a reliable visible Download button fallback for browser download restrictions.
- Service Worker cache version bumped to v2.7.0 and old Orthobitto caches are purged on activation.


## v4.1.2 GitHub + pagination + profile link fix
- Replaced fixed item-count page breaks with physical-height-aware pagination.
- Pages now keep accepting sentences/rows until the usable A4 area is full.
- Reduced excess inter-sentence spacing while keeping sentence cards visually separated.
- Added real jsPDF link annotations to the footer name and Facebook Profile link.
- Updated PDF engine cache/version references.
