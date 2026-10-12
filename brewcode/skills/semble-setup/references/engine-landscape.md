# Engine landscape: semantic / structural code search

Purpose: verified facts on the code-search engines we evaluated, so a future decision (add or switch an engine) needs no repeat research.

**Data verified: 2026-08-08** (GitHub REST API + source reading + PyPI/npm registry).

> Stars, release numbers and cadence decay fast. Before any switch decision re-check: `curl -s https://api.github.com/repos/<owner>/<repo> | jq -r .stargazers_count` and `.../releases?per_page=30`. The numbers below are a 2026-08-08 snapshot, not constants.

## Context: stars (GitHub API, 2026-08-08)

| Repo | Stars |
|------|------:|
| Graphify-Labs/graphify | 104,234 |
| mem0ai/mem0 | 62,810 |
| upstash/context7 | 60,417 |
| DeusData/codebase-memory-mcp | 38,149 |
| microsoft/graphrag | 35,327 |
| topoteretes/cognee | 29,862 |
| getzep/graphiti | 29,682 |
| oraios/serena | 27,739 |
| zilliztech/claude-context | 12,323 |
| MinishLab/semble | 5,845 |

> Stars != fitness. graphify leads on stars and has no embeddings at all; semble is last on stars and wins NDCG@10 in its own benchmark.

---

## 1. semble (our current engine)

### Sources

| What | Where |
|-----|-----|
| Repo | https://github.com/MinishLab/semble |
| PyPI | https://pypi.org/pypi/semble/json |
| Benchmarks | `benchmarks/README.md`, `benchmarks/results/*.json` (19 result files + `.gitkeep`) |
| Cache logic | `_MIN_REVALIDATE_FACTOR = 3` in the semble source |
| Our hooks | `brewcode/skills/semble-setup/assets/semble-{session,stats,subagent}.mjs` |
| Our rule | `.claude/rules/semble-first.md` |

### Type

Embedding-based semantic code search. MCP server `semble_code`, pinned to exact `semble[mcp]==0.6.2`.

### What it does

| Tool | Arguments | Returns |
|------|-----------|--------|
| `search` | `query`, required `repo`, `top_k`, `max_snippet_lines`, optional `content=code\|docs\|config\|all` | `file_path`, `start_line`, `end_line`, `score`, `content` |
| `find_related` | `file_path`, `line`, required `repo`, optional `content=code\|docs\|config\|all` | same |

`repo` is an absolute project root or an explicit `http://`/`https://` git URL; it is never inferred. Omitting optional `content` uses the MCP server's configured corpus.

### How it works

| Aspect | Implementation |
|--------|-----------|
| Model | static / distilled embeddings (model2vec class), CPU-only |
| Index | chunks of the selected buckets, cosine similarity |
| When built | lazily, INSIDE the tool call. No daemon, no watcher, no background thread |
| Revalidation | pull-based, `_MIN_REVALIDATE_FACTOR = 3`: a rebuild is considered only after 3x the previous build time |
| Cache | Upstream defaults to macOS `$HOME/Library/Caches/semble` or Linux `${XDG_CACHE_HOME:-$HOME/.cache}/semble`. This skill sets one shared `SEMBLE_CACHE_LOCATION`: macOS `$HOME/Library/Caches/semble-code`, Linux `${XDG_CACHE_HOME:-$HOME/.cache}/semble-code` |
| Corpus | `--content code docs config`: three buckets, 342 suffixes. `docs` is required: `markdown` is in `_DOC_LANGUAGES` (`index/files.py`), so a `code config` corpus indexed ZERO `.md` |
| Not indexed | `.json`, `.json5`, `.csv`, `.tsv`, `.psv` (the data bucket belongs to no content type); `.mdx`, `.txt` and any suffix absent from `_EXTENSION_TO_LANGUAGE`. `.html`/`.htm` are indexed with docs |
| Exact content variants | Since 0.5.5, one hashed repository directory holds independent exact-selection leaves: code-only is `index`; every other sorted selection is `index-<scope>`. The registered `code docs config` corpus is `index-code-config-docs`; sibling variants coexist without cross-content eviction |
| Telemetry | writes `savings.jsonl` (flock, drop-on-contention); counts ONLY its own calls, no grep-vs-semantic comparison |

### Pros

| # | Pro |
|---|------|
| 1 | Best quality/speed in its own open benchmark: NDCG@10 0.854, index 518 ms, query p50 0.91 ms |
| 2 | Real natural-language semantics: the query is a sentence, not a keyword list |
| 3 | Fully offline and CPU-only, no external API keys, no vector DB |
| 4 | No daemon -> no background process to clean up. Exact content leaves (0.5.5+) remove cross-content eviction; parallel calls, cleanup and reindex can still contend for the cache |
| 5 | Open reproducible harness with raw JSON results in the repo |

### Cons

| # | Con |
|---|-------|
| 1 | No watcher: the index refreshes lazily, and `_MIN_REVALIDATE_FACTOR = 3` can keep a stale index on a large repo |
| 2 | The first call after changes pays the rebuild inside the tool (latency visible to the agent) |
| 3 | `.json`/`.csv` and suffixes with no content bucket such as `.mdx`/`.txt` stay outside the corpus; `.html`/`.htm` are indexed in `docs` |
| 4 | No structural graph: no call path, no referencing symbols, no inheritance |
| 5 | `savings.jsonl` has no comparative metric: our own data cannot prove a win over grep |
| 6 | Young project (first release 2026-04-26), lowest star count in the list |

