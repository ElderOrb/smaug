# Smaug 🐉

Archive your Twitter/X bookmarks (and/or optionally, likes) to markdown. Automatically.

*Like a dragon hoarding treasure, Smaug collects the valuable things you bookmark and like.*

## Contents

- [Quick Start](#quick-start-5-minutes)
- [Requirements](#requirements)
- [Platform Support](#platform-support)
- [OpenCode CLI Support](#opencode-cli-support)
- [Getting Twitter Credentials](#getting-twitter-credentials)
- [What It Does](#what-it-does)
- [Running](#running)
- [Categories](#categories)
- [Automation](#automation)
- [Output](#output)
- [Configuration](#configuration)
- [AI CLI Integration](#ai-cli-integration)
- [Troubleshooting](#troubleshooting)
- [Credits](#credits)

```
  🔥  🔥  🔥  🔥  🔥  🔥  🔥  🔥  🔥  🔥  🔥  🔥
       _____ __  __   _   _   _  ____
      / ____|  \/  | / \ | | | |/ ___|
      \___ \| |\/| |/ _ \| | | | |  _
       ___) | |  | / ___ \ |_| | |_| |
      |____/|_|  |_/_/  \_\___/ \____|

   🐉 The dragon stirs... treasures to hoard!
```

## Quick Start (5 minutes)

```bash
# 1. Install bird CLI (Twitter API wrapper)
# See https://github.com/steipete/bird for installation

# 2. Install an AI CLI (choose one):
#    Claude Code: npm install -g @anthropic-ai/claude-code
#    OpenCode:    npm install -g @opencode/cli

# 3. Clone and install Smaug
git clone https://github.com/alexknowshtml/smaug
cd smaug
npm install

# 4. Run the setup wizard
npx smaug setup

# 5. Run the full job (fetch + process)
npx smaug run
```

The setup wizard will:
- Create required directories
- Guide you through getting Twitter credentials
- Create your config file
- Auto-detect your installed AI CLI

## Requirements

- **Node.js 20+** (uses native `fetch` API)
- **bird CLI** - Twitter API wrapper (install globally)
- **AI CLI** - For bookmark analysis (Claude Code or OpenCode, optional, auto-detected)
- **Git** - Optional, for committing changes to version control

No shell utilities (curl, jq, etc.) needed - pure Node.js!

## Platform Support

Smaug works on all major platforms:

| Platform | Status | Notes |
|----------|--------|-------|
| **Windows 10/11** | ✅ Fully supported | Native Node.js APIs, no shell dependencies |
| **macOS 12+** | ✅ Fully supported | Native Node.js APIs |
| **Linux** | ✅ Fully supported | Native Node.js APIs |

## OpenCode CLI Support

Smaug supports both **Claude Code** and **OpenCode** CLI tools for bookmark analysis. You can choose which CLI to use based on your preferences and API access.

### Choosing Your CLI Tool

Configure which CLI tool to use in `smaug.config.json`:

```json
{
  "cliTool": "opencode",  // or "claude"
  "opencodeModel": "opencode/glm-4.7-free",
  "claudeModel": "sonnet",
  "autoInvokeOpencode": true,
  "autoInvokeClaude": true
}
```

Or set via environment variable:
```bash
export CLI_TOOL=opencode
export OPENCODE_MODEL=opencode/glm-4.7-free
export AUTO_INVOKE_OPENCODE=true
```

### Using OpenCode

OpenCode is a versatile CLI that supports multiple AI models including free options.

**Setup:**
```bash
# Install OpenCode
npm install -g @opencode/cli

# Configure Smaug to use OpenCode
npx smaug init
# Then edit smaug.config.json to set:
# "cliTool": "opencode"
# "opencodeModel": "opencode/glm-4.7-free"
```

**Usage Examples:**
```bash
# Run with OpenCode (configured in smaug.config.json)
npx smaug run

# Or override model for one run
export OPENCODE_MODEL=opencode/glm-4.7-pro
npx smaug run

# Fetch and process with OpenCode
npx smaug fetch 20
npx smaug run
```

### Using Claude Code

Claude Code provides advanced reasoning with Anthropic's models (Sonnet, Haiku, Opus).

**Setup:**
```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Configure Smaug to use Claude
npx smaug init
# Then edit smaug.config.json to set:
# "cliTool": "claude"
# "claudeModel": "sonnet"
```

**Usage Examples:**
```bash
# Run with Claude (default)
npx smaug run

# Use Haiku for faster, cheaper processing
export CLAUDE_MODEL=haiku
npx smaug run

# Track token usage and costs
npx smaug run --track-tokens
```

### CLI Tool Comparison

| Feature | OpenCode | Claude Code |
|---------|----------|-------------|
| **Models** | Multiple (GLM-4.7, etc.) | Sonnet, Haiku, Opus |
| **Cost** | Free tier available | Paid API (Anthropic) |
| **Setup** | `npm install -g @opencode/cli` | `npm install -g @anthropic-ai/claude-code` |
| **Token Tracking** | ✅ Supported | ✅ Supported |
| **Parallel Processing** | ✅ Via Task tool | ✅ Via Task tool |
| **Auto-detection** | ✅ Cross-platform | ✅ Cross-platform |

### Environment Variables

Both CLIs support these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `CLI_TOOL` | Which CLI to use | `opencode` or `claude` |
| `OPENCODE_MODEL` | OpenCode model name | `opencode/glm-4.7-free` |
| `CLAUDE_MODEL` | Claude model name | `sonnet`, `haiku`, `opus` |
| `AUTO_INVOKE_OPENCODE` | Auto-run OpenCode after fetch | `true` or `false` |
| `AUTO_INVOKE_CLAUDE` | Auto-run Claude after fetch | `true` or `false` |
| `AI_PATH` | Custom path to CLI binary | `/usr/local/bin/opencode` |
| `CLAUDE_TIMEOUT` | Processing timeout (ms) | `900000` (15 min) |

### Configuration Examples

**OpenCode with free model:**
```json
{
  "cliTool": "opencode",
  "opencodeModel": "opencode/glm-4.7-free",
  "autoInvokeOpencode": true,
  "autoInvokeClaude": false,
  "claudeTimeout": 900000
}
```

**Claude with Sonnet:**
```json
{
  "cliTool": "claude",
  "claudeModel": "sonnet",
  "autoInvokeClaude": true,
  "allowedTools": "Read,Write,Edit,Glob,Grep,Bash,Task,TodoWrite",
  "claudeTimeout": 900000
}
```

**Mixed usage (switch between them):**
```json
{
  "cliTool": "opencode",
  "opencodeModel": "opencode/glm-4.7-free",
  "claudeModel": "sonnet",
  "autoInvokeOpencode": true,
  "autoInvokeClaude": true
}
```

### Cross-Platform Features

- ✅ **No shell command dependencies** - Uses native Node.js `fetch` API
- ✅ **Automatic path detection** - Finds Claude CLI on Windows/Mac/Linux
- ✅ **Native HTTP handling** - Better error handling and performance
- ✅ **Exponential retry logic** - Automatic retries with backoff for failed requests
- ✅ **GitHub API rate limiting** - Respects API limits (5000 req/hour authenticated)

### Windows-Specific Notes

1. **AI CLI Location**:
   - Smaug automatically searches these Windows paths for Claude:
     - `%LOCALAPPDATA%\Programs\claude.exe`
     - `%PROGRAMFILES%\Claude\claude.exe`
     - `%USERPROFILE%\AppData\Local\Programs\claude.exe`
   - And for OpenCode:
     - `%APPDATA%\Roaming\npm\opencode.cmd`
     - `%LOCALAPPDATA%\npm\opencode.cmd`
     - `%LOCALAPPDATA%\Programs\opencode.exe`

2. **No additional tools required**:
   - No `curl` needed
   - No `git` needed (unless using git automation)
   - Works out of the box with just Node.js

3. **PowerShell vs CMD**:
   - All commands work in both PowerShell and CMD
   - No shell-specific syntax used

### Troubleshooting - Windows

**"Cannot find Claude/OpenCode binary"**:
```powershell
# Check if Claude is installed
Get-Command claude

# Or check OpenCode
Get-Command opencode

# Or manually set path in smaug.config.json:
{
  "claudePath": "C:\\Users\\YourName\\AppData\\Local\\Programs\\claude.exe"
}
```

**"Bird CLI not found"**:
- Install bird CLI globally:
  ```powershell
  npm install -g @steipete/bird@latest
  ```
- Verify installation: `bird --version`

## Manually Getting Twitter Credentials

Smaug uses the bird CLI which needs your Twitter session cookies. 

If you don't want to use the wizard to make it easy, you can manually put your seession info into the config. 

1. Open Twitter/X in your browser
2. Open Developer Tools → Application → Cookies
3. Find and copy these values:
   - `auth_token`
   - `ct0`
4. Add them to `smaug.config.json`:

```json
{
  "twitter": {
    "authToken": "your_auth_token_here",
    "ct0": "your_ct0_here"
  }
}
```

## What Smaug Actually Does

1. **Fetches bookmarks** from Twitter/X using the bird CLI (can also fetch likes, or both)
2. **Expands t.co links** to reveal actual URLs
3. **Extracts content** from linked pages (GitHub repos, articles, quote tweets)
4. **Invokes Claude Code or OpenCode** to analyze and categorize each tweet
5. **Saves to markdown** organized by date with rich context
6. **Files to knowledge library** - GitHub repos to `knowledge/tools/`, articles to `knowledge/articles/`

## Running Manually

```bash
# Full job (fetch + process with configured CLI)
npx smaug run

# Fetch from bookmarks (default)
npx smaug fetch 20

# Fetch from likes instead
npx smaug fetch --source likes

# Fetch from both bookmarks AND likes
npx smaug fetch --source both

# Process already-fetched tweets
npx smaug process

# Force re-process (ignore duplicates)
npx smaug process --force

# Track token usage and costs
npx smaug run --track-tokens

# Check what's pending
cat .state/pending-bookmarks.json | jq '.count'
```

## Categories

Categories define how different bookmark types are handled. Smaug comes with sensible defaults, but you can customize them in `smaug.config.json`.

### Default Categories

| Category | Matches | Action | Destination |
|----------|---------|--------|-------------|
| **article** | blogs, news sites, papers, medium.com, substack, etc | file | `./knowledge/articles/` |
| **github** | github.com | file | `./knowledge/tools/` |
| **tweet** | (fallback) | capture | bookmarks.md only |

🔜 _Note: Transcription coming soon for podcasts, videos, etc but feel free to edit your own and submit back suggestions!_

### Actions

- **file**: Create a separate markdown file with rich metadata
- **capture**: Add to bookmarks.md only (no separate file)
- **transcribe**: Flag for future transcription *(auto-transcription coming soon! PRs welcome)*

### Custom Categories

Add your own categories in `smaug.config.json`:

```json
{
  "categories": {
    "research": {
      "match": ["arxiv.org", "papers.", "scholar.google"],
      "action": "file",
      "folder": "./knowledge/research",
      "template": "article",
      "description": "Academic papers"
    },
    "newsletter": {
      "match": ["buttondown.email", "beehiiv.com"],
      "action": "file",
      "folder": "./knowledge/newsletters",
      "template": "article",
      "description": "Newsletter issues"
    }
  }
}
```

Your custom categories merge with the defaults. To override a default, use the same key (e.g., `github`, `article`).

## Automation

Run Smaug automatically every 30 minutes:

### Option A: PM2 (recommended)

```bash
npm install -g pm2
pm2 start "npx smaug run" --cron "*/30 * * * *" --name smaug
pm2 save
pm2 startup    # Start on boot
```

### Option B: Cron

```bash
crontab -e
# Add:
*/30 * * * * cd /path/to/smaug && npx smaug run >> smaug.log 2>&1
```

### Option C: systemd

```bash
# Create /etc/systemd/system/smaug.service
# See docs/systemd-setup.md for details
```

## Output

### bookmarks.md

Your bookmarks organized by date:

```markdown
# Thursday, January 2, 2026

## @simonw - Gist Host Fork for Rendering GitHub Gists
> I forked the wonderful gistpreview.github.io to create gisthost.github.io

- **Tweet:** https://x.com/simonw/status/123456789
- **Link:** https://gisthost.github.io/
- **Filed:** [gisthost-gist-rendering.md](./knowledge/articles/gisthost-gist-rendering.md)
- **What:** Free GitHub Pages-hosted tool that renders HTML files from Gists.

---

## @tom_doerr - Whisper-Flow Real-time Transcription
> This is amazing - real-time transcription with Whisper

- **Tweet:** https://x.com/tom_doerr/status/987654321
- **Link:** https://github.com/dimastatz/whisper-flow
- **Filed:** [whisper-flow.md](./knowledge/tools/whisper-flow.md)
- **What:** Real-time speech-to-text using OpenAI Whisper with streaming support.
```

### knowledge/tools/*.md

GitHub repos get their own files:

```markdown
---
title: "whisper-flow"
type: tool
date_added: 2026-01-02
source: "https://github.com/dimastatz/whisper-flow"
tags: [ai, transcription, whisper, streaming]
via: "Twitter bookmark from @tom_doerr"
---

Real-time speech-to-text transcription using OpenAI Whisper...

## Key Features
- Streaming audio input
- Multiple language support
- Low latency output

## Links
- [GitHub](https://github.com/dimastatz/whisper-flow)
- [Original Tweet](https://x.com/tom_doerr/status/987654321)
```

## Configuration

Create `smaug.config.json`:

```json
{
  "source": "bookmarks",
  "archiveFile": "./bookmarks.md",
  "pendingFile": "./.state/pending-bookmarks.json",
  "stateFile": "./.state/bookmarks-state.json",
  "timezone": "America/New_York",
  "twitter": {
    "authToken": "your_auth_token",
    "ct0": "your_ct0"
  },
  "autoInvokeClaude": true,
  "claudeModel": "sonnet",
  "claudeTimeout": 900000,
  "allowedTools": "Read,Write,Edit,Glob,Grep,Bash,Task,TodoWrite",
  "webhookUrl": null,
  "webhookType": "discord"
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `source` | `bookmarks` | What to fetch: `bookmarks` (default), `likes`, or `both` |
| `includeMedia` | `false` | **EXPERIMENTAL**: Include media attachments (photos, videos, GIFs) |
| `archiveFile` | `./bookmarks.md` | Main archive file |
| `timezone` | `America/New_York` | For date formatting |
| `cliTool` | `claude` | CLI tool to use: `claude` or `opencode` |
| `autoInvokeClaude` | `true` | Auto-run Claude Code for analysis |
| `autoInvokeOpencode` | `true` | Auto-run OpenCode for analysis |
| `claudeModel` | `sonnet` | Claude model: `sonnet`, `haiku`, or `opus` |
| `opencodeModel` | `opencode/glm-4.7-free` | OpenCode model (any OpenCode-compatible model) |
| `claudePath` | `null` | Custom path to CLI binary (auto-detected if null) |
| `claudeTimeout` | `900000` | Max processing time (15 min) |
| `webhookUrl` | `null` | Discord/Slack webhook for notifications |
| `webhookType` | `discord` | Webhook type: `discord`, `slack`, or `generic` |

Environment variables also work: `AUTH_TOKEN`, `CT0`, `SOURCE`, `INCLUDE_MEDIA`, `ARCHIVE_FILE`, `TIMEZONE`, `CLI_TOOL`, `OPENCODE_MODEL`, `CLAUDE_MODEL`, `AUTO_INVOKE_OPENCODE`, `AUTO_INVOKE_CLAUDE`, `AI_PATH`, `CLAUDE_TIMEOUT`, `WEBHOOK_URL`, `WEBHOOK_TYPE`, etc.

### Experimental: Media Attachments

Media extraction (photos, videos, GIFs) is available but disabled by default. To enable:

```bash
# One-time with flag
npx smaug fetch --media

# Or in config
{
  "includeMedia": true
}
```

When enabled, the `media[]` array is included in the pending JSON with:
- `type`: "photo", "video", or "animated_gif"
- `url`: Full-size media URL
- `previewUrl`: Thumbnail (smaller, faster)
- `width`, `height`: Dimensions
- `videoUrl`, `durationMs`: For videos only

⚠️ **Why experimental?**
1. **Requires bird with media support** - PR [#14](https://github.com/steipete/bird/pull/14) adds media extraction. Until merged, you'll need a fork with this PR or wait for an upstream release. Without it, `--media` is a no-op (empty array).
2. **Workflow still being refined** - Short screengrabs (< 30s) don't need transcripts, but longer videos might. We're still figuring out the best handling.

## AI CLI Integration

Smaug uses either Claude Code or OpenCode for intelligent bookmark processing (configurable via `cliTool` setting). Both CLIs use the same processing instructions in `.claude/commands/process-bookmarks.md`:

- Generating descriptive titles (not generic "Article" or "Tweet")
- Filing GitHub repos to `knowledge/tools/`
- Filing articles to `knowledge/articles/`
- Handling quote tweets with full context
- Processing reply threads with parent context
- Parallel processing for 3+ bookmarks (using Haiku subagents for cost efficiency)

### Manual Processing

You can also run processing manually with your configured CLI:

```bash
# With Claude Code
claude
> Run /process-bookmarks

# With OpenCode
opencode
> Run /process-bookmarks
```

### Token Usage Tracking

Track your API costs with the `-t` flag:

```bash
npx smaug run -t
# or
npx smaug run --track-tokens
```

This displays a breakdown at the end of each run:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 TOKEN USAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Main (sonnet):
  Input:               85 tokens  <$0.01
  Output:           5,327 tokens  $0.08
  Cache Read:     724,991 tokens  $0.22
  Cache Write:     62,233 tokens  $0.23

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 TOTAL COST: $0.53
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Cost Optimization: Haiku Subagents

For batches of 3+ bookmarks, Smaug spawns parallel subagents. By default, these use Haiku instead of Sonnet, which cuts costs nearly in half:

| Configuration | 20 Bookmarks | Time |
|---------------|--------------|------|
| Sonnet subagents | $1.00 | 4m 12s |
| **Haiku subagents** | **$0.53** | 4m 18s |

Same speed, ~50% cheaper. The categorization and filing tasks don't require Sonnet-level reasoning, so Haiku handles them well.

This is configured in `.claude/commands/process-bookmarks.md` with `model="haiku"` in the Task calls.

## Troubleshooting

### "No new bookmarks to process"

This means either:
1. No bookmarks were fetched (check bird CLI credentials)
2. All fetched bookmarks already exist in `bookmarks.md`

To start fresh:
```bash
rm -rf .state/ bookmarks.md knowledge/
mkdir -p .state knowledge/tools knowledge/articles
npx smaug run
```

### Bird CLI 403 errors

Your Twitter cookies may have expired. Get fresh ones from your browser.

### "Cannot find Claude/OpenCode binary"

**For Claude:**
```bash
# Check if Claude is installed
claude --version

# Or manually set path in smaug.config.json:
{
  "claudePath": "C:\\Users\\YourName\\AppData\\Local\\Programs\\claude.exe"
}
```

**For OpenCode:**
```bash
# Check if OpenCode is installed
opencode --version

# Or manually set path in smaug.config.json:
{
  "claudePath": "/usr/local/bin/opencode"
}
```

### Processing is slow

- Try `haiku` model instead of `sonnet` in config for faster (but less thorough) processing
- Switch to OpenCode with `opencode/glm-4.7-free` for faster processing
- Make sure you're not re-processing with `--force` (causes edits instead of appends)

### OpenCode not working

- Ensure OpenCode is installed: `npm install -g @opencode/cli`
- Verify model is valid: `opencode models` to see available models
- Check that `cliTool` is set to `"opencode"` in config

## Credits

- [bird CLI](https://github.com/steipete/bird) by Peter Steinberger
- [OpenCode](https://github.com/opencode-ai/opencode) for CLI support
- Built with Claude Code

## License

MIT
