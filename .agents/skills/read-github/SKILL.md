---
name: read-github
description: Access GitHub repository documentation and code via the gitmcp.io MCP service.
source: https://skills.sh/am-will/codex-skills/read-github
---

# Read GitHub Docs

Access GitHub repository documentation and code via the gitmcp.io MCP service.

## URL Conversion

Convert GitHub URLs to gitmcp.io:

- github.com/owner/repo → gitmcp.io/owner/repo
- <https://github.com/karpathy/llm-council> → <https://gitmcp.io/karpathy/llm-council>

## CLI Usage

Use `scripts/gitmcp.py` for CLI access:

- `python3 scripts/gitmcp.py list-tools owner/repo`
- `python3 scripts/gitmcp.py fetch-docs owner/repo`
- `python3 scripts/gitmcp.py search-docs owner/repo "query"`
- `python3 scripts/gitmcp.py search-code owner/repo "function_name"`
- `python3 scripts/gitmcp.py fetch-url owner/repo "https://example.com/doc"`

## Available MCP Tools

1. `fetch_{repo}_documentation`: Fetch entire documentation.
2. `search_{repo}_documentation`: Semantic search within docs.
3. `search_{repo}_code`: Search code via GitHub API (exact match).
4. `fetch_generic_url_content`: Fetch any URL referenced in docs.

## Workflow

1. Fetch documentation to understand the project.
2. Use `search-docs` for specific usage questions.
3. Use `search-code` to find implementations.
4. Use `fetch-url` for external references.
