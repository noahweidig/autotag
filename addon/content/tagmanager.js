/* Autotag tag manager window. Plain script, runs in the dialog's chrome window.
 * All Zotero work happens through the `api` object passed in by the plugin. */
(function () {
  const arg = window.arguments && window.arguments[0];
  const api = arg && (arg.wrappedJSObject || arg);
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString();
  const PAGE = 300;

  const REASONS = {
    format: "Same tag, different format",
    similar: "Looks similar",
    abbreviation: "Abbreviation",
    ai: "Same meaning",
  };

  let tags = [];
  let suggestions = [];
  let busy = false;
  let aiOK = false;
  let shown = PAGE;
  const picked = new Set();
  let cancel = { value: false };

  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  /* ---------- feedback ---------- */

  let statusTimer = 0;
  function status(text) {
    $("status").textContent = text || "";
    window.clearTimeout(statusTimer);
    if (text)
      statusTimer = window.setTimeout(
        () => ($("status").textContent = ""),
        6000,
      );
  }

  function notice(text, kind) {
    const n = $("notice");
    n.textContent = text || "";
    n.className = "notice" + (kind ? " " + kind : "");
    n.hidden = !text;
  }

  function setBusy(b) {
    busy = b;
    for (const id of [
      "scan-dup",
      "scan-fmt",
      "merge-selected",
      "sel-merge",
      "sel-delete",
    ])
      $(id).disabled = b;
    $("scan-ai").disabled = b || !aiOK;
    $("undo").disabled = b || !api.undoLabel();
    if (!b) renderSuggestionsFooter();
  }

  function refreshUndo() {
    const label = api.undoLabel();
    $("undo").disabled = busy || !label;
    $("undo").textContent = label ? "Undo: " + label : "Undo";
  }

  /* ---------- tags ---------- */

  async function reloadTags() {
    tags = await api.loadTags();
    const once = tags.filter((t) => t.count === 1).length;
    $("stats").textContent =
      `${fmt(tags.length)} tags, ${fmt(once)} used on only one item.`;
    const names = new Set(tags.map((t) => t.name));
    for (const n of [...picked]) if (!names.has(n)) picked.delete(n);
    renderTagList();
  }

  function visibleTags() {
    const q = $("q").value.trim().toLowerCase();
    const f = $("filter").value;
    let list = tags.filter(
      (t) =>
        (!q || t.name.toLowerCase().includes(q)) &&
        (f === "all" || (f === "once" ? t.count === 1 : t.count > 1)),
    );
    const s = $("sort").value;
    list = list.sort((a, b) =>
      s === "name"
        ? a.name.localeCompare(b.name)
        : s === "few"
          ? a.count - b.count || a.name.localeCompare(b.name)
          : b.count - a.count || a.name.localeCompare(b.name),
    );
    return list;
  }

  function renderTagList() {
    const list = visibleTags();
    const box = $("tag-list");
    box.textContent = "";
    for (const t of list.slice(0, shown)) {
      const row = h("div", "tag-row" + (picked.has(t.name) ? " sel" : ""));
      const cb = h("input");
      cb.type = "checkbox";
      cb.checked = picked.has(t.name);
      const toggle = () => {
        if (picked.has(t.name)) picked.delete(t.name);
        else picked.add(t.name);
        row.classList.toggle("sel", picked.has(t.name));
        cb.checked = picked.has(t.name);
        updateSelbar(true);
      };
      cb.addEventListener("click", (e) => {
        e.stopPropagation();
        toggle();
      });
      row.addEventListener("click", toggle);
      row.append(
        cb,
        h("span", "name", t.name),
        h("span", "count", fmt(t.count)),
      );
      box.append(row);
    }
    if (!list.length) box.append(h("div", "empty", "No tags match."));
    $("more").hidden = list.length <= shown;
    $("more").textContent = `Show more (${fmt(list.length - shown)} left)`;
    updateSelbar(false);
  }

  function mostUsed(names) {
    const counts = new Map(tags.map((t) => [t.name, t.count]));
    return [...names].sort(
      (a, b) =>
        (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b),
    );
  }

  function updateSelbar(resetTarget) {
    const n = picked.size;
    $("selbar").hidden = !n;
    if (!n) return;
    const ordered = mostUsed(picked);
    $("sel-count").textContent = `${fmt(n)} selected`;
    const opts = $("sel-options");
    opts.textContent = "";
    for (const name of ordered) {
      const o = h("option");
      o.value = name;
      opts.append(o);
    }
    if (resetTarget || !$("sel-target").value)
      $("sel-target").value = ordered[0];
    $("sel-merge").textContent = n === 1 ? "Rename" : "Merge";
  }

  /* ---------- suggestions ---------- */

  function effect(s) {
    const members = s.members.filter((m) => m.name !== s.target);
    const items = members.reduce((n, m) => n + m.count, 0);
    return `Merges ${members.length} tag${members.length === 1 ? "" : "s"} into "${s.target}", up to ${fmt(items)} item${items === 1 ? "" : "s"} updated`;
  }

  function renderSuggestionsFooter() {
    const sel = suggestions.filter((s) => s.selected);
    const btn = $("merge-selected");
    btn.textContent = sel.length
      ? `Merge ${fmt(sel.length)} group${sel.length === 1 ? "" : "s"}`
      : "Merge";
    btn.disabled = busy || !sel.length;
  }

  function renderCard(s) {
    const card = h("section", "card" + (s.selected ? "" : " off"));
    const cb = h("input");
    cb.type = "checkbox";
    cb.checked = s.selected;
    cb.addEventListener("change", () => {
      s.selected = cb.checked;
      card.classList.toggle("off", !s.selected);
      renderSuggestionsFooter();
    });

    const top = h("div", "card-top");
    top.append(
      h("span", "badge " + s.reason, REASONS[s.reason] || s.reason),
      h("span", "spacer"),
    );
    const ignore = h("button", "link", "Ignore");
    ignore.title = "Never suggest this group again";
    ignore.addEventListener("click", () => {
      api.ignore([s.sig]);
      suggestions = suggestions.filter((x) => x !== s);
      renderSuggestions();
    });
    top.append(ignore);

    const members = h("div", "members");
    const eff = h("div", "effect", effect(s));
    const draw = () => {
      members.textContent = "";
      for (const m of s.members) {
        const chip = h(
          "button",
          "member" + (m.name === s.target ? " keep" : ""),
        );
        chip.type = "button";
        chip.title =
          m.name === s.target
            ? "Tag that will be kept"
            : "Click to keep this one instead";
        chip.append(
          document.createTextNode(m.name),
          h("small", "", fmt(m.count)),
        );
        chip.addEventListener("click", () => {
          s.target = m.name;
          eff.textContent = effect(s);
          draw();
        });
        members.append(chip);
      }
    };
    draw();

    const body = h("div", "card-body");
    body.append(top, members, eff);
    card.append(cb, body);
    return card;
  }

  function renderSuggestions(title) {
    if (title !== undefined) $("sug-title").textContent = title;
    const list = $("sug-list");
    list.textContent = "";
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "10px";
    for (const s of suggestions) list.append(renderCard(s));
    $("sug-head").hidden = !suggestions.length;
    $("sug-empty").hidden = !!suggestions.length || !$("sug-title").textContent;
    if (!suggestions.length && $("sug-title").textContent) {
      $("sug-empty").textContent =
        "Nothing to merge here. Your tags look clean for this check.";
    }
    renderSuggestionsFooter();
  }

  async function runLocal(kind) {
    if (busy) return;
    setBusy(true);
    notice("");
    try {
      await reloadTags();
      suggestions =
        kind === "dup" ? await api.scanDuplicates() : await api.scanFormat();
      const label = kind === "dup" ? "Duplicate tags" : "Formatting fixes";
      renderSuggestions(
        `${label}: ${fmt(suggestions.length)} group${suggestions.length === 1 ? "" : "s"}`,
      );
    } catch (e) {
      notice(String((e && e.message) || e), "err");
    } finally {
      setBusy(false);
    }
  }

  /* ---------- AI scan ---------- */

  async function refreshPlan() {
    const el = $("ai-plan");
    try {
      const p = await api.planAI();
      aiOK = p.ready && p.sent > 0;
      $("scan-ai").disabled = busy || !aiOK;
      if (!p.ready) {
        el.textContent = p.error + " ";
        const open = h("button", "link", "Open settings");
        open.addEventListener("click", () => api.openSettings());
        el.append(open);
      } else if (!p.sent) {
        el.textContent =
          "Every tag has been checked. Use Budget, then Forget checked tags, to check again.";
      } else {
        const tok =
          p.tokens >= 1000
            ? (p.tokens / 1000).toFixed(1) + "k"
            : String(p.tokens);
        el.textContent =
          `Sends tag names only. Next scan: ${fmt(p.sent)} tags, ${p.requests} request${p.requests === 1 ? "" : "s"}, about ${tok} tokens, to ${p.provider} (${p.model}).` +
          (p.pending
            ? ` ${fmt(p.pending)} more tags are left for later scans.`
            : "");
      }
    } catch (e) {
      el.textContent =
        "Could not prepare the AI scan: " + String((e && e.message) || e);
      aiOK = false;
      $("scan-ai").disabled = true;
    }
  }

  async function runAI() {
    if (busy) return;
    setBusy(true);
    notice("");
    cancel = { value: false };
    $("progress").hidden = false;
    $("bar-fill").style.width = "0%";
    $("progress-text").textContent = "Starting...";
    try {
      await reloadTags();
      const res = await api.scanAI((text, pct) => {
        $("progress-text").textContent = text;
        $("bar-fill").style.width = pct + "%";
      }, cancel);
      suggestions = res.suggestions;
      renderSuggestions(
        `AI suggestions: ${fmt(suggestions.length)} group${suggestions.length === 1 ? "" : "s"}`,
      );
      if (res.errors.length) notice(res.errors.join("\n\n"), "err");
      else if (!suggestions.length)
        notice(
          "The model found no tags with the same meaning in this batch.",
          "",
        );
    } catch (e) {
      notice(String((e && e.message) || e), "err");
    } finally {
      $("progress").hidden = true;
      setBusy(false);
      refreshPlan();
    }
  }

  /* ---------- applying changes ---------- */

  function resultNotice(label, items, errors) {
    if (errors.length) notice(`${label}\n${errors.join("\n")}`, "err");
    else
      notice(
        `${label} ${fmt(items)} item${items === 1 ? "" : "s"} updated.`,
        "ok",
      );
  }

  async function applyGroups() {
    const sel = suggestions.filter((s) => s.selected);
    if (!sel.length || busy) return;
    setBusy(true);
    try {
      const res = await api.apply(
        sel.map((s) => ({
          target: s.target,
          sources: s.members.map((m) => m.name).filter((n) => n !== s.target),
        })),
      );
      resultNotice(
        `Merged ${fmt(res.tagsMerged)} tag${res.tagsMerged === 1 ? "" : "s"}.`,
        res.itemsMoved,
        res.errors,
      );
      const done = new Set(sel.map((s) => s.id));
      suggestions = suggestions.filter((s) => !done.has(s.id));
      await reloadTags();
      const live = new Set(tags.map((t) => t.name));
      suggestions = suggestions
        .map((s) => {
          s.members = s.members.filter((m) => live.has(m.name));
          if (!live.has(s.target) && s.members.length)
            s.target = s.members[0].name;
          return s;
        })
        .filter((s) => s.members.length > 1);
      renderSuggestions();
    } catch (e) {
      notice(String((e && e.message) || e), "err");
    } finally {
      setBusy(false);
      refreshUndo();
      refreshPlan();
    }
  }

  async function mergePicked() {
    if (!picked.size || busy) return;
    const target = $("sel-target").value.trim();
    if (!target) return;
    const names = [...picked];
    setBusy(true);
    try {
      if (names.length === 1) {
        const res = await api.rename(names[0], target);
        resultNotice(
          `Renamed "${names[0]}" to "${target}".`,
          res.itemsMoved,
          res.errors,
        );
      } else {
        const res = await api.apply([
          { target, sources: names.filter((n) => n !== target) },
        ]);
        resultNotice(
          `Merged ${fmt(names.length)} tags into "${target}".`,
          res.itemsMoved,
          res.errors,
        );
      }
      picked.clear();
      await reloadTags();
    } catch (e) {
      notice(String((e && e.message) || e), "err");
    } finally {
      setBusy(false);
      refreshUndo();
    }
  }

  async function deletePicked() {
    if (!picked.size || busy) return;
    const names = [...picked];
    const counts = new Map(tags.map((t) => [t.name, t.count]));
    const items = names.reduce((n, x) => n + (counts.get(x) || 0), 0);
    if (
      !window.confirm(
        `Delete ${fmt(names.length)} tag${names.length === 1 ? "" : "s"} from up to ${fmt(items)} item${items === 1 ? "" : "s"}?\n\nYou can undo this until you close the window.`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await api.deleteTags(names);
      if (res.errors.length) notice(res.errors.join("\n"), "err");
      else
        notice(
          `Deleted ${fmt(res.deleted)} tag${res.deleted === 1 ? "" : "s"}.`,
          "ok",
        );
      picked.clear();
      await reloadTags();
    } catch (e) {
      notice(String((e && e.message) || e), "err");
    } finally {
      setBusy(false);
      refreshUndo();
    }
  }

  async function undo() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.undo();
      if (res.label)
        notice(
          `Undid "${res.label}". ${fmt(res.items)} item${res.items === 1 ? "" : "s"} restored.`,
          "ok",
        );
      await reloadTags();
    } catch (e) {
      notice(String((e && e.message) || e), "err");
    } finally {
      setBusy(false);
      refreshUndo();
      refreshPlan();
    }
  }

  /* ---------- wiring ---------- */

  function showTab(name) {
    for (const t of document.querySelectorAll(".tab"))
      t.classList.toggle("active", t.dataset.tab === name);
    $("suggest").hidden = name !== "suggest";
    $("all").hidden = name !== "all";
    $("merge-selected").hidden = name !== "suggest";
  }
  for (const t of document.querySelectorAll(".tab"))
    t.addEventListener("click", () => showTab(t.dataset.tab));

  $("scan-dup").addEventListener("click", () => runLocal("dup"));
  $("scan-fmt").addEventListener("click", () => runLocal("fmt"));
  $("scan-ai").addEventListener("click", runAI);
  $("cancel-scan").addEventListener("click", () => {
    cancel.value = true;
    $("progress-text").textContent = "Cancelling after the current request...";
  });
  $("merge-selected").addEventListener("click", applyGroups);
  $("undo").addEventListener("click", undo);
  $("close").addEventListener("click", () => window.close());
  $("sug-all").addEventListener("click", () => {
    suggestions.forEach((s) => (s.selected = true));
    renderSuggestions();
  });
  $("sug-none").addEventListener("click", () => {
    suggestions.forEach((s) => (s.selected = false));
    renderSuggestions();
  });

  $("q").addEventListener("input", () => {
    shown = PAGE;
    renderTagList();
  });
  for (const id of ["sort", "filter"])
    $(id).addEventListener("change", () => {
      shown = PAGE;
      renderTagList();
    });
  $("more").addEventListener("click", () => {
    shown += PAGE;
    renderTagList();
  });
  $("pick-shown").addEventListener("click", () => {
    for (const t of visibleTags().slice(0, shown)) picked.add(t.name);
    renderTagList();
    updateSelbar(true);
  });
  $("sel-clear").addEventListener("click", () => {
    picked.clear();
    renderTagList();
  });
  $("sel-merge").addEventListener("click", mergePicked);
  $("sel-delete").addEventListener("click", deletePicked);
  $("sel-target").addEventListener("keydown", (e) => {
    if (e.key === "Enter") mergePicked();
  });

  $("budget-toggle").addEventListener("click", () => {
    $("budget").hidden = !$("budget").hidden;
  });
  const saveBudget = () => {
    api.setBudget({
      maxTagsPerRequest: Number($("b-tags").value),
      maxRequests: Number($("b-req").value),
    });
    refreshPlan();
  };
  $("b-tags").addEventListener("change", saveBudget);
  $("b-req").addEventListener("change", saveBudget);
  $("b-reset").addEventListener("click", () => {
    api.forgetReviewed();
    status("Checked tags forgotten.");
    refreshPlan();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !busy) window.close();
  });

  (async function init() {
    if (!api) {
      $("stats").textContent = "Tag manager could not start.";
      return;
    }
    $("lib").textContent = api.libraryName;
    const b = api.getBudget();
    $("b-tags").value = b.maxTagsPerRequest;
    $("b-req").value = b.maxRequests;
    showTab("suggest");
    setBusy(true);
    try {
      await reloadTags();
    } catch (e) {
      notice("Could not read tags: " + String((e && e.message) || e), "err");
    }
    setBusy(false);
    refreshUndo();
    refreshPlan();
  })();
})();
