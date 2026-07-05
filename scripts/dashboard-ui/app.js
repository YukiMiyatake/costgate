function fmt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function badge(text, ok = false, extraClass = "") {
  const span = document.createElement("span");
  span.className = ["badge", ok ? "ok" : "", extraClass].filter(Boolean).join(" ");
  span.textContent = text;
  return span;
}

function tierBadge(tier, forced = false) {
  const base = (tier ?? "—").toLowerCase();
  const label = forced ? `${tier}*` : (tier ?? "—");
  return badge(label, false, `tier-badge tier-${base}`);
}

function dashHeaders() {
  const token = sessionStorage.getItem("costgate_dashboard_token");
  const h = { "Content-Type": "application/json" };
  if (token) h["X-Costgate-Dashboard-Token"] = token;
  return h;
}

async function fetchJson(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { ...dashHeaders(), ...options.headers },
  });
  if (!res.ok) {
    let err = {};
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      err = await res.json().catch(() => ({}));
    } else {
      const text = await res.text().catch(() => "");
      if (text) err = { error: text };
    }
    throw new Error(err.error ?? err.path ?? `${path}: HTTP ${res.status}`);
  }
  return res.json();
}

const WORKSPACE_EXPLICIT_KEY = "costgate_workspace_explicit";

let activeWorkspaceId = sessionStorage.getItem("costgate_workspace_id") || null;
let workspaceApiAvailable = true;

function isWorkspaceApiError(message) {
  if (!message) return false;
  return (
    message === "not_found" ||
    message.startsWith("unknown workspace:") ||
    /\/api\/workspaces\//.test(message)
  );
}

function clearWorkspaceSelection() {
  activeWorkspaceId = null;
  sessionStorage.removeItem("costgate_workspace_id");
  sessionStorage.removeItem(WORKSPACE_EXPLICIT_KEY);
  setActiveWorkspace(null, "Global (~/.costgate)");
}

function isExplicitWorkspaceChoice() {
  return sessionStorage.getItem(WORKSPACE_EXPLICIT_KEY) === "1";
}

function apiPath(segment) {
  if (activeWorkspaceId) {
    return `/api/workspaces/${encodeURIComponent(activeWorkspaceId)}/${segment}`;
  }
  return `/api/${segment}`;
}

function setActiveWorkspace(id, pathLabel, { explicit = false } = {}) {
  activeWorkspaceId = id || null;
  if (id) {
    sessionStorage.setItem("costgate_workspace_id", id);
    if (explicit) sessionStorage.setItem(WORKSPACE_EXPLICIT_KEY, "1");
  } else {
    sessionStorage.removeItem("costgate_workspace_id");
    if (explicit) sessionStorage.removeItem(WORKSPACE_EXPLICIT_KEY);
  }
  const note = document.getElementById("workspace-path");
  if (note) note.textContent = pathLabel ?? (id ? "" : "Global (~/.costgate)");
}

