/* ============================================================
   1. Build a JS-side word dictionary from every card on the page
   Lazy-loaded per chapter: only inlined chapters' cards are indexed
   here; for other chapters, dict/chN.json is fetched on first lookup.
   ============================================================ */
const wordIndex = new Map();   // lowercased word -> { meta, cardId }
const phraseIndex = new Map();  // joined phrase -> { meta, cardId }
const dictLoaded = new Set();  // chapter ids whose dict JSON has been loaded

// Index inlined chapters (ch1+ch2) immediately
document.querySelectorAll('.word-card').forEach(card => {
  const main = card.querySelector('.word-main')?.textContent.trim();
  const ipa  = card.querySelector('.word-ipa')?.textContent.trim() || '';
  const pos  = card.querySelector('.word-pos')?.textContent.trim() || '';
  const def  = card.querySelector('.def-block .text')?.textContent.trim() || '';
  if (!main) return;
  const key = main.toLowerCase();
  if (!wordIndex.has(key)) {
    const cardId = card.id || ('w_' + main.replace(/\W+/g,'_'));
    card.id = cardId;
    wordIndex.set(key, { main, ipa, pos, def, cardId });
    phraseIndex.set(key, wordIndex.get(key));
    // Mark the section containing this card as indexed
    const sec = card.closest('section[data-chapter]');
    if (sec && sec.dataset.chapter) dictLoaded.add(sec.dataset.chapter);
  }
});

// Lazy loader: fetch dict/chN.json on first miss, then retry lookup
async function ensureDictLoaded(chapterId) {
  if (!chapterId || dictLoaded.has(chapterId)) return;
  dictLoaded.add(chapterId);
  try {
    const num = chapterId.replace('ch', '');
    const r = await fetch(`./ch_data/dict/ch${num}.json`, { cache: 'force-cache' });
    if (!r.ok) return;
    const arr = await r.json();
    for (const [key, val] of arr) {
      if (!wordIndex.has(key)) wordIndex.set(key, val);
      if (!phraseIndex.has(key)) phraseIndex.set(key, val);
    }
  } catch (e) { /* swallow — wordIndex stays partial */ }
}

/* ============================================================
   2. Selection popup
   ============================================================ */
const popup = document.getElementById('popup');
let popupHideTimer = null;

