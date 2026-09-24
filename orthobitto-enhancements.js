/* Orthobitto v4 — product & interaction layer */
'use strict';

(() => {
  const THEME_KEY = 'orthobitto-theme-preference-v2';
  const DB_NAME = 'orthobitto-learning-v2';
  const DB_VERSION = 1;
  let dbPromise = null;
  let cropState = null;
  let currentWordContext = null;

  // ---------------- THEME ----------------
  const Theme = {
    init() {
      const buttons = [...document.querySelectorAll('[data-theme-option]')];
      const stored = localStorage.getItem(THEME_KEY) || 'system';
      apply(stored);
      syncButtons(stored, buttons);

      buttons.forEach(btn => btn.addEventListener('click', () => {
        const preference = btn.dataset.themeOption || 'system';
        Theme.set(preference);
      }));

      const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      mq?.addEventListener?.('change', () => {
        if ((localStorage.getItem(THEME_KEY) || 'system') === 'system') apply('system');
      });
    },
    set(preference) {
      const safe = ['system', 'light', 'dark'].includes(preference) ? preference : 'system';
      localStorage.setItem(THEME_KEY, safe);
      apply(safe);
      syncButtons(safe);
    },
    preference() { return localStorage.getItem(THEME_KEY) || 'system'; }
  };

  function syncButtons(preference, buttons) {
    const list = buttons || [...document.querySelectorAll('[data-theme-option]')];
    list.forEach(btn => {
      const active = btn.dataset.themeOption === preference;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function apply(preference) {
    const dark = preference === 'dark' || (preference === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    const resolved = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = resolved;
    syncButtons(preference);
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor && !themeColor.media) themeColor.content = dark ? '#0B0C0E' : '#F4F1EA';
  }

  window.OrthobittoTheme = Theme;

  // ---------------- LOCAL LEARNING DB ----------------
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('savedWords')) {
          const store = db.createObjectStore('savedWords', { keyPath: 'word' });
          store.createIndex('savedAt', 'savedAt');
          store.createIndex('mastery', 'mastery');
        }
        if (!db.objectStoreNames.contains('quiz')) db.createObjectStore('quiz', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(() => null);
    return dbPromise;
  }
  async function idbPut(storeName, value) {
    const db = await openDB(); if (!db) return false;
    return new Promise(resolve => { const tx=db.transaction(storeName,'readwrite'); tx.objectStore(storeName).put(value); tx.oncomplete=()=>resolve(true); tx.onerror=()=>resolve(false); });
  }
  async function idbGetAll(storeName) {
    const db=await openDB(); if(!db) return [];
    return new Promise(resolve=>{ const tx=db.transaction(storeName,'readonly'); const req=tx.objectStore(storeName).getAll(); req.onsuccess=()=>resolve(req.result||[]); req.onerror=()=>resolve([]); });
  }
  async function idbDelete(storeName,key) {
    const db=await openDB(); if(!db) return;
    await new Promise(resolve=>{const tx=db.transaction(storeName,'readwrite');tx.objectStore(storeName).delete(key);tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();});
  }

  // ---------------- WORD CARD ----------------
  window.openWordCard = async function(word, sentence='', index='') {
    const cleaned = window.OrthobittoDictionary?.normalizeWord ? window.OrthobittoDictionary.normalizeWord(word) : String(word||'').toLowerCase();
    if (!cleaned) return;
    currentWordContext = { word: cleaned, sentence, index };
    const overlay=document.getElementById('word-card-overlay'); if(!overlay) return;
    overlay.hidden=false; document.body.classList.add('word-card-open');
    const entry = await window.OrthobittoDictionary?.ready().then(()=>window.OrthobittoDictionary.lookup(cleaned)).catch(()=>null);
    const title=document.getElementById('word-card-title');
    const pronunciation=document.getElementById('word-card-pronunciation');
    const pos=document.getElementById('word-card-pos');
    const meaning=document.getElementById('word-card-meaning');
    const contextWrap=document.getElementById('word-card-context-wrap');
    const context=document.getElementById('word-card-context');
    const exampleWrap=document.getElementById('word-card-example-wrap');
    const example=document.getElementById('word-card-example');
    const syn=document.getElementById('word-card-synonyms'); const ant=document.getElementById('word-card-antonyms'); const meta=document.getElementById('word-card-meta');
    title.textContent = cleaned;
    pronunciation.textContent = entry?.pronunciation || entry?.phonetic || '';
    pos.textContent = entry?.pos || entry?.partOfSpeech || inferPOS(cleaned);
    meaning.textContent = entry?.meaning_bn || 'Meaning unavailable in the approved local dictionary.';
    contextWrap.hidden = !sentence;
    context.textContent = sentence ? sentence : '';
    const ex = Array.isArray(entry?.examples) ? entry.examples[0] : (entry?.example || '');
    exampleWrap.hidden = !ex;
    example.textContent = ex || '';
    syn.textContent = joinMeta(entry?.synonyms);
    ant.textContent = joinMeta(entry?.antonyms);
    meta.textContent = [entry?.level, entry?.frequency ? `Frequency ${entry.frequency}` : ''].filter(Boolean).join(' · ') || 'Approved local dictionary';
    const listenBtn = document.getElementById('word-card-listen'); if (listenBtn) listenBtn.onclick = () => window.speakText?.(cleaned, listenBtn);
    const saveBtn = document.getElementById('word-card-save'); if (saveBtn) saveBtn.onclick = () => saveWord({word:cleaned, entry});
    const practiceBtn = document.getElementById('word-card-practice'); if (practiceBtn) practiceBtn.onclick = () => { closeWordCard(); openAuxHub('learn'); };
  };
  function joinMeta(v){ return Array.isArray(v)&&v.length ? v.join(', ') : (typeof v === 'string' && v ? v : '—'); }
  function inferPOS(word){
    if(/(?:ly)$/.test(word)) return 'Adverb';
    if(/(?:ing|ed)$/.test(word)) return 'Verb / participle';
    if(/(?:tion|ment|ness|ity)$/.test(word)) return 'Noun';
    if(/(?:ous|ful|ive|al|ic)$/.test(word)) return 'Adjective';
    return 'Word';
  }
  window.closeWordCard = function(){ const o=document.getElementById('word-card-overlay'); if(o) o.hidden=true; document.body.classList.remove('word-card-open'); };
  document.getElementById('word-card-overlay')?.addEventListener('click', e=>{ if(e.target.id==='word-card-overlay') closeWordCard(); });
  document.getElementById('aux-overlay')?.addEventListener('click', e=>{ if(e.target.id==='aux-overlay') closeAuxHub(); });
  document.getElementById('crop-overlay')?.addEventListener('click', e=>{ if(e.target.id==='crop-overlay') closePerspectiveCrop(); });
  document.addEventListener('keydown', e=>{
    if(e.key!=='Escape') return;
    const crop=document.getElementById('crop-overlay');
    const word=document.getElementById('word-card-overlay');
    const aux=document.getElementById('aux-overlay');
    if(crop && !crop.hidden){ e.preventDefault(); closePerspectiveCrop(); return; }
    if(word && !word.hidden){ e.preventDefault(); closeWordCard(); return; }
    if(aux && !aux.hidden){ e.preventDefault(); closeAuxHub(); return; }
  });

  async function saveWord({word, entry}){
    const record = {
      word,
      meaning_bn: entry?.meaning_bn || '',
      pos: entry?.pos || entry?.partOfSpeech || inferPOS(word),
      pronunciation: entry?.pronunciation || entry?.phonetic || '',
      examples: entry?.examples || (entry?.example ? [entry.example] : []),
      synonyms: entry?.synonyms || [], antonyms: entry?.antonyms || [],
      level: entry?.level || null, mastery: 0, reviewCount: 0, savedAt: Date.now(), lastReviewedAt: null
    };
    await idbPut('savedWords', record);
    window.showToast?.('Saved', `${word} added to My Vocabulary.`, 'success', 2200);
    refreshAux('saved');
  }

  // ---------------- LEARN / SAVED / MORE HUB ----------------
  window.openAuxHub = async function(mode='learn', btn){
    document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active')); if(btn) btn.classList.add('active');
    const overlay=document.getElementById('aux-overlay'); if(!overlay) return;
    overlay.hidden=false; document.body.classList.add('aux-open');
    await refreshAux(mode);
  };
  window.closeAuxHub = function(){const o=document.getElementById('aux-overlay'); if(o)o.hidden=true; document.body.classList.remove('aux-open');};
  async function refreshAux(mode='learn'){
    const title=document.getElementById('aux-title'), content=document.getElementById('aux-content'); if(!content) return;
    const saved=await idbGetAll('savedWords');
    if(mode==='saved'){
      title.textContent='Saved';
      content.innerHTML = saved.length ? `<div class="aux-stats"><div><strong>${saved.length}</strong><span>Saved words</span></div><div><strong>${saved.filter(x=>x.mastery>=80).length}</strong><span>Mastered</span></div></div><div class="saved-list">${saved.sort((a,b)=>b.savedAt-a.savedAt).map(w=>`<button class="saved-row" type="button" onclick="openWordCard('${escapeAttrSafe(w.word)}','','')"><span><b>${escapeHtmlSafe(w.word)}</b><small>${escapeHtmlSafe(w.meaning_bn||'Meaning unavailable')}</small></span><em>${escapeHtmlSafe(w.pos||'Word')}</em></button>`).join('')}</div>` : emptyPanel('No saved words yet','Tap any word in a scan to save it here.');
      return;
    }
    if(mode==='more'){
      title.textContent='More';
      content.innerHTML = `<div class="more-grid"><button class="more-item" onclick="openDictionarySearch()"><b>Search</b><span>English &amp; saved words</span></button><button class="more-item" onclick="openHistoryDrawer();closeAuxHub()"><b>History</b><span>Review previous scans</span></button><button class="more-item" onclick="document.getElementById('pdf-modal')?.removeAttribute('hidden');closeAuxHub()"><b>Export</b><span>PDF and learning data</span></button><button class="more-item" onclick="toggleReadingMode()"><b>Reading Mode</b><span>Focus on clean text</span></button><button class="more-item" onclick="showSettingsPanel()"><b>Settings</b><span>Appearance &amp; preferences</span></button><button class="more-item" onclick="backupLearningData()"><b>Backup</b><span>Save learning data locally</span></button><button class="more-item" onclick="document.getElementById('restore-input').click()"><b>Restore</b><span>Restore a previous backup</span></button><button class="more-item" onclick="openTutorPanel()"><b>Tutor</b><span>Explain words and sentences</span></button></div>`;
      return;
    }
    title.textContent='Learn';
    const review = saved.filter(w=>w.mastery<80).slice(0,8);
    content.innerHTML = `<div class="learning-hero"><span>DAILY GOAL</span><strong>${Math.min(saved.length,10)} / 10</strong><p>${saved.length ? 'Keep going — your next review is ready.' : 'Save words from a scan to begin.'}</p><button class="btn btn-outline" type="button" onclick="startLearningQuiz()" style="margin-top:14px;border-color:rgba(244,241,234,.35)!important;color:#F4F1EA!important">Start 5-word review</button></div><div class="aux-stats"><div><strong>${saved.length}</strong><span>Words learned</span></div><div><strong>${saved.filter(x=>x.reviewCount>0).length}</strong><span>Reviewed</span></div><div><strong>${saved.filter(x=>x.mastery>=80).length}</strong><span>Mastered</span></div></div><div class="section-heading"><h3>Review Queue</h3><span>${review.length} ready</span></div>${review.length?`<div class="review-list">${review.map(w=>`<button type="button" class="review-card" onclick="openWordCard('${escapeAttrSafe(w.word)}','','')"><b>${escapeHtmlSafe(w.word)}</b><span>${escapeHtmlSafe(w.meaning_bn||'Meaning unavailable')}</span><em>${escapeHtmlSafe(w.pos||'Word')}</em></button>`).join('')}</div>`:emptyPanel('No review queue','Your learning queue will appear after you save a few words.')}`;
  }
  window.refreshAux = refreshAux;
  function emptyPanel(title, text){ return `<div class="aux-empty"><strong>${title}</strong><span>${text}</span></div>`; }
  function escapeHtmlSafe(v){return String(v??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
  function escapeAttrSafe(v){return escapeHtmlSafe(v).replace(/'/g,'&#039;');}
  window.showSettingsPanel=function(){
    const content=document.getElementById('aux-content'); const title=document.getElementById('aux-title'); if(title) title.textContent='Settings';
    content.innerHTML=`<div class="settings-panel"><label>Appearance<select id="settings-theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><p>Your app follows the operating system by default. You can override it here.</p></div>`;
    const s=document.getElementById('settings-theme'); s.value=Theme.preference(); s.onchange=()=>Theme.set(s.value);
  };
  window.toggleReadingMode=function(){document.body.classList.toggle('reading-mode'); showToast?.('Reading Mode',document.body.classList.contains('reading-mode')?'Focus mode enabled.':'Focus mode disabled.','info',1800);};

  // ---------------- RESPONSIVE / MOBILE TABS ----------------
  // Keep original app behavior for scanner/sentences/vocabulary; extra tabs use aux hub.
  const originalSwitch = window.switchMobileTab;
  window.switchMobileTab = function(tabName, btn){
    if(['learn','saved','more'].includes(tabName)) return openAuxHub(tabName, btn);
    return originalSwitch ? originalSwitch(tabName, btn) : undefined;
  };

  // ---------------- PERSPECTIVE CROP ----------------
  window.openPerspectiveCrop=function(){
    const state = window.OrthobittoAppState;
    const overlay=document.getElementById('crop-overlay');
    const img=document.getElementById('crop-image');
    const preview=document.getElementById('preview-img');
    const src = state?.imageDataURL || (preview?.dataset?.imageSrc || '');
    if(!overlay || !img) return;
    if(!src){
      window.showToast?.('No image','Upload or capture an image before adjusting corners.','warning',2600);
      closePerspectiveCrop();
      return;
    }
    cropState = null;
    overlay.hidden=false;
    document.body.classList.add('crop-open');
    img.onload=()=>{ setupCropHandles(); requestAnimationFrame(()=>document.getElementById('crop-close-btn')?.focus()); };
    img.onerror=()=>{
      closePerspectiveCrop();
      window.showToast?.('Crop preview unavailable','The selected image could not be loaded.','error',3200);
    };
    img.src=src;
    if(img.complete && img.naturalWidth) setupCropHandles();
  };
  window.closePerspectiveCrop=function(){
    const o=document.getElementById('crop-overlay');
    if(o) o.hidden=true;
    const img=document.getElementById('crop-image');
    if(img){ img.onload=null; img.onerror=null; }
    cropState=null;
    document.body.classList.remove('crop-open');
  };
  function setupCropHandles(){
    const img=document.getElementById('crop-image'), stage=document.getElementById('crop-stage'); if(!img||!stage||!img.naturalWidth)return;
    cropState={points:{tl:{x:0.08,y:0.08},tr:{x:0.92,y:0.08},br:{x:0.92,y:0.92},bl:{x:0.08,y:0.92}}};
    stage.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`; stage.style.height = 'auto';
    document.querySelectorAll('.crop-handle').forEach(h=>{
      const key=h.dataset.corner;
      const move=e=>{
        e.preventDefault();
        if(!cropState) return;
        const r=stage.getBoundingClientRect();
        const x=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width));
        const y=Math.min(1,Math.max(0,(e.clientY-r.top)/r.height));
        cropState.points[key]={x,y};
        renderCrop();
      };
      const stop=()=>{
        if(h._move) h.removeEventListener('pointermove',h._move);
        h._move=null;
      };
      h.onpointerdown=e=>{
        e.preventDefault();
        h.setPointerCapture?.(e.pointerId);
        h._move=move;
        h.addEventListener('pointermove',move);
      };
      h.onpointerup=stop;
      h.onpointercancel=stop;
      h.onlostpointercapture=stop;
    });
    renderCrop();
  }
  function renderCrop(){
    const stage=document.getElementById('crop-stage'), poly=document.getElementById('crop-polygon'); if(!stage||!poly||!cropState)return;
    const r=stage.getBoundingClientRect(); const p=cropState.points;
    const px=k=>`${p[k].x*100}% ${p[k].y*100}%`;
    poly.style.clipPath=`polygon(${px('tl')},${px('tr')},${px('br')},${px('bl')})`;
    for(const k of ['tl','tr','br','bl']){const el=document.querySelector(`.crop-${k}`); if(el){el.style.left=`calc(${p[k].x*100}% - 12px)`;el.style.top=`calc(${p[k].y*100}% - 12px)`;}}
  }
  window.applyPerspectiveCrop=async function(){
    const img=document.getElementById('crop-image');
    if(!img||!cropState||!img.naturalWidth){
      closePerspectiveCrop();
      return;
    }
    if(!isValidCropQuad(cropState.points)){
      window.showToast?.('Invalid crop','Keep the four corners inside the image and avoid crossing the document outline.','warning',3200);
      return;
    }
    try{
      const out=await perspectiveCrop(img,cropState.points);
      if(out){
        if(window.OrthobittoAppState) window.OrthobittoAppState.imageDataURL=out;
        const preview=document.getElementById('preview-img');
        if(preview){ preview.src=out; preview.dataset.imageSrc=out; preview.style.transform=''; preview.style.filter=''; }
        closePerspectiveCrop();
        window.showToast?.('Crop applied','Document perspective adjusted.','success',1800);
      }
    }catch(err){
      console.error('[Crop] Failed:',err);
      window.showToast?.('Crop failed','The original image was kept unchanged.','error',3200);
    }
  };
  function isValidCropQuad(p){
    if(!p?.tl||!p?.tr||!p?.br||!p?.bl) return false;
    const pts=[p.tl,p.tr,p.br,p.bl];
    if(pts.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y)||q.x<0||q.x>1||q.y<0||q.y>1)) return false;
    const area=Math.abs(pts.reduce((sum,a,i)=>{const b=pts[(i+1)%pts.length];return sum+(a.x*b.y-b.x*a.y);},0))/2;
    if(area < 0.02) return false;
    const cross=(a,b,c)=>(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
    const signs=[cross(pts[0],pts[1],pts[2]),cross(pts[1],pts[2],pts[3]),cross(pts[2],pts[3],pts[0]),cross(pts[3],pts[0],pts[1])].map(Math.sign).filter(Boolean);
    return signs.length===4 && (signs.every(s=>s>0)||signs.every(s=>s<0));
  }
  async function perspectiveCrop(img,p){
    const srcW=img.naturalWidth, srcH=img.naturalHeight; if(!srcW||!srcH)return null;
    const dstW=Math.max(640,Math.min(1800,Math.round(srcW*Math.max(p.tr.x-p.tl.x,p.br.x-p.bl.x))));
    const dstH=Math.max(640,Math.min(1800,Math.round(srcH*Math.max(p.bl.y-p.tl.y,p.br.y-p.tr.y))));
    const canvas=document.createElement('canvas'); canvas.width=dstW; canvas.height=dstH;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}); const tmp=document.createElement('canvas'); tmp.width=srcW;tmp.height=srcH; const tctx=tmp.getContext('2d',{willReadFrequently:true});tctx.drawImage(img,0,0); const data=tctx.getImageData(0,0,srcW,srcH), out=ctx.createImageData(dstW,dstH);
    const src=[p.tl.x*srcW,p.tl.y*srcH,p.tr.x*srcW,p.tr.y*srcH,p.br.x*srcW,p.br.y*srcH,p.bl.x*srcW,p.bl.y*srcH];
    const H=homography(src,dstW,dstH); const inv=invert3(H);
    if(!inv) throw new Error('homography');
    const sx=(x,y)=>{const den=inv[6]*x+inv[7]*y+inv[8];return [(inv[0]*x+inv[1]*y+inv[2])/den,(inv[3]*x+inv[4]*y+inv[5])/den];};
    for(let y=0;y<dstH;y++){
      for(let x=0;x<dstW;x++){
        const [fx,fy]=sx(x,y); const ix=Math.floor(fx), iy=Math.floor(fy), dx=fx-ix,dy=fy-iy, oi=(y*dstW+x)*4;
        if(ix<0||iy<0||ix>=srcW-1||iy>=srcH-1){out.data[oi+3]=255;continue;}
        const i00=(iy*srcW+ix)*4,i10=i00+4,i01=i00+srcW*4,i11=i01+4;
        for(let c=0;c<3;c++) out.data[oi+c]=data.data[i00+c]*(1-dx)*(1-dy)+data.data[i10+c]*dx*(1-dy)+data.data[i01+c]*(1-dx)*dy+data.data[i11+c]*dx*dy;
        out.data[oi+3]=255;
      }
    }
    ctx.putImageData(out,0,0); return canvas.toDataURL('image/jpeg',0.92);
  }
  function homography(s,dw,dh){const dx=[0,dw,dw,0],dy=[0,0,dh,dh], sx=[s[0],s[2],s[4],s[6]],sy=[s[1],s[3],s[5],s[7]];const A=[],b=[];for(let i=0;i<4;i++){const x=dx[i],y=dy[i],u=sx[i],v=sy[i];A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);}const h=gaussSolve(A,b);return h?[h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1]:null;}
  function gaussSolve(A,b){const n=8;for(let i=0;i<n;i++){let p=i;for(let r=i+1;r<n;r++)if(Math.abs(A[r][i])>Math.abs(A[p][i]))p=r;if(Math.abs(A[p][i])<1e-10)return null;[A[i],A[p]]=[A[p],A[i]];[b[i],b[p]]=[b[p],b[i]];const q=A[i][i];for(let c=i;c<n;c++)A[i][c]/=q;b[i]/=q;for(let r=0;r<n;r++){if(r===i)continue;const f=A[r][i];if(!f)continue;for(let c=i;c<n;c++)A[r][c]-=f*A[i][c];b[r]-=f*b[i];}}return b;}
  function invert3(m){const [a,b,c,d,e,f,g,h,i]=m,det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);if(Math.abs(det)<1e-10)return null;return [(e*i-f*h)/det,(c*h-b*i)/det,(b*f-c*e)/det,(f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det,(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det];}

  // ---------------- SIMPLE GRAMMAR / READING TOOLS ----------------
  window.openSentenceTools = function(sentence=''){
    const text=sentence||''; const subject=(text.match(/^(I|You|He|She|It|We|They|This|That|The [^, ]+)/i)||[])[1]||'Subject not detected';
    const tense=/\b(was|were|did|had)\b/i.test(text)?'Past / past construction':/\b(is|am|are|has|have|do|does)\b/i.test(text)?'Present construction':'General / context dependent';
    window.showToast?.('Grammar Lens',`${subject} · ${tense}`,'info',3000);
  };


  // ---------------- LEARNING QUIZ ----------------
  window.startLearningQuiz = async function(){
    const saved=await idbGetAll('savedWords');
    const pool=saved.filter(w=>w.meaning_bn).sort(()=>Math.random()-.5).slice(0,5);
    const content=document.getElementById('aux-content'), title=document.getElementById('aux-title');
    if(!pool.length){content.innerHTML=emptyPanel('Quiz is not ready yet','Save at least one word with an approved meaning.');return;}
    title.textContent='Review Quiz';
    let index=0, score=0;
    const render=()=>{
      const item=pool[index];
      const choices=[item.meaning_bn,...pool.filter(x=>x.word!==item.word).sort(()=>Math.random()-.5).slice(0,3).map(x=>x.meaning_bn)].sort(()=>Math.random()-.5);
      content.innerHTML=`<div class="quiz-card"><span class="aux-kicker">QUESTION ${index+1} / ${pool.length}</span><h3>${escapeHtmlSafe(item.word)}</h3><p>Which Bengali meaning matches this word?</p><div class="quiz-options">${choices.map(c=>`<button type="button" class="quiz-option" data-answer="${escapeAttrSafe(c)}">${escapeHtmlSafe(c)}</button>`).join('')}</div></div>`;
      content.querySelectorAll('.quiz-option').forEach(btn=>btn.onclick=async()=>{const correct=btn.dataset.answer===item.meaning_bn; if(correct){score++;btn.classList.add('is-correct');await idbPut('savedWords',{...item,mastery:Math.min(100,(item.mastery||0)+20),reviewCount:(item.reviewCount||0)+1,lastReviewedAt:Date.now()});} else {btn.classList.add('is-wrong');await idbPut('savedWords',{...item,mastery:Math.max(0,(item.mastery||0)-10),reviewCount:(item.reviewCount||0)+1,lastReviewedAt:Date.now()});} setTimeout(()=>{index++; if(index<pool.length) render(); else content.innerHTML=`<div class="learning-hero"><span>REVIEW COMPLETE</span><strong>${score} / ${pool.length}</strong><p>${score===pool.length?'Excellent review session.':'Keep practicing — your weak words will return.'}</p></div><button class="btn btn-primary" style="margin-top:14px;width:100%" onclick="refreshAux('learn')">Back to Learn</button>`;},450);});
    };
    render();
  };

  // ---------------- DICTIONARY SEARCH ----------------
  window.openDictionarySearch = async function(){
    const title=document.getElementById('aux-title'), content=document.getElementById('aux-content'); title.textContent='Search';
    content.innerHTML=`<div class="search-panel"><input id="word-search-input" class="search-input" type="search" placeholder="Search an English word…" autocomplete="off"/><div id="word-search-results" class="search-results"><div class="aux-empty"><strong>Search Orthobitto</strong><span>Type a word to search the approved local dictionary and your saved words.</span></div></div></div>`;
    const input=document.getElementById('word-search-input');
    let timer; input.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>runSearch(input.value),120);}; input.focus();
  };
  async function runSearch(q){
    const results=document.getElementById('word-search-results'); if(!results)return; const term=String(q||'').trim().toLowerCase();
    const saved=await idbGetAll('savedWords'); if(!term){results.innerHTML=emptyPanel('Search Orthobitto','Type at least two letters.');return;}
    await window.OrthobittoDictionary?.ready();
    const local=[];
    const entries=window.OrthobittoDictionary && typeof window.OrthobittoDictionary.size==='function' ? window.OrthobittoDictionary.size() : 0;
    // Dictionary engine intentionally exposes lookup only; search local saved words first, then a small candidate window via known OCR history.
    saved.filter(x=>x.word.includes(term)).slice(0,20).forEach(x=>local.push(x));
    if(local.length) results.innerHTML=local.map(x=>`<button class="saved-row" type="button" onclick="openWordCard('${escapeAttrSafe(x.word)}','','')"><span><b>${escapeHtmlSafe(x.word)}</b><small>${escapeHtmlSafe(x.meaning_bn||'Meaning unavailable')}</small></span><em>${escapeHtmlSafe(x.pos||'Word')}</em></button>`).join('');
    else results.innerHTML=`<div class="aux-empty"><strong>${escapeHtmlSafe(term)}</strong><span>No saved match found. Use Scan to resolve words from the approved local dictionary.</span></div>`;
  }

  // ---------------- LOCAL BACKUP / RESTORE ----------------
  window.backupLearningData=async function(){
    const saved=await idbGetAll('savedWords');
    const payload={version:1,product:'Orthobitto',createdAt:new Date().toISOString(),savedWords:saved,theme:Theme.preference()};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`orthobitto-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href); window.showToast?.('Backup ready',`${saved.length} saved words exported.`,'success',2200);
  };
  window.restoreLearningData=async function(file){
    try{const payload=JSON.parse(await file.text()); if(!Array.isArray(payload.savedWords))throw new Error('Invalid backup'); for(const w of payload.savedWords){if(w?.word) await idbPut('savedWords',w);} if(payload.theme) Theme.set(payload.theme); window.showToast?.('Restore complete',`${payload.savedWords.length} learning records restored.`,'success',2500); refreshAux('saved');}catch(e){window.showToast?.('Restore failed','That backup file is not a valid Orthobitto backup.','error');}
  };

  // ---------------- TUTOR ADAPTER ----------------
  window.openTutorPanel=function(){
    const title=document.getElementById('aux-title'), content=document.getElementById('aux-content'); title.textContent='Tutor';
    content.innerHTML=`<div class="tutor-panel"><p class="tutor-intro">Ask about an English word or sentence. Orthobitto keeps dictionary meanings anchored to its approved local data; optional AI connectivity can be added later without changing the core dictionary.</p><input id="tutor-input" class="search-input" placeholder="e.g. What does “abandon” mean in context?"/><button class="btn btn-primary" style="width:100%;margin-top:10px" onclick="askTutor()">Explain</button><div id="tutor-output" class="tutor-output"></div></div>`;
  };
  window.askTutor=async function(){
    const input=document.getElementById('tutor-input'), out=document.getElementById('tutor-output'); if(!input||!out)return; const q=input.value.trim(); if(!q)return;
    const wordMatch=q.match(/[A-Za-z]{2,}/); const w=wordMatch?.[0]||''; let answer='';
    if(w){const entry=await window.OrthobittoDictionary?.ready().then(()=>window.OrthobittoDictionary.lookup(w)).catch(()=>null); if(entry) answer=`<b>${escapeHtmlSafe(w)}</b><br><span>${escapeHtmlSafe(entry.meaning_bn)}</span><br><small>${escapeHtmlSafe(entry.pos||'Word')}</small>`;}
    if(!answer) answer='<span>Core tutor is ready for dictionary-grounded explanations. Add an approved word to a scan or connect an external AI provider later for open-ended explanations.</span>';
    out.innerHTML=answer;
  };

  document.addEventListener('DOMContentLoaded',()=>{
    const restore=document.createElement('input'); restore.type='file'; restore.accept='.json,application/json'; restore.id='restore-input'; restore.hidden=true; restore.onchange=()=>{if(restore.files[0])restoreLearningData(restore.files[0]);}; document.body.appendChild(restore);
  });

  // Keyboard and overlay safety.
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'){closeWordCard();closeAuxHub();closePerspectiveCrop();} });
  document.addEventListener('DOMContentLoaded',()=>{Theme.init(); openDB();});
})();
