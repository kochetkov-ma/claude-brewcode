---
name: grepai
description: Semantic code search setup and management. Auto-detects mode based on project state. Triggers - "grepai", "semantic search", "setup grepai", "grepai status".
user-invocable: true
argument-hint: "[setup|status|start|stop]"
allowed-tools: Read, Write, Edit, Bash, Task, Glob
context: fork
model: sonnet
---

# grepai Skill

Semantic code search setup and management for grepai.

<instructions>

## Mode Detection

**Step 1: Check for exact keyword match (case-insensitive)**

| Keyword | Mode | Jump to |
|---------|------|---------|
| `stop`, `halt`, `kill` | stop | → **Mode: stop** |
| `start`, `watch`, `run` | start | → **Mode: start** |
| `status`, `doctor`, `check`, `health` | status | → **Mode: status** |
| `setup`, `install`, `configure`, `init` | setup | → **Mode: setup** |

**Step 2: If no keyword match, check for empty arguments**

| Condition | Mode |
|-----------|------|
| No arguments + `.grepai/` exists | start |
| No arguments + no `.grepai/` | setup |

**Step 3: If still no match → Mode: prompt** (interpret user intent)

---

**EXECUTE MODE:** Based on arguments, jump to the correct section:

- `/grepai stop` → execute **Mode: stop** section ONLY
- `/grepai start` → execute **Mode: start** section ONLY
- `/grepai status` → execute **Mode: status** section ONLY
- `/grepai setup` → execute **Mode: setup** section ONLY

**DO NOT** execute other modes. Each mode is self-contained.

---

## Mode: setup

Full grepai installation and project setup.

### Phase 1: Infrastructure Check

**EXECUTE** using Bash tool:
```bash
echo "=== Infrastructure Check ==="

# grepai CLI
if which grepai >/dev/null 2>&1; then
  echo "✅ grepai: $(grepai --version 2>/dev/null || echo 'installed')"
else
  echo "❌ grepai: NOT FOUND"
  echo "   Install: brew install yoanbernabeu/tap/grepai"
fi

# Ollama
if curl -s localhost:11434/api/tags >/dev/null 2>&1; then
  echo "✅ ollama: running"
else
  echo "❌ ollama: not running"
  echo "   Install: brew install ollama && brew services start ollama"
fi

# bge-m3 model
if ollama list 2>/dev/null | grep -q bge-m3; then
  echo "✅ bge-m3: installed"
else
  echo "❌ bge-m3: not installed"
  echo "   Install: ollama pull bge-m3"
fi
```

> **STOP if any ❌** — install missing components before continuing.

### Phase 2: MCP Configuration

**EXECUTE** using Bash tool:
```bash
echo "=== MCP Check ==="

if grep -q '"grepai"' ~/.claude.json 2>/dev/null; then
  echo "✅ MCP grepai: already configured"
else
  echo "⚠️ MCP grepai: not configured"
  echo "   Adding via claude CLI..."
fi
```

If MCP not configured, **EXECUTE**:
```bash
claude mcp add --scope user grepai -- grepai mcp-serve
echo "✅ MCP grepai: added"
```

### Phase 3: Generate Config

**Spawn `ft-grepai-configurator` agent** for deep project analysis and config generation:

```
Task(subagent_type="focus-task:ft-grepai-configurator", prompt="Configure grepai for this project. Analyze all build files, test patterns, source structure. Generate optimal .grepai/config.yaml.")
```

The agent will:
1. Run 5 parallel Explore subagents for comprehensive project analysis
2. Detect languages, test patterns, generated code, source structure
3. Fetch latest grepai docs if needed
4. Generate `.grepai/config.yaml` with project-specific settings
5. Verify with `grepai init` and test search

> Wait for agent to complete before proceeding to Phase 4.

### Phase 4: Initialize Index

**EXECUTE** using Bash tool:
```bash
echo "=== Initialize Index ==="

# Init if no index exists
if [ ! -f .grepai/index.gob ]; then
  grepai init && echo "✅ grepai init: complete" || echo "❌ grepai init: FAILED"
else
  echo "⏭️ index.gob already exists"
fi

# Create logs directory
mkdir -p .grepai/logs

# Start watch in background
grepai watch --background --log-dir .grepai/logs 2>/dev/null
echo "✅ grepai watch: started in background"
```

