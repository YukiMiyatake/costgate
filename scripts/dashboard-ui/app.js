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

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
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
    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${t.backend ?? "—"}</td>
      <td>${t.tier ?? "—"}</td>
      <td>${fmt(t.call_count)}</td>
      <td>${fmtDate(t.last_used)}</td>
      <td>${t.estimated_list_tokens != null ? `~${fmt(t.estimated_list_tokens)}` : "—"}</td>
      <td></td>`;
    tr.lastElementChild.appendChild(flag);
    body.appendChild(tr);
  }
}

function renderMcps(data) {
  const body = document.getElementById("mcps-body");
  body.innerHTML = "";
  for (const s of data.servers ?? []) {
    const tr = document.createElement("tr");
    const measured = s.measured ? badge("measured", true) : badge("blind spot");
    tr.innerHTML = `
      <td>${s.name}</td>
      <td>${s.role}</td>
      <td></td>
      <td><code>${s.command ?? "—"}</code></td>`;
    tr.children[2].appendChild(measured);
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

async function main() {
  setupTabs();
  try {
    const [health, overview, tools, mcps, recs] = await Promise.all([
      fetchJson("/api/health"),
      fetchJson("/api/overview"),
      fetchJson("/api/tools"),
      fetchJson("/api/mcps"),
      fetchJson("/api/recommendations"),
    ]);
    document.getElementById("health-status").textContent =
      `health: ${health.status} · read-only · probe logs: ${health.data_sources.probe_logs ? "yes" : "no"}`;
    renderOverview(overview);
    renderTools(tools);
    renderMcps(mcps);
    renderRecommendations(recs);
  } catch (err) {
    document.getElementById("health-status").textContent = `Error: ${err.message}`;
  }
}

main();
