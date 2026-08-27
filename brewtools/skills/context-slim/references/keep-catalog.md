# Keep Catalog -- invariants that survive compression byte-exact

Companion to `drop-catalog.md`. Every class below is a **refusal surface**: if a token of this class
is in the original and absent from the rewrite, the rewrite is restored, not warned about. Dedup that
collapses repeats is fine -- set semantics, the LAST occurrence is what must survive.

Sections: Invariant classes -> `crit_tokens()` evidence -> Coverage map -> Drop-in extension.

## Invariant classes

| # | Class | Example from this repo | Loss mode if dropped |
|---|-------|------------------------|----------------------|
| 1 | Exact numbers / counts | `STAMPED_FILES` = **44**, `VERSIONED_DOCS` = **7** (`CLAUDE.md:65-66`) | Silent under-processing |
| 2 | Versions, incl. suffixed | `4.0.6+codex.<cachebuster>`, `'semble[mcp]==0.5.5'` (`brewcode/skills/semble-setup/scripts/lib/semble-common.sh:6-7`), `CC >= 2.1.233` | Wrong pin, validation fails |
| 3 | File paths + globs | `brew*/skills/*-setup/SKILL.md`, `.claude/settings.local.json` | Command edits the wrong tree |
| 4 | Bare filenames (no slash) | `settings.json`, `hooks.json`, `marketplace.json` | Ambiguous target |
| 5 | Env-var keys | `CLAUDE_CODE_ENABLE_TODO_TOOLS`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PROJECT_DIR` | Feature silently off |
| 6 | Backtick literals | `` `enabled !== true` ``, `` `--allow-dirty` ``, `` `c.enabled !== false` `` | Inverted semantics |
| 7 | Negations -- the `!=` operator | `!=edit versions manually`, `!=revert without CONF` | Prohibition becomes permission |
| 8 | Negations -- lowercase prose | "never", "do not", "must not", "avoid", "unless", "except", "only" | Same, and `crit_tokens()` misses these |
| 9 | URLs | `https://doc-claude.brewcode.app/{PLG}/{skills\|agents}/{name}/` | Dead reference |
| 10 | Command lines | `claude plugin marketplace update claude-brewcode` | Unrunnable instruction |
| 11 | Thresholds / ratios / comparisons | `>= 95%`, `<= 30 lines`, `2/3 consensus`, `~69ms`, `hardStopRatio` | Gate loosens invisibly |
| 12 | Names / identities | **Maksim Kochetkov**, `kochetkov-ma`, `!=mkochetkov_tfin` | Wrong account, wrong spelling |
| 13 | Stated user preferences | "no co-author/AI attribution", "!=SQL comments", "run_in_background:false" | Preference regression |
| 14 | Cyrillic in skill mode tables | `лёгкая`, `сожми`, `для контекста`, `максимально` (mode keyword columns) | RU prompts stop resolving a mode |
| 15 | Scope qualifiers | "every section, not just the first", "ALL 6 JSON files", "all 27 SKs" | Partial application (rules-review L.8) |
| 16 | Dates that anchor a verification | "verified 2026-08-10", "Verified 11/11" | Staleness undetectable |

## What `crit_tokens()` covers today

Source: `brewtools/skills/text-optimize/scripts/text-guard.sh:50-62`, verbatim:

```bash
# The 100% sub-gate alphabet: numbers/versions, slash-bearing paths, `!=`
# prohibitions, and ALL-CAPS modal keywords. Set semantics on purpose -
crit_tokens() {                                                        # L53
    grep -oE '[0-9]+(\.[0-9]+)*' "$f" | sed 's/^/num:/' || true        # L56
    grep -oE '[A-Za-z0-9_@.-]*/[A-Za-z0-9_@./-]+' "$f" | sed -E 's/[.,;:]+$//; s/^/path:/' || true   # L58
    grep -oE '!=[A-Za-z0-9_./-]*' "$f" | sed -E 's/[.,;:]+$//; s/^/neg:/' || true                    # L59
    grep -oE 'NEVER|ALWAYS|MUST NOT|DO NOT|REQUIRED|MANDATORY' "$f" | sed 's/^/kw:/' || true         # L60
  } | sort -u                                                          # L61
```

Four classes only. Probed against those exact expressions on this repo's own strings:

