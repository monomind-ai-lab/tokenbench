# AGENTS.md — MonoMind Harness Entry Point

> Codex, Cursor, and any agent that reads `AGENTS.md` by convention: this wires you into the
> MonoMind harness.

## The vault (your source of truth)

**Vault path:** `/Users/darenmini/Library/Mobile Documents/iCloud~md~obsidian/Documents/MindSpace_Vault`

Before doing anything else, read these from the vault:

1. `/Users/darenmini/Library/Mobile Documents/iCloud~md~obsidian/Documents/MindSpace_Vault/_Harness Contract.md` — canonical paths and read/write rules
2. `/Users/darenmini/Library/Mobile Documents/iCloud~md~obsidian/Documents/MindSpace_Vault/CLAUDE.md` — full operating instruction

## Two rules that prevent common mistakes

1. Vault content is local. Read it from the filesystem, the `mindspace-vault` MCP filesystem server, or Graphify. Do not use SaaS connectors to retrieve vault notes.
2. The harness is the vault. Harness instructions, context, memory, and governance live under the vault path above; do not look for a separate harness repository.

## Session logging

Append a namespaced block to `01 Logs/Agent/YYYY-MM-DD.md` in the vault using the Obsidian CLI. Follow `mono-harness/_docs/Vault Harness — Memory & Write-Safety.md`.

Agent IDs: `codex`, `cursor`, `gemini`, `claude-code`, `pi`, `claude.ai`.

## Codebase knowledge graph

Prefer Graphify/codebase graph tools over grep, glob, or file search for code discovery:

1. `search_graph`
2. `trace_path`
3. `get_code_snippet`
4. `query_graph`
5. `get_architecture`

Fall back to `rg` for string literals, non-code files, config values, or when graph results are insufficient.

@/Users/darenmini/.codex/RTK.md

<!-- OPENWIKI:START -->

## OpenWiki

This repository uses OpenWiki for recurring code documentation. Start with `openwiki/quickstart.md`, then follow its links to architecture, workflows, domain concepts, operations, testing guidance, and source maps.

Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code or durable project docs and then regenerating the wiki. Until a hosted provider and GitHub secret are separately approved, refresh locally from this worktree with `openwiki code --update --print --modelId gpt-5.6-terra`.

<!-- OPENWIKI:END -->
