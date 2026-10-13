# Language coverage — what `--content code docs config` actually indexes

> Authority: semble 0.6.2 wheel, `semble/index/files.py`, `semble/index/file_walker.py`, `semble/cache.py`
> (2026-10-12; suffix map and walker unchanged since 0.5.5, whose tag tests were checked 2026-08-27).
> Suffix tables generated from those constants: 281 code + 44 config + 17 docs = 342 indexed suffixes;
> the five data suffixes are excluded.

## The one rule that explains everything

Semble uses **only the suffix** (`Path(name).suffix.lower()`), not content/shebang/name:

| Consequence | Detail |
|-------------|--------|
| Extensionless files are never indexed | `Dockerfile`, `Makefile`, `LICENSE`, `Jenkinsfile`, `.gitignore`, `.env` — a name with no suffix (or only a leading dot) has no suffix at all, so it matches nothing |
| Only the LAST suffix counts | `settings.gradle.kts` -> `.kts` (code). `schema.sql.j2` -> `.j2` (code). `data.tar.gz` -> `.gz` (nothing) |
| The bucket is fixed per suffix | You cannot move `.html` into the code bucket. `--content` selects buckets, never suffixes |
| An unmapped suffix is unreachable | `.mdx` and `.txt` are absent from `_EXTENSION_TO_LANGUAGE`, so no content type — not even `all` — indexes them. `.mdx` is not an alias of `.md` |

One hole (it cost this workspace 7.5% of its index): the next section.

## The negation bypass — the one way an unreachable suffix gets in

`file_walker.py:_is_ignored` returns a pair, `(ignored, found)`. The second flag:

```python
found = not ignored and isinstance(pat, str) and bool(Path(pat.rstrip("/")).suffix)
```

and `_walk` yields on `found or item.suffix.lower() in extensions`. A `.gitignore` or
`.sembleignore` pattern that un-ignores a path (`!…`) and ends in a file extension sets
`found` to `True`, so the extension filter is skipped: the file is indexed whatever its suffix's bucket, if any.

Present in the 0.6.2 walker; output below is from a 0.5.4 reproduction:

```text
.gitignore:  package-lock.json / !sub/package-lock.json / *.png / !keep.png
walk_files(root, get_extensions([CODE])) ->
  ['a.py', 'keep.png', 'sub/package-lock.json']       # .png, .json: both in NO bucket
plain.json (never negated)                            # correctly absent
```

1. **The content set cannot fix it.** The bypass runs before the extension test, so
   `--content code` pulls in the same files as `--content code docs config`; dropping a bucket sheds no lockfile.
2. **It is how binaries enter the corpus.** `read_file_text` decodes with `errors="replace"`, so a
   negated `.png` is indexed as mojibake. Measured on `claude-brewcode`: `!web/docs/package-lock.json`
   -> 552 chunks, 5.9% of the whole index, the only `.json` in it; two negated `.png` -> 143 chunks.
3. **`.sembleignore` is the cure.** `_load_ignore_for_dir` concatenates the directory's `.gitignore`
   lines, then its `.sembleignore` lines, into one `GitIgnoreSpec`; `_is_ignored` keeps the last
   matching pattern, so a re-ignore in `.sembleignore` beats the `.gitignore` negation:

```text
+ .sembleignore:  *.png / package-lock.json
walk_files(...) -> ['a.py', 'w.yml']                  # both bypassers gone
```

Hence the binary-suffix and lockfile blocks of the shipped `sembleignore.template`: no-ops
against a plain `.gitignore`, the only lever against a negation.

## Buckets in this corpus

`semble_code` runs with `--content code docs config` — all three buckets, 342 suffixes
(`code config` = 325, `docs` adds the 17 of the HTML and Markdown rows).