### Stars / releases / cadence

| Metric | Value |
|---------|----------|
| Stars | 5,845 (2026-08-08); 6,197 (2026-10-12) |
| GitHub releases | 26 on 2026-08-27 (`v0.1.0` 2026-04-26 ... `v0.5.5` 2026-08-12), ~4.2 days per release (108 days / 26 releases); 30 on 2026-10-12, last `v0.6.2` 2026-10-05 |
| PyPI latest | `0.6.2`, upload 2026-10-05T09:26:55.900894Z |
| Our pin | exact `semble[mcp]==0.6.2` — no drift |

### Semble 0.6.2 (verified 2026-10-12)

- [PyPI 0.6.2](https://pypi.org/project/semble/0.6.2/): wheel SHA-256 `94110c12da424a676cdec5a32adb1faee00ffcd3f494ea9fb88b4cd7efabac9a`, `Requires-Python >=3.10`. Releases since 0.5.5: `0.5.6`, `0.6.0`, `0.6.1`, `0.6.2`.
- Drop-in for 0.5.5, checked on the unpacked wheels and live runs: same `index-code-config-docs` leaf, `cache_version` 1 and `chunk_size` 750 (a 0.5.5-built index is reused), same CLI argv, same MCP tool and parameter names. `repo` now also accepts a list; `SEMBLE_MCP_IDLE_TIMEOUT` and `SEMBLE_MAX_FILE_BYTES` are new optional knobs. Staleness moved from "any file newer than `metadata.time`" to a per-file `mtime_ns` comparison.
- The MCP `content` filter and the exact content leaves date from 0.5.5 ([release](https://github.com/MinishLab/semble/releases/tag/v0.5.5)): `cache.py` derives the leaf from the sorted content set; a bare pre-0.5.5 combined `index` is legacy, a code-only `index` is current.

### Benchmarks

Published in `benchmarks/README.md`, with raw results.

Main results (NDCG@10 / cold index / warm query p50):

| Method | NDCG@10 | Index | Query p50 |
|--------|--------:|------:|----------:|
| **semble** | **0.854** | **518 ms** | **0.91 ms** |
| CodeRankEmbed | 0.839 | 116 s | 16 ms |
| ColGREP | 0.693 | 5.4 s | 122 ms |
| BM25 | 0.673 | 47 ms | 0.17 ms |
| ck | 0.642 | 96 s | 187 ms |
| codebase-memory-mcp | 0.630 | 454 ms | 46 ms |
| grepai | 0.561 | 35 s | 48 ms |
| probe | 0.387 | - | 207 ms |
| cs | 0.200 | - | 22 ms |
| ripgrep | 0.126 | - | 14 ms |

Token efficiency (1251 queries, `cl100k_base`):

| Method | Expected tokens per query | Savings |
|--------|--------------------------:|--------:|
| ripgrep + read file | 45,587 | baseline |
| **semble** | **348** | **99% fewer** |

Recall at a fixed token budget:

| Method | 500 | 1k | 2k | 4k | 8k | 16k | 32k |
|--------|----:|---:|---:|---:|---:|---:|----:|
| **semble** | **0.842** | **0.923** | **0.967** | **0.988** | **0.995** | **0.995** | **0.995** |
| ripgrep + read file | 0.001 | 0.008 | 0.037 | 0.086 | 0.207 | 0.374 | 0.583 |

> Caveat: semble's own benchmark on its own harness and dataset. Competitor numbers come from ITS harness, not an independent third party.

### Claude Code hooks

**Upstream ships no hooks.** `semble install` (0.6.2 `installer/agents.py`) writes a floating `semble` MCP entry into `~/.claude.json`, instructions into `~/.claude/CLAUDE.md` and the subagent `~/.claude/agents/semble-search.md`. Everything below is ours; session and subagent skip (`no-mcp`) when the active profile has no `semble_code` registration.

| Artifact | Event / matcher | Behaviour |
|----------|-------------------|-----------|
| `assets/semble-session.mjs` | `SessionStart`, no matcher | reads `<root>/.claude/semble/state.json`; at `awaiting_reload`/`ready` sends `systemMessage` + `additionalContext`, or only a `not registered for this profile` notice when the active profile lacks `semble_code`. Never blocks |
| `assets/semble-stats.mjs` | `PostToolUse` + `PostToolUseFailure`, one pipe matcher | pure observer: JSONL into `<cwd>/.claude/semble/telemetry.jsonl`, always `{}` |
| `assets/semble-subagent.mjs` | `SubagentStart`, NO matcher (= every `agent_type`) | advisory `additionalContext` into the spawned subagent's context, skipped (`agent-no-tool`) when its `tools:` omits semble; writes `agent_type`/`agent_id` to telemetry |
| `semble-explore.mjs` (retired for good) | - | was bound to the single `agent_type === 'Explore'`; replaced by `semble-subagent.mjs`. `install`/`upgrade` delete the file and REPLACE its entry |
| `semble-reminder.mjs`, `semble-prefetch.mjs` (retired 6.5.0) | was `PreToolUse` `Bash\|Grep` / `UserPromptSubmit` | same-profile A/B, 36 sessions per run: pooled semble share 42% with the 6.4.0 hooks and 42% with the repaired 6.5.0 ones, `none` arm 38% / 54% (1 rep per cell, direction only); reminder fired 0 times, prefetch candidates never held the answering file. `install`/`upgrade`/uninstall delete files, markers and every settings row |
| `.claude/rules/semble-first.md` | - | "semantic-first" rule |
| marker block in `CLAUDE.md` | - | session instruction |
| `semble-agents.sh` | - | patches agent frontmatter, adding the 2 MCP tools to `tools:` |
| permissions | - | allow-only |

`state.json` holds no aggregate call counters; the hooks write best-effort usage events to `.claude/semble/telemetry.jsonl` (`semble-stats.mjs`; `nudge` records from `semble-session.mjs`, `gate`/`nudge` from `semble-subagent.mjs`). Write errors are swallowed: no complete accounting and no comparative metric against grep. Upstream `savings.jsonl` is a separate source. State keys: `schema` (constant 1), `phase`, `enabled`, `scope`, `cacheRoot`, `repoHash`, `completed[]`, `notes[]`, `version`, `generated_by`, `last_updated` (date of the last write, `YYYY-MM-DD`, `sc_state_patch` in `scripts/lib/semble-common.sh`), and `agentsPreExisting` (agent tool ownership record of `semble-agents.sh`).

---

## 2. codebase-memory-mcp (cbm)

### Sources

| What | Where |
|-----|-----|
| Repo | https://github.com/DeusData/codebase-memory-mcp (default branch `main`) |
| Pretrained blob + vocabulary | `vendored/nomic/{code_vectors.bin, code_vectors.h, code_vectors_blob.S, code_tokens.h, code_tokens.txt}` — repo top level, NOT under `internal/cbm/` |
| Only consumer of the blob | `src/semantic/semantic.c` (+ `.h`) |
| Indexing pass that calls it | `src/pipeline/pass_semantic_edges.c` |
| Query-side vector search | `src/store/store.c` (310 KB) |
| MCP tool schema | `src/mcp/mcp.c:395-398` (modes), `:434-439` (`query`), `:444-447` (`semantic_query`) |
| Vectors in the DB | `internal/cbm/sqlite_writer.c:2248-2254` (`node_vectors`, `token_vectors`) — path re-checked by curl 2026-08-08, 200 OK, lines match |
| Vector pass skipped | `src/pipeline/pipeline.c:951` |
| Dead flag | `src/semantic/semantic.c:134` (`CBM_SEMANTIC_ENABLED`) |
| Stale comments | `src/pipeline/pipeline_internal.h:624` |
| Query path | `src/mcp/mcp.c:3105` (`run_semantic_query_core`) |
| Key weakness | `src/store/store.c:8250` (`vs_build_keyword_vectors`), `:8181` (`vs_load_enriched_vector`), `:8207` (`vs_fill_sparse_random`) |
| Weights | `vendored/nomic/code_vectors.bin` (31 MB) |
| Benchmark | `docs/BENCHMARK.md` |
| Integrations | `README.md:447` |

> The store lives in `src/store/store.c`; `internal/cbm/` holds only the extractor/LSP/grammar layer plus `sqlite_writer.c`. Any `internal/cbm/store.c` reference is stale.

### Type

A single static C binary, MCP server. Graph + FTS5 + REAL embeddings.

### What it does

Builds a code graph (nodes/edges/labels/rel types) + an FTS5 index + a vector index. Tools: `index_repository`, `search_graph`, `search_code`, `get_code_snippet`, `trace_path` (alias `trace_call_path`), `query_graph` (Cypher), `get_graph_schema`, `check_index_coverage`. 15 MCP tools in total (`TOOL_ANNOTATIONS`, `src/mcp/mcp.c:708-724`); `list_directory` is NOT one of them — it appears only in `docs/BENCHMARK.md` (harness question Q12) and `src/cli/agent_profiles.c`.

### How it works

| Aspect | Implementation (read in source, not marketing) |
|--------|--------------------------------------------------|
| Embeddings | ON BY DEFAULT and fully offline |
| Weights | `vendored/nomic/code_vectors.bin`, 31,377,416 B = 8-byte header + 40856*768: nomic-embed-code distilled to 40,856 tokens x 768 dims, int8 unit-vector quantization, compiled in via `.incbin` |
| Storage | SQLite tables `node_vectors` / `token_vectors` (`internal/cbm/sqlite_writer.c:2248-2254`), SQL function `cbm_cosine_i8` |
| Modes | `index_repository`: `"enum":["full","moderate","fast",...],"default":"full"` (`src/mcp/mcp.c:395-398`) |
| When there are no vectors | the vector pass is skipped ONLY in `fast` mode (`src/pipeline/pipeline.c:951`) |
| `CBM_SEMANTIC_ENABLED` | a DEAD function (`src/semantic/semantic.c:134`), zero callers. The "opt-in" comments in `src/pipeline/pipeline_internal.h:624` are STALE |
| Query path | `search_graph(semantic_query=[...])` -> `run_semantic_query_core` (`mcp.c:3105`) -> `cbm_store_vector_search` |
| Watcher | yes, plus a shared per-account daemon for all clients (`README.md:107`) |

> Any claim that "cbm semantics are opt-in" is wrong: they are on by default in every mode except `fast`.

### Blob and symbols (confirmed by curl 2026-08-08)

| What | Source |
|-----|----------|
| Blob embedding | `vendored/nomic/code_vectors_blob.S:10` `.incbin "vendored/nomic/code_vectors.bin"`; identical at `:24` (COFF) and `:49` (ELF) |
| Public symbols | `vendored/nomic/code_vectors.h:23-33`: `PRETRAINED_TOKEN_COUNT 40856`, `PRETRAINED_DIM 768`, `PRETRAINED_VECTOR_BLOB[]`, `pretrained_vec_at(int i)` |
| The vocabulary SHIPS | `vendored/nomic/code_tokens.h:5` `static const char *PRETRAINED_TOKENS[40856]`; `code_tokens.txt` — exactly 40,856 lines |
| Blob size | 31,377,416 B = 8 + 40856*768 |

### KEY WEAKNESS (re-checked in source 2026-08-08)

`store.c` never touches `PRETRAINED_*`, but the pretrained table still reaches queries indirectly. Mechanics:

| Fact | Source |
|------|----------|
| `query=` is FTS5/BM25 with camelCase splitting, self-described as "recommended for natural-language discovery"; lexical, not an embedding | `src/mcp/mcp.c:416`, schema `:434-439` |
| Free text is embedded on NO path | grep over `mcp.c`: 0 matches of `PRETRAINED_*` / `cbm_sem_*` |
| `semantic_query=` takes an ARRAY of keywords; a string is rejected at the schema level | `mcp.c:444-447`: `"MUST be an ARRAY of keyword strings (e.g. [\"send\",\"pubsub\",\"publish\"]) - NOT a single string.` |
| And at runtime | `mcp.c:3120-3122` `if (sq_val && !yyjson_is_arr(sq_val)) { type_error = true;` -> error text `mcp.c:3692` «semantic_query must be an array of keyword strings ... not a single string.» |
| NO tokenizer on the query path: array items are copied verbatim, a multi-word item is hashed whole via `XXH3_64bits(token, strlen(token))` | `extract_semantic_keywords`, `mcp.c:3060-3075` |
| `PRETRAINED_*` appears ONLY on the INDEXING path | `src/semantic/semantic.c:17,419,421-422,449-451,806,817,1097-1104` |
| Real use sites | `cbm_sem_random_index()` `semantic.c:437-457` — pretrained first, hash only as fallback; `build_src_entry()` `semantic.c:1104` -> `out->dense_int8 = pretrained_vec_at((int)idx)` |
| Callers | only `src/pipeline/pass_semantic_edges.c:511,527,534,550` and `:1373` (`cbm_sem_ensure_ready()`), plus `tests/test_semantic.c` |
| `src/store/store.c` and `src/mcp/mcp.c` contain NO `PRETRAINED_*` / `cbm_sem_*`; the include list `store.c:11-88` has no `semantic/semantic.h` | grep = 0 in both files |
| Query-side fallback | `store.c:8259-8261`: `if (!vs_load_enriched_vector(s, project, keywords[k], kw_f)) { vs_fill_sparse_random(keywords[k], kw_f); }` |
| `vs_load_enriched_vector` | `store.c:8181` — `SELECT vector, idf FROM token_vectors WHERE project = ?1 AND token = ?2 LIMIT 1` |
| `vs_fill_sparse_random` | `store.c:8207` — 8 XXH3 positions, `VS_RI_SEED = 0x52494E44` (`store.c:8173`) |
| Query vector assembly | `vs_build_keyword_vectors` `store.c:8250`, single call from `cbm_store_vector_search` `store.c:8337` |

`phase3c_export_token_vectors()` (`pass_semantic_edges.c:1101`, called at `:1292`) writes per-project `token_vectors` rows seeded FROM the pretrained table. So pretrained embeddings DO reach query results — indirectly, for every token present in the indexed project. Exactly one thing is lost: a word OUTSIDE the project. It never reaches the pretrained table, even when it is among those 40,856 tokens, and falls into deterministic hash noise with no error signal.

Asking "how does authentication work" when the project's symbols are named `Guardian` still yields noise — because `authentication` is absent from the project corpus, not because the pretrained table is unused.

Open issue #1112 shows it live: the query `"match comprobante bancario con lote de pagos"` (Spanish-language domain) returns Makefile targets scoring 0.121-0.132.

### Only metadata is embedded, not function bodies

Source: OPEN issue #1462 "Feature: hybrid BM25+vector via RRF, and option to embed function bodies in semantic_query". The author states node vectors are built from name/signature/docstring, so `semantic_query` matches only HOW code is named, not what it DOES, and that metadata-only embedding is "the single most common cause of "semantic search returned nothing relevant"".

> A CLAIM in a user issue, not behaviour we read in the code. We did not confirm it in source.

### Pros

| # | Pro |
|---|------|
| 1 | Zero dependencies, one static binary, fully offline |
| 2 | 158 languages |
| 3 | Millisecond indexing |
| 4 | Explicit coverage / completeness contract |
| 5 | File watcher + a daemon shared between clients |
| 6 | Structural features semble lacks: call trace, inheritance, Cypher |
| 7 | Richest agent integration of all evaluated (see hooks below) |

### Cons

| # | Con |
|---|-------|
| 1 | `semantic_query` is not natural language but a keyword array; a sentence is rejected by the schema (`mcp.c:444-447`) and at runtime (`mcp.c:3120-3122`) |
| 2 | Out-of-corpus word -> deterministic noise instead of an error (`vs_fill_sparse_random`, `store.c:8207`) |
| 3 | The 40,856-token pretrained vocabulary is not reachable DIRECTLY on the query path (`store.c` does not include `semantic/semantic.h`); it arrives indirectly through `token_vectors` seeded at indexing. Only words outside the project are really lost |
| 4 | Metadata instead of function bodies — per open issue #1462, not our reading of the code |
| 5 | NDCG@10 0.630 vs semble's 0.854 in the semble benchmark. Note: semble runs cbm in `fast` mode (`benchmarks/README.md`, Methods) — exactly the one mode where the vector pass is off. The number measures cbm's BM25 path, not its semantics |
| 6 | Shared daemon = shared state between sessions; a version/cache-root conflict is rejected hard (`README.md:119`) |
| 7 | Stale comments in source (`pipeline_internal.h:624`) — a marker of code/doc drift |
| 8 | Last stable release `v0.9.0` from 2026-07-08; newer ones are pre-releases only |

### What could change (the main reason to keep cbm under watch)

| Change | Size | Already in the repo |
|-----------|-------|---------------------|
| Route words OUTSIDE the project through the pretrained table | ~10 lines + one link edge | the vocabulary ships (`code_tokens.h:5`, `code_tokens.txt` — 40,856 lines); `ensure_pretrained_map()` `semantic.c:399-431` already builds token -> row-index; `semantic.h:112` already exports `cbm_sem_random_index()`. Work = include `semantic/semantic.h` in `store.c` and replace the `vs_fill_sparse_random` fallback. Caveats: scale `CBM_SEM_INT8_MAX` vs `CBM_STORE_INT8_MAX`, an early `cbm_sem_ensure_ready()` before threads start. Dimensions already match (768) |
| Sentence support | a SEPARATE, larger task: ~50-150 lines plus a contract change | the vocabulary is whole lowercase words (`aa`, `aaa`, `aalborg`, `aantal`), not BPE/subword, so it needs a real tokenizer (lowercase, punctuation strip, camelCase/snake split) plus a pooling rule (naturally an IDF-weighted mean; IDF is already in `token_vectors`) plus relaxing the array-only schema. Nothing outside the repo is needed |

### Upstream: no stated plans

No `CHANGELOG.md` in the repo (contents API -> 404). The last five releases (`v0.9.1-rc.1`, `v0.9.0`, `v0.8.1`, `0.8.0`, `0.7.0`) mention semantic search only for language bindings and Cypher-engine fixes. Search `sentence OR "free text" OR "free-form" in:title` in the repo -> 0 hits.

Open issues on the topic:

| # | Title |
|---|-----------|
| 1462 | hybrid BM25+vector via RRF + option to embed function bodies |
| 1402 | `semantic_query` is English-only: non-Latin text scores negative against every node. The author independently reverse-engineered the same mechanics and names `vendored/nomic/` and `code_vectors_blob.S` |
| 1112 | pluggable / multilingual embedding model |
| 1238 | TurboVec/TurboQuant as an optional vector-index backend |
| 915, 1417, 1295, 938 | semantic-search quality and ranking bugs |

### Stars / releases / cadence

| Metric | Value |
|---------|----------|
| Stars | 38,149 |
| Repo created | 2026-02-24, last push 2026-08-08 |
| GitHub releases | 37 (`v0.0.2` 2026-02-25 ... `v0.9.1-rc.1` 2026-07-30) |
| Cadence | ~4.2 days per release (155 days / 37 releases) |
| Last stable | `v0.9.0`, 2026-07-08 |
| Last overall | `v0.9.1-rc.1`, 2026-07-30, `prerelease=true` |
| Anomaly | tags `0.6.0` / `0.6.1` / `0.7.0` / `0.8.0` published on one date, 2026-06-12 — retroactive release stamping; real ship dates are not confirmed by it |

### Benchmarks

`docs/BENCHMARK.md` exists, plus `docs/EVALUATION_PLAN.md`. The content is language coverage, **not** retrieval quality:

| Parameter | Value |
|----------|----------|
| Title | "Codebase Memory MCP -- v0.3.0 Language Benchmark" |
| Run date | 2026-03-01 (v0.3.0 — the benchmark is STALE relative to v0.9.x) |
| Scope | claims "63 languages (27 programming + 8 config/markup)", 12 questions per language (4 for config). The title contradicts the content: 27+8=35, and the summary table has exactly 35 rows. 35 languages were actually tested |
| Scoring | PASS 1.0 / PARTIAL 0.5 / FAIL 0.0, up to 5 attempts per question |
| Platform | Apple M3 Pro, macOS Darwin 25.3.0 |
| Tier 1 (>=90%) | 17 languages: Lua, Kotlin, C++, Perl, Objective-C, Groovy, C, Bash, Zig, Swift, CSS, YAML, TOML, HTML, SCSS, HCL, Dockerfile |
| Tier 2 (75-89%) | 16: Python, TypeScript, TSX, Go, Rust, Java, R, Dart, JavaScript, Erlang, Elixir, Scala, Ruby, PHP, C#, SQL |
| Tier 3 (<75%) | 2: OCaml 72%, Haskell 62% |

> `docs/BENCHMARK.md` has no semantic-search quality number. The only comparative retrieval figure is NDCG@10 0.630 from the semble benchmark, i.e. a competitor's harness.

### Claude Code hooks

The repo has **no** `.claude/`, `hooks/`, `skills/`, `.claude-plugin/` (contents API returns `Not Found` for all four; a `filename:SKILL.md` search finds 0). The artifacts are **generated by `cbm install`**, which auto-detects installed agents (`README.md:103`).

What it installs into Claude Code (`README.md:447`):

| Component | Details |
|-----------|--------|
| Config | `~/.claude.json` |
| Skill | one |
| Agents | three exact-tool graph agents |
| Hooks | `SessionStart`, `SubagentStart`, **non-blocking** `PreToolUse` for `Grep`/`Glob`, and post-`Read` coverage |

Similar integrations for Codex CLI, Zed, OpenCode, VS Code, Cursor, Kiro, Junie, Hermes, OpenHands, Cline, Warp, Qwen Code, GitHub Copilot CLI. `cbm uninstall` removes entries, skills, hooks, instructions and the binary (`README.md:184`).

> The hook shape matched our retired `semble-reminder.mjs`: `PreToolUse` on `Grep`/`Glob` is explicitly non-blocking, i.e. advisory. That is a design match, not evidence: our own same-profile A/B found no gain from the nudge (row in the semble hooks table above), so 6.5.0 dropped it.

---

## 3. Other codebase MCPs

### 3.1 oraios/serena

#### Sources

| What | Where |
|-----|-----|
| Repo | https://github.com/oraios/serena |
| CC context | `src/serena/resources/config/contexts/claude-code.yml` |
| Hooks | `src/serena/hooks.py` |
| Hook tests | `test/serena/test_hooks.py` |

#### Type

LSP-based symbol retrieval + editing. **NOT embeddings.**

#### What it does

`find_symbol`, `find_referencing_symbols`, `get_symbols_overview`, `replace_symbol_body`, `insert_*_symbol`, `replace_content` — both search and editor.

#### How it works

Starts a language server (LSP) on the project and queries its symbol structure; no vector index. `excluded_tools` in `claude-code.yml` disables all six of its own: `create_text_file`, `read_file`, `execute_shell_command`, `find_file`, `list_dir`, `search_for_pattern` — deliberately leaving those operations to the client.

#### Pros

| # | Pro |
|---|------|
| 1 | LSP precision: referencing symbols are real references, not similar strings |
| 2 | Edits by symbol, not by line |
| 3 | The most aggressive and most elaborate enforcement model of all (see hooks) |
| 4 | Maturity: releases since 2025-05-19 |

#### Cons

| # | Con |
|---|-------|
| 1 | Zero semantics: "where is authorization handled" is unsolvable without knowing the symbol name |
| 2 | Needs a working language server per project language |
| 3 | Hooks `deny`, but as a rate limit, not a ban: deny fires after a run of consecutive non-symbolic calls, the counter resets immediately ("You can continue using grep now if needed, the counter was reset"), the next call passes |
| 4 | Per-session usage counters are ephemeral: pickle files in `${SERENA_HOME}/hook_data/<session_id>`, deleted on SessionEnd -> no accumulated metric |
| 5 | Slow release cadence relative to the rest |

#### Stars / releases / cadence

| Metric | Value |
|---------|----------|
| Stars | 27,739 |
| GitHub releases | 15 (first `2025-05-19`, dated 2025-05-19) |
| Last | `v1.6.1`, 2026-07-21 |
| Previous | `v1.6.0`, 2026-07-16 |
| Cadence | ~28 days per release (~428 days / 15 releases) — slowest in the set |

#### Benchmarks

Not confirmed: no published retrieval metrics found for serena.

#### Claude Code hooks

Serena ships executable hooks with **blocking** decisions, not just text context.

`src/serena/hooks.py`, `HookClient` lists `claude-code`, `codebuddy`, `vscode`, `codex`, `grok`. Hooks are registered as CLI subcommands (`HookCommands`, `hooks.py:594+`):

| Class | Event | What it does |
|-------|---------|-----------|
| `SessionStartActivateProjectHook` (`hooks.py:523`) | `SessionStart` | activates the project |
| `SessionEndCleanupHook` (`hooks.py:540`) | SessionEnd | deletes the session's hook data |
| `PreToolUseRemindAboutSymbolicToolsHook` (`hooks.py:115`) | `PreToolUse` | reminds to use symbolic tools instead of `read_file`/`grep` |
| `PreToolUseAutoApproveSerenaHook` (`hooks.py:545`) | `PreToolUse` | auto-approves Serena tool calls |

The reminder hook has three **deny** builders: `_build_grep_deny` (`hooks.py:487`), `_build_code_read_deny` (`hooks.py:498`), `_build_non_symbolic_deny` (`hooks.py:509`); all three return `permission_decision="deny"`. So the hook really blocks `Grep` and `Read`, as a threshold: deny on exceeding the consecutive non-symbolic call counter, the counter resets at once, and the retry passes.

Text pressure in `contexts/claude-code.yml`:

| Rule (verbatim) | |
|---|---|
| `Read           -> FORBIDDEN for discovery.` | |
| `Glob (by name) -> Allowed for discovery only.` | |
| `Grep (content) -> Allowed for discovery only; follow up reads or reference searches must be Serena.` | |
| `Edit           -> FORBIDDEN.` | |

Plus a `Disallowed reasoning` block listing excuses models use to return to their own tools:

> `Disallowed reasoning. Do NOT use any of the following to justify Read/Edit on a code file:`
> `- "I already know the path"`
> `- "one Read call is faster than three Serena calls"`
> `- "the built-in tool description says to use Read for known paths"`
> `If you catch yourself reaching for one of these, that is the signal to switch to Serena.`

> A SEPARATE `cc_system_prompt_override` exists with DIFFERENT wording. Two different sources; never quote them as one.

### 3.2 zilliztech/claude-context

#### Sources

| What | Where |
|-----|-----|
| Repo | https://github.com/zilliztech/claude-context |
| npm | `@zilliz/claude-context-mcp` |

#### Type

Embeddings + Milvus / Zilliz vector DB.

#### How it works

Requires an EXTERNAL embedding provider (OpenAI etc.) and an external vector store, so every indexing request depends on the network and an API key.

#### Pros

| # | Pro |
|---|------|
| 1 | Real natural-language embeddings |
| 2 | Scales to very large corpora via Milvus |

#### Cons

| # | Con |
|---|-------|
| 1 | Network + API key mandatory: no offline mode |
| 2 | External vector store = separate infrastructure to maintain |
| 3 | Embedding is paid and grows with repository size |
| 4 | Own metrics exist but are weak: F1 does not improve (0.40 -> 0.40), the win is only tokens and call count; n=30 SWE-bench_Verified tasks, GPT-4o-mini, 3 runs |
| 5 | Dead GitHub release cadence (see below) |

#### Stars / releases / cadence

| Metric | Value |
|---------|----------|
| Stars | 12,323 |
| GitHub releases | **0** — the releases API returns an empty array |
| Last git tag | `v0.1.11`, commit date 2026-04-28 |
| Tag `v0.1.10` date | 2026-04-27 (lightweight tag `005c90d`; date from the commit, not a tag object) |
| npm latest | `@zilliz/claude-context-mcp` `0.1.15`, published 2026-06-22 |
| Cadence | not confirmable from GitHub releases (none). On npm: last publish 2026-06-22, ~47 days without a release as of 2026-08-08 |

#### Benchmarks

Published in `evaluation/README.md` (branch `master`). Agent efficiency, not NDCG: 30 SWE-bench_Verified instances (2 files per edit, 15-60 min), LangGraph ReAct, GPT-4o-mini, 3 runs per method.

| Metric | Baseline (grep only) | + claude-context MCP | Delta |
|---------|---------------------:|---------------------:|-------:|
| Average F1 | 0.40 | 0.40 | unchanged |
| Average tokens | 73,373 | 44,449 | -39.4% |
| Average tool calls | 8.3 | 5.3 | -36.3% |

Retrieval quality does not improve at all; only context savings are claimed. Not comparable with semble's NDCG@10: different dataset, metric and harness.

#### Claude Code hooks

None. The repo root has `CLAUDE.md` and `AGENTS.md` (instructions) but no `.claude/`, `hooks/`, `skills/` directories. Integration is MCP config only.

---

## 4. graphify

### Sources

| What | Where |
|-----|-----|
| Repo | https://github.com/Graphify-Labs/graphify (default branch **`v8`**, not `main`) |
| Query tokenization | `graphify/serve.py:253` (`_query_terms()`) |
| Scoring | `graphify/serve.py:439` (`_score_query()`) |
| MinHash | `graphify/_minhash.py`, used in `graphify/dedup.py:533` |
| Benchmarks | `BENCHMARKS.md` (root, branch `v8`) |
| CC skill | `graphify/skill.md` + `graphify/skills/claude/references/` |
| CC hooks | `graphify/install.py:291` (`_claude_pretooluse_hooks`) |
| Git hooks | `graphify/hooks.py` |
| Usage log | `graphify/querylog.py` |

### Type

A pure structural code graph. **NO EMBEDDINGS AT ALL** — disqualifying for our use case.

Their own wording, `README.md:32` (branch `v8`), verbatim:

> **Not a vector index.** No embeddings, no vector store: a real graph you traverse.

And from their skill reference `graphify/skills/claude/references/query.md:25`, verbatim:

> graphify's `query` CLI matches nodes via case-folded substring + IDF - there is **no stemming, no synonyms, no cross-language match** inside the binary, and the inline fallback below matches the same way. If the user's question uses different language or different domain vocabulary than the graph's labels (user says "обработчик" / graph says "handler"; user says "authentication" / graph says "Guardian"), the literal matcher returns 0 hits and the answer collapses to noise.

> Caveat to "no embeddings at all": the authors contradict themselves. `BENCHMARKS.md` ("Cost and token economics") says `graphify extracts with tree-sitter ... and a local embedder`. The OSS code on branch `v8` does not confirm it: `graphify/serve.py` (the whole query path) never mentions `embed`/`vector`. Our reading: the shipped CLI has no embeddings on the query path; the `BENCHMARKS.md` phrase refers to the hosted product or the harness's SurrealDB adapter.

### What it does

Turns a directory of files (code, documents, papers, images, video) into a persistent knowledge graph: interactive HTML, GraphRAG-ready JSON, `GRAPH_REPORT.md`. Tools query / path / explain, community detection, god nodes.

### How it works

| Aspect | Implementation |
|--------|-----------|
| Query tokenization | `_query_terms()` (`serve.py:253`) — `re.findall(r"\w+")` |
| Scoring | `_score_query()` (`serve.py:439`), IDF-weighted |
| Match weights | `_EXACT_MATCH_BONUS = 1000.0`, `_PREFIX_MATCH_BONUS = 100.0`, `_SUBSTRING_MATCH_BONUS = 1.0`, `_SOURCE_MATCH_BONUS = 0.5` |
| Prefilter | trigram |
| Expansion | BFS/DFS graph traversal after scoring |
| MinHash | `_minhash.py` -> used for DEDUP (`dedup.py:533`), not retrieval |
| Index refresh | git post-commit / post-checkout hooks (`graphify/hooks.py`), plus `graphify/watch.py` |

### Pros

| # | Pro |
|---|------|
| 1 | Deterministic: same query, same result, explainable score |
| 2 | The graph is really traversed: path / explain between entities |
| 3 | Zero LLM credits to build the index |
| 4 | Not only code: documents, images, video (transcription) |
| 5 | Widest multi-client delivery: 14 skill directories (claude, codex, amp, copilot, droid, kilo, kiro, opencode, pi, trae, vscode, claw, agents, windows) |
| 6 | Export to Neo4j / FalkorDB / GraphML / SVG |

### Cons

| # | Con |
|---|-------|
| 1 | No embeddings -> no semantics. A vocabulary mismatch kills the query silently, admitted by the authors (quote above) |
| 2 | Their workaround is manual query expansion over the graph vocabulary before traversal (`query.md:23`, "Step 0 — Constrained query expansion (REQUIRED before traversal)"), shifting the semantic work onto the agent |
| 3 | Benchmarks measure conversational memory (LOCOMO / LongMemEval), not code retrieval — not directly comparable with semble |
| 4 | Release cadence ~1.5 per day (182 releases in 124 days): unstable API, costly pin |
| 5 | Unpredictable versioning: `v1.0.0` is the OLDEST published release (2026-04-05); numbering then went back to `v0.7.x` and grows to `v0.9.36` |
| 6 | Default branch `v8`, not `main` — raw-file URLs on `main` give 404 |

### Stars / releases / cadence

| Metric | Value |
|---------|----------|
| Stars | 104,234 |
| Repo created | 2026-04-03 |
| GitHub releases | 182 (two pages of 100; `v1.0.0` 2026-04-05 ... `v0.9.36` 2026-08-07) |
| Cadence | ~0.68 days per release (124 days / 182 releases) — about 1.5 releases per day |
| Last release | `v0.9.36`, 2026-08-07 |
| `v1.0.0` | both a tag and a published release (2026-04-05, `draft=false`, `prerelease=false`) — the repo's first release; numbering then rolled back to `v0.7.x` |

### Benchmarks

`BENCHMARKS.md` at the root of branch `v8`, "Last updated: 2026-07-05".

| Suite | Dataset (n) | Metric | graphify | Comparison field |
|-------|-------------|--------|---------:|----------------|
| Memory | LOCOMO (300) | QA accuracy | 45.3% | supermemory 49.7% (11x ingest cost), bm25 31.3%, mem0 27.3% |
| Memory | LOCOMO (300) | recall@10 | 0.497 | bm25 0.362, mem0 0.048 |
| Memory | LongMemEval-S (50) | QA accuracy | 76% | dense RAG 76%, hybrid 74%, mem0 70% |
| Cost | LOCOMO ingest | USD | ~$1.40 | supermemory $15.67, mem0 $3.48 |
| Cost | graph build | LLM credits | $0 | n/a |

Harness: their own; competitors (mem0, supermemory) run through adapters inside it, one model Kimi K2.6, one budget, one grader. Judge blind-validated against a second independent judge: 90.6% agreement, Cohen's kappa 0.81. Grading formula: `coverage = (covered + 0.5 * partial) / total`.

Code suite (`crosstool/`): fixed agent Claude Opus 4.8, at most 14 turns, a grep/read/list floor plus one code-intelligence tool, on ERPNext (~1M LOC, `frappe/erpnext`), with a temporal sub-suite of 689 weekly AST checkpoints 2011-2026. Not in the summary table, but in "Results: code intelligence": key-fact coverage 70.8% (grep+read baseline) -> 82.0% with one graphify tool, at ~140K tokens per query. Sample: **n=6 questions** — statistically meaningless.

> Caveat: all numbers are self-reported on their own harness. LOCOMO and LongMemEval are dialogue memory, not code search; these percentages do not transfer to our use case.

### Claude Code hooks

Ships both a skill and real blocking hooks.

Skill: `graphify/skill.md` (frontmatter `name: graphify`), installed to `.claude/skills/graphify/SKILL.md` (`graphify/install.py`, `_PLATFORM_CONFIG["claude"]`), plus eight reference files in `graphify/skills/claude/references/`:

| File | Size |
|------|-------:|
| `add-watch.md` | 2,486 |
| `exports.md` | 3,362 |
| `extraction-spec.md` | 7,960 |
| `github-and-merge.md` | 2,177 |
| `hooks.md` | 1,267 |
| `query.md` | 13,456 |
| `transcribe.md` | 3,173 |
| `update.md` | 10,425 |

CC hooks, `graphify/install.py:291` (`_claude_pretooluse_hooks`):

| Matcher | Command | Mode |
|---------|---------|-------|
| `Bash\|Grep` | `graphify hook-guard search` | advisory nudge, fail-open |
| `Read\|Glob` | `graphify hook-guard read` (+`--strict`) | with `strict` **blocks the first raw read per session** (Claude Code only) |

`GRAPHIFY_HOOK_STRICT` changes strictness at runtime without reinstalling. A source comment records an important observation (`install.py:299-301`):

> `"Grep" is in the search matcher because current Claude Code routes content search through its dedicated Grep tool, not Bash (#1986) - a Bash-only matcher never fired on the agent's primary search path.`

> On macOS Claude Code 2.1.296 the `Grep`/`Glob` tools are absent by default, so search runs through `Bash`; keep both names in a search matcher.

Git hooks (separate from CC): `graphify hook install|uninstall|status` installs post-commit and post-checkout hooks that re-index changed files from `git diff HEAD~1` and rebuild `graph.json` + `GRAPH_REPORT.md`; an existing post-commit is appended to, not overwritten. `graphify claude install` writes an H1 `# graphify` section into `.claude/CLAUDE.md` (`install.py:317` `_skill_registration`; the source notes it is deliberately H1 so a user's `## graphify` is untouched).

Telemetry: opt-in `graphify/querylog.py`.
