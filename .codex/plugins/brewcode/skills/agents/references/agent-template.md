# Native Codex agent template

Create one writable project/personal `.toml` role, preserve existing metadata/routing, and validate parsed values. Template examples are TOML, not a second manifest format.

```toml
name = "{name}"
description = "{description}"
developer_instructions = """
Own the requested domain and named paths; exclude adjacent work.
Load applicable AGENTS.md, named rules and relevant repository references before implementation.
You are not alone: preserve concurrent edits; never revert another owner's work.
Return missing material decisions to main; do not re-delegate or self-accept.
Verify the changed behavior with the narrowest reliable checks.
Return a concise verdict and file:line evidence; file bulky evidence and return its path.
"""
```

Only when the active project/user policy requires an explicit model, add supported settings:

```toml
model = "gpt-6.1-sol"
model_reasoning_effort = "high"
```

Otherwise omit these keys to inherit. Preserve existing fixed-role settings and only use efforts supported by that model/client. Do not insert `model = "inherit"`.

Description policy is in agent-frontmatter-fields.md. Role instructions cover mission, domain, owned scope/exclusions, must-load references, relevant self-check and colleague handoff. Code/script/schema/infrastructure/config writers also state current-scale scope fit, one simplification pass, and etalon-first: before writing a class, module, or test, find the closest well-built existing one in this repository and take its principles, in addition to conventions, rules, and documentation, never instead of them. Review/research-only roles retain their appropriate read-only scope instead.

Teams-setup domain agents use exactly that workflow's six ordered headings, shared team reference and budgets. The shared superreview pipeline alone owns intent-guard. Generic authoring must not overwrite either profile.

```bash
python3 - <<'PY' ".codex/agents/{name}.toml"
import pathlib, sys, tomllib
file = pathlib.Path(sys.argv[1])
data = tomllib.loads(file.read_text())
required = {"name", "description", "developer_instructions"}
for key in required:
    assert isinstance(data.get(key), str) and data[key].strip(), f"{file}: {key} must be nonempty text"
supported = required | {"model", "model_reasoning_effort", "sandbox_mode", "mcp_servers", "skills"}
assert set(data) <= supported, f"{file}: verify additional config keys against current official schema"
assert data.get("model") != "inherit", f"{file}: omit model to inherit"
for key in ("model", "model_reasoning_effort"):
    assert key not in data or isinstance(data[key], str) and data[key].strip(), f"{file}: {key} must be nonempty text"
assert "sandbox_mode" not in data or data["sandbox_mode"] in {"read-only", "workspace-write", "danger-full-access"}
assert "mcp_servers" not in data or isinstance(data["mcp_servers"], dict)
if "skills" in data:
    assert isinstance(data["skills"], dict) and set(data["skills"]) <= {"config"}
    assert isinstance(data["skills"].get("config", []), list)
    for entry in data["skills"].get("config", []):
        assert isinstance(entry, dict) and set(entry) <= {"path", "enabled"}
        assert isinstance(entry.get("path"), str) and entry["path"].strip()
        assert isinstance(entry.get("enabled"), bool)
print(f"{file}: TOML and bounded authoring schema passed")
PY
```

This local check deliberately accepts the documented subset, not every session setting. If another supported key is needed, verify it with the official schema and extend that role's explicit validation; never bypass a rejected key silently.
