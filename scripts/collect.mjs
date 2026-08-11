import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const token = process.env.GH_TOKEN;
// Projects de conta pessoal não são cobertos pelas permissões "Account" dos tokens
// fine-grained — só um classic PAT com escopo read:project enxerga os quadros 9/10.
// Sem ele, cai pro token principal (que falha graciosamente e só deixa "Em andamento" vazio).
const projectsToken = process.env.PROJECTS_TOKEN || token;

if (!token) {
  console.error("GH_TOKEN não definido — nada pra coletar. Veja o README para configurar o secret DASHBOARD_PAT.");
  process.exit(0);
}

const repos = JSON.parse(readFileSync(new URL("../repos.json", import.meta.url)));
const PROJECT_LOGIN = "kevinDsousa";
const PROJECT_NUMBERS = [9, 10];

async function graphql(query, variables, authToken = token) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data;
}

const PROJECT_ITEMS_QUERY = `
query($number: Int!, $cursor: String) {
  user(login: "${PROJECT_LOGIN}") {
    projectV2(number: $number) {
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          updatedAt
          fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
          content {
            __typename
            ... on Issue { number title url state repository { name } }
          }
        }
      }
    }
  }
}`;

// Lê os quadros 9 e 10 e monta um mapa "repo -> issues com status In Progress",
// já que issue no GitHub só tem aberta/fechada — "em andamento" é um conceito do board.
async function fetchInProgressByRepo() {
  const byRepo = new Map();

  for (const number of PROJECT_NUMBERS) {
    let cursor = null;
    do {
      const data = await graphql(PROJECT_ITEMS_QUERY, { number, cursor }, projectsToken);
      const items = data.user.projectV2.items;
      for (const item of items.nodes) {
        if (item.content?.__typename !== "Issue") continue;
        if (item.fieldValueByName?.name !== "In Progress") continue;
        const repoName = item.content.repository.name;
        const list = byRepo.get(repoName) ?? [];
        list.push({
          number: item.content.number,
          title: item.content.title,
          url: item.content.url,
          state: item.content.state,
          updatedAt: item.updatedAt,
        });
        byRepo.set(repoName, list);
      }
      cursor = items.pageInfo.hasNextPage ? items.pageInfo.endCursor : null;
    } while (cursor);
  }

  for (const [repoName, list] of byRepo) {
    list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    byRepo.set(repoName, list.slice(0, 5));
  }

  return byRepo;
}

const REPO_QUERY = `
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    openIssues: issues(states: OPEN) { totalCount }
    closedIssues: issues(states: CLOSED) { totalCount }
    openPRs: pullRequests(states: OPEN) { totalCount }
    releases(first: 5, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes { tagName name description publishedAt url }
    }
    recentlyCreated: issues(first: 5, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes { number title state url }
    }
  }
}`;

async function fetchRepo({ owner, name }, inProgressByRepo) {
  const data = await graphql(REPO_QUERY, { owner, name });
  const r = data.repository;
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
    inProgress: inProgressByRepo.get(name) ?? [],
    recentlyCreated: r.recentlyCreated.nodes,
  };
}

const results = [];
let inProgressByRepo = new Map();
try {
  inProgressByRepo = await fetchInProgressByRepo();
  console.log(`quadros 9 e 10 lidos, ${inProgressByRepo.size} repositórios com issues "In Progress"`);
} catch (err) {
  console.error(`falhou ao ler os quadros de projeto: ${err.message}`);
}

for (const repo of repos) {
  try {
    results.push(await fetchRepo(repo, inProgressByRepo));
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