### Phase 5: Create Rule

**EXECUTE** using Bash tool:
```bash
echo "=== Create Rule ==="

RULE_FILE=".claude/rules/grepai-first.md"
mkdir -p .claude/rules

if [ -f "$RULE_FILE" ]; then
  echo "⏭️ Rule already exists: $RULE_FILE"
else
  PLUGIN_TEMPLATES="$HOME/.claude/plugins/cache/claude-brewcode/focus-task/$(ls $HOME/.claude/plugins/cache/claude-brewcode/focus-task 2>/dev/null | sort -V | tail -1)/templates"

  if [ -f "$PLUGIN_TEMPLATES/rules/grepai-first.md.template" ]; then
    cp "$PLUGIN_TEMPLATES/rules/grepai-first.md.template" "$RULE_FILE"
    echo "✅ Rule created: $RULE_FILE"
  else
    echo "⚠️ Template not found, creating default rule"
    cat > "$RULE_FILE" << 'RULE'
---
globs: ["**/*"]
alwaysApply: true
---

# grepai-first

Use grepai as PRIMARY search tool for semantic code search.

| Task | Tool |
|------|------|
| Search by intent | grepai_search |
| Exact text match | Grep |
| File path patterns | Glob |

**Decision:** "Need exact text/pattern?" → YES: Grep/Glob, NO: grepai
RULE
    echo "✅ Rule created (default): $RULE_FILE"
  fi
fi
```

### Phase 6: Verification

**EXECUTE** using Bash tool:
```bash
echo "=== Final Verification ==="

# Infrastructure
which grepai >/dev/null && echo "✅ grepai CLI" || echo "❌ grepai CLI"
curl -s localhost:11434/api/tags >/dev/null && echo "✅ ollama running" || echo "❌ ollama stopped"
ollama list 2>/dev/null | grep -q bge-m3 && echo "✅ bge-m3 model" || echo "❌ bge-m3 missing"
grep -q '"grepai"' ~/.claude.json 2>/dev/null && echo "✅ MCP configured" || echo "❌ MCP missing"

# Project config
test -d .grepai && echo "✅ .grepai/ directory" || echo "❌ .grepai/ missing"
test -f .grepai/config.yaml && echo "✅ config.yaml" || echo "❌ config.yaml missing"
test -f .grepai/index.gob && echo "✅ index.gob ($(du -h .grepai/index.gob | cut -f1))" || echo "⚠️ index.gob (indexing...)"
test -f .claude/rules/grepai-first.md && echo "✅ grepai-first.md rule" || echo "❌ rule missing"

# Plugin hook (auto-starts watch on session start)
PLUGIN_HOOKS="$HOME/.claude/plugins/cache/claude-brewcode/focus-task/$(ls $HOME/.claude/plugins/cache/claude-brewcode/focus-task 2>/dev/null | sort -V | tail -1)/hooks"
test -f "$PLUGIN_HOOKS/grepai-session.mjs" && echo "✅ hook: built-in (plugin)" || echo "❌ hook: missing in plugin"

# Watch status
pgrep -f "grepai watch" >/dev/null && echo "✅ watch running" || echo "⚠️ watch not running"

echo ""
echo "=== Setup Complete ==="
echo "Hook auto-starts grepai watch on every session start."
```

---

## Mode: status

Read-only diagnostics.

