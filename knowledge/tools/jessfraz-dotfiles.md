---
title: "dotfiles"
type: tool
date_added: 2026-01-04
source: "https://github.com/jessfraz/dotfiles"
tags: [dotfiles, shell, bash, containers, docker, linux]
via: "Twitter bookmark from @jessfraz"
---

Jessie Frazelle's personal dotfiles collection. Comprehensive setup for bash, containers, docker, and Linux environments. Includes detailed AGENTS.md configuration for Claude Code and other AI assistants with strict guardrails and comprehensive tool specifications.

## Key Features

- **Shell Configuration**: Bash scripts for terminal customization and aliases
- **Container Support**: Docker and container-related configurations
- **AI Assistant Config**: Detailed AGENTS.md with:
  - Strict guardrails for AI behavior
  - Comprehensive tool allowlists
  - File editing restrictions
  - Testing requirements
  - Committing conventions
- **Git Setup**: Comprehensive git configuration and aliases
- **Customization**: `.extra` file for environment-specific settings

## Installation

```bash
# Clone and install
make
```

This creates symlinks from the repo to your home folder.

## Customization

Save environment variables and custom settings in a `.extra` file:

```bash
### Git credentials
GIT_AUTHOR_NAME="Your Name"
GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
git config --global user.name "$GIT_AUTHOR_NAME"
GIT_AUTHOR_EMAIL="email@you.com"
GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
git config --global user.email "$GIT_AUTHOR_EMAIL"

### Email settings
export GMAIL=email@you.com
export GMAIL_NAME="Your Name"
```

## Links

- [GitHub](https://github.com/jessfraz/dotfiles)
- [AGENTS.md](https://github.com/jessfraz/dotfiles/blob/main/.codex/AGENTS.md)
- [Original Tweet](https://x.com/jessfraz/status/2007682934585864619)
