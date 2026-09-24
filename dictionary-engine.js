/* ============================================================
   Orthobitto — Local Word Dictionary Engine
   Version 1.2 — Local allowlist + file:// fallback + fail-open
   ============================================================ */
'use strict';

window.OrthobittoDictionary = (() => {
  let dictionary = new Map();
  let readyPromise = null;
  const version = '1.2.0';
  const DICTIONARY_URL = './orthobitto-dictionary.json?v=4.1.2';
  const LOAD_TIMEOUT_MS = 2500;
  const INLINE_URL = './dictionary-inline.js?v=4.1.2';

  const BLOCKED_MEANING_TERMS = [
    'চোদাচুদি', 'চোদা', 'চুদা', 'চুদাচুদি', 'যৌনসঙ্গম', 'যৌনমিলন',
    'শ্লীলতাহানি', 'অশ্লীল', 'অশালীন', 'নোংরা যৌন', 'যৌন নির্যাতন'
  ];

  const BLOCKED_WORD_PATTERNS = [
    /(?:^|[^a-z])(?:fuck|fucking|fucked|fucker|shit|bullshit|bitch|bastard|cunt)(?:[^a-z]|$)/i,
    /(?:^|[^a-z])(?:dick|cock|pussy|whore|slut|porn|porno|semen|cum)(?:[^a-z]|$)/i,
    /(?:^|[^a-z])(?:blowjob|handjob|creampie|orgasm|masturbat\w*|rape|rapist)(?:[^a-z]|$)/i,
    /(?:^|[^a-z])(?:nigger|nigga|fag|faggot|retard)(?:[^a-z]|$)/i,
  ];

  const WORD_CLEAN_RE = /[^a-zA-Z'\-]/g;
  const BENGALI_RE = /[\u0980-\u09FF]/;

  function normalizeWord(word) {
    return String(word || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(WORD_CLEAN_RE, '')
      .replace(/^[-']+|[-']+$/g, '')
      .trim();
  }

  function normalizeMeaning(value) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isSafeWord(word) {
    const text = String(word || '').normalize('NFKC').toLowerCase();
    return !!text && !BLOCKED_WORD_PATTERNS.some(re => re.test(text));
  }

  function isApprovedMeaning(meaning) {
    const text = normalizeMeaning(meaning);
    if (!text || !BENGALI_RE.test(text)) return false;
    const lower = text.toLowerCase();
    if (BLOCKED_MEANING_TERMS.some(term => lower.includes(term))) return false;
    return true;
  }

  function ingest(payload) {
    dictionary = new Map();
    const entries = payload?.entries || {};
    for (const [key, value] of Object.entries(entries)) {
      const word = normalizeWord(key || value?.word);
      const meaning = normalizeMeaning(value?.meaning_bn);
      if (!word || !meaning || value?.approved !== true || value?.safe !== true) continue;
      if (!isSafeWord(word) || !isApprovedMeaning(meaning)) continue;
      dictionary.set(word, { ...value, word, meaning_bn: meaning });
    }
    console.info(`[Dictionary] Loaded ${dictionary.size} approved local entries (v${payload?.version || version}).`);
    return dictionary;
  }

  function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Dictionary load timeout after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function loadInline() {
    if (window.__ORTHOBITTO_INLINE_DICTIONARY__) {
      return ingest(window.__ORTHOBITTO_INLINE_DICTIONARY__);
    }

    await new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-orthobitto-inline-dictionary]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = INLINE_URL;
      script.async = false;
      script.dataset.orthobittoInlineDictionary = 'true';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Inline dictionary script failed to load'));
      document.head.appendChild(script);
    });

    if (!window.__ORTHOBITTO_INLINE_DICTIONARY__) {
      throw new Error('Inline dictionary payload unavailable');
    }
    return ingest(window.__ORTHOBITTO_INLINE_DICTIONARY__);
  }

  async function load() {
    if (readyPromise) return readyPromise;

    readyPromise = (async () => {
      // A local file opened directly from disk cannot reliably fetch JSON via fetch().
      // Use the packaged JS fallback in that environment.
      if (location.protocol === 'file:') {
        try {
          return await loadInline();
        } catch (inlineError) {
          console.warn('[Dictionary] file:// inline fallback failed:', inlineError);
          return dictionary;
        }
      }

      try {
        const response = await withTimeout(
          fetch(DICTIONARY_URL, { cache: 'force-cache', credentials: 'same-origin' }),
          LOAD_TIMEOUT_MS
        );
        if (!response.ok) throw new Error(`Dictionary HTTP ${response.status}`);
        return ingest(await response.json());
      } catch (networkError) {
        console.warn('[Dictionary] Network/local JSON load failed:', networkError);
        // Never block the scan pipeline because the dictionary is unavailable.
        try {
          return await loadInline();
        } catch (inlineError) {
          console.warn('[Dictionary] Packaged fallback unavailable:', inlineError);
          dictionary = new Map();
          return dictionary;
        }
      }
    })();

    return readyPromise;
  }

  async function ready() { return load(); }

  function lookup(word) {
    const key = normalizeWord(word);
    if (!key || !isSafeWord(key)) return null;
    const item = dictionary.get(key);
    if (!item) return null;
    if (!isApprovedMeaning(item.meaning_bn)) return null;
    return item;
  }

  function size() { return dictionary.size; }

  return { ready, lookup, normalizeWord, isApprovedMeaning, isSafeWord, size };
})();
