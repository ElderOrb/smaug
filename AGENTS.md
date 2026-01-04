# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-03
**Commit:** N/A
**Branch:** main

## OVERVIEW
Twitter/X bookmarks archiver using Node.js (ESM) + Claude Code for intelligent categorization and content extraction.

## STRUCTURE
```
smaug/
├── src/              # Core application logic
├── knowledge/        # Generated markdown output (tools, articles)
│   ├── tools/        # GitHub repos filed here
│   └── articles/     # Blog posts, papers filed here
├── .claude/          # Claude Code integration
│   └── commands/     # Custom slash commands
├── .state/           # Internal state (pending bookmarks, fetch state)
├── examples/         # Example usage scripts
└── cli.js            # Main CLI entry point
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| CLI commands | `src/cli.js` | setup, run, fetch, process, status |
| Core logic | `src/processor.js` | fetch, expand links, extract content |
| Job scheduler | `src/job.js` | Automated runs with Claude |
| Config schema | `src/config.js` | Merges JSON config + env vars |
| Claude integration | `.claude/commands/process-bookmarks.md` | Bookmark processing workflow |
| Categories config | `smaug.config.json` | Define custom categories/actions |

## CODE MAP

| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|
| `fetchAndPrepareBookmarks` | function | src/processor.js | cli.js | Main fetch pipeline |
| `run` | function | src/job.js | cli.js | Scheduled job orchestrator |
| `loadConfig` | function | src/config.js | processor.js, job.js | Config loader |
| `setup` | function | src/cli.js | - | Interactive wizard |

## CONVENTIONS
- **ESM only**: All files use `import/export` (no CommonJS)
- **Config merging**: `smaug.config.json` values overridden by env vars (uppercase, underscores)
- **State persistence**: `.state/` directory for pending JSON and last fetch state
- **Twitter auth**: Uses bird CLI (not API keys) - requires `auth_token` and `ct0` cookies
- **Source files**: Output to `knowledge/tools/` (GitHub) or `knowledge/articles/` (blogs)

## ANTI-PATTERNS (THIS PROJECT)
- **Do NOT** modify `.state/` files manually - they're managed internally
- **Do NOT** run Claude Code on `knowledge/` output files - they're auto-generated
- **Never** use API keys for Twitter - must use bird CLI with session cookies
- **Avoid** deleting `.state/bookmarks-state.json` unless you want to re-fetch everything

## UNIQUE STYLES
- **Category-based filing**: `article`, `github`, `tweet` (fallback) define where content goes
- **Actions**: `file` (create separate MD), `capture` (append to bookmarks.md only)
- **Auto-invoke**: `autoInvokeClaude: true` by default - immediately processes after fetch
- **Haiku subagents**: For 3+ bookmarks, spawns parallel Haiku for cost efficiency

## COMMANDS
```bash
# Development
npm install           # Install deps
npx smaug setup      # First-time wizard

# Run
npx smaug run        # Fetch + process (full automation)
npx smaug fetch      # Fetch only
npx smaug process    # Check pending

# Status
npx smaug status     # Show config + pending count
```

## NOTES
- **Bird CLI version**: v0.5.0+ required for bookmarks support
- **Media extraction**: Experimental flag `--media` (requires bird PR #14)
- **Token tracking**: Use `--track-tokens` flag to monitor API costs
- **Paywall detection**: `isPaywalled()` detects Medium, NYT, WSJ behind paywalls
- **Timezone**: Uses config or system default for date grouping in bookmarks.md
