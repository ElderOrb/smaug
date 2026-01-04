---
title: "burrow"
type: tool
date_added: 2026-01-04
source: "https://github.com/captainsafia/burrow"
tags: [secrets-management, cli, sqlite, dotenv, env-vars, local]
via: "Twitter bookmark from @captainsafia"
---

Directory-scoped secrets manager that autoloads per-directory secrets (direnv-style). Secrets are stored outside your repos in a local SQLite store and exportable to various formats via CLI. Unlike system-wide solutions, burrow lets you define different secrets for different project directories with automatic inheritance and selective blocking.

## Key Features

- **Directory-scoped secrets**: Define secrets per project with automatic inheritance
- **Direnv-style autoloading**: Right secrets automatically in scope for current directory
- **SQLite storage**: Local database keeps secrets outside your git repos
- **Multiple export formats**: bash, fish, powershell, cmd, dotenv, json
- **Secret blocking**: Block inheritance of specific secrets in subdirectories
- **Simple CLI**: Set, get, list, export, block, and unset commands
- **Per-path operations**: Manage secrets for any directory path
- **Redaction support**: Redact values in output for safe logging

## Installation

Linux/macOS:
```bash
curl -fsSL https://safia.rocks/burrow/install.sh | sh
```

## Usage

Set secrets (KEY=VALUE format):
```bash
burrow set API_KEY=sk-live-abc123
burrow set DATABASE_URL=postgres://localhost/mydb --path ~/projects
```

Get secrets:
```bash
burrow get API_KEY
burrow get API_KEY --redact
```

List all secrets:
```bash
burrow list
burrow list --format json
burrow list --redact
```

Export to shell:
```bash
eval "$(burrow export)"
burrow release --format fish
burrow release --format dotenv
```

Block inheritance:
```bash
burrow block API_KEY --path ~/projects/app-a/tests
```

## Links

- [GitHub](https://github.com/captainsafia/burrow)
- [Releases](https://github.com/captainsafia/burrow/releases)
- [Original Tweet](https://x.com/captainsafia/status/2007215212932350165)
