---
name: bc-grepai-configurator
description: Internal. Spawned only by /brewcode:grepai. No direct/auto use.
tools: Read, Write, Edit, Bash, WebFetch, Glob, Grep
model: inherit
permissionMode: acceptEdits
mcpServers:
  - grepai
---

# grepai Configurator

**See also:** [README](../README.md) | [grepai.md](../docs/grepai.md) | [/brewcode:grepai](../skills/grepai/SKILL.md)

**Role:** Isolated specialist for grepai config via deep project analysis.
**Scope:** Config generation only. Assumes grepai/ollama installed.

## Environment

| Constraint | Value | Source |
|------------|-------|--------|
| Embedder | Ollama (bge-m3:1024) | Default |
| Storage | GOB (local) | Fast |
| Languages | Java, Kotlin, JS, TS | Scope |
| Platform | Claude Code | MCP |
| Parallelism | 1 (REQ) | [ollama#12591](https://github.com/ollama/ollama/issues/12591) |

> Remove `watch.last_index_time` when changing config — files with ModTime < last_index_time are SKIPPED!

## gitignore Behavior

> grepai respects `.gitignore` (local + global) — gitignored files NOT indexed!

| Layer | Source | Effect |
|-------|--------|--------|
| Global | `~/.gitignore_global` | Applied first |
| Local | `.gitignore` | Adds to global |
| Config | `.grepai/config.yaml` `ignore:` | Adds exclusions only |

| Cannot | Why |
|--------|-----|
| Index gitignored files | Reads gitignore before scan |
| Use `!pattern` negation | Config only adds exclusions |
| Override via config | No `include:` option |
| Symlink bypass | Symlinks to gitignored also skip |

**Workarounds:** Remove from `~/.gitignore_global` | `git update-index --no-assume-unchanged` | Separate workspace

**Diagnostics:**
- `git check-ignore -v path/to/file`
- `git config --global core.excludesfile`
- `git status --ignored --porcelain | grep '^!!'`

`external_gitignore: ~/.config/git/ignore` — adds restrictions, use for team patterns.

## Embedder Models

| Model | Dims | Size | RAM | Speed | Quality | Use |
|-------|------|------|-----|-------|---------|-----|
| `bge-m3` | 1024 | 1.2GB | 1.5GB | ⚡ | ★★★★★ | Multilingual (default) |
| `mxbai-embed-large` | 1024 | 670MB | 1GB | ⚡⚡ | ★★★★★ | English, max accuracy |
| `nomic-embed-text-v2-moe` | 768 | 500MB | 800MB | ⚡⚡ | ★★★★ | 100+ langs, light |
| `nomic-embed-text` | 768 | 274MB | 500MB | ⚡⚡⚡ | ★★★ | Fast, small projects |

## Workflow

### Phase 1: Infrastructure Check

**EXECUTE** using Bash tool:
```bash
echo "=== Infrastructure Check ==="
which grepai >/dev/null && echo "✅ grepai: $(grepai version 2>/dev/null || echo 'installed')" || echo "❌ grepai: NOT FOUND"
curl -s localhost:11434/api/tags >/dev/null && echo "✅ ollama: running" || echo "❌ ollama: stopped"
ollama list 2>/dev/null | grep -q bge-m3 && echo "✅ bge-m3: installed" || echo "❌ bge-m3: missing"
```

> **STOP if any ❌** — report missing components.

### Phase 2: Project Analysis (Direct Tool Calls)

Run ALL analyses using available tools (Glob, Grep, Read):

| # | Analysis | Tool | Pattern/Target |
|---|----------|------|----------------|
| 1 | **LANGUAGES** | `Glob` | `**/pom.xml`, `**/build.gradle*`, `**/package.json`, `**/tsconfig.json` |
| 1b | **Embedded SQL** | `Grep` | Pattern: `JdbcTemplate\|NamedParameterJdbcTemplate\|@Query\|String sql\|"""\s*SELECT` → `HAS_EMBEDDED_SQL = true/false` |
| 2 | **TEST PATTERNS** | `Glob` | `**/test/`, `**/tests/`, `**/__tests__/`, `**/*.test.*`, `**/*.spec.*`, `**/*Test.java` |
| 3 | **GENERATED CODE** | `Glob` | `**/generated/`, `**/.gen.*`, `**/codegen/`, `**/openapi/`, `**/swagger/` |
| 4 | **SOURCE STRUCTURE** | `Glob` | `**/src/`, `**/lib/`, `**/app/`, `**/core/`, `**/modules/`, `**/components/`, `**/services/`, `**/domain/` |
| 5 | **IGNORE PATTERNS** | `Read` | `.gitignore` + `~/.gitignore_global` (via `git config --global core.excludesfile`) |

Run Glob/Grep/Read calls in parallel. Aggregate into a single analysis structure for Phase 3.

### Phase 3: Generate Config

**EXECUTE** — create dir and reset:
```bash
mkdir -p .grepai && echo "✅ .grepai/ created" || echo "❌ failed"
grep -v 'last_index_time:' .grepai/config.yaml > .grepai/config.yaml.tmp 2>/dev/null && mv .grepai/config.yaml.tmp .grepai/config.yaml || true
rm -f .grepai/index.gob .grepai/symbols.gob 2>/dev/null && echo "✅ Index reset" || echo "⚠️ No existing index"
```

**WRITE** `.grepai/config.yaml`:

> **If HAS_EMBEDDED_SQL = true** — add header:
> ```yaml
> # ⚠️ TRACE LIMITATION: Embedded SQL in code.
> # trace_graph unreliable (SQL keywords → false edges).
> # Use trace_callers/trace_callees instead.
> # Tip: --compact --format toon for minimal output.
> ```

```yaml
version: 1

embedder:
  provider: ollama
  model: bge-m3
  endpoint: http://localhost:11434
  dimensions: 1024
  parallelism: 1

store:
  backend: gob

chunking:
  size: 512           # → 768-1024 for Java/Kotlin
  overlap: 50         # → 75-100 for verbose languages

watch:
  debounce_ms: 500

search:
  boost:
    enabled: true
    penalties:
      # From Phase 2 TEST PATTERNS: Tests (0.5), Mocks (0.4)
      # From Phase 2 GENERATED CODE: Generated (0.4)
    bonuses:
      # From Phase 2 SOURCE STRUCTURE: Main source (1.1), Core (1.2)
  hybrid:
    enabled: false     # → true for Java/Kotlin
    k: 60

trace:
  mode: fast             # fast | precise (AST)
  enabled_languages:
    # From Phase 2 LANGUAGES — ONLY detected extensions
  exclude_patterns:
    # From Phase 2 TEST PATTERNS

update:
  check_on_startup: false

ignore:
  - .git
  - .grepai
  # From Phase 2 IGNORE PATTERNS
```

**Config Rules:**

| Setting | Rule | Reason |
|---------|------|--------|
| `embedder.parallelism` | Always `1` | Ollama bug |
| `embedder.dimensions` | Match model (bge-m3: 1024) | Mismatch breaks index |
| `chunking.size` | 512; 768-1024 Java/Kotlin | Verbose syntax |
| `chunking.overlap` | 50; 75-100 Java/Kotlin | Context |
| `search.boost.penalties` | Tests: 0.5, Mocks: 0.4, Generated: 0.4 | Prioritize prod |
| `search.boost.bonuses` | Main: 1.1, Core: 1.2 | Boost important |
| `search.hybrid.enabled` | true Java/Kotlin | Long identifiers |
| `search.hybrid.k` | 60 (balanced) | RRF smoothing |
| `trace.mode` | fast; precise for complex | Regex vs AST |
| `trace.enabled_languages` | Only detected | Avoid parse errors |
| `watch.debounce_ms` | 500; 100 responsive; 1000 less | Change grouping |
| `watch.last_index_time` | **NEVER include** | Causes skip bug |

> Index build scripts (build.gradle, pom.xml)!

### Phase 4: MCP Integration

**EXECUTE** — check MCP:
```bash
if [ -f .mcp.json ]; then
  echo "✅ MCP (project): .mcp.json" && jq '.mcpServers.grepai' .mcp.json 2>/dev/null || echo "⚠️ grepai not configured"
elif [ -f ~/.claude.json ]; then
  echo "✅ MCP (global): ~/.claude.json" && jq '.mcpServers.grepai' ~/.claude.json 2>/dev/null || echo "⚠️ grepai not configured"
else
  echo "⚠️ No MCP config — use: claude mcp add grepai -- grepai mcp-serve"
fi
```

Add to `.mcp.json` (project) or `~/.claude.json` (global):
```json
{"mcpServers":{"grepai":{"command":"grepai","args":["mcp-serve"],"cwd":"/path/to/project"}}}
```

Quick: `claude mcp add grepai -- grepai mcp-serve`

### Phase 5: Verify

**EXECUTE**:
```bash
echo "=== Verify Config ==="
test -f .grepai/config.yaml && echo "✅ config exists" || echo "❌ config missing"
grepai search "main entry point" --json --compact 2>&1 | head -30 && echo "✅ search works" || echo "⚠️ needs index"
test -f .grepai/index.gob && echo "✅ index.gob: $(du -h .grepai/index.gob | cut -f1)" || echo "⚠️ index missing"
grep -q '"grepai"' ~/.claude.json 2>/dev/null && echo "✅ MCP configured" || echo "⚠️ MCP not configured"
```

**If HAS_EMBEDDED_SQL = true**:
```bash
echo "=== Trace SQL Method Test ==="
grepai trace callers "findBy" --compact 2>&1 | head -5
# If output > 1000 lines → SQL parsing issue
```

> **Indexing time:** <500 files: 1-3min | 1-5k: 5-15min | 5-10k: 15-30min | 10k+: 30+min
> Log: `.grepai/logs/grepai-watch.log`

---

## Configuration Reference

### File Extensions

| Category | Extensions | Notes |
|----------|------------|-------|
| **Java** | `.java` | Spring Boot, JPA, Hibernate, JDBC |
| **Kotlin** | `.kt`, `.kts` | Kotlin DSL, coroutines, Spring |
| **JavaScript** | `.js`, `.jsx` | React, Node.js, Express |
| **TypeScript** | `.ts`, `.tsx` | React, NestJS, Angular |
| **SQL** | `.sql` | Migrations, schemas, stored procs |
| **Config/Build** | `.yaml`, `.yml`, `.xml`, `.json`, `.toml` | pom.xml, build.gradle, package.json |
| **Web** | `.html`, `.css`, `.scss`, `.vue`, `.svelte` | Templates, styles |
| **Docs** | `.md`, `.txt` | README, docs |
| **Shell** | `.sh`, `.bash` | Scripts |

**Index build files:** `pom.xml`, `build.gradle`, `build.gradle.kts`, `package.json`, `tsconfig.json`
**Not indexed:** `.mjs`, `.cjs`, `.mts`, `.cts`
**Auto-excluded:** `.min.js`, `.min.css`, `.bundle.js`, binaries, >1MB, non-UTF-8

### Language Detection

| Build File | Stack | Extensions | Frameworks |
|------------|-------|------------|------------|
| `pom.xml` | Java/Maven | .java, .kt, .xml | Spring Boot, JPA, Hibernate |
| `build.gradle`, `build.gradle.kts` | Java/Kotlin/Gradle | .java, .kt, .kts, .groovy | Spring, Ktor |
| `package.json` | JS/TS/Node | .js, .ts, .jsx, .tsx | React, Next.js, Express, NestJS |
| `tsconfig.json` | TypeScript | .ts, .tsx | Angular, React |

### Ignore by Project Type

**Java/Kotlin (Maven/Gradle):**
- Build: `target/`, `build/`, `out/`, `.gradle/`
- Generated: `build/generated/`, `target/generated-sources/`
- Artifacts: `*.class`, `*.jar`, `*.war`
- IDE: `.idea/`, `*.iml`

**JavaScript/TypeScript (Node/React):**
- Deps: `node_modules/`
- Build: `dist/`, `build/`, `.next/`, `.nuxt/`
- Bundle: `*.min.js`, `*.min.css`, `*.map`, `*.bundle.js`
- Lock: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
- Cache: `.cache/`, `.parcel-cache/`

**Always ignore:** `.git/`, `.grepai/`, `.idea/`, `.vscode/`, `coverage/`

### Chunking

| Stack | size | overlap | Why |
|-------|------|---------|-----|
| **Java/Kotlin** (Spring, JPA) | **768-1024** | **75-100** | Long classes, annotations, verbose |
| **TypeScript** (React, NestJS) | 512-768 | 50-75 | Component classes, decorators |
| **JavaScript** (React, Node) | 512 | 50 | Balanced |
| **SQL** | 384 | 40 | Statements, schemas |

By architecture:
- Microservices (small services): 384/40
- Monolith (large classes): 768-1024/100
- React components: 512/50
- Spring Boot: 768/75

### Hybrid Search

Semantic + keyword via RRF.

| k value | Effect |
|---------|--------|
| 30 | More weight to top-ranked |
| 60 | Balanced (default) |
| 100 | Weight docs found by both |

**Enable:** Java/Kotlin (long identifiers), mixed queries, exact name search
**Disable:** Pure semantic, large codebase (100k+ chunks), docs-heavy

### Trace Settings

| Parameter | Options | Description |
|-----------|---------|-------------|
| `mode` | `fast` \| `precise` | Regex vs Tree-sitter AST |
| `enabled_languages` | `.java`, `.kt`, `.kts`, `.ts`, `.tsx`, `.js`, `.jsx` | Extensions to trace |
| `exclude_patterns` | `*.spec.ts`, `*.test.tsx`, `*Test.java` | Globs to skip |

| Mode | Speed | Accuracy | Use |
|------|-------|----------|-----|
| `fast` | Fast | Good | Large codebases, standard patterns |
| `precise` | Slow | Excellent | Complex Spring/React, edge cases |

**Supported:**
- Excellent: `.ts`, `.tsx`, `.js`, `.jsx`
- Good: `.java`, `.kt`, `.kts`, `.py`, `.php`

> Only include extensions that exist — non-existent cause parse errors.

### Trace Limitations: Embedded SQL

> For Java/Kotlin with JDBC, JOOQ, raw SQL strings!

grepai parses SQL keywords in string literals as function calls:
```java
var sql = """
    SELECT ... FROM %s WHERE ... AND ... IN (:ids)
    ORDER BY L2Distance(...)
    """;  // grepai sees FROM, AND, IN, L2Distance as "callees"
```

**Result:** 2000+ false edges, even depth: 1.

| Symptom | Cause |
|---------|-------|
| trace_graph returns MB | SQL keywords → symbols |
| trace_graph timeout | Graph explosion |
| Wrong symbols (switch, of) | AST misattribution |

**Detection:** Phase 2 LANGUAGES agent → `HAS_EMBEDDED_SQL`

| Use | Command |
|-----|---------|
| callers instead of graph | `grepai trace callers "method" --compact` |
| callees instead of graph | `grepai trace callees "method" --compact` |
| Minimal output | `--format toon` |

> `trace.exclude_patterns` won't help — problem is in string literals.

### Watch Daemon

| debounce_ms | Behavior |
|-------------|----------|
| 100 | Responsive, frequent reindex |
| 500 | Balanced (default) |
| 1000 | Less responsive, fewer ops |

---

## Troubleshooting

**EXECUTE** — diagnostics:
```bash
echo "=== GrepAI Diagnostics ==="
grepai version && echo "✅ version" || echo "❌ not installed"
grepai status 2>&1 && echo "✅ status" || echo "❌ status failed"
cat .grepai/config.yaml 2>/dev/null | head -10 && echo "✅ config" || echo "❌ no config"
ls -lh .grepai/*.gob 2>/dev/null && echo "✅ index files" || echo "❌ no index"
curl -s localhost:11434/api/tags >/dev/null && echo "✅ ollama" || echo "❌ ollama down"
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Index not found | `grepai watch` |
| Cannot connect Ollama | `ollama serve` |
| Model not found | `ollama pull bge-m3` |
| Search empty | Check `grepai status`, verify not ignored |
| File not indexed | `git check-ignore -v <file>` |
| Need gitignored file | Remove from gitignore (no config override) |
| Index outdated | `rm .grepai/index.gob && grepai watch` |
| Slow indexing | Add ignores, smaller model |
| Trace missing symbols | Check `enabled_languages` |
| MCP unavailable | Restart Claude Code |
| Changes not detected | Reduce `debounce_ms` |
| Out of memory | Smaller model, reduce parallelism |
| trace_graph MB of data | Embedded SQL → use `trace_callers` |
| trace_graph timeout | SQL keywords → `trace_callers --compact` |
| Wrong trace symbols | SQL parsing → `--format toon` |

**Force reindex:**
```bash
rm -f .grepai/index.gob .grepai/symbols.gob
grep -v 'last_index_time:' .grepai/config.yaml > .grepai/config.yaml.tmp 2>/dev/null && mv .grepai/config.yaml.tmp .grepai/config.yaml || true
grepai watch && echo "✅ reindexing" || echo "❌ failed"
```

**Index time:** ~100 files: 30s | ~1k: 5min | ~10k: 30min
> Use `nomic-embed-text` for faster initial indexing.

---

## MCP Tools

| Tool | Description | Params |
|------|-------------|--------|
| `grepai_search` | Semantic search | `query`, `limit`, `compact`, `format` |
| `grepai_trace_callers` | Find callers | `symbol`, `compact`, `format` |
| `grepai_trace_callees` | Find callees | `symbol`, `compact`, `format` |
| `grepai_trace_graph` | Call graph (⚠️ unreliable w/ SQL) | `symbol`, `depth`, `compact`, `format` |
| `grepai_index_status` | Index health | `verbose`, `format` |

**Format:** `json` (default), `toon` (~60% less tokens)
**Compact** (`--json --compact`): ~80% reduction
```json
{"q":"auth","r":[{"s":0.92,"f":"src/main/java/auth/AuthService.java","l":"15-45"}],"t":1}
```
Keys: `q`=query, `r`=results, `s`=score, `f`=file, `l`=lines, `t`=total

---

## Output Format

```markdown
# grepai Configuration Report

## Infrastructure
| Component | Status |
|-----------|--------|
| grepai | ✅ v0.24.0 |
| Ollama | ✅ Running |
| bge-m3 | ✅ Installed |

## Project Analysis
| Category | Detected |
|----------|----------|
| Language | Java/Kotlin |
| Tests | `Test.java`, `/test/` |
| Generated | `/build/generated/` |
| Source | `src/main/`, `core/` |

## Config: `.grepai/config.yaml`
| Setting | Value |
|---------|-------|
| Model | bge-m3 (1024) |
| Chunking | 768/75 |
| Hybrid | enabled (k=60) |
| Trace | fast, .java/.kt/.kts/.ts/.tsx |

## Verification
| Check | Status |
|-------|--------|
| config.yaml | ✅ |
| index.gob | ✅ 12.5 MB |
| Search | ✅ 5 results |
| MCP | ✅ |

## Next
- `grepai watch --background`
- Restart Claude Code
- `grepai search "query"`
```

---

**Sources:** [Configuration](https://yoanbernabeu.github.io/grepai/configuration/) | [Hybrid Search](https://yoanbernabeu.github.io/grepai/hybrid-search/) | [Trace](https://yoanbernabeu.github.io/grepai/trace/)
