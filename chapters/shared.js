// chapters/shared.js
// Pure DOM utility module — no string concatenation, no innerHTML on user data.
// All <template> + cloneNode + textContent approach.
//
// Used by:
//   - chapters/chN.js (one per chapter) — generated
//   - main.js (top-level loader for inline ch1+ch2)

// Build an OALD URL from a word (NFKD normalize, ASCII-encode, hyphens, drop punctuation).
export function oaldUrl(word) {
  // Browser supports Unicode property escapes in modern engines; we use the
  // same simple normalisation as the original Python render_chapter.py.
  const lower = word.toLowerCase();
  const stripped = lower.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return 'https://www.oxfordlearnersdictionaries.com/definition/english/' +
         stripped.replace(/['']/g, '').replace(/ /g, '-').replace(/[^\w-]/g, '');
}

// Build a lowercase search haystack from card fields. Strips HTML tags, escapes
// for safe inclusion in a data-* attribute.
export function haystackOf(word, pos, def, example, pitfall) {
  const stripHtml = (s) => s.replace(/<[^>]+>/g, ' ');
  const raw = (
    word + ' ' +
    pos.toLowerCase() + ' ' +
    stripHtml(def).slice(0, 120) + ' ' +
    stripHtml(example).slice(0, 120) + ' ' +
    stripHtml(pitfall).slice(0, 120)
  ).replace(/\s+/g, ' ').trim();
  // Escape for attribute value (always double-quoted in template)
  return raw.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// Mount a chapter into a <section id="chN"> using the shared <template>.
// cards: Array<{ word, ipa, pos, def, example, pitfall, oaldUrl, haystack }>
export function mountChapter(sectionEl, cards) {
  if (!sectionEl) return;
  if (sectionEl.dataset.loaded === 'true') return;
  const tpl = document.getElementById('card-template');
  if (!tpl) {
    console.error('card-template not found in document');
    return;
  }
  const frag = document.createDocumentFragment();
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const node = tpl.content.cloneNode(true);
    const article = node.querySelector('.word-card');
    article.dataset.haystack = c.haystack;
    article.id = 'w_' + c.word.replace(/\W+/g, '_');

    const num = node.querySelector('.word-num');
    if (num) num.textContent = String(i + 1).padStart(2, '0');
    const main = node.querySelector('.word-main');
    if (main) main.textContent = c.word;  // textContent: XSS-safe
    const ipa = node.querySelector('.word-ipa');
    if (ipa) ipa.textContent = c.ipa;
    const pos = node.querySelector('.word-pos');
    if (pos) pos.textContent = c.pos;

    // def / example / pitfall are trusted HTML (built from OALD scrape at
    // build time, not user input). innerHTML is acceptable here.
    const defEl = node.querySelector('.def-block .text');
    if (defEl) defEl.innerHTML = c.def;
    const exEl = node.querySelector('.examples li');
    if (exEl) exEl.innerHTML = c.example;
    const pitEl = node.querySelector('.pitfall .pitfall-text');
    if (pitEl) pitEl.innerHTML = c.pitfall;

    const link = node.querySelector('.source a');
    if (link) {
      link.href = c.oaldUrl;  // property assignment, URL-encoded safely
      link.textContent = 'Oxford: ' + c.word;
    }
    frag.appendChild(node);
  }
  // Insert before any closing divider/footer
  sectionEl.appendChild(frag);
  sectionEl.dataset.loaded = 'true';
}
