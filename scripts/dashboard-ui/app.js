import {
  t,
  fmt,
  formatDateTime as fmtDate,
  relativeAge,
  applyStaticI18n,
  loadUiSettingsFromApi,
  saveUiSettingsToApi,
  gateSettingLabel,
  gateSettingHint,
  shieldSettingLabel,
  shieldSettingHint,
} from "./i18n.mjs";

function showToast(message, { kind = "error" } = {}) {
  const root = document.getElementById("toast-root");
  if (!root || !message) return;
  const toast = document.createElement("div");
  toast.className = `toast${kind === "success" ? " toast--success" : ""}`;
  const icon = document.createElement("span");
  icon.className = "toast__icon";
  icon.textContent = kind === "success" ? "✓" : "!";
  const body = document.createElement("div");
  body.className = "toast__body";
  body.textContent = message;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast__close";
  close.textContent = "×";
  close.addEventListener("click", () => {
    root.removeChild(toast);
  });
  toast.appendChild(icon);
  toast.appendChild(body);
  toast.appendChild(close);
  root.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement === root) {
      root.removeChild(toast);
    }
  }, 5000);
}

function globalLabel() {
  return t("workspace.global");
}

function relativeAgeSec(sec) {
  if (sec == null) return "";
  return relativeAge(new Date(Date.now() - sec * 1000).toISOString());
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
  setActiveWorkspace(null, globalLabel());
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

/** Global-only APIs (not scoped to workspace). */
function globalApiPath(segment) {
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
  if (note) note.textContent = pathLabel ?? (id ? "" : globalLabel());
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
    globalOpt.textContent = globalLabel();
    select.appendChild(globalOpt);
    for (const w of data.workspaces ?? []) {
      const opt = document.createElement("option");
      opt.value = w.id;
      opt.dataset.path = w.path;
      const pin = w.pinned ? "📌 " : "";
      const src = w.source_label ? ` · ${w.source_label}` : "";
      opt.textContent = `${pin}${w.label}${src}${w.has_config ? "" : t("workspace.newSuffix")}`;
      select.appendChild(opt);
    }

    const help = document.getElementById("workspace-help");
    if (help) {
      help.textContent = data.help ?? t("workspace.help");
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
      setActiveWorkspace(null, globalLabel());
    }
    return data;
  } catch (e) {
    workspaceApiAvailable = false;
    clearWorkspaceSelection();
    if (select) {
      select.innerHTML = "";
      const globalOpt = document.createElement("option");
      globalOpt.value = "";
      globalOpt.textContent = globalLabel();
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
    setActiveWorkspace(id, id ? opt?.dataset?.path ?? opt?.textContent : globalLabel(), {
      explicit: true,
    });
    try {
      await reload();
      await loadGateSettings();
      await loadMarketplace();
    } catch (e) {
      showToast(e.message);
    }
  });
  refreshBtn?.addEventListener("click", async () => {
    try {
      await loadWorkspaces();
      await reload();
      await loadGateSettings();
      await loadMarketplace();
    } catch (e) {
      showToast(e.message);
    }
  });
  pinBtn?.addEventListener("click", async () => {
    const path = prompt(t("workspace.pinPrompt"));
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
      showToast(e.message);
    }
  });
}

const MCP_TRUST_LEVELS = ["trusted", "standard", "restricted", "untrusted"];

function trustBadge(trust, origin) {
  const level = (trust ?? "—").toLowerCase();
  const label = origin && origin !== "default" && origin !== "config" ? `${trust} (${origin})` : (trust ?? "—");
  const ok = level === "trusted" || level === "standard";
  return badge(label, ok, `trust-badge trust-${level}`);
}

function trustSelect(server) {
  const select = document.createElement("select");
  select.className = "trust-select";
  select.title =
    server.origin && server.origin !== "default" && server.origin !== "config"
      ? t("mcps.trustResolved", { origin: server.resolved_from ?? server.origin })
      : t("mcps.trustLevel");
  for (const level of MCP_TRUST_LEVELS) {
    const opt = document.createElement("option");
    opt.value = level;
    opt.textContent = level;
    select.appendChild(opt);
  }
  const current = MCP_TRUST_LEVELS.includes(server.trust) ? server.trust : "restricted";
  select.value = current;
  let lastValue = current;
  let saving = false;
  select.addEventListener("change", async () => {
    if (saving) return;
    const next = select.value;
    const prev = lastValue;
    saving = true;
    select.disabled = true;
    try {
      await fetchJson(apiPath("mcp-trust"), {
        method: "PATCH",
        body: JSON.stringify({ server: server.name, trust: next }),
      });
      lastValue = next;
      await reload();
    } catch (e) {
      select.value = prev;
      showToast(e.message);
    } finally {
      select.disabled = false;
      saving = false;
    }
  });
  return select;
}

