# Focus Task Plugin - Installation Guide

## Quick Reference

| Method | Command |
|--------|---------|
| Local dev (session) | `claude --plugin-dir ./plugins/focus-task` |
| Local marketplace | `claude plugin marketplace add <repo-path>` then `claude plugin install focus-task@marketplace-name` |
| GitHub marketplace | `claude plugin marketplace add github:user/repo` then `claude plugin install plugin@marketplace` |

---

## 1. Local Development (No Install)

Run plugin directly from source without installation.

```bash
# From project root
claude --plugin-dir ./plugins/focus-task

# Or with absolute path
claude --plugin-dir /path/to/claude-brewcode/plugins/focus-task

# Multiple plugins
claude --plugin-dir ./plugins/focus-task --plugin-dir ./plugins/other
```

**Pros:** Instant changes, no rebuild needed for skills/agents
**Cons:** Must specify path every time

---

## 2. Build Runtime

Required before any installation method.

```bash
cd plugins/focus-task/runtime
npm install
npm run build
```

**Verify build:**
```bash
ls dist/
# Should show: index.js, config.js, context-monitor.js, etc.
```

---

## 3. Local Marketplace Installation (Recommended)

Claude Code requires plugins to be installed from a marketplace. Create a local marketplace for development.

### 3.1 Create Marketplace Manifest

In your repository root, create `.claude-plugin/marketplace.json`:

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "my-local-plugins",
  "description": "Local development plugins",
  "owner": {
    "name": "Your Name"
  },
  "plugins": [
    {
      "name": "focus-task",
      "description": "Infinite task execution with automatic handoff",
      "author": { "name": "Your Name" },
      "source": "./plugins/focus-task",
      "category": "productivity"
    }
  ]
}
```

### 3.2 Add Marketplace

```bash
# Add local marketplace (absolute path)
claude plugin marketplace add /path/to/your/repo

# Verify
claude plugin marketplace list
```

### 3.3 Install Plugin

```bash
# Install from your marketplace
claude plugin install focus-task@my-local-plugins

# Verify
claude plugin list
```

### 3.4 Update After Changes

```bash
# Update marketplace index
claude plugin marketplace update my-local-plugins

# Update plugin
claude plugin update focus-task@my-local-plugins
```

### 3.5 Uninstall

```bash
claude plugin uninstall focus-task@my-local-plugins

# Remove marketplace
claude plugin marketplace remove my-local-plugins
```

---

## 4. NPM Publishing

Publish to NPM registry for public distribution.

### 4.1 Prepare package.json

```bash
cd plugins/focus-task
```

Create/update `package.json`:
```json
{
  "name": "claude-plugin-focus-task",
  "version": "1.0.0",
  "description": "Infinite task execution with automatic handoff for Claude Code",
  "keywords": ["claude-code", "claude-plugin", "task-management", "agents"],
  "author": "Maximus Kochetkov",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/user/claude-brewcode.git",
    "directory": "plugins/focus-task"
  },
  "files": [
    ".claude-plugin/",
    "skills/",
    "agents/",
    "hooks/",
    "templates/",
    "runtime/dist/",
    "runtime/package.json",
    "README.md"
  ],
  "claude-plugin": {
    "name": "focus-task",
    "version": "1.0.0"
  }
}
```

### 4.2 Publish

```bash
# Login to NPM
npm login

# Publish (public)
npm publish --access public

# Publish beta
npm publish --tag beta --access public
```

### 4.3 Install from NPM

```bash
claude plugins install claude-plugin-focus-task

# Specific version
claude plugins install claude-plugin-focus-task@1.0.0

# Beta
claude plugins install claude-plugin-focus-task@beta
```

---

## 5. GitHub Publishing

Publish directly from GitHub repository.

### 5.1 Repository Structure

```
github.com/user/claude-brewcode/
├── .claude-plugin/
│   └── marketplace.json    # Registry manifest
└── plugins/
    └── focus-task/
        └── .claude-plugin/
            └── plugin.json  # Plugin manifest
```

### 5.2 marketplace.json (repo root)

```json
{
  "name": "brewcode",
  "owner": { "name": "Maximus Kochetkov" },
  "plugins": [
    {
      "name": "focus-task",
      "source": "./plugins/focus-task",
      "description": "Infinite task execution with automatic handoff"
    }
  ]
}
```

### 5.3 Install from GitHub

```bash
# Install from default branch
claude plugins install github:user/claude-brewcode/plugins/focus-task

# Install from specific branch
claude plugins install github:user/claude-brewcode/plugins/focus-task#main

