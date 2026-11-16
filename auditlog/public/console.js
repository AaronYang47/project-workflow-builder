// Audit console. Everything recorded may come from any visitor, so it is only
// ever written into the page as text (textContent), never as HTML.
(() => {
  const $ = (selector) => document.querySelector(selector);
  const loginView = $("#login-view");
  const consoleView = $("#console-view");
  const filters = $("#filters");
  let nextCursor = null;
  let activeTab = "events";
  let refreshTimer = null;

  const el = (tag, options = {}, children = []) => {
    const node = document.createElement(tag);
    if (options.text !== undefined && options.text !== null) node.textContent = String(options.text);
    if (options.className) node.className = options.className;
    if (options.title) node.title = options.title;
    for (const child of children) if (child) node.appendChild(child);
    return node;
  };

  const localTime = (iso) => iso ? new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
  const duration = (seconds) => {
    const value = Number(seconds) || 0;
    if (value < 60) return `${value}s`;
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    return hours ? `${hours}h ${minutes}m` : `${minutes}m ${value % 60}s`;
  };
  const place = (row) => [row.city, row.region, row.country].filter(Boolean).join(", ");
  const device = (row) => [row.device_type, row.os, row.browser].filter(Boolean).join(" · ");

  async function api(path, options = {}) {
    const response = await fetch(path, { credentials: "same-origin", ...options });
    if (response.status === 401) {
      showLogin();
      throw new Error("signed out");
    }
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Request failed (${response.status})`);
    return response.json();
  }

  function query(extra = {}) {
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(filters)) {
      if (!value) continue;
      params.set(name, name === "from" || name === "to" ? new Date(value).toISOString() : value);
    }
    for (const [name, value] of Object.entries(extra)) if (value) params.set(name, value);
    return params.toString();
  }

  function showLogin() {
    consoleView.hidden = true;
    loginView.hidden = false;
    $("#password").focus();
  }

  function showConsole() {
    loginView.hidden = true;
    consoleView.hidden = false;
    refreshAll();
  }

  function renderCards(stats) {
    const totals = stats.totals || {};
    const cards = [
      ["Events", totals.events],
      ["Accounts", totals.users],
      ["IP addresses", totals.ips],
      ["Visits", totals.visits],
      ["Successful sign-ins", stats.logins.success || 0],
      ["Failed sign-ins", stats.logins.failure || 0],
      ["Active time", duration(stats.activeSeconds)],
    ];
    $("#cards").replaceChildren(...cards.map(([label, value]) =>
      el("div", { className: "card" }, [el("div", { className: "value", text: value ?? 0 }), el("div", { className: "label", text: label })])));
  }

  function breakdown(title, rows, nameKey) {
    const max = Math.max(1, ...rows.map((row) => row.count));
    return el("div", { className: "breakdown" }, [
      el("h3", { text: title }),
      ...(rows.length ? rows.map((row) => {
        const name = el("div", { className: "name", title: String(row[nameKey]) });
        const fill = el("div", { className: "fill" });
        fill.style.width = `${(row.count / max) * 100}%`;
        name.append(fill, el("span", { text: row[nameKey] }));
        return el("div", { className: "bar-row" }, [name, el("div", { className: "count", text: row.count.toLocaleString() })]);
      }) : [el("div", { className: "muted", text: "Nothing yet" })]),
    ]);
  }

  function renderBreakdowns(stats) {
    $("#breakdowns").replaceChildren(
      breakdown("Top actions", stats.actions, "action"),
      breakdown("Countries", stats.countries, "country"),
      breakdown("Devices (visits)", stats.devices, "device"),
      breakdown("Events per day", stats.days, "day"),
    );
  }

  function showDetail(row) {
    const body = $("#detail-body");
    const fields = [
      ["Time (local)", localTime(row.ts)], ["Time (UTC)", row.ts], ["Stored at", row.received_at],
      ["Action", row.action], ["Category", row.category], ["Result", row.outcome], ["Source", row.source],
      ["Account", row.user_email], ["Account id", row.user_id], ["Visit id", row.session_id],
      ["IP address", row.ip], ["City", row.city], ["Region", row.region], ["Country", row.country], ["Postal code", row.postal_code],
      ["Coordinates", row.latitude && row.longitude ? `${row.latitude}, ${row.longitude}` : ""], ["Time zone", row.timezone],
      ["Network", [row.as_organization, row.asn ? `AS${row.asn}` : ""].filter(Boolean).join(" · ")], ["Cloudflare site", row.colo],
      ["Device", row.device_type], ["System", row.os], ["Browser", row.browser], ["Browser text", row.user_agent],
      ["Request", [row.method, row.path].filter(Boolean).join(" ")], ["Status", row.status], ["Took", row.duration_ms !== null && row.duration_ms !== undefined ? `${row.duration_ms} ms` : ""],
      ["Page", row.page], ["Event id", row.id],
    ];
    const items = fields.filter(([, value]) => value !== null && value !== undefined && value !== "")
      .flatMap(([label, value]) => [el("dt", { text: label }), el("dd", { text: value })]);
    if (row.details_json) {
      let pretty = row.details_json;
      try { pretty = JSON.stringify(JSON.parse(row.details_json), null, 2); } catch { /* keep as stored */ }
      items.push(el("dt", { text: "Details" }), el("dd", {}, [el("pre", { text: pretty })]));
    }
    if (row.session_id) {
      const follow = el("button", { className: "secondary", text: "Show this whole visit" });
      follow.type = "button";
      follow.addEventListener("click", () => {
        filters.elements.session.value = row.session_id;
        $("#detail").hidden = true;
        selectTab("events");
        refreshAll();
      });
      items.push(el("dt", { text: "" }), el("dd", {}, [follow]));
    }
    body.replaceChildren(...items);
    $("#detail").hidden = false;
  }

  function eventRow(row) {
    const tr = el("tr", {}, [
      el("td", { className: "nowrap", text: localTime(row.ts), title: row.ts }),
      el("td", {}, [el("span", { text: row.user_email || "—" }), el("span", { className: "sub", text: row.source })]),
      el("td", {}, [el("span", { text: row.action }), el("span", { className: "sub", text: row.category })]),
      el("td", {}, [el("span", { className: `pill ${row.outcome || "info"}`, text: row.status ? `${row.outcome} ${row.status}` : row.outcome })]),
      el("td", {}, [el("span", { text: row.ip || "" }), el("span", { className: "sub", text: place(row) })]),
      el("td", { text: device(row) }),
      el("td", {}, [el("span", { text: row.path ? `${row.method || ""} ${row.path}` : row.page || "" }), el("span", { className: "sub", text: row.path && row.page ? row.page : "" })]),
    ]);
    tr.addEventListener("click", () => showDetail(row));
    return tr;
  }

  async function loadEvents(append = false) {
    const data = await api(`/api/events?${query({ limit: "100", before: append ? nextCursor : "" })}`);
    const rows = data.events.map(eventRow);
    const body = $("#events-body");
    if (append) body.append(...rows);
    else body.replaceChildren(...(rows.length ? rows : [el("tr", {}, [Object.assign(el("td", { className: "empty", text: "No activity matches these filters." }), { colSpan: 7 })])]));
    nextCursor = data.next;
    $("#more").hidden = !nextCursor;
  }

  async function loadSessions() {
    const data = await api(`/api/sessions?${query()}`);
    const rows = data.sessions.map((row) => {
      const show = el("button", { className: "secondary", text: "Events" });
      show.type = "button";
      const tr = el("tr", {}, [
        el("td", { className: "nowrap", text: localTime(row.started), title: row.started }),
        el("td", { className: "nowrap", text: localTime(row.ended), title: row.ended }),
        el("td", { text: row.user_email || "Not signed in" }),
        el("td", { text: duration(row.active_seconds) }),
        el("td", { text: duration(row.span_seconds) }),
        el("td", { text: row.clicks ?? 0 }),
        el("td", { text: row.page_views ?? 0 }),
        el("td", {}, [el("span", { text: row.ip || "" }), el("span", { className: "sub", text: place(row) })]),
        el("td", {}, [el("span", { text: device(row) }), el("span", { className: "sub", text: [row.screen, row.time_zone].filter(Boolean).join(" · ") })]),
        el("td", {}, [show]),
      ]);
      const open = () => {
        filters.elements.session.value = row.session_id;
        selectTab("events");
        refreshAll();
      };
      tr.addEventListener("click", open);
      return tr;
    });
    $("#sessions-body").replaceChildren(...(rows.length ? rows : [el("tr", {}, [Object.assign(el("td", { className: "empty", text: "No visits match these filters." }), { colSpan: 10 })])]));
  }

  async function refreshAll() {
    try {
      const stats = await api(`/api/stats?${query()}`);
      renderCards(stats);
      renderBreakdowns(stats);
      if (activeTab === "events") await loadEvents();
      else await loadSessions();
      $("#refreshed").textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      if (error.message !== "signed out") $("#refreshed").textContent = error.message;
    }
  }

  function selectTab(tab) {
    activeTab = tab;
    for (const button of document.querySelectorAll("[data-tab]")) button.setAttribute("aria-selected", String(button.dataset.tab === tab));
    $("#events-panel").hidden = tab !== "events";
    $("#sessions-panel").hidden = tab !== "sessions";
  }

  function setPreset(days) {
    for (const button of document.querySelectorAll("[data-preset]")) button.setAttribute("aria-pressed", String(button.dataset.preset === String(days)));
    const pad = (value) => String(value).padStart(2, "0");
    const local = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    filters.elements.from.value = days ? local(new Date(Date.now() - days * 86_400_000)) : "";
    filters.elements.to.value = "";
  }

  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("#login-error").textContent = "";
    const response = await fetch("/api/login", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: $("#password").value }),
    });
    $("#password").value = "";
    if (response.ok) showConsole();
    else $("#login-error").textContent = (await response.json().catch(() => ({}))).error || "Could not sign in.";
  });
  $("#logout").addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    showLogin();
  });
  filters.addEventListener("submit", (event) => {
    event.preventDefault();
    refreshAll();
  });
  $("#reset").addEventListener("click", () => {
    filters.reset();
    filters.elements.session.value = "";
    setPreset(7);
    refreshAll();
  });
  for (const button of document.querySelectorAll("[data-preset]")) {
    button.addEventListener("click", () => {
      setPreset(Number(button.dataset.preset));
      refreshAll();
    });
  }
  for (const button of document.querySelectorAll("[data-tab]")) {
    button.addEventListener("click", () => {
      selectTab(button.dataset.tab);
      refreshAll();
    });
  }
  $("#more").addEventListener("click", () => loadEvents(true));
  $("#export").addEventListener("click", () => { location.href = `/api/export?${query()}`; });
  $("#detail-close").addEventListener("click", () => { $("#detail").hidden = true; });
  $("#auto-refresh").addEventListener("change", (event) => {
    clearInterval(refreshTimer);
    if (event.target.checked) refreshTimer = setInterval(refreshAll, 30_000);
  });

  setPreset(7);
  fetch("/api/session", { credentials: "same-origin" }).then((response) => response.ok ? showConsole() : showLogin(), showLogin);
})();