**EXECUTE** using Bash tool:
```bash
echo "=== grepai Status ==="
echo ""

echo "--- Infrastructure ---"
which grepai >/dev/null && echo "✅ grepai: $(grepai --version 2>/dev/null || echo 'installed')" || echo "❌ grepai: NOT FOUND"
curl -s localhost:11434/api/tags >/dev/null && echo "✅ ollama: running" || echo "❌ ollama: stopped"
ollama list 2>/dev/null | grep -q bge-m3 && echo "✅ bge-m3: installed" || echo "❌ bge-m3: missing"

echo ""
echo "--- Project ---"
test -d .grepai && echo "✅ .grepai/: exists" || echo "❌ .grepai/: missing"
test -f .grepai/config.yaml && echo "✅ config.yaml: exists" || echo "❌ config.yaml: missing"
test -f .grepai/index.gob && echo "✅ index.gob: $(du -h .grepai/index.gob 2>/dev/null | cut -f1)" || echo "⚠️ index.gob: missing"

echo ""
echo "--- Watch ---"
if pgrep -f "grepai watch" >/dev/null; then
  echo "✅ watch: running (PID: $(pgrep -f 'grepai watch'))"
else
  echo "⚠️ watch: not running"
fi

echo ""
echo "--- Integration ---"
grep -q '"grepai"' ~/.claude.json 2>/dev/null && echo "✅ MCP: configured" || echo "❌ MCP: not configured"
test -f .claude/rules/grepai-first.md && echo "✅ rule: grepai-first.md" || echo "⚠️ rule: missing"

echo ""
echo "--- Hook ---"
PLUGIN_HOOKS="$HOME/.claude/plugins/cache/claude-brewcode/focus-task/$(ls $HOME/.claude/plugins/cache/claude-brewcode/focus-task 2>/dev/null | sort -V | tail -1)/hooks"
test -f "$PLUGIN_HOOKS/grepai-session.mjs" && echo "✅ hook: built-in (plugin)" || echo "⚠️ hook: missing in plugin"

echo ""
echo "--- MCP Tools ---"
if grep -q '"grepai"' ~/.claude.json 2>/dev/null; then
  echo "Available: grepai_search, grepai_trace_callers, grepai_trace_callees, grepai_trace_graph, grepai_index_status"
fi
```

---

## Mode: start

Start grepai watch in background.

**EXECUTE** using Bash tool:
```bash
echo "=== Starting grepai watch ==="

# Check prerequisites
if [ ! -d .grepai ]; then
  echo "❌ .grepai/ not found. Run setup first: /focus-task:grepai setup"
  exit 1
fi

# Check if already running
if pgrep -f "grepai watch" >/dev/null; then
  echo "⚠️ watch already running (PID: $(pgrep -f 'grepai watch'))"
  exit 0
fi

# Create logs directory
mkdir -p .grepai/logs

# Start watch
grepai watch --background --log-dir .grepai/logs 2>/dev/null

# Verify
sleep 1
if pgrep -f "grepai watch" >/dev/null; then
  echo "✅ watch started (PID: $(pgrep -f 'grepai watch'))"
  echo "   Logs: .grepai/logs/"
else
  echo "❌ watch failed to start"
  echo "   Check: grepai watch (foreground) for errors"
fi
```

---

## Mode: stop

Stop grepai watch.

**EXECUTE** using Bash tool:
```bash
echo "=== Stopping grepai watch ==="

# Try graceful stop first
grepai watch --stop 2>/dev/null

# Force kill if still running
if pgrep -f "grepai watch" >/dev/null; then
  pkill -f "grepai watch"
  sleep 1
fi

# Verify
if pgrep -f "grepai watch" >/dev/null; then
  echo "❌ watch still running (PID: $(pgrep -f 'grepai watch'))"
  echo "   Try: kill -9 $(pgrep -f 'grepai watch')"
else
  echo "✅ watch stopped"
fi
```

---

## Mode: prompt

Interpret user intent from `$ARGUMENTS`.

**Decision tree:**
- Contains "install", "configure", "set up" → setup mode
- Contains "check", "diagnose", "health" → status mode
- Contains "run", "enable", "activate" → start mode
- Contains "stop", "disable", "kill", "terminate" → stop mode
- Otherwise → ask user what they want

</instructions>

---

## Output Format

```markdown
# grepai [MODE]

## Status

| Component | Status |
|-----------|--------|
| grepai CLI | [✅/❌] |
| ollama | [✅/❌] |
| bge-m3 | [✅/❌] |
| MCP | [✅/❌] |
| .grepai/ | [✅/❌] |
| index | [size/indexing] |
| watch | [running/stopped] |
| rule | [✅/⚠️] |

## Actions Taken

- [action 1]
- [action 2]

## Next Steps

- [if any issues, list resolution steps]
```
