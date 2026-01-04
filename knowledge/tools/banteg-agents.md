---
title: "banteg-agents"
type: tool
date_added: 2026-01-04
source: "https://github.com/banteg/agents"
tags: [git, worktrees, ai-agents, claude, codex]
via: "Twitter bookmark from @banteg"
---

Documentation of git worktree workflows for AI agents like Codex and Claude. Shows how to isolate agent work in separate directories to prevent conflicts when multiple agents work on the same codebase.

## Key Features

- **Git worktree isolation**: Create separate working trees for each agent task
- **Workflow documentation**: Best practices for create → commit → PR → cleanup cycle
- **Tool wrappers**: Recommendations for git-wt and worktrunk CLI tools
- **Automatic cleanup**: Discard worktrees after merging PRs

## Usage

The workflow: create a worktree, make commits, open PR (with `gh pr create` or ask Claude), merge, then discard worktree and prune branch.

## Tools Mentioned

- **git-wt**: Simple wrapper for common worktree operations
- **worktrunk**: Full-featured tool with auto-install scripts and LLM commit generation

## Links

- [GitHub](https://github.com/banteg/agents)
- [Original Tweet](https://x.com/banteg/status/2007410500859245029)
