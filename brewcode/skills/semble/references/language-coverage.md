# Language coverage — what `--content code config` actually indexes

> Source of truth: semble 0.5.2, `src/semble/index/files.py` and `src/semble/index/file_walker.py`.
> The tables below are generated from that source, not from the README.

## The one rule that explains everything

Semble classifies a file by its **file suffix only** — `Path(name).suffix.lower()`.
Not by content, not by shebang, not by name. Three consequences:

| Consequence | Detail |
|-------------|--------|
| Extensionless files are never indexed | `Dockerfile`, `Makefile`, `LICENSE`, `Jenkinsfile`, `.gitignore`, `.env` — a name with no suffix (or only a leading dot) has no suffix at all, so it matches nothing |
| Only the LAST suffix counts | `settings.gradle.kts` -> `.kts` (code). `schema.sql.j2` -> `.j2` (code). `data.tar.gz` -> `.gz` (nothing) |
| The bucket is fixed per suffix | You cannot move `.html` into the code corpus. `--content` selects buckets, never suffixes |

## Buckets in this corpus

`semble_code` runs with `--content code config` — two buckets, 325 suffixes.

| Requested by SPEC | Suffixes | Bucket | Indexed here? |
|-------------------|----------|--------|----------------|
| Python | `.py .pyi .pyw` | code | yes |
| JavaScript | `.js .mjs .cjs .jsx` | code | yes |
| TypeScript | `.ts .mts .cts .tsx` | code | yes |
| Shell | `.sh .bash .zsh .fish` | code | yes |
| Java / Kotlin | `.java .kt .kts` | code | yes |
| **Gradle / Groovy** | `.gradle .groovy` | **code** | yes |
| CSS | `.css .scss .less` | code | yes |
| Components | `.vue .svelte .astro` | code | yes |
| Other code | `.sql .tf .tfvars .conf .bat .cmd .ps1 .dockerfile .go .rs .rb .php .c .cpp .h .hpp .cs .swift .scala .lua .r .pl .ex .exs .erl .hs .dart .zig .nix .hcl .graphql .prisma` | code | yes |
| Markup / config | `.xml .xsl .xslt .yaml .yml .toml .ini .cfg .properties .proto` | config | yes |
| Repo metadata | `.gitignore .gitattributes .patch .diff .pem` (only as a *suffix*, e.g. `base.gitignore`) | config | yes |
| **HTML** | **`.html .htm`** | **docs** | **NO** |
| Markdown / docs | `.md .markdown .rst .adoc .asciidoc .tex .org .mmd .mermaid .po .rtf .bib .dj .norg .pot` | docs | NO |
| **Data** | **`.json .json5 .csv .tsv .psv`** | **excluded from every bucket** | **NO — unreachable even with `--content all`** |

Two corrections worth stating out loud, because both were wrong in the original SPEC:

1. **`.gradle` / `.groovy` / `.kts` are code, not config** (`files.py:66,140,143` -> `groovy`, `kotlin`).
   Adding the `config` bucket is *not* what makes Gradle searchable — `code` alone already covers it.
   The `config` bucket is in the corpus for YAML/TOML/XML/properties.
2. **`.conf` is code** (`files.py:186`, mapped to `nginx`), not config.

## What is NOT in this corpus

```text
Not indexed by this corpus: .html/.htm (semble classifies HTML as docs) and
.json/.json5/.csv/.tsv/.psv (excluded from every semble content type).
Use rg/Grep for those. Adding docs to this corpus is NOT a fix — it would
invalidate the code index on every call (shared repo-hash directory).
```

That paragraph is printed verbatim by `semble-project.sh audit` and belongs in every
status report. The reason the last sentence is not negotiable: the per-repo cache
directory is `sha256(resolved repo path)` and the **content type is not part of the hash**
(`cache.py:27-36`). A `docs` index and a `code config` index for the same repo land in the
same directory, and `_metadata_matches` compares `set(content_type)` — so each server would
invalidate and rebuild the other's index on every single call. Docs get their own cache
root (`semble-docs`), reserved but never registered in this skill.

`package.json`, `tsconfig.json`, `composer.json`, every `*.csv` fixture and every OpenAPI
`*.json` spec are therefore invisible to semantic search. That is a semble limitation, not
a configuration mistake. Use `rg`.

## Files that are skipped even when the suffix matches

| Rule | Threshold | Source |
|------|-----------|--------|
| Too large | `size > 1_000_000` bytes | `files.py:8,498` |
| Tiny **and** blank | `size < 128` bytes **and** the text is empty after `.strip()` | `files.py:9,501` |
| Modified after the index was built | `mtime > metadata.time` -> the index is stale, not the file skipped | `files.py:493-495` |

Note the second rule is an **and**, not an or: a 4-byte `x=1\n` file *is* indexed; a 60-byte
file of only whitespace is not. `semble-project.sh audit` reports both counters separately
(`skipped.tooLarge`, `skipped.tinyBlank`).

## Directories that are never walked

```text
.git  .hg  .svn  __pycache__  node_modules  .venv  venv  .tox  .mypy_cache
.pytest_cache  .ruff_cache  .cache  .semble  .next  dist  build  .eggs
```

Symlinks are never followed (`file_walker.py:118`). On top of that list, semble merges the
`.gitignore` **and** `.sembleignore` of *every* directory it walks, recursively
(`file_walker.py:37-49`) — a single root-level ignore file is not the model.

`semble-project.sh audit` applies the hard-coded directory list and the symlink rule, but it
does **not** parse `.gitignore`/`.sembleignore`. Its per-bucket counts are therefore an
**upper bound** on what semble will index. Report them as such; never present them as the
exact chunk count of the index.

## Reading the audit output

```bash
scripts/semble-project.sh audit --json
```

```json
{
  "coverage": {
    "code":     {".py": 42, ".ts": 17},
    "config":   {".yaml": 6},
    "docsOnly": {".md": 12, ".html": 3},
    "excluded": {".json": 9},
    "totals":   {"code": 59, "config": 6, "docsOnly": 15, "excluded": 9,
                 "indexable": 65, "classified": 89, "unclassified": 0},
    "skipped":  {"tooLarge": 1, "tinyBlank": 2, "symlinks": 4, "dirs": 3}
  }
}
```

| Key | Meaning |
|-----|---------|
| `code`, `config` | in this corpus — searchable through `mcp__semble_code__search` |
| `docsOnly` | recognised by semble but in the docs bucket — **not** in this corpus |
| `excluded` | a data suffix that no content type can reach |
| `totals.indexable` | `code + config`, the upper bound of what the index contains |
| `totals.unclassified` | a suffix semble does not know at all (e.g. `.log`, `.png`) |
| `skipped.dirs` | how many never-walked directories were pruned |

A repo whose `totals.indexable` is 0 has nothing to search: report that instead of running a
warm query that can only come back empty.