function showPopup(selection) {
  const text = selection.toString().trim();
  if (!text || text.length > 60) { hidePopup(); return; }
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (!rect.width) { hidePopup(); return; }

  // Try exact single-word match first
  const lower = text.toLowerCase();
  let hit = wordIndex.get(lower);

  // If multi-word, try the longest word in the selection
  if (!hit) {
    const words = text.split(/\s+/);
    for (let i = words.length; i > 0; i--) {
      const candidate = words.slice(0, i).join(' ').toLowerCase();
      if (wordIndex.has(candidate)) { hit = wordIndex.get(candidate); break; }
    }
  }

  // Lazy: if still no hit, try fetching the dict JSON for the closest
  // chapter (find the chapter the selection sits in, or fall back to all
  // 22 chapters in parallel). One fetch ≈ 50-200KB, 100-300ms on 4G.
  if (!hit) {
    const ch = selection.anchorNode && selection.anchorNode.nodeType === 1
      ? selection.anchorNode.closest('section[data-chapter]')
      : (selection.anchorNode && selection.anchorNode.parentElement
          && selection.anchorNode.parentElement.closest('section[data-chapter]'));
    const chId = ch ? ch.dataset.chapter : null;
    // Show "loading" popup immediately, then refresh once dict loads
    popup.classList.remove('notfound');
    popup.innerHTML = `<div class="pword">${text}</div><div class="pnote">Loading definition…</div>`;
    showPopupAt(rect);
    if (chId) {
      ensureDictLoaded(chId).then(() => {
        const lower2 = text.toLowerCase();
        let hit2 = wordIndex.get(lower2);
        if (!hit2) {
          const words2 = text.split(/\s+/);
          for (let i = words2.length; i > 0; i--) {
            const candidate2 = words2.slice(0, i).join(' ').toLowerCase();
            if (wordIndex.has(candidate2)) { hit2 = wordIndex.get(candidate2); break; }
          }
        }
        if (hit2) {
          popup.classList.remove('notfound');
          popup.innerHTML = `
            <div class="pword">${hit2.main}
              <button class="speak-btn" id="popupSpeak" title="Read aloud">🔊</button>
            </div>
            <div><span class="pipa">${hit2.ipa}</span>
                 <span class="ppos">${hit2.pos}</span></div>
            <div class="pdef">${hit2.def}</div>
            <div class="paction">
              <a href="#${hit2.cardId}">Jump to full card →</a>
              <span style="color:var(--muted)">·</span>
              <a href="https://www.oxfordlearnersdictionaries.com/definition/english/${encodeURIComponent(hit2.main.toLowerCase().replace(/\s+/g,'-'))}" target="_blank" rel="noopener">Oxford entry ↗</a>
            </div>`;
          const btn = document.getElementById('popupSpeak');
          if (btn) btn.onclick = e => { e.stopPropagation(); speak(hit2.main); };
        } else {
          popup.classList.add('notfound');
          const oaldGuess = text.toLowerCase().trim().split(/\s+/)[0];
          popup.innerHTML = `<div class="pword">${text}</div>
            <div class="pnote">Not in this glossary. Try the Oxford Learner's Dictionary.</div>
            <div class="paction">
              <a href="https://www.oxfordlearnersdictionaries.com/definition/english/${encodeURIComponent(oaldGuess)}" target="_blank" rel="noopener">Look up in Oxford ↗</a>
            </div>`;
        }
      });
      return;
    }
  }

  if (hit) {
    popup.classList.remove('notfound');
    popup.innerHTML = `
      <div class="pword">${hit.main}
        <button class="speak-btn" id="popupSpeak" title="Read aloud">🔊</button>
      </div>
      <div><span class="pipa">${hit.ipa}</span>
           <span class="ppos">${hit.pos}</span></div>
      <div class="pdef">${hit.def}</div>
      <div class="paction">
        <a href="#${hit.cardId}">Jump to full card →</a>
        <span style="color:var(--muted)">·</span>
        <a href="https://www.oxfordlearnersdictionaries.com/definition/english/${encodeURIComponent(hit.main.toLowerCase().replace(/\s+/g,'-'))}" target="_blank" rel="noopener">Oxford entry ↗</a>
      </div>`;
    document.getElementById('popupSpeak').onclick = e => {
      e.stopPropagation();
      speak(hit.main);
    };
  } else {
    popup.classList.add('notfound');
    const oaldGuess = text.toLowerCase().trim().split(/\s+/)[0];
    popup.innerHTML = `
      <div class="pword">${text}</div>
      <div class="pnote">Not in this glossary. Try the Oxford Learner's Dictionary for any word.</div>
      <div class="paction">
        <a href="https://www.oxfordlearnersdictionaries.com/definition/english/${encodeURIComponent(oaldGuess)}" target="_blank" rel="noopener">Look up in Oxford ↗</a>
      </div>`;
  }

  // Position near the selection — prefer ABOVE the selection (so it
  // never gets clipped by the sidebar). Fall back to below if no room.
  const popupWidth  = Math.min(380, window.innerWidth - 32);
  const popupHeight = popup.offsetHeight || 140;   // estimate before paint
  const margin = 12;
  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;
  let left = rect.left + window.scrollX;
  let top;
  if (spaceAbove >= popupHeight + 16 || spaceAbove > spaceBelow) {
    // above the selection
    top = rect.top + window.scrollY - popupHeight - 8;
  } else {
    // below the selection
    top = rect.bottom + window.scrollY + 8;
  }
  if (left + popupWidth > window.innerWidth - margin) {
    left = window.innerWidth - popupWidth - margin;
  }
  popup.style.left = Math.max(margin, left) + 'px';
  popup.style.top  = Math.max(margin, top) + 'px';
  popup.classList.add('show');

  clearTimeout(popupHideTimer);
  popupHideTimer = setTimeout(hidePopup, 8000);
}

function hidePopup() {
  popup.classList.remove('show');
}

document.addEventListener('mouseup', e => {
  // ignore clicks inside the popup itself
  if (popup.contains(e.target)) return;
  // delay 10ms so the browser finalises the selection range
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { hidePopup(); return; }
    const txt = sel.toString().trim();
    if (!txt) { hidePopup(); return; }
    showPopup(sel);
  }, 10);
});
document.addEventListener('mousedown', e => {
  if (!popup.contains(e.target)) {
    // delay 50ms so a fresh mousedown→mouseup→click on a word-main
    // can still fire the click handler below
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) hidePopup();
    }, 50);
  }
});

