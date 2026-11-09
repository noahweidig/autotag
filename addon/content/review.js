/* Autotag review window. Plain script, runs in the dialog's chrome window. */
(function () {
  const arg = window.arguments && window.arguments[0];
  const io = (arg && arg.wrappedJSObject) ||
    arg || { rows: [], accepted: false };
  const rows = io.rows || [];
  const $ = (id) => document.getElementById(id);
  const list = $("list");

  function updateSummary() {
    const on = rows.filter((r) => r.apply);
    const n = on.reduce((s, r) => s + r.tags.length, 0);
    $("summary").textContent =
      `${on.length} of ${rows.length} item(s) selected, ${n} tag(s) to add.`;
    $("apply").disabled = !on.length;
  }

  function render(row, card) {
    card.textContent = "";
    card.classList.toggle("off", !row.apply);

    const head = document.createElement("div");
    head.className = "card-head";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = row.apply;
    cb.addEventListener("change", () => {
      row.apply = cb.checked;
      card.classList.toggle("off", !row.apply);
      updateSummary();
    });
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = row.title;
    head.append(cb, title);
    card.append(head);

    if (row.existing && row.existing.length) {
      const ex = document.createElement("div");
      ex.className = "existing";
      ex.textContent = "Existing: " + row.existing.join(", ");
      card.append(ex);
    }

    const chips = document.createElement("div");
    chips.className = "chips";
    row.tags.forEach((tag, i) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.append(document.createTextNode(tag));
      const src = row.sources && row.sources[tag.toLowerCase()];
      if (src) {
        const badge = document.createElement("small");
        badge.className = "src";
        badge.textContent = src;
        badge.title = "Suggested by " + src;
        chip.append(badge);
      }
      const x = document.createElement("button");
      x.type = "button";
      x.textContent = "×";
      x.title = "Remove";
      x.addEventListener("click", () => {
        row.tags.splice(i, 1);
        render(row, card);
        updateSummary();
      });
      chip.append(x);
      chips.append(chip);
    });
    const add = document.createElement("input");
    add.className = "add";
    add.placeholder = "+ add tag";
    add.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== ",") return;
      e.preventDefault();
      const v = add.value.trim();
      if (!v) return;
      if (!row.tags.some((t) => t.toLowerCase() === v.toLowerCase()))
        row.tags.push(v);
      render(row, card);
      updateSummary();
      const again = card.querySelector(".add");
      if (again) again.focus();
    });
    chips.append(add);
    card.append(chips);
  }

  const cards = rows.map((row) => {
    const card = document.createElement("section");
    card.className = "card";
    render(row, card);
    list.append(card);
    return { row, card };
  });

  $("select-all").addEventListener("click", () => {
    rows.forEach((r) => (r.apply = true));
    cards.forEach((c) => render(c.row, c.card));
    updateSummary();
  });
  $("select-none").addEventListener("click", () => {
    rows.forEach((r) => (r.apply = false));
    cards.forEach((c) => render(c.row, c.card));
    updateSummary();
  });
  $("filter").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    cards.forEach((c) => {
      c.card.hidden = !!q && !c.row.title.toLowerCase().includes(q);
    });
  });
  $("apply").addEventListener("click", () => {
    io.accepted = true;
    window.close();
  });
  $("cancel").addEventListener("click", () => {
    io.accepted = false;
    window.close();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") window.close();
  });
  updateSummary();
})();
