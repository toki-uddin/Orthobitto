'use strict';
window.OrthobittoSafety = (() => {
  const BLOCKED_INPUT_PATTERNS = [
    /(?:^|[^a-z])(fuck|fucking|fucked|fucker|shit|bullshit|bitch|bastard|cunt)(?:[^a-z]|$)/i,
    /(?:^|[^a-z])(dick|cock|pussy|whore|slut|porn|porno|semen|cum)(?:[^a-z]|$)/i,
    /(?:^|[^a-z])(blowjob|handjob|creampie|orgasm|masturbat\w*|rape|rapist)(?:[^a-z]|$)/i,
    /(?:^|[^a-z])(nigger|nigga|fag|faggot|retard)(?:[^a-z]|$)/i,
    /চোদাচুদি|চোদা|চুদা|চুদাচুদি|যৌনসঙ্গম|যৌনমিলন|শ্লীলতাহানি|নোংরা যৌন/i
  ];
  const BLOCKED_MEANING_TERMS = ['চোদাচুদি','চোদা','চুদা','চুদাচুদি','যৌনসঙ্গম','যৌনমিলন','শ্লীলতাহানি','অশ্লীল','অশালীন','নোংরা যৌন'];
  function normalize(value){
    return String(value || '').normalize('NFKC').toLowerCase()
      .replace(/[0-9]/g,'')
      .replace(/[\u200B-\u200D\uFEFF]/g,'')
      .replace(/[._\-\s]+/g,' ')
      .trim();
  }
  function containsBlockedContent(text){
    const value = normalize(text);
    return BLOCKED_INPUT_PATTERNS.some(re => re.test(value));
  }
  function isApprovedMeaning(meaning){
    const text = String(meaning || '').normalize('NFKC').replace(/\s+/g,' ').trim();
    if (!text || !/[\u0980-\u09FF]/.test(text)) return false;
    const lower = text.toLowerCase();
    return !BLOCKED_MEANING_TERMS.some(term => lower.includes(term));
  }
  function sanitizeForLearning(text){ return containsBlockedContent(text) ? null : text; }
  return { normalize, containsBlockedContent, isApprovedMeaning, sanitizeForLearning };
})();