// Click on any word-main (or its sub-element except speak-btn)
// → auto-select that word + show popup
document.addEventListener('click', e => {
  if (popup.contains(e.target)) return;
  if (e.target.closest('.speak-btn')) return;        // don't fight the speaker button
  const main = e.target.closest('.word-main');
  if (!main) return;
  e.preventDefault();
  // select the word text only (not the speak button)
  const range = document.createRange();
  range.selectNodeContents(main);
  // skip the trailing speak-btn if present
  const last = main.lastChild;
  if (last && last.classList && last.classList.contains('speak-btn')) {
    range.setEndBefore(last);
  }
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  showPopup(sel);
});

/* ============================================================
   3. Web Speech API — TTS
   ============================================================ */
let cachedVoice = null;
function pickEnglishVoice() {
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  // Prefer high-quality English voices
  const preferred = [
    'Google US English', 'Google UK English Female', 'Google UK English Male',
    'Microsoft Aria Online (Natural) - English (United States)',
    'Microsoft Guy Online (Natural) - English (United States)',
    'Microsoft Jenny Online (Natural) - English (United States)',
    'Microsoft Hazel - English (Great Britain)',
    'Samantha', 'Alex', 'Daniel', 'Karen', 'Moira', 'Tessa'
  ];
  for (const name of preferred) {
    const v = voices.find(v => v.name === name);
    if (v) { cachedVoice = v; return v; }
  }
  // Fallback: first en-US or en-GB
  cachedVoice = voices.find(v => v.lang === 'en-US' || v.lang === 'en-GB')
             || voices.find(v => v.lang.startsWith('en'))
             || voices[0];
  return cachedVoice;
}
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = pickEnglishVoice;
}

function speak(text) {
  if (!window.speechSynthesis) {
    const s = document.getElementById('voiceStatus');
    if (s) s.textContent = '⚠ TTS not supported';
    return;
  }
  try { window.speechSynthesis.cancel(); } catch (e) {}
  const u = new SpeechSynthesisUtterance(text);
  const v = pickEnglishVoice();
  if (v) { u.voice = v; u.lang = v.lang; }
  else {
    // No voice picked yet (TTS not yet warm on this device) — fall back
    // to a sensible default. Browser will use its built-in default voice
    // for this lang, which always works.
    u.lang = 'en-US';
  }
  u.rate = 0.92; u.pitch = 1;
  const s = document.getElementById('voiceStatus');
  u.onstart = () => { if (s) s.textContent = '🔊 Speaking…'; };
  u.onend = u.onerror = () => { if (s) s.textContent = ''; };
  try {
    window.speechSynthesis.speak(u);
  } catch (e) {
    if (s) s.textContent = '⚠ TTS failed';
  }
  // Re-attempt voice pick in case the first speak() warmed up the engine
  if (!v) setTimeout(pickEnglishVoice, 50);
}

// Strip all emoji & pictographic code points from any string before TTS
function cleanForTTS(s) {
  return s
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')        // most emoji blocks
    .replace(/[\u{2600}-\u{27BF}]/gu, '')          // misc symbols / dingbats
    .replace(/[\u{2300}-\u{23FF}]/gu, '')          // misc technical
    .replace(/[↗→←↑↓✓✗★☆●○■□▪▫•…“”‘’""]/g, '')  // common arrows/symbols/curly quotes
    .replace(/\s+/g, ' ')
    .trim();
}

// Wire every word head with a 🔊 button (or insert one if missing)
document.querySelectorAll('.word-card').forEach(card => {
  const main = card.querySelector('.word-main');
  if (!main) return;
  if (!card.querySelector('.speak-btn')) {
    const btn = document.createElement('button');
    btn.className = 'speak-btn';
    btn.textContent = '🔊';
    btn.title = 'Read aloud';
    // Use the first text node (the actual word), not main.textContent
    // (which would also include the appended speak-btn emoji)
    btn.onclick = e => {
      e.stopPropagation();
      // Get the clean word from the data structure (always a clean string)
      const wordKey = (main.textContent || '').trim().toLowerCase();
      const entry = wordIndex.get(wordKey);
      const word = entry ? entry.main : cleanForTTS(main.firstChild ? main.firstChild.textContent : main.textContent);
      speak(word);
    };
    main.appendChild(btn);
  }
});

/* ============================================================
   3b. Definition audio — personal recordings (ch1 first 10 words)
   Word main → file slug map. Audio plays if file exists; TTS fallback otherwise.
   Does not alter word-head 🔊, search, popup, dark mode, PWA, or TTS.
   ============================================================ */