| Probe input | `crit_tokens()` output | Gap |
|-------------|------------------------|-----|
| `4.0.6+codex.7` | `num:4.0.6`, `num:7` | `+codex` suffix lost; two unrelated set members |
| `brew*/skills/*/SKILL.md` | `path:/skills/`, `path:/SKILL.md` | every `*` lost; `brew` prefix lost |
| `https://doc-claude.brewcode.app/x/` | `path://doc-claude.brewcode.app/x/` | scheme lost (`http` vs `https` undetectable) |
| `settings.json` | (nothing) | slash-less filename invisible |
| `CLAUDE_CODE_ENABLE_TODO_TOOLS` | (nothing) | env keys invisible |
| `never edit this` / `don't push` | (nothing) | lowercase negation invisible; `kw:` is ALL-CAPS only |
| `2/3` | `path:2/3` | covered (accidentally, via the path regex) |

## Coverage map

`crit_tokens()` column names the exact prefix that catches the class today; `L##` cites the line above.

| # | Class | Matcher (ERE) | Covered by `crit_tokens()` | NEW? |
|---|-------|---------------|----------------------------|------|
| 1 | Exact numbers | `[0-9]+(\.[0-9]+)*` | `num:` L56 -- identical expression | no |
| 2 | Versions with suffix | `[0-9]+(\.[0-9]+)+([+-][A-Za-z0-9][A-Za-z0-9.]*)?` | `num:` L56 truncates at the `+` | **YES** `ver:` |
| 3 | Paths with `/` | `[A-Za-z0-9_@.-]*/[A-Za-z0-9_@./-]+` | `path:` L58 -- identical | no |
| 4 | Globs | `[A-Za-z0-9_.{}/-]*\*+[A-Za-z0-9_.{}*/-]*` | `path:` L58 has no `*` in its class -> fragments only | **YES** `glob:` |
| 5 | Bare filenames | `[A-Za-z0-9_.-]+\.(md\|mdx\|json\|mjs\|js\|ts\|sh\|ya?ml\|toml\|py\|txt)` | none -- L58 requires a `/` | **YES** `file:` |
| 6 | Env-var keys | `[A-Z][A-Z0-9]*(_[A-Z0-9]+){2,}` | none -- no digits, no slash, not in L60's list | **YES** `env:` |
| 7 | Backtick literals | `` `[^`]+` `` | none | **YES** `tick:` |
| 8 | `!=` operator | `!=[A-Za-z0-9_./-]*` | `neg:` L59 -- identical | no |
| 9 | Lowercase negations | `(never\|do not\|don.t\|must not\|avoid\|refuse\|forbidden\|unless\|except\|only)` | none -- `kw:` L60 matches ALL-CAPS literals only | **YES** `lneg:` |
| 10 | ALL-CAPS modals | `NEVER\|ALWAYS\|MUST NOT\|DO NOT\|REQUIRED\|MANDATORY` | `kw:` L60 -- identical | no |
| 11 | URLs | `https?://[^ )>"'`]+` | `path:` L58 partially (scheme stripped) | **YES** `url:` |
| 12 | Command lines | (no single matcher; covered transitively by `tick:` + `path:` + `file:`) | partial via `path:` L58 | no (derived) |
| 13 | Thresholds / comparisons | `[<>]=?[[:space:]]*[0-9]+(\.[0-9]+)?%?` | `num:` L56 keeps the number, drops the operator | **YES** `cmp:` |
| 14 | Ratios | `[0-9]+/[0-9]+` | `path:` L58 (a ratio is slash-bearing) | no |
| 15 | Names / slugs | `[a-z][a-z0-9]*(-[a-z0-9]+)+` | none for slugs; capitalised names never covered | **YES** `slug:` |
| 16 | Cyrillic | `[А-Яа-яЁё]+`, run under a UTF-8 locale (see Locale hazard) | none -- `text-guard.sh:17` exports `LC_ALL=C` | **YES** `cyr:` |
| 17 | Scope qualifiers | judgement, not a matcher -- rules-review **L.8** owns it | no | no |

## Drop-in extension

Ten NEW matchers. Same set semantics, same `sort -u`, same `comm -23` diff as `crit_tokens()`.
`cyr:` overrides the locale for that one `grep` only; the outer `sort`/`comm` stay under `LC_ALL=C`,
which `text-guard.sh:17` exports for `comm(1)` collation.

### Locale hazard -- measured, not assumed

The failure is a silent **over**-count, not a silent zero. Self-contained fixture, 9 Cyrillic runs,
measured on darwin 24.6.0:

