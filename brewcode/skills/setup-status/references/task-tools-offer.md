# setup-status — the task-tools offer (Phase 4)

Read in Phase 4 only on a bare `off` verdict. Path tokens in these fences are literal: fill them as `SKILL.md` "Running the fences" says.

Only when the verdict is a bare `off` and Phase 1c said the gate applies or is assumed, this is Q2 of
the run's one bundled `AskUserQuestion` call (`SKILL.md` "The one question"), beside Q1 when Q1 applies,
never a call of its own — header `Task tools`, three options in this order:

| Option | Effect |
|--------|--------|
| `Global (<GLOBAL dir>) (Recommended)` | writes `<GLOBAL>/settings.json` — every project of this Claude Code profile |
| `This project only` | writes `<ROOT>/.claude/settings.json` — this repo only |
| `Leave off` | report only, change nothing: print the manual line and stop |

On `Global` or `This project only` run the merge with `node` via Bash, never `Write`/`Edit`: the
config dir is a protected path for the editing tools, and the block read-merges where a whole-file
write would overwrite. Pass `global` or `project` as the single argument:

**EXECUTE** using Bash tool:

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
node --input-type=module -e '
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const scope = process.argv[1];
const G = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const file = scope === "global"
  ? path.join(G, "settings.json")
  : path.join(process.cwd(), ".claude", "settings.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
function lock(f) {
  const l = `${f}.lock`, w = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 0; i < 100; i++) {
    try { fs.mkdirSync(l); return () => { try { fs.rmdirSync(l); } catch {} }; }
    catch (e) {
      if (e.code !== "EEXIST") throw e;
      try { if (Date.now() - fs.statSync(l).mtimeMs > 30000) fs.rmdirSync(l); } catch {}
      Atomics.wait(w, 0, 0, 100);
    }
  }
  console.error(`ABORT ${l} is held by another installer; nothing was written`); process.exit(1);
}
process.on("exit", lock(file));
let cfg = {};
if (fs.existsSync(file)) {
  try { cfg = JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch { cfg = null; }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) { console.error(`REFUSED ${file} is not a JSON object — fix it by hand`); process.exit(1); }
}
cfg.env = { ...(cfg.env || {}), CLAUDE_CODE_ENABLE_TODO_TOOLS: "1" };
const tmp = `${file}.tmp-${process.pid}`;
fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + "\n");
fs.renameSync(tmp, file);
console.log(`WROTE ${file} env.CLAUDE_CODE_ENABLE_TODO_TOOLS=1`);
' global && echo "✅" || echo "❌ FAILED"
```

Every other key survives: the merge parses, adds one key under `env`, and renames a temp file over
the original, so a crash mid-write leaves the old file intact. It holds the `settings.json.lock` dir
the other setup skills' merges take (`mkdir`; held 10 s -> abort with nothing written, older than
30 s -> stale, broken) over the whole read-modify-write, so a concurrent setup merge is not erased.
An unparsable settings file is refused, never rewritten: say so and hand the path back.

Then report, in two lines and no more:

```
Task tools: enabled — env.CLAUDE_CODE_ENABLE_TODO_TOOLS=1 in <the file that was written>.
Takes effect in new sessions, and usually in this one — the tool roster is re-read per request.
```

If the user picked `Leave off`, print the manual route instead and move on:
`add "env": { "CLAUDE_CODE_ENABLE_TODO_TOOLS": "1" } to <GLOBAL>/settings.json`.
