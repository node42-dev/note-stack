/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

(function () {
  const vscode = acquireVsCodeApi();
  const snippetLoaded = new Set();
  let activeKws = new Set();

  const _state = vscode.getState() || {};
  let activePriority = _state.priority || 'all';
  let searchTerm     = _state.search   || '';

  if (searchTerm) document.getElementById('searchInput').value = searchTerm;
  if (_state.priority) document.getElementById('prioritySelect').value = _state.priority;
  if (_state.sort)     document.getElementById('sortSelect').value     = _state.sort;
  if (_state.kws) _state.kws.forEach(k => activeKws.add(k));

  function saveState() {
    vscode.setState({
      priority: activePriority,
      search:   searchTerm,
      sort:     document.getElementById('sortSelect').value,
      kws:      [...activeKws],
    });
  }

  // Wire up keyword pills (pre-rendered in HTML)
  document.querySelectorAll('.kw-pill').forEach(pill => {
    const kw = pill.getAttribute('data-kw');
    if (activeKws.has(kw)) pill.classList.add('active');
    pill.addEventListener('click', () => {
      if (activeKws.has(kw)) { activeKws.delete(kw); pill.classList.remove('active'); }
      else                   { activeKws.add(kw);    pill.classList.add('active'); }
      saveState();
      applyFilters();
    });
  });

  // Jump to tag on title click
  document.querySelectorAll('.note-title-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = JSON.parse(btn.getAttribute('data-entry'));
      vscode.postMessage({ type: 'openCodeTag', entry });
    });
  });

  // Click keyword badge inside a card → toggle that keyword's pill
  document.querySelectorAll('.tag-kw-badge').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const kw = el.getAttribute('data-kw');
      if (!kw) return;
      const pill = document.querySelector('.kw-pill[data-kw="' + kw + '"]');
      if (activeKws.has(kw)) { activeKws.delete(kw); pill?.classList.remove('active'); }
      else                   { activeKws.add(kw);    pill?.classList.add('active'); }
      saveState();
      applyFilters();
    });
  });

  // Inline snippet on line number click
  const list = document.getElementById('notesList');
  list.querySelectorAll('.note-card').forEach(card => {
    const loc       = card.querySelector('.note-location');
    const snippetEl = card.querySelector('.note-snippet');
    if (!loc || !snippetEl) return;
    loc.addEventListener('click', e => {
      e.stopPropagation();
      if (snippetEl.classList.contains('open')) { snippetEl.classList.remove('open'); return; }
      snippetEl.classList.add('open');
      const id = card.getAttribute('data-id');
      if (!snippetLoaded.has(id)) {
        snippetLoaded.add(id);
        vscode.postMessage({ type: 'getSnippet', filePath: card.getAttribute('data-file'), line: parseInt(card.getAttribute('data-line')), id });
      }
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.note-snippet.open').forEach(el => el.classList.remove('open'));
  });

  window.addEventListener('message', e => {
    const { type, id, snippet } = e.data;
    if (type === 'snippetResult') {
      const el = document.querySelector('[data-id="' + id + '"] .note-snippet');
      if (el && snippet) {
        const code = document.createElement('code');
        code.textContent = snippet;
        const pre = document.createElement('pre');
        pre.appendChild(code);
        el.innerHTML = '';
        el.appendChild(pre);
        el.style.marginTop = '6px';
        el.style.display = 'block';
      }
    }
  });

  // Copy relative path on file label click
  document.querySelectorAll('.meta-item.meta-file').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      const p = el.getAttribute('title');
      if (!p) return;
      navigator.clipboard.writeText(p).then(() => {
        const orig = el.textContent;
        el.textContent = '✓ copied';
        setTimeout(() => el.textContent = orig, 1200);
      });
    });
  });

  function applyFilters() {
    const cards = document.querySelectorAll('.note-card');
    let visible = 0;
    cards.forEach(card => {
      const priority      = card.getAttribute('data-priority');
      const cardKw        = card.getAttribute('data-tag');
      const text          = card.textContent.toLowerCase();
      const priorityMatch = activePriority === 'all' || priority === activePriority;
      const kwMatch       = activeKws.size === 0 || activeKws.has(cardKw);
      const searchMatch   = !searchTerm || text.includes(searchTerm);
      if (priorityMatch && kwMatch && searchMatch) { card.classList.remove('hidden'); visible++; }
      else card.classList.add('hidden');
    });
    const visibleCards = [...document.querySelectorAll('.note-card:not(.hidden)')];
    const visibleFiles = new Set(visibleCards.map(c => c.getAttribute('data-file'))).size;
    const lbl    = document.getElementById('statsLabel');
    const appId  = lbl.getAttribute('data-appid') || '';
    const host   = lbl.getAttribute('data-host')  || '';
    lbl.textContent =
      visible + ' tag' + (visible !== 1 ? 's' : '') + ' · ' +
      visibleFiles + ' file' + (visibleFiles !== 1 ? 's' : '') + ' · ' + appId + ' · ' + host;
  }

  function getSortedCards() {
    const sort  = document.getElementById('sortSelect').value;
    const cards = [...document.querySelectorAll('.note-card')];
    const po    = { p3: 0, p2: 1, p1: 2, p0: 3, none: 4 };

    cards.sort((a, b) => {
      const at = parseInt(a.getAttribute('data-ts')    || '0');
      const bt = parseInt(b.getAttribute('data-ts')    || '0');
      const ad = parseInt(a.getAttribute('data-drift') || '0');
      const bd = parseInt(b.getAttribute('data-drift') || '0');
      const ap = po[a.getAttribute('data-priority')] ?? 4;
      const bp = po[b.getAttribute('data-priority')] ?? 4;
      const al = parseInt(a.getAttribute('data-line') || '0');
      const bl = parseInt(b.getAttribute('data-line') || '0');
      const af = a.getAttribute('data-file') || '';
      const bf = b.getAttribute('data-file') || '';

      switch (sort) {
        case 'priority': return ap !== bp ? ap - bp : bt - at;
        case 'newest':   return bt !== at ? bt - at : ap - bp;
        case 'oldest':   return at !== bt ? at - bt : ap - bp;
        case 'drift':    return bd !== ad ? bd - ad : ap - bp;
        case 'file':     return af !== bf ? af.localeCompare(bf) : al - bl;
        default:         return 0;
      }
    });

    cards.forEach(c => list.appendChild(c));
  }

  document.getElementById('sortSelect').addEventListener('change', () => { saveState(); getSortedCards(); });
  document.getElementById('prioritySelect').addEventListener('change', e => {
    activePriority = e.target.value;
    saveState();
    applyFilters();
  });
  document.getElementById('searchInput').addEventListener('input', e => {
    searchTerm = e.target.value.toLowerCase().trim();
    saveState();
    applyFilters();
  });

  getSortedCards();
  applyFilters();
  document.getElementById('searchInput').focus();
})();