async function loadWorkspaces() {
  const select = document.getElementById("workspace-select");
  const bar = document.getElementById("workspace-bar");
  try {
    const data = await fetchJson("/api/workspaces");
    workspaceApiAvailable = true;
    if (bar) bar.classList.remove("hidden");
    if (!select) return data;
    select.innerHTML = "";
    const globalOpt = document.createElement("option");
    globalOpt.value = "";
    globalOpt.textContent = "Global (~/.costgate)";
    select.appendChild(globalOpt);
    for (const w of data.workspaces ?? []) {
      const opt = document.createElement("option");
      opt.value = w.id;
      opt.dataset.path = w.path;
      const pin = w.pinned ? "📌 " : "";
      const src = w.source_label ? ` · ${w.source_label}` : "";
      opt.textContent = `${pin}${w.label}${src}${w.has_config ? "" : " (new)"}`;
      select.appendChild(opt);
    }

    const help = document.getElementById("workspace-help");
    if (help) {
      help.textContent =
        data.help ??
        "Projects appear when Gate runs, Cursor opens a folder, or you Pin a path.";
    }

    let selectedId = isExplicitWorkspaceChoice() ? activeWorkspaceId : null;
    if (selectedId && ![...select.options].some((o) => o.value === selectedId)) {
      selectedId = null;
      sessionStorage.removeItem(WORKSPACE_EXPLICIT_KEY);
    }
    if (selectedId) {
      select.value = selectedId;
      activeWorkspaceId = selectedId;
    } else {
      select.value = "";
      activeWorkspaceId = null;
      sessionStorage.removeItem("costgate_workspace_id");
    }
    const current = data.workspaces?.find((w) => w.id === select.value);
    if (select.value) {
      setActiveWorkspace(select.value, current?.path);
    } else {
      setActiveWorkspace(null, "Global (~/.costgate)");
    }
    return data;
  } catch (e) {
    workspaceApiAvailable = false;
    clearWorkspaceSelection();
    if (select) {
      select.innerHTML = "";
      const globalOpt = document.createElement("option");
      globalOpt.value = "";
      globalOpt.textContent = "Global (~/.costgate)";
      select.appendChild(globalOpt);
      select.value = "";
    }
    if (bar) bar.classList.add("hidden");
    return { workspaces: [], legacy: true };
  }
}

function setupWorkspaces() {
  const select = document.getElementById("workspace-select");
  const pinBtn = document.getElementById("workspace-pin-btn");
  const refreshBtn = document.getElementById("workspace-refresh-btn");
  if (!select) return;
  select.addEventListener("change", async () => {
    const opt = select.selectedOptions[0];
    const id = select.value || null;
    setActiveWorkspace(id, id ? opt?.dataset?.path ?? opt?.textContent : "Global (~/.costgate)", {
      explicit: true,
    });
    try {
      await reload();
      await loadMarketplace();
    } catch (e) {
      alert(e.message);
    }
  });
  refreshBtn?.addEventListener("click", async () => {
    try {
      await loadWorkspaces();
      await reload();
      await loadMarketplace();
    } catch (e) {
      alert(e.message);
    }
  });
  pinBtn?.addEventListener("click", async () => {
    const path = prompt("Pin workspace folder (absolute path):");
    if (!path?.trim()) return;
    try {
      await fetchJson("/api/workspaces/pin", {
        method: "POST",
        body: JSON.stringify({ path: path.trim() }),
      });
      await loadWorkspaces();
      if (select.value) {
        sessionStorage.setItem(WORKSPACE_EXPLICIT_KEY, "1");
      }
      await reload();
    } catch (e) {
      alert(e.message);
    }
  });
}

