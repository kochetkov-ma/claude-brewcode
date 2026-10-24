#!/usr/bin/env bash
# Cheap release contracts; integration, tokenizer, mod and build tests remain in manual Tests.
set -euo pipefail
cd "$(dirname "$0")/../.."
shopt -s nullglob

node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const marketplace = read('.claude-plugin/marketplace.json');
const version = marketplace.metadata.version;
assert.match(version, /^\d+\.\d+\.\d+$/, 'marketplace version must be stable X.Y.Z');
for (const plugin of marketplace.plugins) {
  assert.equal(plugin.version, version, `marketplace entry ${plugin.name} must match the release version`);
  assert.equal(read(`${plugin.source}/.claude-plugin/plugin.json`).version, version,
    `${plugin.name} manifest must match the release version`);
}
if (process.env.GITHUB_REF_TYPE === 'tag') {
  assert.equal(process.env.GITHUB_REF_NAME, `v${version}`, 'release tag must match every plugin manifest');
}
console.log(`Release versions match: ${version}`);
NODE

CLAUDE_CONFIG_DIR="$(mktemp -d)"
export CLAUDE_CONFIG_DIR
for target in . ./brewcode ./brewdoc ./brewtools ./brewui ./brewmod-*; do
  claude plugin validate --strict "$target"
done

skill_log="$(mktemp)"
for skill in brewcode/skills/*/ brewdoc/skills/*/ brewtools/skills/*/ brewui/skills/*/ brewmod-*/skills/*/ skills/*/ openclaw/*/ .claude/skills/*/; do
  [ -f "${skill}SKILL.md" ] || continue
  if ! sh brewcode/skills/skills/scripts/validate-skill.sh "${skill%/}" > "$skill_log" 2>&1; then
    cat "$skill_log"
    exit 1
  fi
done

for file in brew*/skills/*/SKILL.md skills/*/SKILL.md openclaw/*/SKILL.md; do
  [ "$(awk 'NR>1&&/^---$/{print p;exit}{p=$0}' "$file")" = 'license: MIT' ] || {
    echo "::error file=$file::Last frontmatter key must be license: MIT"; exit 1;
  }
done
for file in brew*/agents/*.md; do
  case "$(tail -n 1 "$file")" in
    *'SPDX-License-Identifier: MIT'*) ;;
    *) echo "::error file=$file::Missing SPDX license footer"; exit 1 ;;
  esac
done
for file in brew*/hooks/*.mjs brewmod-*/hooks/*.ts brew*/skills/*/assets/*.mjs brewtools/hooks/lib/manager-state.mjs; do
  grep -qxF '// SPDX-License-Identifier: MIT' "$file"
  grep -qxF '// Copyright (c) 2025-2026 Maksim Kochetkov' "$file"
done

bash .github/scripts/check-shards.sh .github/workflows/tests.yml
node .claude/scripts/check-install-blocks.mjs
bash .claude/skills/docs/scripts/check-links.sh
node .codex/scripts/validate-compat.mjs
node .codex/scripts/validate-setup.mjs
