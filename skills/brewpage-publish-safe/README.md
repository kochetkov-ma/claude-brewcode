# BrewPage Publish Safe

This standalone Skillstore edition publishes to the BrewPage REST API. It saves anonymous owner tokens and private management links automatically, then uses the saved owner for a later update in the same workspace. Command output contains the reader link and storage status.

The regular BrewDoc, standalone and OpenClaw skills can deliver owner keys and management links in a verified private receipt. The regular MCP also supports private receipts and connected account authority. Use those editions for those workflows. This edition has its own version, stored in [`VERSION`](VERSION).

## Publish and update

Use Bash, Python 3.8 or newer, Node.js, curl and jq on macOS or Linux. ZIP sites also need `zip` and `unzip`. Start from the workspace where you want to reuse the same anonymous owner. Replace `{runner}` with the installed `scripts/brewpage-run.sh` path, quoted if needed. Pass each selected value as one argument. When filling a single-quoted slot, escape each internal `'` as `'\''`.

```bash
bash {runner} publish html --ns '{namespace}' --password-file '' --text '{content}'
bash {runner} publish site-dir --ns '{namespace}' --password-file '' --path '{directory}'
bash {runner} update html --target '{exact_saved_reader_link}' --password-file '' --path '{replacement_markdown}'
```

Use `public` as the namespace only when public listing is requested. A link-only publication is viewable by anyone with its link unless it has a password. An empty password-file value selects no password for a new publish and preserves the current password on update. For a requested password, supply an approved password file path on publish. Keep password and owner records out of input files. Use `html-file`, `json`, `file`, or `site-zip` when the selected input is a standalone HTML file, JSON value, raw file, or built ZIP.

An archive review that needs approval returns `CONFIRM` and the digest of the reviewed ZIP. Re-run with `--confirmed --review-sha256 '{digest}'` only after approval. A missing target, a read-only target, or a rejected update leaves the existing item in place.

## Saved ownership and recovery

Safe stores owner records under `~/Library/Application Support/brewpage-publish-safe` on macOS or `$XDG_STATE_HOME/brewpage-publish-safe` on Linux. The Linux default is `~/.local/state/brewpage-publish-safe`. It selects a separate `0700` directory for each resolved workspace and uses `0600` owner records. The chosen storage location must be outside Git. An unsafe or unavailable store stops publishing before the request.

Use the same OS account and workspace to update the exact saved publication in a new session. When the runner reports `OWNER RECOVERY SAVED`, use its local recovery command from that workspace. `owner-pending` reports whether an uncertain create has a protected recovery receipt. With an uncertain result and no saved proof, leave the attempt pending and verify the outcome before any new create.

```bash
bash {runner} owner-recover
bash {runner} owner-pending
```