function renderOverview(data) {
  const cards = document.getElementById("overview-cards");
  cards.innerHTML = "";
  const items = [
    ["Sessions", fmt(data.sessions)],
    ["tools/list tokens", `~${fmt(data.tools_list_tokens)}`],
    ["tool_call tokens", `~${fmt(data.tool_call_tokens)}`],
    ["MCP measurable", `~${fmt(data.mcp_measurable_total_tokens)}`],
    ["Fixed share", `${data.fixed_share_pct ?? 0}%`],
    ["Tools tracked", fmt(data.tool_count)],
    ["Recommendations", fmt(data.recommendation_count)],
    ["Blind spots", fmt(data.blind_spot_count)],
    ["Cursor mode", data.cursor_mode ?? "—"],
  ];
  if (data.prompt_intent?.keywords) {
    const pi = data.prompt_intent;
    const label = pi.stale ? "Prompt intent (stale)" : "Prompt intent";
    const value = pi.keywords;
    items.push([label, value]);
  } else {
    items.push(["Prompt intent", "—"]);
  }
  for (const [label, value] of items) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div class="label">${label}</div><div class="value">${value}</div>`;
    cards.appendChild(card);
  }
  const note = document.getElementById("overview-note");
  let noteText = "";
  if (data.period) {
    noteText = `Period: ${data.period.from} → ${data.period.to}. Gate/Probe 外 MCP は blind spot として表示されます。`;
  } else {
    noteText =
      "Probe ログがありません。npm run cursor:measurement で計測を開始してください。";
  }
  if (data.config_merge) {
    noteText +=
      " プロジェクト表示では Global の backends / overrides / disabled を継承し、同名キーはプロジェクト設定が優先されます。";
  }
  if (data.prompt_intent?.keywords) {
    const pi = data.prompt_intent;
    const templates = (pi.templates ?? []).join(", ") || "—";
    const sources = (pi.sources ?? []).join(", ") || "—";
    const age = pi.age_sec != null ? `${pi.age_sec}s ago` : "";
    noteText += ` Prompt intent: templates=[${templates}] sources=[${sources}]${age ? ` ${age}` : ""}.`;
  }
  note.textContent = noteText;
}

let toolsData = null;
let toolsTierFilter = "all";

function isToolMeasured(tool) {
  return tool.estimated_list_tokens != null;
}

function toolMatchesTierFilter(tool) {
  if (toolsTierFilter === "all") return true;
  if (toolsTierFilter === "hidden") return tool.tier === "hidden";
  if (toolsTierFilter === "visible") return tool.tier !== "hidden";
  return true;
}

function filterTools(tools) {
  const q = document.getElementById("tools-search")?.value.trim().toLowerCase() ?? "";
  const backend = document.getElementById("tools-backend-filter")?.value ?? "";
  const measured = document.getElementById("tools-measured-filter")?.value ?? "";
  const recOnly = document.getElementById("tools-rec-only")?.checked ?? false;
  const forcedOnly = document.getElementById("tools-forced-only")?.checked ?? false;

  return (tools ?? []).filter((t) => {
    if (q) {
      const hay = `${t.name} ${t.backend ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (backend && (t.backend ?? "") !== backend) return false;
    if (!toolMatchesTierFilter(t)) return false;
    if (recOnly && !t.recommendation) return false;
    if (forcedOnly && !t.forced_tier) return false;
    if (measured === "measured" && !isToolMeasured(t)) return false;
    if (measured === "unmeasured" && isToolMeasured(t)) return false;
    return true;
  });
}

function sortTools(tools) {
  const sortKey = document.getElementById("tools-sort")?.value ?? "call_count";
  const sorted = [...tools];
  sorted.sort((a, b) => {
    if (sortKey === "name") return a.name.localeCompare(b.name);
    if (sortKey === "call_count") {
      return b.call_count - a.call_count || a.name.localeCompare(b.name);
    }
    if (sortKey === "last_used") {
      const aTs = a.last_used ? Date.parse(a.last_used) : 0;
      const bTs = b.last_used ? Date.parse(b.last_used) : 0;
      return bTs - aTs || a.name.localeCompare(b.name);
    }
    if (sortKey === "list_tokens") {
      const aTok = a.estimated_list_tokens ?? -1;
      const bTok = b.estimated_list_tokens ?? -1;
      return bTok - aTok || a.name.localeCompare(b.name);
    }
    return 0;
  });
  return sorted;
}

function renderToolsTierTabs() {
  const container = document.getElementById("tools-tier-tabs");
  if (!container) return;
  container.innerHTML = "";
  for (const tier of [
    { id: "all", label: "All" },
    { id: "visible", label: "Visible" },
    { id: "hidden", label: "Hidden" },
  ]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `category-tab${toolsTierFilter === tier.id ? " active" : ""}`;
    btn.textContent = tier.label;
    btn.onclick = () => {
      toolsTierFilter = tier.id;
      renderToolsTierTabs();
      renderToolsTable();
    };
    container.appendChild(btn);
  }
}