function renderOverview(data) {
  const cards = document.getElementById("overview-cards");
  cards.innerHTML = "";
  const dash = t("common.dash");
  const items = [
    [t("overview.sessions"), fmt(data.sessions)],
    [t("overview.toolsListTokens"), `~${fmt(data.tools_list_tokens)}`],
    [t("overview.toolCallTokens"), `~${fmt(data.tool_call_tokens)}`],
    [t("overview.mcpMeasurable"), `~${fmt(data.mcp_measurable_total_tokens)}`],
    [t("overview.fixedShare"), `${data.fixed_share_pct ?? 0}%`],
    [t("overview.toolsTracked"), fmt(data.tool_count)],
    [t("overview.recommendations"), fmt(data.recommendation_count)],
    [t("overview.blindSpots"), fmt(data.blind_spot_count)],
    [t("overview.trustRestricted"), fmt(data.trust_restricted_count ?? 0)],
    [t("overview.shieldBlocks"), fmt(data.shield_prompt_block_count ?? data.shield_prompt?.block_count ?? 0)],
    [t("overview.cursorMode"), data.cursor_mode ?? dash],
  ];
  if (data.prompt_intent?.keywords) {
    const pi = data.prompt_intent;
    const label = pi.stale ? t("overview.promptIntentStale") : t("overview.promptIntent");
    items.push([label, pi.keywords]);
  } else {
    items.push([t("overview.promptIntent"), dash]);
  }
  const sp = data.shield_prompt;
  if (sp?.last_block?.kinds?.length) {
    const lb = sp.last_block;
    const age = relativeAgeSec(lb.age_sec);
    const kinds = lb.kinds.join(", ");
    const label = lb.stale ? t("overview.lastShieldBlockStale") : t("overview.lastShieldBlock");
    items.push([label, `${kinds}${age ? ` · ${age}` : ""}`]);
  } else {
    items.push([t("overview.lastShieldBlock"), dash]);
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
    noteText = t("overview.periodNote", { from: data.period.from, to: data.period.to });
  } else {
    noteText = t("overview.probeMissing");
  }
  if (data.config_merge) {
    noteText += t("overview.configMergeNote");
  }
  if (data.prompt_intent?.keywords) {
    const pi = data.prompt_intent;
    const templates = (pi.templates ?? []).join(", ") || dash;
    const sources = (pi.sources ?? []).join(", ") || dash;
    const age = relativeAgeSec(pi.age_sec);
    noteText += t("overview.promptIntentDetail", {
      templates,
      sources,
      age: age ? ` ${age}` : "",
    });
  }
  if (data.shield_prompt?.aggressive) {
    noteText += t("overview.shieldAggressive");
  }
  note.textContent = noteText;
  renderShieldPromptPanel(data.shield_prompt);
}

function renderShieldFinding(finding) {
  const span = document.createElement("span");
  span.className = "shield-finding";
  span.innerHTML = `<strong>${finding.kind}</strong> <code>${finding.masked ?? "••••"}</code>`;
  return span;
}

function renderShieldPromptPanel(snapshot) {
  const panel = document.getElementById("shield-prompt-panel");
  const note = document.getElementById("shield-prompt-note");
  const findingsEl = document.getElementById("shield-prompt-findings");
  const sanitizedEl = document.getElementById("shield-prompt-sanitized");
  if (!panel || !note || !findingsEl || !sanitizedEl) return;

  const last = snapshot?.last_block;
  if (!last?.findings?.length) {
    panel.classList.add("hidden");
    findingsEl.innerHTML = "";
    sanitizedEl.value = "";
    return;
  }

  panel.classList.remove("hidden");
  const age = relativeAgeSec(last.age_sec);
  const stale = last.stale ? t("overview.staleSuffix") : "";
  note.textContent =
    last.message ??
    t("overview.shieldDetected", {
      kinds: last.kinds?.join(", ") ?? "secrets",
      age: age ? ` ${age}` : "",
      stale,
    });

  findingsEl.innerHTML = "";
  for (const f of last.findings ?? []) {
    findingsEl.appendChild(renderShieldFinding(f));
  }

  loadShieldPromptSanitized(sanitizedEl);
}

