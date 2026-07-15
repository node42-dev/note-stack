/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

(function () {
  const vscode = acquireVsCodeApi();

  const APP_ID = document.body.dataset.appId;
  const HOST_NAME = document.body.dataset.hostName;

  const list = document.getElementById("notesList");
  const snippetLoaded = new Set();

  let activeTags = new Set();

  // Restore persisted state
  const _state = vscode.getState() || {};
  let activePriority = _state.priority || "all";
  let searchTerm = _state.search || "";

  if (searchTerm) {
    document.getElementById("searchInput").value = searchTerm;
  }
  if (_state.priority) {
    document.getElementById("prioritySelect").value = _state.priority;
  }
  if (_state.sort) {
    document.getElementById("sortSelect").value = _state.sort;
  }

  function saveState() {
    vscode.setState({
      priority: activePriority,
      search: searchTerm,
      sort: document.getElementById("sortSelect").value,
    });
  }

  document.querySelectorAll(".note-title-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const filePath = JSON.parse(btn.getAttribute("data-file"));
      const note = JSON.parse(btn.getAttribute("data-note"));
      vscode.postMessage({ type: "openNote", filePath, note });
    });
  });

  document.querySelectorAll(".note-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const filePath = JSON.parse(btn.getAttribute("data-file"));
      const note = JSON.parse(btn.getAttribute("data-note"));
      vscode.postMessage({ type: "editNote", filePath, note });
    });
  });

  document.querySelectorAll(".meta-workspace").forEach((el) => {
    el.addEventListener("click", () => {
      const wsRoot = el.getAttribute("data-wsroot");
      const card = el.closest(".note-card");
      const filePath = card?.getAttribute("data-file");
      const line = parseInt(card?.getAttribute("data-line") ?? "0");
      if (wsRoot)
        vscode.postMessage({
          type: "openWorkspace",
          wsRoot,
          filePath,
          line,
          character: 0,
        });
    });
  });

  list.querySelectorAll(".note-card").forEach((card) => {
    const loc = card.querySelector(".note-location");
    const snippetEl = card.querySelector(".note-snippet");
    if (!loc || !snippetEl) return;

    loc.addEventListener("click", (e) => {
      e.stopPropagation();

      const isOpen = snippetEl.classList.contains("open");
      if (isOpen) {
        snippetEl.classList.remove("open");
        return;
      }

      snippetEl.classList.add("open");

      const id = card.getAttribute("data-id");
      if (!snippetLoaded.has(id)) {
        snippetLoaded.add(id);

        const filePath = card.getAttribute("data-file");
        const line = parseInt(card.getAttribute("data-line"));
        vscode.postMessage({ type: "getSnippet", filePath, line, id });
      }
    });
  });

  document.addEventListener("click", () => {
    document.querySelectorAll(".note-snippet.open").forEach((el) => {
      el.classList.remove("open");
    });
  });

  window.addEventListener("message", (e) => {
    const { type, id, snippet, lang } = e.data;
    if (type === "snippetResult") {
      const el = document.querySelector('[data-id="' + id + '"] .note-snippet');
      if (el && snippet) {
        const code = document.createElement("code");
        code.textContent = snippet;
        const pre = document.createElement("pre");
        pre.appendChild(code);
        el.innerHTML = "";
        el.appendChild(pre);

        el.style.marginTop = "6px";
        el.style.display = "block";
      }
    }
  });

  document.querySelectorAll(".note-body a").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      vscode.postMessage({ type: "openUrl", url: a.getAttribute("href") });
    });
  });

  document.querySelectorAll(".meta-item.meta-file").forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      const relPath = el.getAttribute("title");
      if (!relPath) return;
      navigator.clipboard.writeText(relPath).then(() => {
        const orig = el.textContent;
        el.textContent = "✓ copied";
        setTimeout(() => (el.textContent = orig), 1200);
      });
    });
  });

  document.querySelectorAll(".note-tag").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const tag = el.getAttribute("data-tag");
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
      } else {
        activeTags.add(tag);
      }
      document.querySelectorAll(".tag-pill").forEach((p) => {
        p.classList.toggle(
          "active",
          activeTags.has(p.getAttribute("data-tag")),
        );
      });
      applyFilters();
    });
  });

  function renderTagPills() {
    const wrap = document.getElementById("tagPills");
    wrap.innerHTML = "";
    const tags = new Set();
    document
      .querySelectorAll(".note-tag")
      .forEach((el) => tags.add(el.getAttribute("data-tag")));
    [...tags].sort().forEach((tag) => {
      const pill = document.createElement("button");
      pill.className = "filter-btn tag-pill";
      pill.textContent = tag;
      pill.setAttribute("data-tag", tag);
      if (activeTags.has(tag)) pill.classList.add("active");
      pill.addEventListener("click", () => {
        if (activeTags.has(tag)) {
          activeTags.delete(tag);
          pill.classList.remove("active");
        } else {
          activeTags.add(tag);
          pill.classList.add("active");
        }
        applyFilters();
      });
      wrap.appendChild(pill);
    });
  }

  function applyFilters() {
    const cards = document.querySelectorAll(".note-card");
    let visible = 0;
    cards.forEach((card) => {
      const priority = card.getAttribute("data-priority");
      const text = card.textContent.toLowerCase();
      const priorityMatch =
        activePriority === "all"
          ? priority !== "completed"
          : priority === activePriority;
      const searchMatch = !searchTerm || text.includes(searchTerm);
      const tagMatch =
        activeTags.size === 0 ||
        [...activeTags].every((tag) =>
          [...card.querySelectorAll(".note-tag")].some(
            (t) => t.getAttribute("data-tag") === tag,
          ),
        );
      if (priorityMatch && searchMatch && tagMatch) {
        card.classList.remove("hidden");
        visible++;
      } else {
        card.classList.add("hidden");
      }
    });

    const visibleCards = [
      ...document.querySelectorAll(".note-card:not(.hidden)"),
    ];
    const visibleFiles = new Set(
      visibleCards.map((c) => c.getAttribute("data-file")),
    ).size;
    document.getElementById("statsLabel").textContent =
      visible +
      " note" +
      (visible !== 1 ? "s" : "") +
      " · " +
      visibleFiles +
      " file" +
      (visibleFiles !== 1 ? "s" : "") +
      " · " +
      APP_ID +
      " · " +
      HOST_NAME;
  }

  function getSortedCards() {
    const sort = document.getElementById("sortSelect").value;
    const cards = [...document.querySelectorAll(".note-card")];
    const priorityOrder = { high: 0, medium: 1, low: 2, none: 3, completed: 4 };

    cards.sort((a, b) => {
      const at = parseInt(a.getAttribute("data-ts"));
      const bt = parseInt(b.getAttribute("data-ts"));
      const pd =
        (priorityOrder[a.getAttribute("data-priority")] ?? 3) -
        (priorityOrder[b.getAttribute("data-priority")] ?? 3);
      const aLocal = a.getAttribute("data-local") === "true" ? 0 : 1;
      const bLocal = b.getAttribute("data-local") === "true" ? 0 : 1;
      const line =
        parseInt(a.getAttribute("data-line")) -
        parseInt(b.getAttribute("data-line"));

      if (sort === "newest") {
        // priority → newest → line
        if (pd !== 0) return pd;
        if (bt !== at) return bt - at;
        return line;
      }
      if (sort === "oldest") {
        // priority → oldest → line
        if (pd !== 0) return pd;
        if (bt !== at) return at - bt;
        return line;
      }
      // workspace: current first → priority → newest → line
      if (aLocal !== bLocal) return aLocal - bLocal;
      if (pd !== 0) return pd;
      if (bt !== at) return bt - at;
      return line;
    });

    const list = document.getElementById("notesList");
    cards.forEach((c) => list.appendChild(c));
  }

  document.getElementById("sortSelect").addEventListener("change", () => {
    saveState();
    getSortedCards();
  });

  document.getElementById("prioritySelect").addEventListener("change", (e) => {
    activePriority = e.target.value;
    saveState();
    applyFilters();
  });

  document.getElementById("searchInput").addEventListener("input", (e) => {
    searchTerm = e.target.value.toLowerCase().trim();
    saveState();
    applyFilters();
  });

  // run on load
  getSortedCards();
  renderTagPills();
  applyFilters();

  document.getElementById("searchInput").focus();
})();