# Install from tag/release
claude plugins install github:user/claude-brewcode/plugins/focus-task#v1.0.0
```

---

## 6. Official Anthropic Marketplace

Submit plugin to official Claude Code marketplace.

### 6.1 Requirements

| Requirement | Details |
|-------------|---------|
| Documentation | README.md with usage examples |
| License | MIT, Apache-2.0, or similar |
| Security | No malicious code, sandboxed operations |
| Quality | Tested, working skills/agents |
| Manifest | Valid plugin.json with all fields |

### 6.2 plugin.json (complete)

```json
{
  "name": "focus-task",
  "version": "1.0.0",
  "description": "Infinite task execution with automatic handoff",
  "author": {
    "name": "Maximus Kochetkov",
    "email": "email@example.com",
    "url": "https://github.com/user"
  },
  "repository": "https://github.com/user/claude-brewcode.git",
  "license": "MIT",
  "keywords": ["task", "automation", "agents", "handoff"],
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json"
}
```

**Note:** `repository` must be a string (not an object). Component paths (`skills`, `agents`, `hooks`) must start with `./`.

### 6.3 Submission Process

1. **Fork official registry** (when available):
   ```bash
   git clone https://github.com/anthropics/claude-code-plugins
   ```

2. **Add plugin entry** to registry:
   ```json
   {
     "name": "focus-task",
     "source": "github:user/claude-brewcode/plugins/focus-task",
     "version": "1.0.0",
     "verified": false
   }
   ```

3. **Submit PR** with:
   - Plugin entry in registry
   - Link to source repository
   - Description of functionality

4. **Review process**:
   - Automated security scan
   - Manual code review
   - Functionality testing

5. **After approval**:
   ```bash
   # Users can install via
   claude plugins install focus-task
   ```

---

## 7. Project-Local Plugin

Include plugin within a specific project.

### 7.1 Structure

```
my-project/
├── .claude/
│   └── plugins/
│       └── focus-task/    # Plugin here
└── src/
```

### 7.2 settings.json

```json
{
  "plugins": [
    { "type": "local", "path": ".claude/plugins/focus-task" }
  ]
}
```

### 7.3 Auto-load on project open

Plugin loads automatically when opening project with Claude Code.

---

## 8. SDK Integration

Use plugin programmatically via Claude Agent SDK.

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const response = query({
  prompt: "Create a task for implementing auth",
  options: {
    plugins: [
      { type: 'local', path: './plugins/focus-task' }
    ]
  }
});
```

---

## 9. Docker/CI Environment

### 9.1 Dockerfile

```dockerfile
FROM node:20-slim

# Install Claude Code
RUN npm install -g @anthropic-ai/claude-code

# Copy plugin
COPY plugins/focus-task /app/plugins/focus-task

# Build runtime
WORKDIR /app/plugins/focus-task/runtime
RUN npm install && npm run build

# Set plugin path
ENV CLAUDE_PLUGIN_PATH=/app/plugins/focus-task

WORKDIR /workspace
ENTRYPOINT ["claude", "--plugin-dir", "/app/plugins/focus-task"]
```

### 9.2 GitHub Actions

```yaml
- name: Setup Claude Code with Plugin
  run: |
    npm install -g @anthropic-ai/claude-code
    cd plugins/focus-task/runtime && npm install && npm run build

- name: Run with Plugin
  run: claude --plugin-dir ./plugins/focus-task -p "Analyze codebase"
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Plugin not found | Check path, ensure `.claude-plugin/plugin.json` exists |
| Skills not showing | Run `/help`, check skill `user-invocable: true` |
| Runtime error | Rebuild: `cd runtime && npm run build` |
| Permission denied | Check file permissions, run `chmod -R 755 plugins/` |
| SDK not found | Run `npm install` in runtime directory |
| Invalid input errors | Run `claude plugin validate <path>` to check manifest |

**Validate plugin before install:**
```bash
claude plugin validate ./plugins/focus-task
```

**Debug mode:**
```bash
CLAUDE_DEBUG=1 claude --plugin-dir ./plugins/focus-task
```

**Common plugin.json errors:**
- `repository: Invalid input` → must be string, not object
- `agents: Invalid input` → agents field not supported in plugins (use skills instead)
- `Unrecognized key` → remove unsupported fields like `claude-code`

---

## Version Compatibility

| Claude Code | Plugin | Notes |
|-------------|--------|-------|
| 1.0.x | 1.0.x | Full support |
| 0.x | - | Not supported |

---

## File Checklist

Before distribution, verify:

- [ ] `.claude-plugin/plugin.json` - valid JSON
- [ ] `README.md` - usage documentation
- [ ] `skills/*/SKILL.md` - all skills have frontmatter
- [ ] `agents/*/agent.md` - all agents have frontmatter
- [ ] `runtime/dist/` - built TypeScript
- [ ] `hooks/hooks.json` - valid JSON (if using hooks)
- [ ] `templates/` - all templates present