async function loadShieldPromptSanitized(textarea) {
  if (!textarea) return;
  try {
    const data = await fetchJson(apiPath("shield-prompt"));
    const sanitized = data.latest?.sanitized ?? "";
    textarea.value = sanitized;
    textarea.placeholder = sanitized ? "" : t("overview.shieldNoSanitized");
  } catch {
    textarea.placeholder = t("overview.shieldLoadFail");
  }
}

function setupShieldPromptPanel() {
  document.getElementById("shield-prompt-copy")?.addEventListener("click", async () => {
    const text = document.getElementById("shield-prompt-sanitized")?.value ?? "";
    if (!text.trim()) {
      showToast(t("overview.shieldCopyEmpty"));
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast(t("overview.shieldCopyOk"), { kind: "success" });
    } catch (e) {
      showToast(e.message ?? t("overview.shieldCopyFail"));
    }
  });
  document.getElementById("shield-prompt-refresh")?.addEventListener("click", async () => {
    const textarea = document.getElementById("shield-prompt-sanitized");
    await loadShieldPromptSanitized(textarea);
    const overview = await fetchJson(apiPath("overview"));
    renderShieldPromptPanel(overview.shield_prompt);
  });
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
    { id: "all", label: t("tools.tierAll") },
    { id: "visible", label: t("tools.tierVisible") },
    { id: "hidden", label: t("tools.tierHidden") },
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
  select.innerHTML = `<option value="">${t("tools.allBackends")}</option>`;
  for (const b of backends) {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    select.appendChild(opt);
  }
  if (prev && backends.includes(prev)) select.value = prev;
}

function renderToolRow(tool) {
  const tr = document.createElement("tr");
  const flag = tool.recommendation ? badge(tool.recommendation) : document.createTextNode(t("common.dash"));
  const hideBtn = document.createElement("button");
  hideBtn.type = "button";
  hideBtn.className = tool.tier === "hidden" ? "btn-sm btn-enable" : "btn-sm btn-disable";
  hideBtn.textContent = tool.tier === "hidden" ? t("tools.unhide") : t("tools.hide");
  hideBtn.onclick = async () => {
    try {
      await fetchJson(apiPath(`tools/${encodeURIComponent(tool.name)}`), {
        method: "PATCH",
        body: JSON.stringify({
          force_tier: tool.tier === "hidden" ? "default" : "hidden",
        }),
      });
      await reload();
      showToast(t("tools.savedOverride"), { kind: "success" });
    } catch (e) {
      showToast(e.message);
    }
  };
  const listData = isToolMeasured(tool) ? badge(t("tools.measured"), true) : badge(t("tools.unmeasured"));
  tr.innerHTML = `
    <td>${tool.name}</td>
    <td>${tool.backend ?? t("common.dash")}</td>
    <td></td>
    <td></td>
    <td>${fmt(tool.call_count)}</td>
    <td>${fmtDate(tool.last_used)}</td>
    <td>${tool.estimated_list_tokens != null ? `~${fmt(tool.estimated_list_tokens)}` : t("common.dash")}</td>
    <td></td>
    <td></td>`;
  tr.children[2].appendChild(tierBadge(tool.tier, tool.forced_tier));
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
  for (const tool of filtered) {
    body.appendChild(renderToolRow(tool));
  }
  if (empty) empty.classList.toggle("hidden", filtered.length > 0);
  wrap?.classList.toggle("hidden", filtered.length === 0);
  if (count) {
    count.textContent =
      filtered.length === all.length
        ? t("tools.countAll", { total: all.length })
        : t("tools.count", { shown: filtered.length, total: all.length });
  }
}