function populateToolsBackendFilter(tools) {
  const select = document.getElementById("tools-backend-filter");
  if (!select) return;
  const prev = select.value;
  const backends = [...new Set((tools ?? []).map((t) => t.backend).filter(Boolean))].sort();
  select.innerHTML = '<option value="">All backends</option>';
  for (const b of backends) {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    select.appendChild(opt);
  }
  if (prev && backends.includes(prev)) select.value = prev;
}

function renderToolRow(t) {
  const tr = document.createElement("tr");
  const flag = t.recommendation ? badge(t.recommendation) : document.createTextNode("—");
  const hideBtn = document.createElement("button");
  hideBtn.type = "button";
  hideBtn.className = t.tier === "hidden" ? "btn-sm btn-enable" : "btn-sm btn-disable";
  hideBtn.textContent = t.tier === "hidden" ? "Unhide" : "Hide";
  hideBtn.onclick = async () => {
    try {
      await fetchJson(apiPath(`tools/${encodeURIComponent(t.name)}`), {
        method: "PATCH",
        body: JSON.stringify({
          force_tier: t.tier === "hidden" ? "default" : "hidden",
        }),
      });
      await reload();
      alert("Saved. Restart Gate (Cursor MCP reload) to apply tool overrides.");
    } catch (e) {
      alert(e.message);
    }
  };
  const listData = isToolMeasured(t) ? badge("measured", true) : badge("no list data");
  tr.innerHTML = `
    <td>${t.name}</td>
    <td>${t.backend ?? "—"}</td>
    <td></td>
    <td></td>
    <td>${fmt(t.call_count)}</td>
    <td>${fmtDate(t.last_used)}</td>
    <td>${t.estimated_list_tokens != null ? `~${fmt(t.estimated_list_tokens)}` : "—"}</td>
    <td></td>
    <td></td>`;
  tr.children[2].appendChild(tierBadge(t.tier, t.forced_tier));
  tr.children[3].appendChild(listData);
  tr.children[7].appendChild(flag);
  tr.children[8].appendChild(hideBtn);
  return tr;
}

function renderToolsTable() {
  if (!toolsData) return;
  const all = toolsData.tools ?? [];
  const filtered = sortTools(filterTools(all));
  const body = document.getElementById("tools-body");
  const empty = document.getElementById("tools-empty");
  const wrap = body?.closest(".table-wrap");
  const count = document.getElementById("tools-count");
  body.innerHTML = "";
  for (const t of filtered) {
    body.appendChild(renderToolRow(t));
  }
  if (empty) empty.classList.toggle("hidden", filtered.length > 0);
  wrap?.classList.toggle("hidden", filtered.length === 0);
  if (count) {
    count.textContent =
      filtered.length === all.length
        ? `${all.length} tool${all.length === 1 ? "" : "s"}`
        : `${filtered.length} / ${all.length} tools`;
  }
}

function renderTools(data) {
  toolsData = data;
  const blind = document.getElementById("tools-blind");
  if (data.blind_spots?.length) {
    blind.classList.remove("hidden");
    blind.textContent = `計測圏外 MCP: ${data.blind_spots.join(", ")}`;
  } else {
    blind.classList.add("hidden");
  }
  populateToolsBackendFilter(data.tools);
  renderToolsTierTabs();
  renderToolsTable();
}

function setupToolsControls() {
  const rerender = () => renderToolsTable();
  document.getElementById("tools-search")?.addEventListener("input", rerender);
  document.getElementById("tools-backend-filter")?.addEventListener("change", rerender);
  document.getElementById("tools-sort")?.addEventListener("change", rerender);
  document.getElementById("tools-measured-filter")?.addEventListener("change", rerender);
  for (const id of ["tools-rec-only", "tools-forced-only"]) {
    document.getElementById(id)?.addEventListener("change", rerender);
  }
}

