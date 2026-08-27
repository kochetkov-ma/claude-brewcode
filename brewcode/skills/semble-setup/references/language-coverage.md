# Language coverage — what `--content code docs config` actually indexes

> Current authority, verified 2026-08-27: semble 0.5.5 tag sources
> `src/semble/index/files.py`, `src/semble/index/file_walker.py`, and
> `src/semble/cache.py`, plus `tests/test_files.py`, `tests/test_file_walker.py`,
> and `tests/test_cache.py`. The installed 0.5.5 wheel copies match the tagged
> runtime files byte-for-byte. The suffix tables below were regenerated from
> those constants: 281 code + 44 config + 17 docs = 342 indexed suffixes; the
> five data suffixes remain excluded.

## The one rule that explains everything

Semble classifies a file by its **file suffix only** — `Path(name).suffix.lower()`.
Not by content, not by shebang, not by name. Three consequences:

| Consequence | Detail |
|-------------|--------|
| Extensionless files are never indexed | `Dockerfile`, `Makefile`, `LICENSE`, `Jenkinsfile`, `.gitignore`, `.env` — a name with no suffix (or only a leading dot) has no suffix at all, so it matches nothing |
| Only the LAST suffix counts | `settings.gradle.kts` -> `.kts` (code). `schema.sql.j2` -> `.j2` (code). `data.tar.gz` -> `.gz` (nothing) |
| The bucket is fixed per suffix | You cannot move `.html` into the code bucket. `--content` selects buckets, never suffixes |
| An unmapped suffix is unreachable | `.mdx` and `.txt` are absent from `_EXTENSION_TO_LANGUAGE` altogether, so no content type — not even `all` — indexes them. `.mdx` is **not** an alias of `.md` |

…with exactly one hole, which is big enough to have cost this workspace 7.5% of
its index. See the next section before trusting "unreachable".

## The negation bypass — the one way an unreachable suffix gets in

`file_walker.py:_is_ignored` returns a pair, `(ignored, found)`. The second flag:

```python
found = not ignored and isinstance(pat, str) and bool(Path(pat.rstrip("/")).suffix)
```

and `_walk` yields on `found or item.suffix.lower() in extensions`. So when a
`.gitignore` or `.sembleignore` pattern **un-ignores** a path (`!…`) and the
pattern text ends in a file extension, `found` is `True` and **the extension
filter is skipped entirely**. The file is indexed no matter which bucket — if
any — its suffix belongs to.

Confirmed by the current 0.5.5 walker implementation and its explicit-negation
test. The concrete output below is retained from the original 0.5.4 reproduction;
it was not rerun for this documentation refresh:

```text
.gitignore:  package-lock.json / !sub/package-lock.json / *.png / !keep.png
walk_files(root, get_extensions([CODE])) ->
  ['a.py', 'keep.png', 'sub/package-lock.json']       # .png, .json: both in NO bucket
plain.json (never negated)                            # correctly absent
```

Three consequences worth stating plainly:

1. **The content set cannot fix it.** The bypass runs before the extension test,
   so `--content code` pulls the same files in as `--content code docs config`.
   Dropping a bucket to shed a lockfile does nothing.
2. **It is how binaries enter the corpus.** `read_file_text` decodes with
   `errors="replace"`, so a negated `.png` is indexed as mojibake. Measured on
   `claude-brewcode`: `!web/docs/package-lock.json` -> **552 chunks, 5.9% of the
   whole index, the only `.json` in it**; two negated `.png` -> **143 chunks**.
3. **`.sembleignore` is the cure.** `_load_ignore_for_dir` concatenates the
   directory's `.gitignore` lines first and its `.sembleignore` lines second into
   one `GitIgnoreSpec`, and `_is_ignored` keeps the **last** matching pattern.
   A re-ignore in `.sembleignore` therefore beats the `.gitignore` negation:

```text
+ .sembleignore:  *.png / package-lock.json
walk_files(...) -> ['a.py', 'w.yml']                  # both bypassers gone
```

That is why the shipped `sembleignore.template` carries a binary-suffix block and
a lockfile block that look like no-ops. Against a plain `.gitignore` they are;
against a negation they are the only lever.

## Buckets in this corpus

`semble_code` runs with `--content code docs config` — all three buckets, **342 suffixes**
(`code config` was 325; adding `docs` contributes 17: `.adoc .asciidoc .bib .dj .htm .html
.markdown .md .mermaid .mmd .norg .org .po .pot .rst .rtf .tex`).

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
| **HTML** | **`.html .htm`** | **docs** | **yes** |
| **Markdown / docs** | **`.md .markdown .rst .adoc .asciidoc .tex .org .mmd .mermaid .po .rtf .bib .dj .norg .pot`** | **docs** | **yes** |
| **Data** | **`.json .json5 .csv .tsv .psv`** | **excluded from every bucket** | **NO — unreachable even with `--content all`** |
| **Unmapped** | **`.mdx .txt`** (and every other suffix missing from `_EXTENSION_TO_LANGUAGE`) | **none** | **NO — no bucket claims them** |

Two corrections worth stating out loud, because both were wrong in the original SPEC:

1. **`.gradle` / `.groovy` / `.kts` are code, not config** (`files.py:66,140,143` -> `groovy`, `kotlin`).
   Adding the `config` bucket is *not* what makes Gradle searchable — `code` alone already covers it.
   The `config` bucket is in the corpus for YAML/TOML/XML/properties.
2. **`.conf` is code** (`files.py:186`, mapped to `nginx`), not config.

## What is NOT in this corpus

```text
This corpus is code+docs+config, so .md/.markdown, .rst, .adoc and .html/.htm ARE
indexed. Still unreachable at any content setting: .json/.json5/.csv/.tsv/.psv
(semble's data bucket belongs to no content type) and any suffix absent from
_EXTENSION_TO_LANGUAGE — notably .mdx and .txt. Use rg/Grep for those. Every
consumer must pass the same --content set so it selects the shared
index-code-config-docs variant.
```

That paragraph is printed verbatim by `semble-project.sh audit` and belongs in every
status report. In 0.5.5, the per-repo directory remains
`sha256(resolved repo path)`, but each exact sorted content selection has its own child:
code-only is `index`; every other selection is `index-<sorted-content>`. The registered
`code docs config` corpus therefore uses `index-code-config-docs`, while `index-docs`,
`index-config`, `index-code-config`, and other exact variants may coexist without eviction.
Metadata still has to match the requested content set inside the selected variant.

`SEMBLE_CONTENT_ARGS` in `lib/semble-common.sh` remains the single source for the
registered/default selection. MCP registration, `warm`, `smoke`, and `reindex` interpolate
it so they select `index-code-config-docs`; an explicit per-call `content` override selects
its own sibling variant.

Historical pre-0.5.5 cache measurement, retained as migration evidence and not rerun:
alternating `code config` with a bare `semble search` rebuilt every time —
1.99s / 1.78s / 1.91s / 1.95s; with both pinned to `code docs config` it was 5.43s cold,
then 0.74s / 0.81s / 0.74s. That eviction behavior describes 0.5.4's single index leaf,
not the current 0.5.5 layout.

`package.json`, `tsconfig.json`, `composer.json`, every `*.csv` fixture, every OpenAPI
`*.json` spec and every `*.mdx` page are therefore invisible to semantic search. That is a
semble limitation, not a configuration mistake. Use `rg`.

Historical sizing measured on `claude-brewcode` with an isolated pre-0.5.5 cache;
the figures were not rerun for 0.5.5, while the suffix membership was reverified:

| Corpus | Files indexed | `.md` | `.mdx` | Cache size |
|--------|---------------|-------|--------|------------|
| `code config` | 278 | 0 | 0 | 8.4 MB |
| `code docs config` | 868 | 585 | 0 | 31 MB |

## Why `config` stays in the set

`config` looks like the bucket to cut. In the retained pre-0.5.5 workspace
measurement it was 40 files and **53 of 9307 chunks, 0.57%** of the corpus; those
counts were not rerun for 0.5.5. It stays for the measured retrieval value:

| Question | Answer |
|----------|--------|
| What is in it here? | All six `.github/workflows/*.yml` (19 chunks) and four `docker-compose*.yml`. That is the entire CI/CD and deployment surface of the repo |
| What breaks without it? | Q12 "what does the docs deploy workflow do" and Q15 "how does the docs site get deployed" — both answered from `deploy-docs.yml`, which is `.yml`, which is `config`. Drop the bucket and both questions have no reachable answer at all |
| Was it buying the lockfile? | **No.** That was the premise for cutting it and it is wrong: `package-lock.json` entered through the `.gitignore` negation bypass above, which runs *before* the extension filter. `--content code` alone indexes it just the same |

At the measured 0.57%, the whole CI surface was the cheapest bucket in the set.
The decision remains: **keep `code docs config` as the registered default.** In
0.5.5 that choice addresses `index-code-config-docs` and does not invalidate sibling
content variants.

## Known corpus limits, and what they cost

These are not cosmetic. Each one has a question shape it silently fails:

| Limit | The question it kills |
|-------|-----------------------|
| `.json` unreachable | "every hook event registered across all four plugins" — registrations live in `hooks/hooks.json`. Semble returns prose *about* hooks and never the registry. Structurally unanswerable, at any content setting, after any cleanup |
| `.mdx`/`.txt` unmapped | Anything about an Astro/Docusaurus content page |
| top-k is a sample | "every place that…", "all N of…" — a ranked list of 5 is not an enumeration. `rg -l`/`-c` owns this |
| no dedup | A file committed at three paths gets three chances at the same five slots |

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
| `docsOnly` | the **docs** bucket. Also in this corpus since the set became `code docs config`; the key keeps its old name for wire compatibility, so read it as "docs", not "unreachable" |
| `excluded` | a data suffix that no content type can reach |
| `totals.indexable` | `code + config + docsOnly`, the upper bound of what the index contains |
| `totals.unclassified` | a suffix semble does not know at all (e.g. `.log`, `.png`, `.mdx`, `.txt`) — also unreachable |
| `skipped.dirs` | how many never-walked directories were pruned |

A repo whose `totals.indexable` is 0 has nothing to search: report that instead of running a
warm query that can only come back empty.
