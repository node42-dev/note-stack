/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

(function () {
  const vscode = acquireVsCodeApi();
  const list = document.getElementById('docsList');

  const _state = vscode.getState() || {};
  let searchTerm = _state.search || '';

  if (searchTerm) document.getElementById('searchInput').value = searchTerm;
  if (_state.sort) document.getElementById('sortSelect').value = _state.sort;

  function saveState() {
    vscode.setState({
      search: searchTerm,
      sort: document.getElementById('sortSelect').value,
    });
  }

  // Open doc on title click
  document.querySelectorAll('.doc-title-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = JSON.parse(btn.getAttribute('data-entry'));
      vscode.postMessage({ type: 'openDoc', entry });
    });
  });

  // Copy relative path on path line click
  document.querySelectorAll('.doc-path').forEach(el => {
    el.addEventListener('click', () => {
      const p = el.getAttribute('data-path');
      if (!p) return;
      navigator.clipboard.writeText(p).then(() => {
        const orig = el.textContent;
        el.textContent = '✓ copied';
        setTimeout(() => el.textContent = orig, 1200);
      });
    });
  });

  function applyFilters() {
    const cards = document.querySelectorAll('.doc-card');
    let visible = 0;
    cards.forEach(card => {
      const text = card.textContent.toLowerCase();
      const searchMatch = !searchTerm || text.includes(searchTerm);
      if (searchMatch) { card.classList.remove('hidden'); visible++; }
      else card.classList.add('hidden');
    });
    const lbl = document.getElementById('statsLabel');
    const appId = lbl.getAttribute('data-appid') || '';
    const host = lbl.getAttribute('data-host') || '';
    lbl.textContent = visible + ' doc' + (visible !== 1 ? 's' : '') + ' · ' + appId + ' · ' + host;
  }

  function getSortedCards() {
    const sort = document.getElementById('sortSelect').value;
    const cards = [...document.querySelectorAll('.doc-card')];

    cards.sort((a, b) => {
      const at = parseInt(a.getAttribute('data-ts') || '0');
      const bt = parseInt(b.getAttribute('data-ts') || '0');
      const asz = parseInt(a.getAttribute('data-size') || '0');
      const bsz = parseInt(b.getAttribute('data-size') || '0');
      const ap = a.getAttribute('data-path') || '';
      const bp = b.getAttribute('data-path') || '';

      switch (sort) {
        case 'newest': return bt - at;
        case 'oldest': return at - bt;
        case 'size':   return bsz - asz;
        case 'path':
        default:       return ap.localeCompare(bp);
      }
    });

    cards.forEach(c => list.appendChild(c));
  }

  document.getElementById('sortSelect').addEventListener('change', () => { saveState(); getSortedCards(); });
  document.getElementById('searchInput').addEventListener('input', e => {
    searchTerm = e.target.value.toLowerCase().trim();
    saveState();
    applyFilters();
  });

  getSortedCards();
  applyFilters();
  document.getElementById('searchInput').focus();
})();