function renderMcps(data) {
  const body = document.getElementById("mcps-body");
  const empty = document.getElementById("mcps-empty");
  const wrap = body?.closest(".table-wrap");
  body.innerHTML = "";
  const servers = data.servers ?? [];
  if (!servers.length) {
    empty?.classList.remove("hidden");
    wrap?.classList.add("hidden");
    return;
  }
  empty?.classList.add("hidden");
  wrap?.classList.remove("hidden");
  for (const s of servers) {
    const tr = document.createElement("tr");
    const measured = s.enabled === false
      ? badge("disabled")
      : s.measured
        ? badge("measured", true)
        : badge("blind spot");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = s.enabled === false ? "btn-sm btn-enable" : "btn-sm btn-disable";
    toggle.textContent = s.enabled === false ? "Enable" : "Disable";
    toggle.onclick = async () => {
      const enable = s.enabled === false;
      if (!enable && !confirm(`Disable MCP "${s.name}"? Cursor restart required.`)) return;
      try {
        await fetchJson(apiPath(`mcps/${encodeURIComponent(s.name)}`), {
          method: "PATCH",
          body: JSON.stringify({ enabled: enable }),
        });
        await reload();
        alert("mcp.json updated. Restart Cursor to apply.");
      } catch (e) {
        alert(e.message);
      }
    };
    tr.innerHTML = `
      <td>${s.name}</td>
      <td></td>
      <td></td>
      <td><code>${s.command ?? "—"}</code></td>
      <td></td>`;
    const roleCell = tr.children[1];
    roleCell.textContent = s.role;
    if (s.config_origin && s.role === "backend") {
      roleCell.appendChild(document.createElement("br"));
      roleCell.appendChild(
        badge(
          s.config_origin === "global" ? "Global" : "Project",
          s.config_origin === "project"
        )
      );
    }
    tr.children[2].appendChild(measured);
    tr.children[4].appendChild(toggle);
    body.appendChild(tr);
  }
}

function recKindBadge(kind) {
  const labels = {
    add_mcp: "Add MCP",
    switch_mcp: "Switch",
    consolidate_mcp: "Consolidate",
    delete_tool: "Delete tool",
    delete_backend: "Delete backend",
  };
  const ok = kind === "add_mcp" || kind === "switch_mcp";
  return badge(labels[kind] ?? kind, ok);
}

async function openAddMcpTab(templateId) {
  const tab = document.querySelector('#tabs button[data-tab="add-mcp"]');
  if (tab) tab.click();
  const searchInput = document.getElementById("marketplace-search");
  if (searchInput && templateId) searchInput.value = templateId;
  try {
    const data = await loadMarketplace(templateId);
    if (!templateId) return;
    const match = (data.templates ?? []).find(
      (t) => t.id === templateId || t.name.toLowerCase() === templateId.toLowerCase()
    );
    if (match) openWizard(match);
  } catch (e) {
    alert(e.message);
  }
}

function renderRecommendations(data) {
  const list = document.getElementById("rec-list");
  const sections = document.getElementById("rec-sections");
  const empty = document.getElementById("rec-empty");
  list.innerHTML = "";
  sections.innerHTML = "";

  const items = data.items ?? [];
  const addItems = items.filter((r) => r.kind === "add_mcp" || r.kind === "switch_mcp" || r.kind === "consolidate_mcp");
  const deleteItems = items.filter((r) => r.kind === "delete_tool" || r.kind === "delete_backend");

  if (items.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  if (data.signals_detected?.length) {
    const sig = document.createElement("p");
    sig.className = "note rec-meta";
    sig.textContent = `Project signals: ${data.signals_detected.join(", ")} (${data.project_root ?? "—"})`;
    sections.appendChild(sig);
  }

  const renderGroup = (title, group) => {
    if (!group.length) return;
    const heading = document.createElement("h3");
    heading.className = "rec-section-title";
    heading.textContent = title;
    sections.appendChild(heading);
    for (const r of group) {
      const li = document.createElement("li");
      li.className = `rec-item rec-${r.kind}`;
      const head = document.createElement("div");
      head.className = "rec-head";
      head.appendChild(recKindBadge(r.kind));
      const target = document.createElement("strong");
      target.textContent = ` ${r.target}`;
      head.appendChild(target);
      if (r.score != null) {
        const score = document.createElement("span");
        score.className = "rec-score";
        score.textContent = `score ${r.score}`;
        head.appendChild(score);
      }
      li.appendChild(head);
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = r.detail ?? "";
      li.appendChild(note);
      if (r.signals?.length) {
        const sigLine = document.createElement("div");
        sigLine.className = "rec-signals";
        sigLine.textContent = `signals: ${r.signals.join(", ")}`;
        li.appendChild(sigLine);
      }
      if (r.template && (r.kind === "add_mcp" || r.kind === "switch_mcp")) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-sm";
        btn.textContent = `Open ${r.template} wizard`;
        btn.onclick = () => openAddMcpTab(r.template);
        li.appendChild(btn);
      }
      list.appendChild(li);
    }
  };

  renderGroup("Add / switch candidates", addItems);
  renderGroup("Delete candidates", deleteItems);
}