| Requested by SPEC | Suffixes | Bucket | Indexed here? |
|-------------------|----------|--------|----------------|
| Python | `.py .pyi .pyw` | code | yes |
| JavaScript | `.js .mjs .cjs .jsx` | code | yes |
| TypeScript | `.ts .mts .cts .tsx` | code | yes |
| Shell | `.sh .bash .zsh .fish` | code | yes |
| Java / Kotlin | `.java .kt .kts` | code | yes |
| Gradle / Groovy | `.gradle .groovy` | code | yes |
| CSS | `.css .scss .less` | code | yes |
| Components | `.vue .svelte .astro` | code | yes |
| Other code | `.sql .tf .tfvars .conf .bat .cmd .ps1 .dockerfile .go .rs .rb .php .c .cpp .h .hpp .cs .swift .scala .lua .r .pl .ex .exs .erl .hs .dart .zig .nix .hcl .graphql .prisma` | code | yes |
| Markup / config | `.xml .xsl .xslt .yaml .yml .toml .ini .cfg .properties .proto` | config | yes |
| Repo metadata | `.gitignore .gitattributes .patch .diff .pem` (only as a *suffix*, e.g. `base.gitignore`) | config | yes |
| HTML | `.html .htm` | docs | yes |
| Markdown / docs | `.md .markdown .rst .adoc .asciidoc .tex .org .mmd .mermaid .po .rtf .bib .dj .norg .pot` | docs | yes |
| Data | `.json .json5 .csv .tsv .psv` | excluded from every bucket | NO — unreachable even with `--content all` |
| Unmapped | `.mdx .txt` (and every other suffix missing from `_EXTENSION_TO_LANGUAGE`) | none | NO — no bucket claims them |

Two easy misreadings (`_EXTENSION_TO_LANGUAGE` in `files.py`):

1. **`.gradle` / `.groovy` / `.kts` are code, not config** (-> `groovy`, `kotlin`): `code` alone makes
   Gradle searchable; `config` is in the corpus for YAML/TOML/XML/properties.
2. **`.conf` is code** (-> `nginx`), not config.

## What is NOT in this corpus

```text
This corpus is code+docs+config, so .md/.markdown, .rst, .adoc and .html/.htm ARE
indexed. Still unreachable at any content setting: .json/.json5/.csv/.tsv/.psv
(semble's data bucket belongs to no content type) and any suffix absent from
_EXTENSION_TO_LANGUAGE — notably .mdx and .txt. Use rg/Grep for those. Every
consumer must pass the same --content set so it selects the shared
index-code-config-docs variant.
```

`semble-project.sh audit` prints that paragraph verbatim; it belongs in every status report.
Per-repo directory = `sha256(resolved repo path)`, one child per exact sorted content selection:
code-only is `index`, every other selection `index-<sorted-content>`. The registered
`code docs config` corpus uses `index-code-config-docs`; `index-docs`, `index-config`,
`index-code-config` and other exact variants coexist without eviction. Metadata must still
match the requested content set inside the selected variant.

`SEMBLE_CONTENT_ARGS` in `lib/semble-common.sh` is the single source of the registered/default
selection: MCP registration, `warm`, `smoke` and `reindex` interpolate it (-> `index-code-config-docs`);
a per-call `content` override selects its own sibling variant.

`package.json`, `tsconfig.json`, `composer.json`, every `*.csv` fixture, every OpenAPI `*.json`
spec and every `*.mdx` page are invisible to semantic search — a semble limitation, not a
configuration mistake. Use `rg`.

Sizing on `claude-brewcode` (pre-0.5.5 cache, not rerun):

| Corpus | Files indexed | `.md` | `.mdx` | Cache size |
|--------|---------------|-------|--------|------------|
| `code config` | 278 | 0 | 0 | 8.4 MB |
| `code docs config` | 868 | 585 | 0 | 31 MB |

## Why `config` stays in the set

`config` looks like the bucket to cut: in the pre-0.5.5 workspace measurement (not rerun) it was
40 files, 53 of 9307 chunks, 0.57% of the corpus. It stays for its retrieval value:

