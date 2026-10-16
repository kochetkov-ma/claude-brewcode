# brewmods GIF sources

One renderer, one story per GIF. `render.html?story=<name>` renders `#hero` (terminal-only frame: title bar with chapter and progress, the captured terminal, a caption bar) at any `&t=<s>` from `<name>.story.js` (storyboard: beats, keycaps, captions, `⏩` chips, `facts`, `bottle`, optional `window`; edit by hand) and `<name>.data.js` (screens; generated, never edit). `&bottle=1` renders `#bottle`, the ASCII fermenter alone, for the README image above the GIF. Every screen is a real tmux capture in `<name>.captures/`; a missing one renders as `TODO-CAPTURE:<beat>` and keeps `--check` red. Output: `../<name>.gif`, `../<name>-still.png`, `../<name>-bottle.gif`, `<name>.manifest.json`.

| Story | GIF | Terminal | Loop |
|---|---|---|---|
| `placeholders` | hero, usage first: `++` list, `↑` `⇥` insert `++r`, the band, send; one quick `/placeholders global add ++db`; plan mode: caret on `++db`, send; `++db ++m` with the teal plan part; `++/` | 88x30 | 35.6 s |
| `placeholders-full-text` | `++m` cut row -> `++m?` -> Enter fills `/placeholders show ++m` -> Enter prints | 88x30 | 24 s |
| `plan-effort` | Shift+Tab into plan mode, first prompt: toast + teal row, Shift+Tab out | 88x22 | 23 s |

| Step | Command (repo root unless noted) |
|---|---|
| Capture | cwd `~/brewery`, `unset CLAUDECODE`, `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, mod copies whose global layer is a scratch dir: `tmux new -d -s ph -x 88 -y 30 'claude --setting-sources project,local --strict-mcp-config --permission-mode default --allowedTools Bash Read Grep Glob --settings {"tui":"default","promptSuggestionEnabled":false,"spinnerTipsEnabled":false} --plugin-dir <mod>...'` (main-screen TUI; no ghost suggestion or spinner tip rows; no approval dialog mid-turn; no `--debug`; `--safe-mode` disables plugins; tmux `focus-events on`). Per key `tmux send-keys -t ph <key>`, then `bash assets/brewmods/src/capture.sh ph <screen> assets/brewmods/src/<name>.captures` (names: `screens` in the story). `PH_SCROLL_UP=<n>` = the view `n` rows up the scrollback (a scrolled terminal, caret hidden); `PH_TMUX_SOCKET` = `tmux -L` name |
| Embed | `node assets/brewmods/src/record-gifs.mjs <name> --embed` |
| Preview | From the record dir: `node <repo>/assets/brewmods/src/record-gifs.mjs <name> --preview 7.5` (PNG in the tmp dir; `--width <px>` for another size) |
| Record | `cd "$(mktemp -d)" && npm i playwright-core@1.64.0 --no-package-lock && node <repo>/assets/brewmods/src/record-gifs.mjs <name>`: writes `../<name>.gif`, `../<name>-still.png` (frame at `still`), `../<name>-bottle.gif`, copies the GIF and the still to `web/docs/public/brewmods/`, writes `<name>.manifest.json`. `--out <dir>` = test run that touches nothing |
| Check | `node assets/brewmods/src/record-gifs.mjs <name> --check` (node only); rc 0 = no FAIL |

Record needs ffmpeg, gifsicle, Google Chrome and network (Google Fonts); about 70 s per story.

Size: the frame is the terminal window, `cols x 8.4 + 30` CSS px wide (88 cols: 768), drawn at 2x and saved 1152 px wide (1.5x, sharp on HiDPI at the 700-800 px the docs and GitHub show it). Text reads at 13-15 px there. The docs rule `.prose p[align='center'] img { max-height: min(55vh, 480px) }` shrinks a 30-row frame to 540 px wide: lift it for these GIFs. The bottle is 420 px wide, at most 1 MB, a 5 s loop.

`--check` gates: loop inside the story's `window` (default 30-38 s); keycaps only from the macOS allow-list (`⇥ tab`, `⏎ enter`, `⎋ esc`, arrows, `⌫ delete`, `⇧⇥ shift+tab`, `⌃O ctrl+o`); no `hover`, `2.1.296`, `Backspace`, `⌘`, Cyrillic; no `TODO-CAPTURE`; `story.bottle` set; every story fact true on its captured screen (`has` present, `lacks` absent); data equal to a fresh `--embed`; captures at `story.term`, ANSI text equal to the plain capture, no home/tmp paths, debug or `Plugins updated` rows, no old dialog wording (`(global) as drafted`, `do not ask where`), no error rows (`no matches found`, `command not found`, Traceback, `*Error`; WARN on `unknown placeholder`); GIF inside the window, 1152 px wide, at most 5 MB (WARN above 3.5 MB), recorded from the current sources (`<name>.manifest.json`); still and bottle equal to the manifest; one sha256 for the repo and docs copies of the GIF and of the still (WARN while `../brewcode-app/site/main/public/mods/<name>.gif` differs, override `BREWCODE_APP_DIR`). Record adds seam SSIM >= 0.985, bottle <= 1 MB and 0 page errors.

Rules: draw only captured rows and proven keys; if the real flow needs another key, add its keycap and its capture. Typing frames reuse the screen captured after the last typed key, prompt row cut to the typed prefix; a token lands as its own capture, since the band changes only once it is complete. Set each `⏩` factor from the session transcript: real seconds in the span / shown seconds.

Publish: stable direct URLs, never renamed: `https://doc-claude.brewcode.app/brewmods/<name>.gif` (Record copies it) and `https://brewcode.app/mods/<name>.gif` plus `<name>-still.png` (copy by hand to `../brewcode-app/site/main/public/mods/`); embed under a stable page anchor (heading slug or `id`) so the link can go to a person. The bottle is for the READMEs only.