let selectedTemplate = null;
let wizardContext = { path_candidates: [], project_root: null };

function renderPathCandidates(input, spec) {
  if (!spec.path_suggestions && spec.name !== "ALLOWED_PATH") return;
  const candidates = wizardContext.path_candidates ?? [];
  if (!candidates.length) return;

  const wrap = document.createElement("div");
  wrap.className = "path-suggest";
  const title = document.createElement("div");
  title.className = "path-suggest-title";
  title.textContent = "Suggested paths (click to use):";
  wrap.appendChild(title);

  const list = document.createElement("div");
  list.className = "path-suggest-list";
  for (const c of candidates) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "path-suggest-chip";
    btn.title = c.path;
    btn.textContent = `${c.label}: ${c.path}`;
    btn.onclick = () => {
      input.value = c.path;
      input.focus();
    };
    list.appendChild(btn);
  }
  wrap.appendChild(list);
  input.parentElement.appendChild(wrap);

  if (!input.value && candidates[0]?.path) {
    input.value = candidates[0].path;
  }
}

function renderCompareEstimate(est) {
  if (!est) return "Cost estimate unavailable.";
  return `~${fmt(est.before_tokens)} → ~${fmt(est.after_tokens)} tokens/tools/list (${est.reduction_pct}% reduction, ${est.tool_count ?? "?"} tools)`;
}

function renderMarketplaceBadges(t) {
  const parts = [];
  if (t.installed) parts.push('<span class="badge badge-installed">Installed</span>');
  if (t.official) parts.push('<span class="badge badge-official">Official</span>');
  if (t.gate_ready) parts.push('<span class="badge badge-gate">Gate ready</span>');
  if (t.popularity === "high") parts.push('<span class="badge badge-pop">Popular</span>');
  return parts.length ? `<div class="marketplace-card-badges">${parts.join("")}</div>` : "";
}

function renderCategoryTabs(categories, activeId) {
  const container = document.getElementById("marketplace-categories");
  if (!container) return;
  container.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = `category-tab${activeId ? "" : " active"}`;
  allBtn.textContent = "All";
  allBtn.onclick = () => {
    marketplaceCategory = "";
    loadMarketplace().catch((e) => alert(e.message));
  };
  container.appendChild(allBtn);
  for (const cat of categories ?? []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `category-tab${activeId === cat.id ? " active" : ""}`;
    btn.textContent = `${cat.label} (${cat.count})`;
    btn.onclick = () => {
      marketplaceCategory = cat.id;
      loadMarketplace().catch((e) => alert(e.message));
    };
    container.appendChild(btn);
  }
}

function marketplaceQueryParams() {
  const params = new URLSearchParams();
  const q = document.getElementById("marketplace-search")?.value.trim();
  if (q) params.set("q", q);
  if (marketplaceCategory) params.set("category", marketplaceCategory);
  const sort = document.getElementById("marketplace-sort")?.value;
  if (sort && sort !== "name") params.set("sort", sort);
  if (document.getElementById("filter-gate-only")?.checked) params.set("gate_only", "1");
  if (document.getElementById("filter-official-only")?.checked) params.set("official_only", "1");
  if (document.getElementById("filter-hide-secrets")?.checked) params.set("hide_secrets", "1");
  return params;
}