function renderTools(data) {
  toolsData = data;
  const blind = document.getElementById("tools-blind");
  if (data.blind_spots?.length) {
    blind.classList.remove("hidden");
    blind.textContent = t("tools.blindBanner", { list: data.blind_spots.join(", ") });
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

function renderGateSettings(data) {
  const form = document.getElementById("gate-settings-form");
  const note = document.getElementById("gate-settings-note");
  const pathEl = document.getElementById("gate-settings-path");
  if (!form || !data?.settings) return;
  form.innerHTML = "";
  for (const def of data.defs ?? []) {
    const label = document.createElement("label");
    label.title = gateSettingHint(def.key, def.hint ?? "");
    const val = data.settings[def.key];
    const labelText = gateSettingLabel(def.key, def.label);
    if (def.type === "boolean") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = def.key;
      input.checked = Boolean(val);
      label.appendChild(input);
      label.appendChild(document.createTextNode(labelText));
    } else if (def.type === "enum") {
      label.appendChild(document.createTextNode(`${labelText} `));
      const select = document.createElement("select");
      select.name = def.key;
      for (const opt of def.options ?? []) {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        if (opt === val) o.selected = true;
        select.appendChild(o);
      }
      label.appendChild(select);
    } else if (def.type === "number") {
      label.appendChild(document.createTextNode(`${labelText} `));
      const input = document.createElement("input");
      input.type = "number";
      input.name = def.key;
      input.value = String(val ?? "");
      label.appendChild(input);
    } else {
      label.appendChild(document.createTextNode(`${labelText} `));
      const input = document.createElement("input");
      input.type = "text";
      input.name = def.key;
      input.value = String(val ?? "");
      label.appendChild(input);
    }
    form.appendChild(label);
  }
  if (note) {
    note.textContent = data.config_merge
      ? t("mcps.gateNoteProject")
      : t("mcps.gateNoteGlobal");
  }
  if (pathEl && data.paths?.effective) {
    pathEl.textContent = data.paths.effective;
  }
}

function collectGateSettingsForm() {
  const form = document.getElementById("gate-settings-form");
  if (!form) return {};
  const out = {};
  for (const el of form.querySelectorAll("[name]")) {
    const key = el.name;
    if (el.type === "checkbox") out[key] = el.checked;
    else if (el.type === "number") out[key] = Number(el.value);
    else out[key] = el.value;
  }
  return out;
}

async function loadGateSettings() {
  const data = await fetchJson(apiPath("gate-settings"));
  renderGateSettings(data);
  return data;
}

function setupGateSettings() {
  document.getElementById("gate-settings-save")?.addEventListener("click", async () => {
    try {
      const settings = collectGateSettingsForm();
      await fetchJson(apiPath("gate-settings"), {
        method: "PATCH",
        body: JSON.stringify({ settings }),
      });
      await loadGateSettings();
      showToast(t("mcps.gateSaved"), { kind: "success" });
    } catch (e) {
      showToast(e.message);
    }
  });
}

function renderShieldSettings(data) {
  const form = document.getElementById("shield-settings-form");
  const note = document.getElementById("shield-settings-note");
  const pathEl = document.getElementById("shield-settings-path");
  if (!form || !data?.settings) return;
  form.innerHTML = "";
  for (const def of data.defs ?? []) {
    const label = document.createElement("label");
    label.title = shieldSettingHint(def.key, def.hint ?? "");
    const val = data.settings[def.key];
    const labelText = shieldSettingLabel(def.key, def.label);
    if (def.type === "boolean") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = def.key;
      input.checked = Boolean(val);
      input.disabled = def.key !== "prompt_block" && !data.settings.prompt_block;
      label.appendChild(input);
      label.appendChild(document.createTextNode(` ${labelText}`));
    }
    form.appendChild(label);
  }
  if (note) {
    let text = t("shield.note");
    if (data.hooks_in_sync === false) {
      text += ` ${t("shield.hooksOutOfSync")}`;
    }
    note.textContent = text;
  }
  if (pathEl) {
    const hookStatus = data.prompt_block_installed
      ? t("shield.installed")
      : t("shield.notInstalled");
    pathEl.textContent = `${data.hooks_path ?? ""} · ${hookStatus}`;
  }
}

function collectShieldSettingsForm() {
  const form = document.getElementById("shield-settings-form");
  if (!form) return {};
  const out = {};
  for (const el of form.querySelectorAll("[name]")) {
    if (el.type === "checkbox") out[el.name] = el.checked;
  }
  return out;
}

async function loadShieldSettings() {
  const data = await fetchJson(globalApiPath("shield-settings"));
  renderShieldSettings(data);
  return data;
}

