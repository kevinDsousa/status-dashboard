# status-dashboard

Painel estático que mostra issues abertas/fechadas, PRs abertos e última release dos
10 repositórios listados em [`repos.json`](repos.json). Publicado via GitHub Pages
(branch `main`, pasta `/docs`), sem login — `robots.txt` bloqueia indexação, mas a
URL é acessível por qualquer um com o link.

## Como funciona

- `scripts/collect.mjs` consulta a GraphQL API do GitHub para cada repositório em
  `repos.json` e grava `data/status.json`.
- `scripts/build.mjs` lê `data/status.json` e gera `docs/index.html`.
- `.github/workflows/update-dashboard.yml` roda os dois a cada 6 horas (ou manualmente
  via "Run workflow") e commita o resultado.

## Setup necessário (uma vez)

O workflow precisa de um token com leitura nos 10 repositórios privados — o
`GITHUB_TOKEN` padrão das Actions só enxerga este próprio repositório, não os outros.

1. Crie um **fine-grained personal access token** em
   https://github.com/settings/personal-access-tokens/new
   - Resource owner: `kevinDsousa`
   - Repository access: selecione os 10 repositórios de `repos.json`
   - Permissions: `Issues: Read-only`, `Metadata: Read-only`, `Pull requests: Read-only`
2. Adicione como secret deste repositório:
   ```
   gh secret set DASHBOARD_PAT --repo kevinDsousa/status-dashboard
   ```
   (cole o token quando pedir — assim ele nunca fica no histórico do terminal nem em texto no chat)
3. Rode manualmente uma vez para confirmar:
   ```
   gh workflow run update-dashboard.yml --repo kevinDsousa/status-dashboard
   ```

Até o secret existir, `docs/index.html` mostra uma mensagem de espera em vez de dados.

## Rodar localmente

```
GH_TOKEN=$(gh auth token) npm run refresh
```
