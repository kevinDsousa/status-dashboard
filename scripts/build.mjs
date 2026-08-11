import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const dataUrl = new URL("../data/status.json", import.meta.url);
const hasData = existsSync(dataUrl);
const data = hasData
  ? JSON.parse(readFileSync(dataUrl))
  : { generatedAt: null, repos: [] };

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function healthColor(ratio) {
  if (ratio === null) return "var(--text-muted)";
  if (ratio >= 60) return "var(--good)";
  if (ratio >= 30) return "var(--warning)";
  return "var(--critical)";
}

function healthLabel(ratio) {
  if (ratio === null) return "sem issues ainda";
  if (ratio >= 60) return "saudável";
  if (ratio >= 30) return "acumulando";
  return "parado";
}

function healthKey(ratio) {
  if (ratio === null) return "sem-issues";
  if (ratio >= 60) return "saudavel";
  if (ratio >= 30) return "acumulando";
  return "parado";
}

function normalize(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const okRepos = data.repos.filter((r) => !r.error);
const erroredRepos = data.repos.filter((r) => r.error);

const totals = okRepos.reduce(
  (acc, r) => {
    acc.open += r.openIssues;
    acc.closed += r.closedIssues;
    acc.openPRs += r.openPRs;
    if (r.latestRelease) acc.withRelease += 1;
    return acc;
  },
  { open: 0, closed: 0, openPRs: 0, withRelease: 0 }
);

function issueRow(issue) {
  const chip = issue.state === "CLOSED"
    ? `<span class="status-chip closed">fechada</span>`
    : `<span class="status-chip open">aberta</span>`;
  return `<div class="link-row">
    <span class="issue-id">#${issue.number}</span>
    <a class="issue-title" href="${esc(issue.url)}" target="_blank" rel="noopener">${esc(issue.title)}</a>
    ${chip}
  </div>`;
}

function repoCard(r) {
  if (r.error) {
    return `<div class="project-card" data-health="erro" data-search="${esc(normalize(r.name))}">
      <div class="project-head">
        <span class="project-name">${esc(r.owner)}/${esc(r.name)}</span>
        <span class="version-chip error">erro na coleta</span>
      </div>
      <p class="error-note">${esc(r.error)}</p>
    </div>`;
  }

  const version = r.latestRelease
    ? `${esc(r.latestRelease.tagName)}`
    : "sem release";

  const inProgressRows = r.inProgress.length
    ? r.inProgress.map((i) => issueRow(i)).join("")
    : `<p class="error-note">Nada em andamento.</p>`;

  const recentRows = r.recentlyCreated.length
    ? r.recentlyCreated.map((i) => issueRow(i)).join("")
    : `<p class="error-note">Nenhuma issue ainda.</p>`;

  const ratio = r.closedRatio;
  const allTitles = [...r.inProgress, ...r.recentlyCreated].map((i) => `#${i.number} ${i.title}`);
  const searchText = normalize([r.name, ...new Set(allTitles)].join(" "));

  return `<div class="project-card" data-health="${healthKey(ratio)}" data-search="${esc(searchText)}">
    <div class="project-head">
      <span class="project-name">${esc(r.name)}</span>
      <span class="version-chip">${version}</span>
    </div>
    <div class="project-stats">
      <div><b>${r.openIssues}</b>abertas</div>
      <div><b>${r.closedIssues}</b>fechadas</div>
      <div><b>${r.openPRs}</b>PRs abertos</div>
    </div>
    <div class="health-bar-track"><div class="health-bar-fill" style="width: ${ratio ?? 0}%; background: ${healthColor(ratio)};"></div></div>
    <div class="health-caption"><span>${ratio === null ? "—" : ratio + "% fechadas"}</span><span>${healthLabel(ratio)}</span></div>
    <div class="issue-columns">
      <div class="issue-column">
        <p class="issue-column-label">Em andamento</p>
        ${inProgressRows}
      </div>
      <div class="issue-column">
        <p class="issue-column-label">Mais recentes</p>
        ${recentRows}
      </div>
    </div>
  </div>`;
}

const generatedLabel = data.generatedAt
  ? new Date(data.generatedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC"
  : "ainda não coletado";

const allReleases = okRepos
  .flatMap((r) => (r.releases ?? []).map((rel) => ({ ...rel, repo: r.name })))
  .filter((rel) => rel.publishedAt)
  .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
  .slice(0, 12);

function releaseItem(rel) {
  const date = new Date(rel.publishedAt).toISOString().slice(0, 10);
  const title = rel.name && rel.name !== rel.tagName ? `${esc(rel.name)}` : "";
  const notes = (rel.description ?? "").trim();
  return `<div class="release-item">
    <div class="release-head">
      <span class="release-repo">${esc(rel.repo)}</span>
      <span class="version-chip">${esc(rel.tagName)}</span>
      ${title ? `<span class="release-title">${title}</span>` : ""}
      <span class="release-date">${date}</span>
    </div>
    ${notes
      ? `<div class="release-notes">${esc(notes)}</div>`
      : `<p class="error-note">Sem notas de release.</p>`}
    <a class="release-link" href="${esc(rel.url)}" target="_blank" rel="noopener">ver release completa →</a>
  </div>`;
}

const releasesSection = allReleases.length
  ? `<section>
      <h2>Releases recentes</h2>
      <div class="release-list">
        ${allReleases.map(releaseItem).join("\n")}
      </div>
    </section>`
  : hasData && okRepos.length
    ? `<section>
        <h2>Releases recentes</h2>
        <p class="error-note">Nenhuma release publicada em nenhum dos repositórios ainda.</p>
      </section>`
    : "";

const bodyContent = hasData && okRepos.length
  ? `
    <div class="stat-row">
      <div class="stat-tile"><span class="num">${totals.open}</span><span class="label">issues abertas no total</span></div>
      <div class="stat-tile good"><span class="num">${totals.closed}</span><span class="label">issues fechadas no total</span></div>
      <div class="stat-tile good"><span class="num">${totals.withRelease}</span><span class="label">repositórios com release</span></div>
      <div class="stat-tile"><span class="num">${totals.openPRs}</span><span class="label">PRs abertos no total</span></div>
    </div>
    <div class="project-grid">
      ${okRepos.map(repoCard).join("\n")}
      ${erroredRepos.map(repoCard).join("\n")}
    </div>
    ${releasesSection}`
  : `<p class="placeholder">
      Ainda sem dados. O workflow <code>update-dashboard.yml</code> precisa do secret
      <code>DASHBOARD_PAT</code> configurado (veja o README) antes de conseguir ler os
      10 repositórios. Assim que o secret existir, o próximo run preenche este painel.
    </p>`;

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Status dos projetos</title>
<style>
  :root {
    --bg: #F4F7F6; --surface: #FFFFFF; --surface-2: #EBF0EF; --border: #D8E1DF;
    --text-primary: #142322; --text-secondary: #53645F; --text-muted: #7C8B87;
    --accent: #0E7C74; --accent-soft: #E3F2EF;
    --good: #1E8E5A; --good-soft: #E4F5EC;
    --warning: #9C6B12; --warning-soft: #FBF0DD;
    --critical: #B03A22; --critical-soft: #FBE7E1;
    --shadow: 0 1px 2px rgba(20,35,34,.06), 0 1px 1px rgba(20,35,34,.04);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0A1413; --surface: #101B1A; --surface-2: #172423; --border: #263635;
      --text-primary: #E8EFED; --text-secondary: #A9BAB6; --text-muted: #79908C;
      --accent: #3FC2B7; --accent-soft: rgba(63,194,183,.14);
      --good: #35C77E; --good-soft: rgba(53,199,126,.14);
      --warning: #E3AE4A; --warning-soft: rgba(227,174,74,.14);
      --critical: #E56A50; --critical-soft: rgba(229,106,80,.14);
      --shadow: 0 1px 2px rgba(0,0,0,.3), 0 1px 1px rgba(0,0,0,.2);
    }
  }
  :root[data-theme="dark"] {
    --bg: #0A1413; --surface: #101B1A; --surface-2: #172423; --border: #263635;
    --text-primary: #E8EFED; --text-secondary: #A9BAB6; --text-muted: #79908C;
    --accent: #3FC2B7; --accent-soft: rgba(63,194,183,.14);
    --good: #35C77E; --good-soft: rgba(53,199,126,.14);
    --warning: #E3AE4A; --warning-soft: rgba(227,174,74,.14);
    --critical: #E56A50; --critical-soft: rgba(229,106,80,.14);
    --shadow: 0 1px 2px rgba(0,0,0,.3), 0 1px 1px rgba(0,0,0,.2);
  }
  * { box-sizing: border-box; }
  html, body { overflow-x: hidden; }
  body {
    background: var(--bg); color: var(--text-primary);
    font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    margin: 0; padding: 40px 20px 80px; line-height: 1.5;
  }
  .page { min-width: 0; }
  header { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
  h1 { font-size: 22px; margin: 0; }
  .generated { font-size: 12px; color: var(--text-muted); font-family: ui-monospace, monospace; }
  .stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .stat-tile { background: var(--surface-2); border-radius: 10px; padding: 14px 16px; }
  .stat-tile .num { font-family: ui-monospace, monospace; font-size: 24px; font-weight: 600; display: block; }
  .stat-tile .label { font-size: 12px; color: var(--text-secondary); margin-top: 4px; display: block; }
  .stat-tile.good .num { color: var(--good); }
  .project-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .project-card { border: 1px solid var(--border); border-radius: 10px; padding: 16px; background: var(--surface); }
  .project-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
  .project-name { font-size: 14.5px; font-weight: 600; }
  .version-chip { font-family: ui-monospace, monospace; font-size: 11.5px; background: var(--accent-soft); color: var(--accent); padding: 2px 7px; border-radius: 5px; white-space: nowrap; }
  .version-chip.error { background: var(--critical-soft); color: var(--critical); }
  .project-stats { display: flex; gap: 16px; margin-bottom: 12px; }
  .project-stats div { font-size: 12.5px; color: var(--text-secondary); }
  .project-stats b { font-family: ui-monospace, monospace; color: var(--text-primary); font-size: 14px; display: block; }
  .health-bar-track { height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; margin-bottom: 8px; }
  .health-bar-fill { height: 100%; border-radius: 3px; }
  .health-caption { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--text-muted); margin-bottom: 12px; }
  .status-chip { font-size: 10.5px; padding: 1px 6px; border-radius: 4px; font-weight: 600; flex-shrink: 0; }
  .status-chip.closed { background: var(--good-soft); color: var(--good); }
  .status-chip.open { background: var(--warning-soft); color: var(--warning); }
  .issue-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; margin-top: 4px; }
  .issue-column { min-width: 0; }
  .issue-column-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; color: var(--text-muted); margin: 0 0 4px; }
  .link-row { display: flex; align-items: baseline; gap: 6px; font-size: 11.5px; padding: 4px 0; border-top: 1px solid var(--border); min-width: 0; }
  .link-row:first-of-type { border-top: none; padding-top: 0; }
  .issue-id { font-family: ui-monospace, monospace; color: var(--text-muted); flex-shrink: 0; }
  .issue-title { color: var(--text-primary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: none; }
  .issue-title:hover { text-decoration: underline; }
  @media (max-width: 460px) { .issue-columns { grid-template-columns: 1fr; gap: 14px 0; } }
  .error-note { font-size: 12px; color: var(--critical); }
  .placeholder { color: var(--text-secondary); background: var(--surface-2); border-radius: 10px; padding: 20px; font-size: 14px; }
  .placeholder code { font-family: ui-monospace, monospace; background: var(--surface); padding: 1px 5px; border-radius: 4px; }
  section { margin-top: 32px; }
  h2 { font-size: 16px; margin: 0 0 12px; }
  .release-list { display: flex; flex-direction: column; gap: 10px; }
  .release-item { border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; background: var(--surface); }
  .release-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
  .release-repo { font-size: 13px; font-weight: 600; }
  .release-title { font-size: 13px; color: var(--text-secondary); }
  .release-date { font-family: ui-monospace, monospace; font-size: 11.5px; color: var(--text-muted); margin-left: auto; }
  .release-notes {
    font-size: 13px; color: var(--text-secondary); white-space: pre-wrap;
    max-height: 4.5em; overflow: hidden; margin-bottom: 6px; line-height: 1.5;
  }
  .release-link { font-size: 12px; color: var(--accent); text-decoration: none; }
  .release-link:hover { text-decoration: underline; }

  .layout { display: grid; grid-template-columns: 190px 1fr; gap: 28px; max-width: 1140px; margin: 0 auto; align-items: start; }
  .sidebar { position: sticky; top: 40px; display: flex; flex-direction: column; gap: 18px; }
  .search-box {
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px;
    padding: 8px 10px; font-size: 13px; color: var(--text-primary); width: 100%;
  }
  .search-box:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .sidebar-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); margin: 0 0 8px; }
  .chip-list { display: flex; flex-direction: column; gap: 6px; }
  .chip {
    display: flex; align-items: center; gap: 7px; background: none; border: 1px solid var(--border);
    border-radius: 7px; padding: 6px 9px; font-size: 12.5px; color: var(--text-secondary);
    cursor: pointer; text-align: left; font-family: inherit;
  }
  .chip:hover { border-color: var(--accent); color: var(--text-primary); }
  .chip.active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); font-weight: 600; }
  .chip-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .chip-dot.saudavel { background: var(--good); }
  .chip-dot.acumulando { background: var(--warning); }
  .chip-dot.parado { background: var(--critical); }
  .chip-dot.sem-issues { background: var(--text-muted); }
  .result-count { font-size: 11.5px; color: var(--text-muted); margin: 0; }
  .no-results { display: none; color: var(--text-secondary); font-size: 13px; padding: 20px 0; }

  @media (max-width: 780px) {
    .layout { grid-template-columns: 1fr; }
    .sidebar { position: static; flex-direction: row; flex-wrap: wrap; }
    .chip-list { flex-direction: row; flex-wrap: wrap; }
  }
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div>
      <input type="search" class="search-box" id="repoSearch" placeholder="Buscar repo ou issue…" autocomplete="off">
    </div>
    <div>
      <p class="sidebar-label">Status</p>
      <div class="chip-list" id="healthChips">
        <button type="button" class="chip" data-filter="saudavel"><span class="chip-dot saudavel"></span>Saudável</button>
        <button type="button" class="chip" data-filter="acumulando"><span class="chip-dot acumulando"></span>Acumulando</button>
        <button type="button" class="chip" data-filter="parado"><span class="chip-dot parado"></span>Parado</button>
        <button type="button" class="chip" data-filter="sem-issues"><span class="chip-dot sem-issues"></span>Sem issues</button>
      </div>
    </div>
    <p class="result-count" id="resultCount"></p>
  </aside>
  <div class="page">
    <header>
      <h1>Status dos projetos</h1>
      <span class="generated">atualizado ${esc(generatedLabel)}</span>
    </header>
    ${bodyContent}
    <p class="no-results" id="noResults">Nenhum projeto bate com esse filtro.</p>
  </div>