const DEF_AUDIO = {
  'atmosphere':     'audio/ch1-atmosphere.mp3',
  'hydrosphere':    'audio/ch1-hydrosphere.mp3',
  'lithosphere':    'audio/ch1-lithosphere.mp3',
  'oxygen':         'audio/ch1-oxygen.mp3',
  'oxide':          'audio/ch1-oxide.mp3',
  'carbon dioxide': 'audio/ch1-carbon-dioxide.mp3',
  'hydrogen':       'audio/ch1-hydrogen.mp3',
  'core':           'audio/ch1-core.mp3',
  'crust':          'audio/ch1-crust.mp3',
  'mantle':         'audio/ch1-mantle.mp3',
};
let currentDefAudio = null;
function playDefAudio(btn, src, defText) {
  if (currentDefAudio) {
    currentDefAudio.pause();
    currentDefAudio.currentTime = 0;
    if (currentDefAudio._btn) currentDefAudio._btn.classList.remove('is-playing');
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  // Show ⏳ loading state immediately
  btn.classList.add('is-loading');
  const audio = new Audio(src);
  currentDefAudio = audio;
  audio._btn = btn;
  // Browser fires canplaythrough when buffer is ready; mark playing
  audio.addEventListener('canplay', () => {
    btn.classList.remove('is-loading');
    btn.classList.add('is-playing');
  }, { once: true });
  audio.addEventListener('ended', () => {
    btn.classList.remove('is-playing');
    btn.classList.remove('is-loading');
    if (currentDefAudio === audio) currentDefAudio = null;
  });
  audio.addEventListener('error', () => {
    btn.classList.remove('is-playing');
    btn.classList.remove('is-loading');
    btn.classList.add('is-fallback');
    btn.title = 'Audio not loaded — using TTS';
    if (currentDefAudio === audio) currentDefAudio = null;
    speak(cleanForTTS(defText));
  });
  // If browser already has the audio in HTTP cache, canplay may not fire
  // reliably. Fall back: clear loading state on first timeupdate too.
  audio.addEventListener('playing', () => {
    btn.classList.remove('is-loading');
  }, { once: true });
  audio.play().catch(() => {
    btn.classList.remove('is-loading');
    btn.classList.remove('is-playing');
    btn.classList.add('is-fallback');
    btn.title = 'Audio blocked — using TTS';
    if (currentDefAudio === audio) currentDefAudio = null;
    speak(cleanForTTS(defText));
  });
}
document.querySelectorAll('.word-card').forEach(card => {
  const main = card.querySelector('.word-main');
  const defBlock = card.querySelector('.def-block');
  if (!main || !defBlock) return;
  // Use first text node (the actual word) to avoid the appended 🔊 button text
  const wordKey = (main.firstChild ? main.firstChild.textContent : main.textContent || '').trim().toLowerCase();
  let src = null;
  for (const [k, v] of Object.entries(DEF_AUDIO)) {
    if (k === wordKey) { src = v; break; }
  }
  if (!src) return;
  const label = defBlock.querySelector('.label');
  if (!label || defBlock.querySelector('.def-speak-btn')) return;
  const btn = document.createElement('button');
  btn.className = 'def-speak-btn';
  btn.type = 'button';
  btn.innerHTML = '🎤 listen';
  btn.title = 'Play personal definition recording';
  const defText = (defBlock.querySelector('.text') || {}).textContent || '';
  btn.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    playDefAudio(btn, src, defText);
  });
  label.appendChild(btn);
});

/* ============================================================
   4. Search — Find & Jump (replaces the old "filter" behaviour)
   ============================================================ */
const q = document.getElementById('q');
const qClear = document.getElementById('qClear');
const searchBar = document.getElementById('searchBar');
const searchResults = document.getElementById('searchResults');