function setupShieldSettings() {
  document.getElementById("shield-settings-save")?.addEventListener("click", async () => {
    try {
      const settings = collectShieldSettingsForm();
      await fetchJson(globalApiPath("shield-settings"), {
        method: "PATCH",
        body: JSON.stringify({ settings }),
      });
      await loadShieldSettings();
      showToast(t("shield.saved"), { kind: "success" });
    } catch (e) {
      showToast(e.message);
    }
  });
  document.getElementById("shield-settings-form")?.addEventListener("change", (e) => {
    if (e.target?.name !== "prompt_block") return;
    const form = document.getElementById("shield-settings-form");
    const enabled = e.target.checked;
    for (const el of form?.querySelectorAll("[name=aggressive],[name=fail_open]") ?? []) {
      el.disabled = !enabled;
      if (!enabled) el.checked = false;
    }
  });
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
      ? badge(t("mcps.badgeDisabled"))
      : s.measured
        ? badge(t("mcps.badgeMeasured"), true)
        : badge(t("mcps.badgeBlind"));
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = s.enabled === false ? "btn-sm btn-enable" : "btn-sm btn-disable";
    toggle.textContent = s.enabled === false ? t("mcps.enable") : t("mcps.disable");
    toggle.onclick = async () => {
      const enable = s.enabled === false;
      if (!enable && !confirm(t("mcps.disableConfirm", { name: s.name }))) return;
      try {
        await fetchJson(apiPath(`mcps/${encodeURIComponent(s.name)}`), {
          method: "PATCH",
          body: JSON.stringify({ enabled: enable }),
        });
        await reload();
        showToast(t("mcps.mcpUpdated"), { kind: "success" });
      } catch (e) {
        showToast(e.message);
      }
    };
    tr.innerHTML = `
      <td>${s.name}</td>
      <td></td>
      <td></td>
      <td></td>
      <td><code>${s.command ?? t("common.dash")}</code></td>
      <td></td>`;
    const roleCell = tr.children[1];
    roleCell.textContent = s.role;
    if (s.config_origin && s.role === "backend") {
      roleCell.appendChild(document.createElement("br"));
      roleCell.appendChild(
        badge(
          s.config_origin === "global" ? t("mcps.originGlobal") : t("mcps.originProject"),
          s.config_origin === "project"
        )
      );
    }
    tr.children[2].appendChild(
      s.enabled === false || s.trust === "disabled"
        ? trustBadge(s.trust, s.origin)
        : trustSelect(s)
    );
    tr.children[3].appendChild(measured);
    tr.children[5].appendChild(toggle);
    body.appendChild(tr);
  }
}

function recKindBadge(kind) {
  const labels = {
    add_mcp: t("rec.kindAdd"),
    switch_mcp: t("rec.kindSwitch"),
    consolidate_mcp: t("rec.kindConsolidate"),
    delete_tool: t("rec.kindDeleteTool"),
    delete_backend: t("rec.kindDeleteBackend"),
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
    showToast(e.message);
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
    sig.textContent = t("rec.signals", {
      list: data.signals_detected.join(", "),
      root: data.project_root ?? t("common.dash"),
    });
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
        score.textContent = t("rec.score", { n: r.score });
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
        sigLine.textContent = t("rec.signalsLine", { list: r.signals.join(", ") });
        li.appendChild(sigLine);
      }
      if (r.template && (r.kind === "add_mcp" || r.kind === "switch_mcp")) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-sm";
        btn.textContent = t("rec.openWizard", { template: r.template });
        btn.onclick = () => openAddMcpTab(r.template);
        li.appendChild(btn);
      }
      list.appendChild(li);
    }
  };

  renderGroup(t("rec.sectionAddSwitch"), addItems);
  renderGroup(t("rec.sectionDelete"), deleteItems);
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
  title.textContent = t("marketplace.suggestedPaths");
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
  if (!est) return t("marketplace.compareUnavailable");
  return t("marketplace.compareEstimate", {
    before: fmt(est.before_tokens),
    after: fmt(est.after_tokens),
    reduction: est.reduction_pct,
    count: est.tool_count ?? "?",
  });
}

function renderMarketplaceBadges(tmpl) {
  const parts = [];
  if (tmpl.installed) parts.push(`<span class="badge badge-installed">${t("marketplace.installed")}</span>`);
  if (tmpl.official) parts.push(`<span class="badge badge-official">${t("marketplace.official")}</span>`);
  if (tmpl.gate_ready) parts.push(`<span class="badge badge-gate">${t("marketplace.gateReady")}</span>`);
  if (tmpl.popularity === "high") parts.push(`<span class="badge badge-pop">${t("marketplace.popular")}</span>`);
  return parts.length ? `<div class="marketplace-card-badges">${parts.join("")}</div>` : "";
}