let marketplaceCategory = "";

function setMarketplaceBrowseVisible(visible) {
  const browse = document.getElementById("marketplace-browse");
  if (browse) {
    browse.classList.toggle("hidden", !visible);
    return;
  }
  document.getElementById("marketplace-results")?.classList.toggle("hidden", !visible);
}

function renderMarketplaceResults(templates) {
  const grid = document.getElementById("marketplace-results");
  const form = document.getElementById("wizard-form");
  const wizardOpen = selectedTemplate != null && !form.classList.contains("hidden");
  grid.innerHTML = "";
  if (!wizardOpen) {
    form.classList.add("hidden");
    selectedTemplate = null;
    setMarketplaceBrowseVisible(true);
  }

  if (!templates.length) {
    grid.innerHTML = '<p class="empty-state">No templates match your filters.</p>';
    return;
  }

  for (const t of templates) {
    const card = document.createElement("div");
    card.className = `marketplace-card${t.installed ? " installed" : ""}`;
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="marketplace-card-title">${t.name}</div>
      ${renderMarketplaceBadges(t)}
      <div class="marketplace-card-meta">${t.category_label ?? t.category} · ${(t.tags ?? []).slice(0, 3).join(", ")}</div>
      <div class="marketplace-card-desc">${t.description}</div>
      <div class="marketplace-card-est">${renderCompareEstimate(t.compare_estimate)}</div>`;
    const open = () => openWizard(t);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
    grid.appendChild(card);
  }
}

function openWizard(template) {
  selectedTemplate = template;
  setMarketplaceBrowseVisible(false);
  const form = document.getElementById("wizard-form");
  form.classList.remove("hidden");
  document.getElementById("wizard-title").textContent = template.name;
  document.getElementById("wizard-desc").textContent = template.description;

  const envFields = document.getElementById("wizard-env-fields");
  envFields.innerHTML = "";
  for (const spec of template.required_env ?? []) {
    const label = document.createElement("label");
    label.className = "wizard-env-label";
    const input = document.createElement("input");
    input.type = spec.secret ? "password" : "text";
    input.name = spec.name;
    input.placeholder = spec.description;
    input.dataset.envName = spec.name;
    label.innerHTML = `<span>${spec.name}</span>`;
    label.appendChild(input);
    renderPathCandidates(input, spec);
    envFields.appendChild(label);
  }
  if (!(template.required_env ?? []).length) {
    envFields.innerHTML = '<p class="note">No environment variables required.</p>';
  }

  document.getElementById("wizard-estimate").textContent = renderCompareEstimate(
    template.compare_estimate
  );

  const hint = document.getElementById("wizard-hint");
  if (template.builtin_hint) {
    hint.textContent = template.builtin_hint;
    hint.classList.remove("hidden");
  } else {
    hint.classList.add("hidden");
  }

  const confirm = document.getElementById("wizard-confirm");
  confirm.textContent =
    template.install_target === "builtin" ? "Show instructions" : "Add MCP";
}

function closeWizard() {
  selectedTemplate = null;
  document.getElementById("wizard-form").classList.add("hidden");
  setMarketplaceBrowseVisible(true);
}

async function loadMarketplace(query) {
  const searchInput = document.getElementById("marketplace-search");
  if (query != null && searchInput) searchInput.value = query;
  const params = marketplaceQueryParams();
  const qs = params.toString();
  const data = await fetchJson(`${apiPath("marketplace")}${qs ? `?${qs}` : ""}`);
  if (data.catalog_available === false) {
    throw new Error(
      `Marketplace catalog not found (${data.catalog_dir ?? "unknown"}). Run dashboard from the costgate repo or set COSTGATE_MARKETPLACE_DIR.`
    );
  }
  wizardContext = {
    project_root: data.project_root ?? null,
    path_candidates: data.path_candidates ?? [],
  };
  renderCategoryTabs(data.categories ?? [], marketplaceCategory);
  renderMarketplaceResults(data.templates ?? []);
  return data;
}

function setupWizard() {
  const searchInput = document.getElementById("marketplace-search");
  const searchBtn = document.getElementById("marketplace-search-btn");
  const runSearch = () => loadMarketplace().catch((e) => alert(e.message));
  searchBtn.onclick = runSearch;
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
  });

  document.getElementById("marketplace-sort")?.addEventListener("change", runSearch);
  for (const id of ["filter-gate-only", "filter-official-only", "filter-hide-secrets"]) {
    document.getElementById(id)?.addEventListener("change", runSearch);
  }

  document.getElementById("wizard-back").onclick = closeWizard;
  document.getElementById("wizard-confirm").onclick = async () => {
    if (!selectedTemplate) return;
    if (selectedTemplate.install_target === "builtin") {
      alert(selectedTemplate.builtin_hint ?? "Enable this MCP in Cursor Settings.");
      return;
    }
    const env = {};
    document.querySelectorAll("#wizard-env-fields input[data-env-name]").forEach((input) => {
      env[input.dataset.envName] = input.value;
    });
    try {
      const result = await fetchJson(apiPath("mcps"), {
        method: "POST",
        body: JSON.stringify({ template: selectedTemplate.id, env }),
      });
      let msg = "MCP configuration saved.";
      if (result.backend) msg += ` backends.json: ${result.backend}.`;
      if (result.compare_estimate) {
        msg += ` Estimated cost: ${renderCompareEstimate(result.compare_estimate)}.`;
      }
      if (result.requires_cursor_restart) msg += " Restart Cursor to apply.";
      alert(msg);
      closeWizard();
      await reload();
      await loadMarketplace();
    } catch (e) {
      alert(e.message);
    }
  };
}

function setupTabs() {
  const buttons = document.querySelectorAll("#tabs button");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
    });
  });
}

function setupTokenBar(health) {
  const bar = document.getElementById("token-bar");
  const input = document.getElementById("dash-token");
  const mode = document.getElementById("write-mode");
  if (health.writes?.token_required) {
    bar.classList.remove("hidden");
    mode.textContent = "writes: token required";
  } else {
    mode.textContent = "writes: localhost";
  }
  input.value = sessionStorage.getItem("costgate_dashboard_token") ?? "";
  input.addEventListener("change", () => {
    sessionStorage.setItem("costgate_dashboard_token", input.value);
  });
}

async function reload(retryGlobal = true) {
  try {
    const [overview, tools, mcps, recs] = await Promise.all([
      fetchJson(apiPath("overview")),
      fetchJson(apiPath("tools")),
      fetchJson(apiPath("mcps")),
      fetchJson(apiPath("recommendations")),
    ]);
    renderOverview(overview);
    renderTools(tools);
    renderMcps(mcps);
    renderRecommendations(recs);
  } catch (e) {
    if (retryGlobal && activeWorkspaceId && isWorkspaceApiError(e.message)) {
      clearWorkspaceSelection();
      const select = document.getElementById("workspace-select");
      if (select) select.value = "";
      return reload(false);
    }
    throw e;
  }
}

async function main() {
  setupTabs();
  setupToolsControls();
  setupWizard();
  setupWorkspaces();
  try {
    const health = await fetchJson("/api/health");
    setupTokenBar(health);
    document.getElementById("health-status").textContent =
      `health: ${health.status} · ${health.version} · probe logs: ${health.data_sources.probe_logs ? "yes" : "no"}`;
    await loadWorkspaces();
    await reload();
    await loadMarketplace();
  } catch (err) {
    document.getElementById("health-status").textContent = `Error: ${err.message}`;
  }
}

main();
