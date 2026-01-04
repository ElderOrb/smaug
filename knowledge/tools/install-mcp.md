# install-mcp

**Source:** [@supermemory](https://x.com/supermemory/status/2007565682754625805) | **Date:** 2026-01-04

**Repository:** [supermemoryai/install-mcp](https://github.com/supermemoryai/install-mcp) | **Language:** TypeScript | **⭐ 151**

## Description
A simple CLI to install and manage MCP servers into any client - auth included!

## Installation
```bash
npx install-mcp <package> --client <client>
```

## Usage
The CLI now supports multiple installation methods with automatic detection:

### Simple package names
```bash
npx install-mcp mcp-package-name --client claude
```

### Scoped packages
```bash
npx install-mcp @org/mcp-server --client claude
```

### Full commands (for custom arguments)
```bash
npx install-mcp 'npx some-mcp-server --custom-args' --client claude
```

### Remote URLs (with automatic naming)
```bash
npx install-mcp https://mcp.example.com/server --client claude
```

## Features
The tool automatically:
- Converts simple package names to `npx package-name`
- Preserves full commands as-is
- Infers server names from package names or URLs (e.g., `mcp.example.com` → `mcp-example-com`)
- Handles OAuth authentication for remote servers
- Deals with different config schemas across clients (so you don't have to)
- Handles auth across clients

## Supermemory project support
When installing a server hosted on `https://api.supermemory.ai/*`, you can pass a project name via `--project`. This is a convenience alias for adding the header `x-sm-project: <value>`.

Rules:
- Only applies to URL installs targeting `https://api.supermemory.ai/*`
- Values must not contain spaces
- If you omit `--project` for these URLs, you'll be prompted. Pressing Enter uses `default`
- The value is injected as a header alongside any `--header` flags

Example:
```bash
# Explicit project
npx install-mcp https://api.supermemory.ai/servers/my-server \
  --client cursor \
  --project myproj

# Prompted for project (Enter defaults to "default")
npx install-mcp https://api.supermemory.ai/servers/my-server --client cursor
```

## Headers Support
You can pass headers for authentication or other purposes using the `--header` flag. Multiple headers can be passed by repeating the flag.

Example:
```bash
npx install-mcp https://api.example.com/mcp \
  --client claude \
  --header "Authorization: Bearer token123" \
  --header "X-Custom-Header: value"
```