// Search index — 2 phases:
//  1. Inline hints (word/wordLower/chapterId) so the search box is
//     responsive on first keystroke without any network call.
//  2. Full haystack text is fetched lazily on first search keystroke
//     (ch_data/search-index.json, ~80KB) and merged into the same array.
const _searchHints = JSON.parse(document.getElementById('searchIndexData').textContent);
const searchIndex = [];
const _cardById = new Map();
document.querySelectorAll('.word-card').forEach(card => {
  if (card.id) _cardById.set(card.id, card);
});
for (const [word, wordLower, chapterId] of _searchHints) {
  searchIndex.push({
    word, wordLower, ipa: '', ipaLower: '', chapterId,
    cardId: 'w_' + word.replace(/\W+/g, '_'),
    card: _cardById.get('w_' + word.replace(/\W+/g, '_')),
    hay: wordLower  // upgraded below on first search
  });
}
let searchHayLoaded = false;
async function ensureSearchHayLoaded() {
  if (searchHayLoaded) return;
  searchHayLoaded = true;
  try {
    const r = await fetch('./ch_data/search-index.json', { cache: 'force-cache' });
    if (!r.ok) return;
    const arr = await r.json();
    // arr entries: [word, wordLower, ipa, ipaLower, chapterId, cardId]
    // We don't store hay on server (would be too big). Instead, on
    // first search we lazily build hay from each card's DOM.
    for (const [w, wl, ipa, ipaLower, ch, cardId] of arr) {
      const idx = searchIndex.findIndex(s => s.wordLower === wl);
      if (idx >= 0) {
        searchIndex[idx].ipa = ipa;
        searchIndex[idx].ipaLower = ipaLower;
        searchIndex[idx].cardId = cardId;
        if (!searchIndex[idx].card) {
          const card = _cardById.get(cardId);
          if (card) searchIndex[idx].card = card;
        }
      }
    }
  } catch (e) { /* swallow — search still works with hints */ }
}
// Kick off the search-hay fetch immediately (idempotent, fast on cache)
if ('requestIdleCallback' in window) {
  requestIdleCallback(ensureSearchHayLoaded, { timeout: 2000 });
} else {
  setTimeout(ensureSearchHayLoaded, 100);
}

const chapterLabels = {};
document.querySelectorAll('.list-divider').forEach(div => {
  const m = div.textContent.match(/Chapter\s+(\d+)\s+·\s+([^/]+)\s*\/\s*([^(]+)\(/);
  if (m) chapterLabels['ch' + m[1]] = m[3].trim();
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function highlightMatch(text, needle) {
  if (!needle) return escapeHtml(text);
  const lower = text.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx < 0) return escapeHtml(text);
  return escapeHtml(text.slice(0, idx))
    + '<mark>' + escapeHtml(text.slice(idx, idx + needle.length)) + '</mark>'
    + escapeHtml(text.slice(idx + needle.length));
}

let activeIdx = -1;
let currentMatches = [];

function renderSearchResults() {
  const needle = q.value.trim().toLowerCase();
  if (!needle) {
    searchResults.classList.remove('show');
    searchBar.classList.remove('has-text');
    activeIdx = -1;
    currentMatches = [];
    return;
  }
  searchBar.classList.add('has-text');

  // Score: starts-with (best) → word includes → ipa includes → haystack includes
  const starts = [], mid = [], late = [];
  for (const item of searchIndex) {
    if (item.wordLower.startsWith(needle)) starts.push(item);
    else if (item.wordLower.includes(needle)) mid.push(item);
    else if (item.ipaLower && item.ipaLower.includes(needle)) mid.push(item);
    else if (item.hay.includes(needle)) late.push(item);
  }
  currentMatches = [...starts, ...mid, ...late].slice(0, 12);

  if (currentMatches.length === 0) {
    searchResults.innerHTML = '<div class="empty">No words match &ldquo;<mark>'
      + escapeHtml(needle) + '</mark>&rdquo;. Try a shorter prefix.</div>';
    searchResults.classList.add('show');
    activeIdx = -1;
    return;
  }

  const total = starts.length + mid.length + late.length;
  let html = '<div class="count">' + total + ' match' + (total !== 1 ? 'es' : '')
    + ' &middot; showing top ' + currentMatches.length + '</div>';
  html += currentMatches.map((item, i) => {
    const chNum = item.chapterId.replace('ch', '');
    const chName = (chapterLabels[item.chapterId] || '').slice(0, 28);
    return '<div class="item" role="option" data-i="' + i + '">'
      + '<span class="word">' + highlightMatch(item.word, needle) + '</span>'
      + '<span class="ipa">' + escapeHtml(item.ipa) + '</span>'
      + '<span class="chapter">Ch ' + chNum
      + (chName ? ' &middot; ' + escapeHtml(chName) : '') + '</span>'
      + '</div>';
  }).join('');
  searchResults.innerHTML = html;
  searchResults.classList.add('show');
  activeIdx = -1;

  // Bind click handlers
  searchResults.querySelectorAll('.item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      // mousedown not click so it fires before the input's blur
      e.preventDefault();
      const i = parseInt(el.dataset.i, 10);
      navigateToMatch(i);
    });
  });
}

