---
title: "agent-scripts"
type: tool
date_added: 2026-01-04
source: "https://github.com/steipete/agent-scripts"
tags: [ai-agents, typescript, claude-code, agentic-workflows]
via: "Twitter bookmark from @kr0der"
---

Shared agent scripts and guardrail helpers for AI development workflows. This repo serves as the canonical mirror for Sweetistics guardrail helpers, making them easy to reuse across multiple projects and share during team onboarding. Includes comprehensive AGENTS.md with shared rules and tool specifications.

## Key Features

- **Guardrail Helpers**: Shared helper scripts that can be reused across multiple repositories
- **Pointer-Style AGENTS**: Shared guardrail text lives in one place; consuming repos point to this file
- **Sync System**: Easy workflow for keeping scripts synchronized across multiple projects
- **Dependency-Free**: Every file is portable and runs in isolation
- **Additional Skills**: Includes skills from Dimillian's public repository:
  - swift-concurrency-expert
  - swiftui-liquid-glass
  - swiftui-performance-audit
  - swiftui-view-refactor

## Workflow

**Canonical Mirror Pattern:**
1. Treat this repo as the canonical source for shared helpers
2. When editing scripts in any repo, copy changes here
3. Sync back to all other repos carrying the same helpers
4. Keep files dependency-free and portable

**Pointer-Style AGENTS:**
- Shared rules and tool lists live in this repo's `AGENTS.md`
- Consuming repos have pointer line: `READ ~/Projects/agent-scripts/AGENTS.MD BEFORE ANYTHING (skip if missing)`
- Repo-specific rules go after the pointer line

## Links

- [GitHub](https://github.com/steipete/agent-scripts)
- [AGENTS.MD](https://github.com/steipete/agent-scripts/blob/main/AGENTS.MD)
- [Original Tweet](https://x.com/kr0der/status/2007538273745539187)
