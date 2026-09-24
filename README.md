# 📖 Orthobitto

> **English Reading, OCR, Bengali Meaning & Vocabulary Learning PWA**

Orthobitto is a mobile-first Progressive Web App (PWA) designed to make reading English easier for Bengali-speaking learners.

**The core experience is simple:**
Take or upload an image → extract the English text → split it into individual sentences → translate each sentence into natural Bengali → identify individual words → show dictionary meaning, Part of Speech, synonyms, antonyms and word details.

Orthobitto combines OCR, English-to-Bengali sentence translation, local-first vocabulary lookup, word relationships, speech, history, and PDF export into one learning-oriented workflow.

---

## ✨ Highlights

* 📷 **Camera-based English text scanning**
* 🖼️ **Image upload** and drag-and-drop support
* 🔲 **Four-corner perspective crop** for document scanning
* 🔄 Image rotation and adjustment
* 🔎 **OCR powered by Tesseract.js**
* ✍️ Editable OCR text before translation
* 🧹 OCR text cleanup and punctuation normalization
* 🧩 Sentence-by-sentence segmentation
* 🇬🇧 → 🇧🇩 **English-to-Bengali sentence translation**
* 📖 **Local-first** English-Bengali dictionary
* 🧠 Part of Speech detection
* 🔗 Synonym and antonym relationships
* 👆 Clickable words inside translated sentences
* 📚 Instant Word Card
* 🔊 English pronunciation using **Web Speech API**
* 🕘 Scan history with local IndexedDB storage
* 📄 **Sentence & Vocabulary PDF export** (Height-aware pagination)
* 🔗 Clickable Facebook profile links inside exported PDFs
* 🌗 System / Light / Dark themes
* 📱 Mobile-first responsive UI
* ⚡ OCR worker reuse and translation caching
* 📦 **PWA + Service Worker support** (Offline local dictionary fallback)

---

## 🎯 Project Goal

Orthobitto is built around one central problem: *English reading becomes difficult when a learner has to repeatedly look up words, manually translate sentences, and switch between different tools.*

Instead of separating these tasks, Orthobitto combines them into a single workflow.

**Traditional workflow:**
`Read English` → `Find unknown word` → `Open dictionary` → `Search meaning` → `Return to text` → `Translate sentence` → `Repeat`

**Orthobitto workflow:**
`Photo/Upload` → `OCR` → `Clean English Text` → `Sentence Segmentation` → `Sentence Translation` → `Word Detection` → `Dictionary Lookup` → `Word Card` → `Learn/Save/Practice`

---

## 🏗️ Architecture

Orthobitto follows a layered architecture so that OCR, dictionary, translation, UI and future learning features can evolve independently.

```mermaid
flowchart TD
    A[User Image / Camera / Upload] --> B[Image Processing]
    B --> C[Perspective Crop / Rotation / Enhancement]
    C --> D[Tesseract.js OCR]
    D --> E[OCR Cleanup & Normalization]
    E --> F[Sentence Segmentation]
    F --> G[Sentence Translation Engine]
    G --> H[Sentence Results]

    E --> I[Word Extraction]
    I --> J[Local Dictionary Engine]
    J --> K[POS]
    J --> L[Meaning]
    J --> M[Synonyms]
    J --> N[Antonyms]

    K --> O[Word Card]
    L --> O
    M --> O
    N --> O

    H --> P[Sentence PDF]
    O --> Q[Vocabulary PDF]

    H --> R[History]
    O --> R

    R --> S[IndexedDB]

    T[Service Worker / PWA Cache] --> A
    T --> J
    T --> P