function navigateToMatch(i) {
  const item = currentMatches[i];
  if (!item) return;
  item.card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Add flash class, then remove
  item.card.classList.remove('search-flash');
  // force reflow so the animation restarts
  void item.card.offsetWidth;
  item.card.classList.add('search-flash');
  setTimeout(() => item.card.classList.remove('search-flash'), 1900);
  // Clear search and close dropdown
  q.value = '';
  renderSearchResults();
  q.blur();
}

function updateActiveItem() {
  const items = searchResults.querySelectorAll('.item');
  items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
  if (activeIdx >= 0 && items[activeIdx]) {
    items[activeIdx].scrollIntoView({ block: 'nearest' });
  }
}

q.addEventListener('input', renderSearchResults);
q.addEventListener('focus', () => { if (q.value.trim()) renderSearchResults(); });
q.addEventListener('keydown', (e) => {
  const items = searchResults.querySelectorAll('.item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (items.length === 0) return;
    activeIdx = Math.min(activeIdx + 1, items.length - 1);
    updateActiveItem();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (items.length === 0) return;
    activeIdx = Math.max(activeIdx - 1, 0);
    updateActiveItem();
  } else if (e.key === 'Enter') {
    if (currentMatches.length === 0) return;
    e.preventDefault();
    const i = activeIdx >= 0 ? activeIdx : 0;
    navigateToMatch(i);
  } else if (e.key === 'Escape') {
    if (q.value) {
      q.value = '';
      renderSearchResults();
    } else {
      searchResults.classList.remove('show');
      q.blur();
    }
  }
});
if (qClear) qClear.addEventListener('click', () => {
  q.value = '';
  q.focus();
  renderSearchResults();
});
// Close dropdown when clicking outside
document.addEventListener('mousedown', (e) => {
  if (!searchBar.contains(e.target)) {
    searchResults.classList.remove('show');
  }
});

/* ============================================================
/* ============================================================
   5. Sidebar toggle + chapter jump
   ============================================================ */
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const mainWrap = document.getElementById('mainWrap');
// (sidebar toggle handler is defined later in section 7 with mobile support)

/* ============================================================
   6. Theme toggle
   ============================================================ */
const themeBtn = document.getElementById('themeBtn');
const darkMobileBtn = document.getElementById('darkMobileBtn');
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
  document.documentElement.setAttribute('data-theme','dark');
  themeBtn.textContent = '☀ Light';
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  themeBtn.textContent = next === 'dark' ? '☀ Light' : '☾ Dark';
  if (darkMobileBtn) darkMobileBtn.querySelector('.ico').textContent = next === 'dark' ? '☀' : '☾';
  localStorage.setItem('theme', next);
}
themeBtn.addEventListener('click', toggleTheme);
if (darkMobileBtn) darkMobileBtn.addEventListener('click', toggleTheme);

/* ============================================================
   7. Mobile sidebar backdrop
   ============================================================ */
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const isMobile = () => window.matchMedia('(max-width: 860px)').matches;
function openMobileSidebar() {
  sidebar.classList.add('open');
  sidebarToggle.classList.add('open');
  sidebarBackdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeMobileSidebar() {
  sidebar.classList.remove('open');
  sidebarToggle.classList.remove('open');
  sidebarBackdrop.classList.remove('open');
  document.body.style.overflow = '';
}
sidebarToggle.addEventListener('click', () => {
  if (isMobile()) {
    const isOpen = sidebar.classList.contains('open');
    if (isOpen) closeMobileSidebar();
    else openMobileSidebar();
  } else {
    const isCollapsed = sidebar.classList.contains('collapsed');
    if (isCollapsed) {
      sidebar.classList.remove('collapsed');
      sidebarToggle.classList.remove('collapsed');
      document.body.classList.remove('sidebar-collined');
    } else {
      sidebar.classList.add('collapsed');
      sidebarToggle.classList.add('collapsed');
      document.body.classList.add('sidebar-collined');
    }
  }
});
sidebarBackdrop.addEventListener('click', closeMobileSidebar);
document.querySelectorAll('.nav-item[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { e.preventDefault(); target.scrollIntoView({behavior:'smooth',block:'start'}); }
    if (isMobile()) closeMobileSidebar();
  });
});

/* ============================================================
   8. Mobile topbar (live chapter title + scroll progress)
   ============================================================ */
