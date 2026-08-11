import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const token = process.env.GH_TOKEN;
if (!token) {
  console.error("GH_TOKEN não definido — nada pra coletar. Veja o README para configurar o secret DASHBOARD_PAT.");
  process.exit(0);
}

const repos = JSON.parse(readFileSync(new URL("../repos.json", import.meta.url)));

const QUERY = `
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    openIssues: issues(states: OPEN) { totalCount }
    closedIssues: issues(states: CLOSED) { totalCount }
    openPRs: pullRequests(states: OPEN) { totalCount }
    releases(first: 5, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes { tagName name description publishedAt url }
    }
    recentIssues: issues(first: 3, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes { number title state url }
    }
  }
}`;

async function fetchRepo({ owner, name }) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: QUERY, variables: { owner, name } }),
  });

  if (!res.ok) {
    throw new Error(`${owner}/${name}: HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`${owner}/${name}: ${json.errors.map((e) => e.message).join("; ")}`);
  }

  const r = json.data.repository;
  const open = r.openIssues.totalCount;
  const closed = r.closedIssues.totalCount;
  const total = open + closed;

  return {
    owner,
    name,
    openIssues: open,
    closedIssues: closed,
    openPRs: r.openPRs.totalCount,
    closedRatio: total > 0 ? Math.round((closed / total) * 100) : null,
    latestRelease: r.releases.nodes[0] ?? null,
    releases: r.releases.nodes,
    recentIssues: r.recentIssues.nodes,
  };
}

const results = [];
for (const repo of repos) {
  try {
    results.push(await fetchRepo(repo));
    console.log(`ok: ${repo.owner}/${repo.name}`);
  } catch (err) {
    console.error(`falhou: ${repo.owner}/${repo.name} — ${err.message}`);
    results.push({ owner: repo.owner, name: repo.name, error: err.message });
  }
}

mkdirSync(new URL("../data", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../data/status.json", import.meta.url),
  JSON.stringify({ generatedAt: new Date().toISOString(), repos: results }, null, 2)
);

console.log(`status.json escrito com ${results.length} repositórios.`);