function renderCategoryTabs(categories, activeId) {
  const container = document.getElementById("marketplace-categories");
  if (!container) return;
  container.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = `category-tab${activeId ? "" : " active"}`;
  allBtn.textContent = t("marketplace.categoryAll");
  allBtn.onclick = () => {
    marketplaceCategory = "";
    loadMarketplace().catch((e) => showToast(e.message));
  };
  container.appendChild(allBtn);
  for (const cat of categories ?? []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `category-tab${activeId === cat.id ? " active" : ""}`;
    btn.textContent = `${cat.label} (${cat.count})`;
    btn.onclick = () => {
      marketplaceCategory = cat.id;
      loadMarketplace().catch((e) => showToast(e.message));
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
    grid.innerHTML = `<p class="empty-state">${t("marketplace.empty")}</p>`;
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
    envFields.innerHTML = `<p class="note">${t("marketplace.noEnv")}</p>`;
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
    template.install_target === "builtin" ? t("marketplace.showInstructions") : t("marketplace.addMcp");
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
      t("marketplace.catalogNotFound", { dir: data.catalog_dir ?? "unknown" })
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
  const runSearch = () => loadMarketplace().catch((e) => showToast(e.message));
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
      showToast(selectedTemplate.builtin_hint ?? t("marketplace.builtinHint"));
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
      let msg = t("marketplace.saved");
      if (result.backend) msg += t("marketplace.savedBackend", { path: result.backend });
      if (result.compare_estimate) {
        msg += t("marketplace.savedEstimate", { estimate: renderCompareEstimate(result.compare_estimate) });
      }
      if (result.requires_cursor_restart) msg += t("marketplace.savedRestart");
      showToast(msg, { kind: "success" });
      closeWizard();
      await reload();
      await loadMarketplace();
    } catch (e) {
      showToast(e.message);
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
    mode.textContent = t("app.writeModeToken");
  } else {
    mode.textContent = t("app.writeModeLocal");
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

let prefsWired = false;

function setupPreferences(uiData) {
  const localeSelect = document.getElementById("locale-select");
  const tzSelect = document.getElementById("timezone-select");
  if (!localeSelect || !tzSelect) return;

  const settings = uiData?.settings ?? {};
  localeSelect.value = settings.locale ?? "en";

  const timezones = [...(uiData?.common_timezones ?? [])];
  const currentTz = settings.timezone ?? "UTC";
  if (currentTz && !timezones.includes(currentTz)) {
    timezones.unshift(currentTz);
  }
  tzSelect.innerHTML = "";
  for (const tz of timezones) {
    const opt = document.createElement("option");
    opt.value = tz;
    opt.textContent = tz;
    tzSelect.appendChild(opt);
  }
  tzSelect.value = currentTz;

  if (prefsWired) return;
  prefsWired = true;

  const onChange = async () => {
    try {
      await saveUiSettingsToApi(fetchJson, {
        locale: localeSelect.value,
        timezone: tzSelect.value,
      });
      applyStaticI18n();
      await reload();
      await loadGateSettings();
      await loadMarketplace();
    } catch (e) {
      showToast(e.message);
    }
  };
  localeSelect.addEventListener("change", onChange);
  tzSelect.addEventListener("change", onChange);
}

async function main() {
  setupTabs();
  setupToolsControls();
  setupWizard();
  setupWorkspaces();
  setupGateSettings();
  setupShieldSettings();
  setupShieldPromptPanel();
  try {
    const uiData = await loadUiSettingsFromApi(fetchJson);
    setupPreferences(uiData);
    applyStaticI18n();
    const health = await fetchJson("/api/health");
    setupTokenBar(health);
    document.getElementById("health-status").textContent = t("app.health", {
      status: health.status,
      version: health.version,
      probe: health.data_sources.probe_logs ? t("app.healthYes") : t("app.healthNo"),
    });
    await loadWorkspaces();
    await reload();
    await loadGateSettings();
    await loadShieldSettings();
    await loadMarketplace();
  } catch (err) {
    document.getElementById("health-status").textContent = t("app.error", { message: err.message });
  }
}

main();