const mobileTopbar = document.getElementById('mobileTopbar');
const mobileChTitle = document.getElementById('mobileChTitle');
const mobileChProgress = document.getElementById('mobileChProgress');
const chapterTitles = {};
document.querySelectorAll('.list-divider').forEach(div => {
  const m = div.textContent.match(/Chapter\s+(\d+)\s+·\s+([^/]+)\s*\/\s*([^(]+)\(/);
  if (m) {
    const n = parseInt(m[1], 10);
    chapterTitles['ch' + n] = { zh: m[2].trim(), en: m[3].trim() };
  }
});
const chaptersArr = Object.keys(chapterTitles).sort();
let currentChapter = null;
function chapterAtScroll() {
  const top = window.scrollY + 120;
  let active = chaptersArr[0];
  for (const cid of chaptersArr) {
    const el = document.getElementById(cid);
    if (el && el.offsetTop <= top) active = cid;
  }
  return active;
}
function updateMobileTopbar() {
  const ch = chapterAtScroll();
  if (ch !== currentChapter) {
    currentChapter = ch;
    const t = chapterTitles[ch] || {zh:'', en:''};
    if (mobileChTitle) {
      mobileChTitle.innerHTML = ((t.en || t.zh || ch).slice(0, 32)) +
        '<small>' + ((t.zh || '').slice(0, 24)) + '</small>';
    }
    const idx = chaptersArr.indexOf(ch);
    if (prevChBtn) {
      prevChBtn.disabled = idx <= 0;
      prevChBtn.dataset.target = chaptersArr[Math.max(0, idx-1)];
    }
    if (nextChBtn) {
      nextChBtn.disabled = idx >= chaptersArr.length - 1;
      nextChBtn.dataset.target = chaptersArr[Math.min(chaptersArr.length-1, idx+1)];
    }
  }
  const docH = document.documentElement.scrollHeight - window.innerHeight;
  const pct = docH > 0 ? Math.min(100, Math.round((window.scrollY / docH) * 100)) : 0;
  if (mobileChProgress) mobileChProgress.textContent = pct + '%';
}
let scrollRaf = null;
window.addEventListener('scroll', () => {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => { updateMobileTopbar(); scrollRaf = null; });
}, {passive: true});

/* ============================================================
   9. Bottom nav (prev/next chapter)
   ============================================================ */
const prevChBtn = document.getElementById('prevChBtn');
const nextChBtn = document.getElementById('nextChBtn');
function gotoChapter(cid) {
  const el = document.getElementById(cid);
  if (el) el.scrollIntoView({behavior: 'smooth', block: 'start'});
}
if (prevChBtn) prevChBtn.addEventListener('click', () => {
  const t = prevChBtn.dataset.target;
  if (t) gotoChapter(t);
});
if (nextChBtn) nextChBtn.addEventListener('click', () => {
  const t = nextChBtn.dataset.target;
  if (t) gotoChapter(t);
});

/* ============================================================
   10. TTS — iOS Safari user-gesture priming
   ============================================================ */
let voicesReady = false;
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  const v = speechSynthesis.getVoices();
  if (v && v.length) voicesReady = true;
}
if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
  const prime = () => {
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch (e) {}
    document.removeEventListener('touchstart', prime);
    document.removeEventListener('click', prime);
  };
  document.addEventListener('touchstart', prime, {once: true, passive: true});
  document.addEventListener('click', prime, {once: true});
}

updateMobileTopbar();
window.__ielts = { chapterTitles, chaptersArr, updateMobileTopbar };

/* ============================================================
   11. Lazy load ch3..ch22 via ESM dynamic import
   ============================================================ */
// Use shared utilities + the auto-generated per-chapter ESM modules
// from chapters/chN.js. Each chN.js is ~5 lines: imports data and calls
// mountChapter (from chapters/shared.js). All DOM construction goes
// through <template id="card-template"> in index.html — no string
// concatenation, no innerHTML on user data, no regex.
import { mountChapter, oaldUrl, haystackOf } from './chapters/shared.js';

// Track which chapters are already mounted (avoid double-import on rapid scroll)
const lazyChaptersLoaded = new Set();

