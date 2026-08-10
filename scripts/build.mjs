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

function issueRow(issue, owner, name) {
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
    return `<div class="project-card">
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

  const rows = r.recentIssues.length
    ? r.recentIssues.map((i) => issueRow(i, r.owner, r.name)).join("")
    : `<p class="error-note">Nenhuma issue ainda.</p>`;

  const ratio = r.closedRatio;

  return `<div class="project-card">
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
    ${rows}
  </div>`;
}

const generatedLabel = data.generatedAt
  ? new Date(data.generatedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC"
  : "ainda não coletado";

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
    </div>`
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
  body {
    background: var(--bg); color: var(--text-primary);
    font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    margin: 0; padding: 40px 20px 80px; line-height: 1.5;
  }
  .page { max-width: 900px; margin: 0 auto; }
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
  .link-row { display: flex; align-items: baseline; gap: 8px; font-size: 12px; padding: 5px 0; border-top: 1px solid var(--border); }
  .link-row:first-of-type { border-top: none; padding-top: 0; }
  .issue-id { font-family: ui-monospace, monospace; color: var(--text-muted); flex-shrink: 0; }
  .issue-title { color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: none; }
  .issue-title:hover { text-decoration: underline; }
  .error-note { font-size: 12px; color: var(--critical); }
  .placeholder { color: var(--text-secondary); background: var(--surface-2); border-radius: 10px; padding: 20px; font-size: 14px; }
  .placeholder code { font-family: ui-monospace, monospace; background: var(--surface); padding: 1px 5px; border-radius: 4px; }
  @media (max-width: 620px) { .stat-row, .project-grid { grid-template-columns: 1fr 1fr; } }
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>Status dos projetos</h1>
    <span class="generated">atualizado ${esc(generatedLabel)}</span>
  </header>
  ${bodyContent}
</div>
</body>
</html>
`;

mkdirSync(new URL("../docs", import.meta.url), { recursive: true });
writeFileSync(new URL("../docs/index.html", import.meta.url), html);
writeFileSync(new URL("../docs/robots.txt", import.meta.url), "User-agent: *\nDisallow: /\n");
writeFileSync(new URL("../docs/.nojekyll", import.meta.url), "");

console.log("docs/index.html gerado.");
