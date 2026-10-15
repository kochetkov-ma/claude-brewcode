# placeholders.gif source

`placeholders.html` renders `#hero` at any `?t=<s>` from `placeholders.story.js` (storyboard v2: beats, keycaps, captions, `⏩` chips; edit by hand) and `placeholders.data.js` (screens; generated, never edit). Every screen is a real tmux capture in `placeholders.captures/`; a missing one renders as `TODO-CAPTURE:<beat>` and keeps `--check` red.

| Step | Command (repo root unless noted) |
|---|---|
| Capture | cwd `~/brewery`, `unset CLAUDECODE`, `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, a mod copy whose global layer is a scratch dir: `tmux new -d -s ph -x 88 -y 40 'claude --setting-sources project,local --strict-mcp-config --settings {"tui":"default"} --plugin-dir <mod>'` (main-screen TUI; no `--debug`; `--safe-mode` disables plugins; tmux `focus-events on`). Per key `tmux send-keys -t ph <key>`, then `bash assets/brewmods/src/capture.sh ph <screen>` (names: `screens` in the story) |
| Embed | `node assets/brewmods/src/record-gifs.mjs placeholders --embed` |
| Preview | From the record dir: `node <repo>/assets/brewmods/src/record-gifs.mjs placeholders --preview 7.5` (PNG in the tmp dir) |
| Record | `cd "$(mktemp -d)" && npm i playwright-core@1.64.0 --no-package-lock && node <repo>/assets/brewmods/src/record-gifs.mjs placeholders`: writes `../placeholders.gif`, copies it to `web/docs/public/brewmods/`, writes `manifest.json`, prints the still path (t=7.5). `--out <dir>` = test run that touches nothing |
| Check | `node assets/brewmods/src/record-gifs.mjs placeholders --check` (node only); rc 0 = no FAIL |

Record needs ffmpeg, gifsicle, Google Chrome and network (Google Fonts); about 80 s.

`--check` gates: loop 30-38 s; keycaps only from the macOS allow-list (`⌃X ctrl+x`, `⇥ tab`, `⏎ enter`, `⎋ esc`, arrows, `⌫ delete`, `⇧⇥ shift+tab`, `⌃O ctrl+o`); no `hover`, `2.1.296`, `Backspace`, `⌘`, Cyrillic; no `TODO-CAPTURE`; every story `facts` string on its captured screen; data equal to a fresh `--embed`; captures 88x40, ANSI text equal to the plain capture, no home/tmp paths, debug or `Plugins updated` rows, no old dialog wording (`(global) as drafted`, `do not ask where`), no error rows (`no matches found`, `command not found`, Traceback, `*Error`; WARN on `unknown placeholder`); GIF 30-38 s, 800 px wide, at most 5 MB (WARN above 3.5 MB), recorded from the current sources (`manifest.json`); one sha256 for the repo and docs copies (WARN while `../brewcode-app/site/main/public/mods/` differs, override `BREWCODE_APP_DIR`). Record adds seam SSIM >= 0.985 and 0 page errors.

Rules: draw only captured rows and proven keys; if the real flow needs another key, add its keycap and its capture. Typing frames reuse the screen captured after the last typed key, prompt row cut to the typed prefix. Set each `⏩` factor from the real elapsed time.
