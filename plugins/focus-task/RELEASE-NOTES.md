# Release Notes

## Format

```
## vX.Y.Z (YYYY-MM-DD)

### Added | Changed | Fixed | Removed | Deprecated | Security

- **Feature/Component** — description
  - Details if needed

### Updated Files (optional)
### Known Issues (optional)
### Breaking Changes (if any)
```

## Protocol

| Rule | Description |
|------|-------------|
| **Versioning** | SemVer: MAJOR.MINOR.PATCH |
| **MAJOR** | Breaking changes, incompatible API |
| **MINOR** | New features, backward compatible |
| **PATCH** | Bug fixes, documentation |
| **Order** | Newest first |
| **Sources** | Link to issues/docs when relevant |

---

## v2.0.43 (2026-01-30)

### Added

- **Setup `link` mode** — quick symlink refresh without full setup
  - Usage: `/focus-task:setup link`
  - Use after plugin update to refresh `~/.claude/skills/focus-task-*` symlinks
- **RELEASE-NOTES.md** — changelog with format and protocol

### Changed

- **CLAUDE.md** — added requirement to update RELEASE-NOTES.md before plugin version bump

### Updated Files

| File | Change |
|------|--------|
| `skills/setup/SKILL.md` | Added `link` mode with Mode Detection section |
| `RELEASE-NOTES.md` | New file |

---

## v2.0.42 (2026-01-30)

### Fixed

- **Rules frontmatter documentation** — corrected invalid fields
  - `globs` → NOT supported (was incorrectly used)
  - `alwaysApply` → NOT supported (Cursor field, not Claude Code)
  - `paths` → Only valid field for conditional loading

### Updated Files

| File | Change |
|------|--------|
| `skills/rules/SKILL.md` | Added frontmatter reference section |
| `agents/ft-knowledge-manager.md` | Added rules frontmatter reference |

### Known Issues

- **Bug #16299**: Lazy loading not working — all rules load at session start regardless of `paths`
  - Source: [github.com/anthropics/claude-code/issues/16299](https://github.com/anthropics/claude-code/issues/16299)

### Documentation Sources

| Topic | URL |
|-------|-----|
| Official Rules Docs | [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory.md#path-specific-rules) |
| YAML Syntax Fix | [Issue #13905](https://github.com/anthropics/claude-code/issues/13905) |
| Lazy Loading Bug | [Issue #16299](https://github.com/anthropics/claude-code/issues/16299) |

---

## v2.0.41 and earlier

See git history for previous changes.