| Question | Answer |
|----------|--------|
| What is in it here? | All six `.github/workflows/*.yml` (19 chunks) and four `docker-compose*.yml`. That is the entire CI/CD and deployment surface of the repo |
| What breaks without it? | Q12 "what does the docs deploy workflow do" and Q15 "how does the docs site get deployed" — both answered from `deploy-docs.yml` (`.yml` = `config`); without the bucket neither has a reachable answer |
| Was it buying the lockfile? | No: `package-lock.json` entered through the negation bypass above, which runs before the extension filter; `--content code` alone indexes it just the same |

Keep `code docs config` as the registered default (`index-code-config-docs`; sibling content
variants unaffected): at 0.57% the whole CI surface is the cheapest bucket in the set.

## Known corpus limits, and what they cost

Each limit silently fails one question shape:

| Limit | The question it kills |
|-------|-----------------------|
| `.json` unreachable | "every hook event registered across all four plugins" — registrations live in `hooks/hooks.json`. Semble returns prose *about* hooks and never the registry. Structurally unanswerable, at any content setting, after any cleanup |
| `.mdx`/`.txt` unmapped | Anything about an Astro/Docusaurus content page |
| top-k is a sample | "every place that…", "all N of…" — a ranked list of 5 is not an enumeration. `rg -l`/`-c` owns this |
| no dedup | A file committed at three paths gets three chances at the same five slots |

## Files that are skipped even when the suffix matches

| Rule | Threshold | Source |
|------|-----------|--------|
| Too large | `size > MAX_FILE_BYTES` (env `SEMBLE_MAX_FILE_BYTES`, default `1_000_000`) | `files.get_file_status` |
| Tiny **and** blank | `size < 128` bytes (`_EMPTY_FILE_BYTES`) **and** the text is empty after `.strip()` | `files.get_file_status` |
| Modified after the index was built | a file's `mtime_ns` differs from the manifest, or the walked file set changed -> the index is stale, not the file skipped | `cache.get_validated_cache` |

The second rule is an and: a 4-byte `x=1\n` file is indexed, a 60-byte whitespace-only file is
not. `semble-project.sh audit` reports both counters (`skipped.tooLarge`, `skipped.tinyBlank`).

## Directories that are never walked

```text
.git  .hg  .svn  __pycache__  node_modules  .venv  venv  .tox  .mypy_cache
.pytest_cache  .ruff_cache  .cache  .semble  .next  dist  build  .eggs
```

Symlinks are never followed (`file_walker._walk`). Semble also merges the `.gitignore` and
`.sembleignore` of every directory it walks, recursively (`file_walker._load_ignore_for_dir`),
not one root-level ignore file.

`semble-project.sh audit` applies the directory list and the symlink rule but does not parse
`.gitignore`/`.sembleignore`: its per-bucket counts are an upper bound on what semble indexes,
never present them as the exact chunk count of the index.

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
                 "indexable": 80, "classified": 92, "unclassified": 0},
    "skipped":  {"tooLarge": 1, "tinyBlank": 2, "symlinks": 4, "dirs": 3}
  }
}
```

Producer arithmetic: `59 + 6 + 15 = 80` indexable; `89` counted files
plus `1` too-large and `2` tiny-blank = `92` classified. Size-skipped files are classified before exclusion.

| Key | Meaning |
|-----|---------|
| `code`, `config` | in this corpus — searchable through `mcp__semble_code__search` |
| `docsOnly` | the docs bucket, in this corpus; name kept for wire compatibility — read it as "docs", not "unreachable" |
| `excluded` | a data suffix that no content type can reach |
| `totals.indexable` | `code + config + docsOnly`, the upper bound of what the index contains |
| `totals.unclassified` | a suffix semble does not know at all (e.g. `.log`, `.png`, `.mdx`, `.txt`) — also unreachable |
| `skipped.dirs` | how many never-walked directories were pruned |

`totals.indexable == 0`: report no searchable files; skip the empty warm query.
