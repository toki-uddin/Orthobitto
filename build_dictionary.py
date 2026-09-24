#!/usr/bin/env python3
"""Build/validate an Orthobitto local English→Bengali allowlist dictionary.

Input: a CSV with columns word,meaning_bn (extra columns are allowed).
Output: validated JSON suitable for ./data/orthobitto-dictionary.json

The tool intentionally rejects entries with no Bengali script, obvious unsafe
meaning markers, duplicate collisions with conflicting meanings, and empty data.
"""
from __future__ import annotations
import argparse, csv, json, re
from pathlib import Path

BENGALI_RE = re.compile(r'[\u0980-\u09FF]')
WORD_RE = re.compile(r"^[A-Za-z][A-Za-z'\-]{1,59}$")
BLOCKED = {
    'চোদাচুদি','চোদা','চুদা','চুদাচুদি','যৌনসঙ্গম','যৌনমিলন',
    'শ্লীলতাহানি','অশ্লীল','অশালীন','নোংরা যৌন'
}

def clean_word(v: str) -> str:
    return re.sub(r'[^A-Za-z\'\-]', '', v or '').lower().strip("-' ")

def clean_meaning(v: str) -> str:
    return re.sub(r'\s+', ' ', (v or '').strip())

def valid(word: str, meaning: str) -> bool:
    if not WORD_RE.fullmatch(word): return False
    if not meaning or not BENGALI_RE.search(meaning): return False
    low = meaning.lower()
    if any(term in low for term in BLOCKED): return False
    return True

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('csv')
    ap.add_argument('-o','--output', default='data/orthobitto-dictionary.json')
    args = ap.parse_args()
    entries = {}
    rejected = 0
    with open(args.csv, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            word = clean_word(row.get('word',''))
            meaning = clean_meaning(row.get('meaning_bn',''))
            if not valid(word, meaning):
                rejected += 1
                continue
            prev = entries.get(word)
            if prev and prev['meaning_bn'] != meaning:
                # Conflicting source mappings are deliberately rejected instead of guessed.
                rejected += 1
                continue
            entries[word] = {
                'word': word,
                'lemma': word,
                'meaning_bn': meaning,
                'pos': row.get('pos') or None,
                'level': row.get('level') or None,
                'approved': True,
                'safe': True,
                'source': row.get('source') or 'Imported + Orthobitto filtered'
            }
    if not entries:
        raise SystemExit('No valid entries found.')
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        'version':'1.0.0', 'language_pair':'en-bn', 'mode':'allowlist',
        'entries': entries, 'stats': {'approved': len(entries), 'rejected': rejected}
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Approved: {len(entries)} | Rejected: {rejected} | Output: {out}')

if __name__ == '__main__':
    main()
