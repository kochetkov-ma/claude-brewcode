---
name: eurodns
description: Show or modify explicitly requested EuroDNS records, with current schema verification, GET-before-write, concrete previews, and whole-zone replacement approval.
---

# EuroDNS records

Resolve RU/EN prose into mode, domain, and record selection; never use the first word as the domain.

| Mode | EN keywords | RU keywords |
|---|---|---|
| `show` (default) | show, list, view, get records, check | покажи, список, посмотри, проверь |
| `add` | add, create, new record | добавь, создай, новая запись |
| `update` | update, change, modify, edit, redirect | обнови, измени, поменяй, настрой редирект |
| `delete` | delete, remove, drop | удали, убери, сними |

Strip flags; one explicit mode token wins. Otherwise score distinct whole-word keyword hits: unique highest wins; a tie involving delete needs clarification; a tie with show resolves to show; add/update ties use the earliest keyword. Conflicting explicit modes need clarification. Zero matches or empty input resolves to show. Ask for a missing domain or outcome-changing ambiguity before API work; clarify deletion scope before target inspection if necessary. Use available Codex input tools for optional questions; required approval needs an explicit user response, never a timeout or absent tool result.

Before the first API call emit one English `PLAN — eurodns` block with `INPUT`, `MODE`, `SCOPE` (domain and record identities), `DO`, and `RESULT`. Redact credentials if present in user input.

## Provider contract and credentials

Verify API routes, status codes, auth header names, IP restrictions, and schemas against [provider OpenAPI](https://rest-api.eurodns.com/openapi) and [official documentation](https://docapi.eurodns.com/) before a future API operation. Do not invent endpoints when verification fails.

Preserve separate DNS records, URL forwards, and mail forwards. Historical provider field notes, adapted 2026-09-30: DNS record `type`, `host`, `ttl`, `rdata`; URL-forward `forwardType`, `host`, `url` and optional FRAME metadata; mail-forward `source`, `destination`; read-only IDs/state; and validation severity. Confirm these fields, supported types, TTLs, read-only fields, and payload/response wrappers in the live schema before constructing payloads. Do not assume domain-specific URL-forward support from historical failures.

During setup/migration do not read `.env` or credentials or call the API. During authorized operation resolve credentials locally through the user's configured secure mechanism; never print, copy, or persist secrets, enable shell tracing, or embed secrets in command text/reports. Use a non-executable credential-resolution placeholder until that mechanism is known; do not ship a hardcoded home path or `source .env` command. Keep temporary/runtime data outside `.claude/` and restrict secret-bearing local files.

## Operation

1. Verify the provider contract, resolve authorized target and credentials, then GET the zone before any mutation. Show requested records and relevant state.
2. Build a concrete before/after preview identifying domain, operation, IDs, host, type, data, TTL or forwarding fields, and preservation of unrelated records. A delete preview names exact existing targets. Preserve unrelated parking records unless removal is requested; remove by ID rather than replacing the zone.
3. Match payloads to the verified schema. Whole-zone PUT requires validation with the verified provider check operation and explicit user approval of that concrete whole-zone replacement preview. Preserve unrelated records, URL forwards, and mail forwards. General DNS modification authority does not authorize whole-zone replacement. Missing approval: present the preview and wait.
4. Execute only authorized changes. If the outcome is uncertain, GET and reconcile before retrying; do not blindly replay writes. GET afterward and compare actual records with the preview. Report verified effects and unresolved differences.

For a verified IP authorization error, stop; if needed obtain the public IP using a trusted endpoint without exposing credentials, explain the provider dashboard allowlist action at [API users](https://my.eurodns.com/apiusers), and wait for user confirmation before one retry. Do not modify allowlists automatically. Distinguish invalid input, authentication, forbidden access, and missing domain/ID using the current provider error contract.
