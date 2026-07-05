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

function badge(text, ok = false) {
  const span = document.createElement("span");
  span.className = ok ? "badge ok" : "badge";
  span.textContent = text;
  return span;
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `${path}: ${res.status}`);
  }
  return res.json();
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
  for (const [label, value] of items) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div class="label">${label}</div><div class="value">${value}</div>`;
    cards.appendChild(card);
  }
  const note = document.getElementById("overview-note");
  if (data.period) {
    note.textContent = `Period: ${data.period.from} → ${data.period.to}. Gate/Probe 外 MCP は blind spot として表示されます。`;
  } else {
    note.textContent =
      "Probe ログがありません。npm run cursor:measurement で計測を開始してください。";
  }
}

function renderTools(data) {
  const blind = document.getElementById("tools-blind");
  if (data.blind_spots?.length) {
    blind.classList.remove("hidden");
    blind.textContent = `計測圏外 MCP: ${data.blind_spots.join(", ")}`;
  } else {
    blind.classList.add("hidden");
  }
  const body = document.getElementById("tools-body");
  body.innerHTML = "";
  for (const t of data.tools ?? []) {
    const tr = document.createElement("tr");
    const flag = t.recommendation ? badge(t.recommendation) : document.createTextNode("—");
    const tierLabel = t.forced_tier ? `${t.tier}*` : (t.tier ?? "—");
    const hideBtn = document.createElement("button");
    hideBtn.type = "button";
    hideBtn.className = "btn-sm";
    hideBtn.textContent = t.tier === "hidden" ? "Unhide" : "Hide";
    hideBtn.onclick = async () => {
      try {
        await fetchJson(`/api/tools/${encodeURIComponent(t.name)}`, {
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
    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${t.backend ?? "—"}</td>
      <td>${tierLabel}</td>
      <td>${fmt(t.call_count)}</td>
      <td>${fmtDate(t.last_used)}</td>
      <td>${t.estimated_list_tokens != null ? `~${fmt(t.estimated_list_tokens)}` : "—"}</td>
      <td></td>
      <td></td>`;
    tr.children[6].appendChild(flag);
    tr.children[7].appendChild(hideBtn);
    body.appendChild(tr);
  }
}

function renderMcps(data) {
  const body = document.getElementById("mcps-body");
  body.innerHTML = "";
  for (const s of data.servers ?? []) {
    const tr = document.createElement("tr");
    const measured = s.enabled === false
      ? badge("disabled")
      : s.measured
        ? badge("measured", true)
        : badge("blind spot");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "btn-sm";
    toggle.textContent = s.enabled === false ? "Enable" : "Disable";
    toggle.onclick = async () => {
      const enable = s.enabled === false;
      if (!enable && !confirm(`Disable MCP "${s.name}"? Cursor restart required.`)) return;
      try {
        await fetchJson(`/api/mcps/${encodeURIComponent(s.name)}`, {
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
      <td>${s.role}</td>
      <td></td>
      <td><code>${s.command ?? "—"}</code></td>
      <td></td>`;
    tr.children[2].appendChild(measured);
    tr.children[4].appendChild(toggle);
    body.appendChild(tr);
  }
}

function renderRecommendations(data) {
  const list = document.getElementById("rec-list");
  const empty = document.getElementById("rec-empty");
  list.innerHTML = "";
  const items = data.items ?? [];
  if (items.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  for (const r of items) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="reason">${r.reason}</span>
      · ${r.kind === "delete_tool" ? "tool" : "backend"}: <strong>${r.target}</strong>
      <div class="note">${r.detail ?? ""}</div>`;
    list.appendChild(li);
  }
}

let selectedTemplate = null;

function renderCompareEstimate(est) {
  if (!est) return "Cost estimate unavailable.";
  return `~${fmt(est.before_tokens)} → ~${fmt(est.after_tokens)} tokens/tools/list (${est.reduction_pct}% reduction, ${est.tool_count ?? "?"} tools)`;
}

function renderMarketplaceResults(templates) {
  const grid = document.getElementById("marketplace-results");
  const form = document.getElementById("wizard-form");
  grid.innerHTML = "";
  form.classList.add("hidden");
  selectedTemplate = null;

  if (!templates.length) {
    grid.innerHTML = '<p class="note">No templates match your search.</p>';
    return;
  }

  for (const t of templates) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "marketplace-card";
    card.innerHTML = `
      <div class="marketplace-card-title">${t.name}</div>
      <div class="marketplace-card-meta">${t.category} · ${(t.tags ?? []).slice(0, 3).join(", ")}</div>
      <div class="marketplace-card-desc">${t.description}</div>
      <div class="marketplace-card-est">${renderCompareEstimate(t.compare_estimate)}</div>`;
    card.onclick = () => openWizard(t);
    grid.appendChild(card);
  }
}

function openWizard(template) {
  selectedTemplate = template;
  document.getElementById("marketplace-results").classList.add("hidden");
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
  document.getElementById("marketplace-results").classList.remove("hidden");
}

async function loadMarketplace(query = "") {
  const q = encodeURIComponent(query);
  const data = await fetchJson(`/api/marketplace${q ? `?q=${q}` : ""}`);
  renderMarketplaceResults(data.templates ?? []);
}

function setupWizard() {
  const searchInput = document.getElementById("marketplace-search");
  const searchBtn = document.getElementById("marketplace-search-btn");
  const runSearch = () => loadMarketplace(searchInput.value.trim()).catch((e) => alert(e.message));
  searchBtn.onclick = runSearch;
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch();
  });

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
      const result = await fetchJson("/api/mcps", {
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
      await loadMarketplace(searchInput.value.trim());
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

async function reload() {
  const [overview, tools, mcps, recs] = await Promise.all([
    fetchJson("/api/overview"),
    fetchJson("/api/tools"),
    fetchJson("/api/mcps"),
    fetchJson("/api/recommendations"),
  ]);
  renderOverview(overview);
  renderTools(tools);
  renderMcps(mcps);
  renderRecommendations(recs);
}

async function main() {
  setupTabs();
  setupWizard();
  try {
    const health = await fetchJson("/api/health");
    setupTokenBar(health);
    document.getElementById("health-status").textContent =
      `health: ${health.status} · ${health.version} · probe logs: ${health.data_sources.probe_logs ? "yes" : "no"}`;
    await reload();
    await loadMarketplace();
  } catch (err) {
    document.getElementById("health-status").textContent = `Error: ${err.message}`;
  }
}

main();
