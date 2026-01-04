---
title: "bridle"
type: tool
date_added: 2026-01-04
source: "https://github.com/neiii/bridle"
tags: [cli, tui, configuration, ai, claude-code, opencode, rust]
via: "Twitter bookmark from @d0xxed"
---

Unified configuration manager for AI coding assistants. Manage profiles, install skills/agents/commands, and switch configurations across Claude Code, OpenCode, Goose, and Amp from a single TUI interface. Bridle acts as a "package manager" for your AI harness, automatically translating paths, namings, schemas, and configurations for each platform.

## Key Features

- **Cross-Platform Support**: Works with Claude Code, OpenCode, Goose, and Amp
- **Profile Management**: Create, switch, and manage multiple configuration profiles
- **Package Manager**: Install skills, agents, commands, and MCPs from any GitHub repository
- **Automatic Translation**: Handles path differences between harnesses (e.g., `~/.claude/skills/` vs `~/.config/opencode/skill/`)
- **Schema Mapping**: Auto-translates JSON/YAML configuration schemas for different platforms
- **Status Dashboard**: See what's configured across all harnesses at once
- **CLI + TUI**: Both terminal commands and interactive terminal interface available

## Key Differentiator

Skills written for one harness can be installed on others without modification. Bridle automatically handles:
- Directory paths
- Naming conventions
- Configuration schemas
- Installation procedures

## Installation

```bash
# Homebrew (macOS/Linux)
brew install neiii/bridle/bridle

# Cargo
cargo install bridle

# From source
git clone https://github.com/neiii/bridle && cd bridle && cargo install --path .
```

## Links

- [GitHub](https://github.com/neiii/bridle)
- [Original Tweet](https://x.com/d0xxed/status/2007213826190778443)
