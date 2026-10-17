# Terminal demo GIFs

Scenario JSON -> 800 px animated Claude Code terminal GIF in `assets/demos/<name>.gif` (one Chrome page, 20 fps virtual, identical frames merged).

Record: `cd "$(mktemp -d)" && npm i playwright-core@1.64.0 --no-package-lock && node <repo>/assets/demos/src/record.mjs <name|all> [--preview <t>] [--out dir] [--keep]`
Text gates only (no Chrome, CI-safe): `node assets/demos/src/record.mjs <name|all> --check`. Needs ffmpeg, gifsicle, Chrome, JetBrains Mono. Rc 0 = every gate PASS.

Gates: bytes (<=5 MB hard, target 2.5 MB: palette/lossy ladder), width 800, duration <=20.5 s, seam SSIM first/last >=0.985, page errors 0, no clipped rows, rows <=94 cols, no Cyrillic, banned-claim (`forbid` regexes minus `forbidAllow` strings), source-strings (engine literals found in `cc-strings.capture.txt`, a real CC 2.1.300 capture), agent-stats format, facts (`facts[{src,has}]` still in the real skill/agent files; stale = re-record).

Scenario `scenarios/<name>.json` (full example: `scenarios/superreview.json`); every `at`/`until`/`doneAt`/`resultAt` is scenario seconds:
- Top level: `name`, `duration` (<=20, last 0.6 s = end card), `meta{version,model,cwd,statusLine,footer,placeholder,rows}`, `chapters[{at,label}]` (bar `n/N`), `captions[{at,text}]` (first = frame 0; plain text), `events[]`, `facts[]`, `forbid[]`, `forbidAllow[]`, `layout.maxCols`, `targetBytes`.
- Every block event takes `gap` (blank rows before, default 1; use 0 to stack tool rows).
- `type {at,text,cps=16}` prompt typing; `key {at,glyph,word,hold=0.9}` keycap badge; `submit {at}` sends the last typed text to the transcript.
- `print {at,lines,reveal=0,bullet}` lines: `"text"` | `["text","dim|ok|gold|warn|err|b|wt"]` | `{segs:[[text,cls],..]}`; `bullet` = assistant `⏺` on line 1; `reveal` = seconds per line.
- `tool {at,name,arg,resultAt,result[]}` `⏺ Name(arg)`, `Running…` until `resultAt`, then `⎿` result lines; `fold {at,lines}` `… +N lines`.
- `agent {at,agent,desc,ticks[[t,"Tool(arg)"]],doneAt,stats}` stats exactly `N tool uses · Xk tokens · Ys`; `spin {at,until,verb,secs[from,to],tokens,doneLine}` trailing spinner row.
- `card {at,title,tiles[{label,to,dec,suffix,sub,cls}|{label,text,..}],verdict{label,text,cls},note}` one final summary card (4 tiles max, count-up, `cls` gold|ok|warn; exactly one per scenario, >=1 s on screen); `print` also takes `kv` (gold-ish `Label:` colouring; `true` = orange, or a class) and inline `[[cls|text]]` markup; `skip` takes `label` (chip text override); every `submit` needs a `key` within 0.4 s before (keycap gate).
- `hl {at,hold=1.5,match}` gold pulse on a substring; `skip {at,until,factor}` title-bar chip `⏩ Nx` (mark every compressed span); `clear {at}` empties the screen (put it at `duration-0.6` so the loop closes).
- Write only what the real skill prints (copy lines from its SKILL.md/template, list them in `facts`); never claim auto-fixing, never show secrets or real hosts.
- Caption "Illustrative animation" goes in the README embed under the GIF, not in the GIF. Docs site: copy `assets/demos/*.gif` to `web/docs/public/demos/` at build time (planned, not committed twice).
- Files: `shell.html` + `terminal.css` (window), `engine.js` (pure `model(S,t)` + DOM render), `manifest.json` (generated: GIF bytes/sha, source hashes, tool versions). Source hashes skip the release stamps `bump-version.sh` rewrites (`brewcode-meta:` line, frontmatter `version`/`content_version`/`generated_by`/`last_updated`), so a version bump alone never fails `manifest-hash`.