</div>
<script>
(function () {
  var search = document.getElementById("repoSearch");
  var chips = document.querySelectorAll(".chip");
  var cards = document.querySelectorAll(".project-card");
  var resultCount = document.getElementById("resultCount");
  var noResults = document.getElementById("noResults");
  if (!cards.length) return;

  var activeFilters = new Set();

  function normalize(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
  }

  function apply() {
    var query = normalize(search.value.trim());
    var visible = 0;
    cards.forEach(function (card) {
      var matchesSearch = !query || (card.dataset.search || "").indexOf(query) !== -1;
      var matchesHealth = activeFilters.size === 0 || activeFilters.has(card.dataset.health);
      var show = matchesSearch && matchesHealth;
      card.style.display = show ? "" : "none";
      if (show) visible += 1;
    });
    resultCount.textContent = visible + " de " + cards.length + " projetos";
    noResults.style.display = visible === 0 ? "block" : "none";
  }

  search.addEventListener("input", apply);
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var key = chip.dataset.filter;
      if (activeFilters.has(key)) {
        activeFilters.delete(key);
        chip.classList.remove("active");
      } else {
        activeFilters.add(key);
        chip.classList.add("active");
      }
      apply();
    });
  });

  apply();
})();
</script>
</body>
</html>
`;

mkdirSync(new URL("../docs", import.meta.url), { recursive: true });
writeFileSync(new URL("../docs/index.html", import.meta.url), html);
writeFileSync(new URL("../docs/robots.txt", import.meta.url), "User-agent: *\nDisallow: /\n");
writeFileSync(new URL("../docs/.nojekyll", import.meta.url), "");

console.log("docs/index.html gerado.");