// Cache wordIndex/phraseIndex extension to avoid rebuilding from scratch
function addCardsToIndex(sec) {
  sec.querySelectorAll('.word-card').forEach(card => {
    const main = card.querySelector('.word-main');
    if (!main) return;
    const word = (main.firstChild ? main.firstChild.textContent : main.textContent || '').trim();
    if (!word) return;
    const wKey = word.toLowerCase();
    if (wordIndex.has(wKey)) return;
    const ipa = card.querySelector('.word-ipa')?.textContent.trim() || '';
    const pos = card.querySelector('.word-pos')?.textContent.trim() || '';
    const def = card.querySelector('.def-block .text')?.textContent.trim() || '';
    const cardId = card.id || ('w_' + word.replace(/\W+/g, '_'));
    card.id = cardId;
    wordIndex.set(wKey, { main: word, ipa, pos, def, cardId });
    phraseIndex.set(wKey, wordIndex.get(wKey));
  });
}

// Re-attach 🔊 speak-btn to a section's word-main elements
function attachSpeakBtns(sec) {
  sec.querySelectorAll('.word-main').forEach(main => {
    if (main.querySelector('.speak-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'speak-btn';
    btn.textContent = '🔊';
    btn.title = 'Read aloud';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const wm = main.firstChild ? main.firstChild.textContent : main.textContent;
      const key = (wm || '').trim().toLowerCase();
      const entry = wordIndex.get(key);
      speak(entry ? entry.main : cleanForTTS(wm));
    });
    main.appendChild(btn);
  });
}

// IntersectionObserver: when a placeholder section enters viewport (or is
// 600px away), dynamic-import its ESM module. Browser handles the network,
// caching, and module graph natively.
const lazyObserver = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const sec = e.target;
    const chId = sec.id;            // "ch3", "ch4", ...
    const chNum = chId.replace('ch', '');
    if (lazyChaptersLoaded.has(chId)) {
      lazyObserver.unobserve(sec);
      continue;
    }
    lazyChaptersLoaded.add(chId);
    // Dynamic ESM import — browser-native, no fetch+innerHTML anti-pattern.
    import(`./chapters/ch${chNum}.js`)
      .then(() => {
        // After mount, extend wordIndex for search and re-attach speak buttons.
        addCardsToIndex(sec);
        attachSpeakBtns(sec);
        // Also pre-warm audio: when a ch1 word card enters viewport for the
        // first time, set its <audio preload> to "auto" so the user can hit
        // play immediately. We don't do this for ch3+ (no def-speak-btn
        // support beyond the first 10 words of ch1).
        lazyObserver.unobserve(sec);
      })
      .catch(err => {
        console.error(`Failed to load ${chId}:`, err);
        lazyChaptersLoaded.delete(chId);  // allow retry
      });
  }
}, { rootMargin: '600px 0px' });

// Observe all ch3..ch22 placeholders
document.querySelectorAll('section[data-chapter][data-loaded="false"]').forEach(sec => {
  lazyObserver.observe(sec);
});

/* ============================================================
   12. Audio preload-on-viewport (replace blocking <link rel="preload>)
   The 10 ch1 def audio clips were preloaded in <head>, but we can
   upgrade: defer preload until each card enters viewport. Initial
   paint is faster; click-to-play is still snappy because preload
   triggers ~200ms before the user actually clicks.
   ============================================================ */
const defAudiosByWord = {
  'atmosphere': 'audio/ch1-atmosphere.mp3',
  'hydrosphere': 'audio/ch1-hydrosphere.mp3',
  'lithosphere': 'audio/ch1-lithosphere.mp3',
  'oxygen': 'audio/ch1-oxygen.mp3',
  'oxide': 'audio/ch1-oxide.mp3',
  'carbon dioxide': 'audio/ch1-carbon-dioxide.mp3',
  'hydrogen': 'audio/ch1-hydrogen.mp3',
  'core': 'audio/ch1-core.mp3',
  'crust': 'audio/ch1-crust.mp3',
  'mantle': 'audio/ch1-mantle.mp3',
};
const audioCache = new Map();
function preloadAudio(url) {
  if (audioCache.has(url)) return audioCache.get(url);
  const a = new Audio();
  a.preload = 'auto';
  a.src = url;
  audioCache.set(url, a);
  return a;
}
const audioObserver = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const card = e.target;
    const wm = card.querySelector('.word-main');
    if (!wm) continue;
    const word = (wm.firstChild ? wm.firstChild.textContent : wm.textContent || '').trim().toLowerCase();
    const url = defAudiosByWord[word];
    if (url) preloadAudio(url);
    audioObserver.unobserve(card);
  }
}, { rootMargin: '300px 0px' });
document.querySelectorAll('.word-card').forEach(card => audioObserver.observe(card));
