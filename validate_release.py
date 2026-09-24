import json, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent
required=['index.html','app.css','app.js','orthobitto-enhancements.js','dictionary-engine.js','content-safety.js','word-classes.js','pdf-generator.js','manifest.json','sw.js','orthobitto-dictionary.json','dictionary-inline.js','orthobitto-relations.json','README.md','.gitignore','.gitattributes']
missing=[x for x in required if not (ROOT/x).exists()]
if missing: raise SystemExit('Missing required files: '+', '.join(missing))
for js in ['app.js','orthobitto-enhancements.js','dictionary-engine.js','content-safety.js','word-classes.js','pdf-generator.js','sw.js']:
    r=subprocess.run(['node','--check',js],cwd=ROOT,capture_output=True,text=True)
    if r.returncode: raise SystemExit(f'JS syntax error in {js}:\n{r.stderr}')
html=(ROOT/'index.html').read_text(encoding='utf-8')
for needle in ['id="theme-control"','data-theme-option="system"','data-theme-option="light"','data-theme-option="dark"','id="word-card-overlay"','id="crop-overlay"','orthobitto-enhancements.js']:
    if needle not in html: raise SystemExit(f'Missing UI marker: {needle}')
manifest=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
assert manifest.get('short_name')=='Orthobitto'
d=json.loads((ROOT/'orthobitto-dictionary.json').read_text(encoding='utf-8'))
entries=d.get('entries',{})
approved=sum(1 for v in entries.values() if v.get('approved') is True and v.get('safe') is True and v.get('meaning_bn'))
print(json.dumps({'status':'ok','approved_dictionary_entries':approved,'required_files':len(required)},ensure_ascii=False))

# Test2 relation coverage
for k in ['happy','good','strong','problem','solution']:
    item=entries.get(k, {})
    print(k, 'syn=', item.get('synonyms', []), 'ant=', item.get('antonyms', []))