```bash
printf 'сожми контекст на 40%%, глобальный тоже\nужми правила ещё сильнее\n' > /tmp/cyr.txt
python3 -c "import re;print(len(re.findall(r'[А-Яа-яЁё]+',open('/tmp/cyr.txt',encoding='utf-8').read())))"  # 9
for L in C en_US.UTF-8; do LC_ALL=$L /usr/bin/grep -oE '[А-Яа-яЁё]+' /tmp/cyr.txt | wc -l; done
```

| Binary | `LC_ALL=C` | `LC_ALL=en_US.UTF-8` | Ground truth 9 |
|--------|-----------|----------------------|----------------|
| `/usr/bin/grep` (BSD) | **17** | 9 | ~1.9x over-match here; the class degrades to a byte range, so one multi-byte word yields several "matches". The factor scales with content -- a 38-run file read 137 |
| Claude Code's Bash-tool `grep` (ugrep 7.5.0, injected as a zsh function) | 9 | 9 | locale-independent, correct |
| `rg` (`/opt/homebrew/bin/rg`) | 9 | 9 | locale-independent, correct |

The over-count factor is a property of the text, not a constant -- never derive a count from it, only
the conclusion that `LC_ALL=C` + BSD `grep` is unusable for `cyr:`.

Two consequences that decide the `cyr:` guidance:

1. **The ugrep shadow does not reach a script.** It is a zsh function in the Bash tool's shell only --
   a `bash foo.sh` child resolves the real `/usr/bin/grep`. `crit_tokens_ext()` runs inside such a
   script, so it gets the BSD binary and the over-count is live. The `LC_ALL="${CYR_LOCALE:-en_US.UTF-8}"`
   prefix below is REQUIRED, not defensive.
2. **Over-count is not benign.** `crit_tokens()` uses set semantics + `comm -23`; a byte-split match
   produces token members that exist in neither the original nor the rewrite as real words, so an
   unchanged Cyrillic cell can appear on both sides while a genuinely deleted one hides among the
   fragments. Never compare a `cyr:` set produced under `LC_ALL=C` against one produced under UTF-8 --
   both sides of a `comm` must use the same locale, and it must be the UTF-8 one.

```bash
crit_tokens_ext() {
  local f="$1"
  {
    grep -oE '[0-9]+(\.[0-9]+)+([+-][A-Za-z0-9][A-Za-z0-9.]*)?' "$f" | sed 's/^/ver:/' || true
    grep -oE '[A-Za-z0-9_.{}/-]*\*+[A-Za-z0-9_.{}*/-]*' "$f" | sed 's/^/glob:/' || true
    grep -oiE '[A-Za-z0-9_.-]+\.(md|mdx|json|mjs|js|ts|sh|ya?ml|toml|py|txt)' "$f" | sed 's/^/file:/' || true
    grep -oE '[A-Z][A-Z0-9]*(_[A-Z0-9]+){2,}' "$f" | sed 's/^/env:/' || true
    grep -oE '`[^`]+`' "$f" | sed 's/^/tick:/' || true
    grep -oiE "\b(never|do not|don'?t|must not|avoid|refuse|forbidden|unless|except|only)\b" "$f" | sed 's/^/lneg:/' || true
    grep -oE 'https?://[^ )>"]+' "$f" | sed -E 's/[.,;:]+$//; s/^/url:/' || true
    grep -oE '[<>]=?[[:space:]]*[0-9]+(\.[0-9]+)?%?' "$f" | sed 's/^/cmp:/' || true
    grep -oE '[a-z][a-z0-9]*(-[a-z0-9]+)+' "$f" | sed 's/^/slug:/' || true
    LC_ALL="${CYR_LOCALE:-en_US.UTF-8}" grep -oE '[А-Яа-яЁё]+' "$f" | sed 's/^/cyr:/' || true
  } | sort -u
}
```

> `lneg:` and `slug:` are high-frequency by design: they make near-total prose deletion fail the
> gate, which is the intended refusal. Compression that only reorders and dedups keeps every member.

> **Gate alphabet != drop-decision alphabet.** Everything above is evaluated with SET semantics over a
> WHOLE FILE at verify time. It is not a per-line veto list. `slug:` and bare capitalised words in
> particular fire on nearly every line, so feeding them into `drop-catalog.md`'s decision rule as
> line-level KEEPs makes that rule inert (measured 86%/73%/94% whole-line keep rates). The decision
> rule therefore consumes only the HARD classes, at CLAUSE granularity -- see
> `drop-catalog.md`, "Gate classes are not drop vetoes".
