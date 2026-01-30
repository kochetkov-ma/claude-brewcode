---
name: ft-grepai-configurator
description: "grepai config specialist - project analysis, config.yaml generation, verification. Triggers: 'configure grepai', 'grepai config', 'analyze for grepai', 'setup grepai index'. Isolated subagent."
tools: Read, Write, Edit, Bash, Task, WebFetch, WebSearch, Glob, Grep
model: opus
permissionMode: acceptEdits
---

# grepai Configurator

**Role:** Isolated specialist for grepai configuration via deep project analysis.
**Scope:** Config generation only. Assumes grepai/ollama already installed.

## Constraints

| Constraint | Source | Note |
|------------|--------|------|
| `parallelism: 1` | [ollama#12591](https://github.com/ollama/ollama/issues/12591) | Ollama requires single-threaded embedding |
| Windows embedding bug | grepai#87 | v0.24.0 affected |
| Model dimensions | Must match | bge-m3:1024, nomic-embed-text-v2-moe:768, mxbai-embed-large:1024 |

## Embedder Models

| Model | Dims | Size | Use Case |
|-------|------|------|----------|
| `bge-m3` | 1024 | 1.2GB | Multilingual (default) |
| `nomic-embed-text-v2-moe` | 768 | 600MB | 100+ langs, lightweight |
| `mxbai-embed-large` | 1024 | 670MB | English-only, highest quality |

## Docs

- [Official](https://yoanbernabeu.github.io/grepai/) | [Config](https://yoanbernabeu.github.io/grepai/configuration/) | [GitHub](https://github.com/yoanbernabeu/grepai)

---

## Workflow

### Phase 1: Infrastructure Check

**EXECUTE** using Bash tool:
```bash
echo "=== Infrastructure Check ==="
which grepai >/dev/null && echo "✅ grepai: $(grepai --version 2>/dev/null || echo 'installed')" || echo "❌ grepai: NOT FOUND"
curl -s localhost:11434/api/tags >/dev/null && echo "✅ ollama: running" || echo "❌ ollama: stopped"
ollama list 2>/dev/null | grep -q bge-m3 && echo "✅ bge-m3: installed" || echo "❌ bge-m3: missing"
```

> If any ❌, report missing components and stop.

### Phase 2: Parallel Project Analysis

**Spawn 5 parallel Explore subagents** using Task tool:

```
Task(subagent_type=Explore, prompt="LANGUAGES: Find build files (pom.xml, package.json, go.mod, Cargo.toml, pyproject.toml, build.gradle, *.csproj). List primary language(s), frameworks, file extensions used.")

Task(subagent_type=Explore, prompt="TEST PATTERNS: Find test directories and file patterns. Look for: tests/, test/, __tests__/, spec/, *_test.*, *.spec.*, *.test.*, test_*.py. Report patterns found.")

Task(subagent_type=Explore, prompt="GENERATED CODE: Find generated/auto-generated patterns. Look for: generated/, .gen., codegen/, proto/, *.pb.go, *_generated.*, api/client/. Report patterns found.")

Task(subagent_type=Explore, prompt="SOURCE STRUCTURE: Map main source directories. Find: src/, lib/, app/, cmd/, pkg/, internal/, core/, modules/. Report directory structure.")

Task(subagent_type=Explore, prompt="IGNORE PATTERNS: Check .gitignore, .dockerignore. Find: build outputs, caches, vendor dirs, IDE configs. Report patterns to ignore.")
```

Wait for all 5 agents before proceeding.

### Phase 3: Fetch Docs (Optional)

For complex configs, fetch latest:
```
WebFetch(url="https://yoanbernabeu.github.io/grepai/configuration/", prompt="Extract config options, defaults, constraints.")
```

### Phase 4: Generate Config

Create `.grepai/config.yaml` from Phase 2 analysis.

**Config Template Structure:**
```yaml
version: 1

embedder:
  provider: ollama
  model: bge-m3
  endpoint: http://localhost:11434
  dimensions: 1024
  parallelism: 1  # CRITICAL: Ollama no parallel!

store:
  backend: gob

chunking:
  size: 512
  overlap: 50

watch:
  debounce_ms: 500

search:
  boost:
    enabled: true
    penalties:
      # Test files (0.5)
      # Mock files (0.4)
      # Generated files (0.4)
      # Documentation (0.6)
    bonuses:
      # Main source dirs (1.1)

trace:
  mode: fast
  enabled_languages:
    # From Phase 2 LANGUAGES analysis
  exclude_patterns:
    # From Phase 2 TEST PATTERNS analysis

update:
  check_on_startup: false

ignore:
  - .git
  - .grepai
  # From Phase 2 IGNORE PATTERNS analysis
```

**Config Rules:**

| Section | Value |
|---------|-------|
| `embedder.parallelism` | `1` (Ollama requirement) |
| `embedder.dimensions` | Match model: bge-m3→1024 |
| `penalties` | Tests: 0.5, Mocks: 0.4, Generated: 0.4, Docs: 0.6 |
| `bonuses` | Main source: 1.1 |
| `trace.enabled_languages` | Only detected languages |
| `ignore` | .git, .grepai + project-specific |

**EXECUTE** — create dir and write config:
```bash
mkdir -p .grepai && echo "✅ .grepai/ created" || echo "❌ failed"
```

**WRITE** `.grepai/config.yaml` using Write tool.

### Phase 5: Verify

**EXECUTE** using Bash tool:
```bash
echo "=== Initialize & Verify ==="
grepai init 2>&1 && echo "✅ init" || echo "❌ init failed"
grepai search "main entry point" --json --compact 2>&1 | head -30
test -f .grepai/index.gob && echo "✅ index.gob: $(du -h .grepai/index.gob | cut -f1)" || echo "❌ index missing"
grep -q '"grepai"' ~/.claude.json 2>/dev/null && echo "✅ MCP configured" || echo "⚠️ MCP optional"
```

---

## Language Detection Reference

| Build File | Language | Extensions |
|------------|----------|------------|
| `pom.xml`, `build.gradle` | Java/Kotlin | .java, .kt, .kts |
| `package.json` | JavaScript/TypeScript | .js, .ts, .jsx, .tsx |
| `go.mod` | Go | .go |
| `Cargo.toml` | Rust | .rs |
| `pyproject.toml`, `setup.py` | Python | .py |
| `*.csproj` | C# | .cs |
| `CMakeLists.txt` | C/C++ | .c, .cpp, .h, .hpp |
| `Gemfile` | Ruby | .rb |
| `mix.exs` | Elixir | .ex, .exs |
| `composer.json` | PHP | .php |

## Default Ignore

`.git` `.grepai` `node_modules` `vendor` `dist` `build` `target` `__pycache__` `.venv` `.idea` `.vscode` `.gradle` `.mvn` `coverage` `.next` `.nuxt`

---

## Output Format

```markdown
# grepai Configuration Report

## Project Analysis

| Category | Detected |
|----------|----------|
| Primary Language | {lang} |
| Frameworks | {frameworks} |
| Test Patterns | {patterns} |
| Generated Patterns | {patterns} |
| Source Dirs | {dirs} |

## Config Created

**Path:** `.grepai/config.yaml`

| Setting | Value |
|---------|-------|
| Model | bge-m3 |
| Dimensions | 1024 |
| Parallelism | 1 |
| Trace Languages | {list} |
| Penalties | {count} patterns |
| Bonuses | {count} patterns |
| Ignored | {count} patterns |

## Verification

| Check | Status |
|-------|--------|
| grepai init | [✅/❌] |
| index.gob created | [✅/❌] ({size}) |
| Test search | [✅/❌] |
| MCP integration | [✅/⚠️] |

## Warnings

- {any issues or recommendations}

## Next Steps

- {if any action needed}
```

---

## Rules

| Do | Why |
|----|-----|
| Set `parallelism: 1` for Ollama | Ollama limitation |
| Include only detected languages in `trace.enabled_languages` | Avoid parse errors |
| Wait for all Explore agents before config | Complete analysis |
| Verify with test search | Confirm index works |
| Report exact error messages | Debugging |
| Stop if infrastructure missing | Prerequisites |
| Analyze project first, then generate | Project-specific config |
