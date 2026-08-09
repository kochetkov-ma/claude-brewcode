# hooks-roadmap - hook-поверхность semble и предложения к развитию. Проверено: 2026-08-08

> **УСТАРЕЛО в части «что лежит на диске» (5.0.0).** Раздел 1 описывает hook-слой
> ДО 5.0.0. `semble-reminder.mjs` (`PreToolUse` `Bash`/`Grep`) и `semble-explore.mjs`
> (`SubagentStart` `Explore`) РЕТАЙРЕНЫ: обе выдавали только advisory
> `additionalContext` и сконвертировали 0/18 и 0/11 при доказанной доставке. Их
> заменил `semble-prefetch.mjs` (`UserPromptSubmit`, без matcher), который сам
> выполняет поиск и отдаёт top-3 ПУТИ. Актуальная want-таблица - четыре строки:
> `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `PostToolUseFailure`.
> Источник правды - `scripts/semble-guidance.sh` (`SG_WANT_TABLE`) и `assets/INSTALL.md`.
> Раздел «Предложения» сохранён как есть: он про будущие события, а не про текущие.

Документ фиксирует (a) что реально лежит на диске сегодня и (b) пять предложений,
каждое сверено с настоящим контрактом хуков Claude Code. Реализация по нему не
требует повторного research. Ничего из раздела "Предложения" не реализовано.

Источник правды по коду - `brewcode/skills/semble-setup/assets/*.mjs` и
`brewcode/skills/semble-setup/scripts/semble-guidance.sh`. Источник правды по платформе -
`https://code.claude.com/docs/en/hooks` (страницы `docs.claude.com/en/docs/claude-code/hooks`
и `.../hooks-reference` дают 301 на `code.claude.com`; `code.claude.com/docs/en/hooks-reference`
отвечает 404 - весь reference сейчас живёт на `/docs/en/hooks`).

---

## 1. Где какой хук был применён ДО 5.0.0 (историческая фиксация)

Ассеты скилла (`assets/`) - то, что устанавливалось ДО 5.0.0. Актуальный набор - ТРИ файла
(`semble-session.mjs`, `semble-prefetch.mjs`, `semble-stats.mjs`); см. баннер выше и
`scripts/semble-guidance.sh` (`SG_LIVE` / `SG_WANT_TABLE`):

| Событие | Matcher | Файл | Что эмитит | Блокирует? |
|---------|---------|------|------------|------------|
| `SessionStart` | нет (все) | `semble-session.mjs` | `systemMessage` + `hookSpecificOutput.additionalContext` (только при `phase === "ready"`) | нет |
| `PreToolUse` | `Bash` | ~~`semble-reminder.mjs`~~ РЕТАЙРЕН 5.0.0 | `hookSpecificOutput.additionalContext`, не чаще 1 раза в 600 s | нет, по контракту |
| `PreToolUse` | `Grep` | ~~`semble-reminder.mjs`~~ РЕТАЙРЕН 5.0.0 | то же (та же регистрация, второй matcher) | нет, по контракту |
| `SubagentStart` | `Explore` | ~~`semble-explore.mjs`~~ РЕТАЙРЕН 5.0.0 | `hookSpecificOutput.additionalContext` в транскрипт ПОРОЖДЁННОГО сабагента | нет |

Общее для всех трёх: pure ESM, только Node built-ins, читают ровно один файл
`<cwd>/.claude/semble/state.json`, не спавнят процессов, всегда печатают один JSON-объект
и всегда `exit 0`. Все три молчат, если `state` отсутствует, не парсится,
`enabled === false` или `phase !== "ready"`.

### Точные факты по каждому файлу

| Файл | Факт |
|------|------|
| `semble-session.mjs` | `phase === "ready"` -> `systemMessage: "semble: ready \| cache " + repoHash.slice(0,8)` (или `"unknown"`), `additionalContext` = "ONE `mcp__semble_code__search` first (repo=<cwd>, top_k=5, max_snippet_lines=10), then open the hit at start_line". Ветки: `missing`/пустой -> `{}`; `corrupt` -> `"semble: state file is corrupt - run /brewcode:semble-setup status"`; `enabled===false` или `phase==="disabled"` -> `"semble: disabled for this project"`; `awaiting_reload` -> resume-nudge + `additionalContext`; `error` -> `"semble: error - ..."`; любая другая непустая `phase` -> `"semble: <phase>"` |
| ~~`semble-reminder.mjs`~~ (РЕТАЙРЕН 5.0.0) | Header прямо запрещает `permissionDecision`, deny и `updatedInput`. `THROTTLE_MS = 600_000`. `SEARCH_RE = /(?:^\|[\|;&(]\|&&\|\|\|)\s*(?:command\s+)?(grep\|egrep\|fgrep\|ugrep\|rg\|ag\|ack\|find\|bfs)\b/`. Маркер троттла - mtime файла `<cwd>/.claude/semble/.reminder-ts`; `writeFileSync` в `touch()` - ЕДИНСТВЕННАЯ runtime-запись во всей hook-системе semble. `isExactIntent()` смещён в молчание: любое сомнение -> `true` (правила a-g). Для нативного `Grep`: `output_mode` `files_with_matches`/`count` -> молчание. Команда, содержащая `semble` (lowercase) -> молчание |
| ~~`semble-explore.mjs`~~ (РЕТАЙРЕН 5.0.0) | `SubagentStart`, гейт `input.agent_type === 'Explore'`, никакого троттла, `additionalContext` про прямой вызов `mcp__semble_code__search` без ToolSearch |

### Блоб settings.json (`assets/INSTALL.md` section 4 и `merge_settings()` в `semble-guidance.sh`)

Обе копии идентичны, `want`-таблица ДО 5.0.0 (актуальная - `SG_WANT_TABLE` в
`scripts/semble-guidance.sh`: `SessionStart` / `UserPromptSubmit` / `PostToolUse` /
`PostToolUseFailure`):

```
["SessionStart", null,      "semble-session.mjs",  5]
["PreToolUse",   "Bash",    "semble-reminder.mjs", 5]
["PreToolUse",   "Grep",    "semble-reminder.mjs", 5]
["SubagentStart","Explore", "semble-explore.mjs",  5]
```

Форма записи обязательна: `{hooks:[{type:"command",command:"node",args:[<abs>],timeout:5}]}`.
`args` - единственный маркер принадлежности; вариант `command:"node /abs/x.mjs"` был бы
невидим и для purge, и для uninstall. `permissions.allow` дополняется
`mcp__semble_code__search` и `mcp__semble_code__find_related` - только allow, ни deny, ни ask.

| Механизм | Что реально в коде |
|----------|--------------------|
| Ключ дедупликации | `event + matcher + full path` (не путь один) - иначе регистрация `Grep` молча терялась бы, т.к. reminder законно встречается дважды |
| Prune стальных путей | сравнение по ПОЛНОМУ пути с `wanted`; фильтрация внутри `entry.hooks[]`, entry удаляется только когда опустел; чужой hook рядом со стальным выживает |
| Post-write assertion | перечитать файл и потребовать ровно 1 вхождение на каждую из 4 пар event+matcher+script и ровно 1 вхождение каждого tool в `permissions.allow`, иначе `exit 1` |
| Abort-гейт | `settings.json` не-JSON или не-объект -> ничего не пишется, `exit 1`; в скрипте это preflight ДО записи rule/CLAUDE.md/hooks |

`state.json` не содержит ни одного числового/монотонного ключа
(`schema, profile, projectRoot, approvedVersion, completed[], phase, enabled, scope,
cacheRoot, repoHash, notes[], resumePrompt, version, generated_by, last_updated,
last_verified_at`) -> телеметрии
использования сегодня нет вообще.

### РАСХОЖДЕНИЯ: установленный экземпляр в этом репозитории (снимок ДО 5.0.0)

`/Users/maximus/IdeaProjects/claude-brewcode/.claude/` - установка устарела относительно ассетов:

| # | Диск | Ассеты | Последствие |
|---|------|--------|-------------|
| 1 | `timeout: 5000` в обеих записях `.claude/settings.json` (SessionStart + оба PreToolUse; проверено на диске 2026-08-08) | `timeout: 5` | 5000 SECONDS = 83 минуты. Клампа явного значения документация НЕ описывает (600 s - это ДЕФОЛТ, а не потолок), поэтому защита от зависшего `node` отсутствует полностью |
| 2 | нет записи `SubagentStart`/`Explore`, нет файла `.claude/hooks/semble-explore.mjs` | есть | `Explore`-сабагенты подсказку не получают |
| 3 | `state.json` -> `"phase": "awaiting_reload"` | `ready` в примерах | reminder и explore молчат ПОЛНОСТЬЮ; session-хук отдаёт только resume-nudge |
| 4 | `.claude/semble/.reminder-ts` отсутствует | - | троттл ни разу не срабатывал (следствие #3) |

Переустановка через `scripts/semble-guidance.sh install --part all` чинит #1/#2;
`#3` лечится `/brewcode:semble-setup resume`.

---

## 2. Факты платформы (перепроверено 2026-08-08)

| # | Факт | Статус | Источник |
|---|------|--------|----------|
| P1 | `timeout` в СЕКУНДАХ. Дефолты: `command`/`http`/`mcp_tool` - 600 s, `prompt` - 30 s, `agent` - 60 s. `UserPromptSubmit` понижает `command`/`http`/`mcp_tool` до 30 s, `MessageDisplay` - до 10 s | подтверждено | https://code.claude.com/docs/en/hooks |
| P2 | "All matching hooks run in parallel." Один и тот же handler из нескольких settings-файлов выполняется один раз; копии из плагина/скилла остаются отдельными | подтверждено | https://code.claude.com/docs/en/hooks |
| P2a | Следствие: при параллельных tool-call'ах `PostToolUse` идёт конкурентно -> read-modify-write общего JSON НЕБЕЗОПАСЕН. Безопасный паттерн: append-only JSONL + `O_APPEND`. ПОПРАВКА: `PIPE_BUF` относится к КАНАЛАМ (pipe/FIFO) и к обычным файлам НЕ применяется - ссылаться на него здесь некорректно. Для обычного файла гарантия другая: POSIX требует, чтобы `O_APPEND` атомарно сдвигал offset в конец перед КАЖДЫМ `write()`, поэтому не перемешиваются записи, уложившиеся в ОДИН `write()`-syscall. `fs.appendFileSync` в Node цикла по частичным записям не исключает, так что бюджет строки надо держать в единицах КБ (реальный порог - размер одного syscall, а не 512 байт) | вывод из P2, не цитата документации; `PIPE_BUF`-обоснование ОТОЗВАНО | - |
| P3 | `SessionEnd` делит общий бюджет 1.5 s; "if your settings set a longer per-hook `timeout`, Claude Code raises the budget to match, up to 60 seconds" | подтверждено | https://code.claude.com/docs/en/hooks |
| P3a | Таймауты на PLUGIN-provided хуках бюджет НЕ поднимают | **подтверждено** - секция `SessionEnd`, дословно: "The overall budget is automatically raised to the highest per-hook timeout configured in settings files, up to 60 seconds. **Timeouts set on plugin-provided hooks don't raise the budget.** To override the budget explicitly, set the `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` environment variable in milliseconds." Semble ставит хуки в ПРОЕКТНЫЙ `settings.json`, а не как plugin-hooks, поэтому ограничение к нему не применяется напрямую - но flush на `SessionEnd` всё равно остаётся плохой идеей: 1.5 s по умолчанию | https://code.claude.com/docs/en/hooks#sessionend |
| P4 | Matcher: `"*"`/`""`/отсутствует -> всё. Буквы, цифры, `_`, `-`, пробелы, `,`, `\|` -> точная строка или список через `\|`/`,`. Любой другой символ -> неякорный JS-regex. Дефисы требуют v2.1.195+, запятые (и терпимость к пробелам вокруг) - v2.1.191+. `FileChanged` и `StopFailure` используют более узкий charset: только буквы, цифры, `_`, `\|` | подтверждено | https://code.claude.com/docs/en/hooks |
| P5 | MCP-инструменты в matcher: `mcp__<server>__<tool>`; серверы из плагина: `mcp__plugin_<plugin-name>_<server-name>__<tool>`. Чтобы поймать все инструменты сервера, `__.*` обязателен | подтверждено | https://code.claude.com/docs/en/hooks |
| P6 | `PostToolUse` payload: `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`, `tool_name`, `tool_input`, **`tool_response`** (НЕ `tool_output` - так называется только поле ОТВЕТА хука `updatedToolOutput`), `tool_use_id`, `duration_ms`. ВАЖНО: `duration_ms` помечен **Optional** - "Tool execution time in milliseconds. Excludes time spent in permission prompts and PreToolUse hooks". Любой потребитель обязан переживать его отсутствие | подтверждено, с исправлением: поле называется `tool_response`, а `duration_ms` необязателен | https://code.claude.com/docs/en/hooks#posttooluse-input |
| P7 | Условные общие поля: `prompt_id` - "Absent until the first user input. Requires Claude Code v2.1.196 or later"; `agent_id` - "Present only when the hook fires inside a subagent call."; `agent_type` - "Present when the session uses `--agent` or the hook fires inside a subagent."; `effort` - присутствует для событий в tool-use контексте, "when the current model supports the effort parameter" | подтверждено | https://code.claude.com/docs/en/hooks |
| P8 | `PostToolUse` "hooks fire after a tool has already executed **successfully**". `PostToolUseFailure` - "Runs when a tool that started executing fails: the tool threw an error, or an MCP tool returned an error result" | подтверждено | https://code.claude.com/docs/en/hooks#posttooluse |
| P8a | Исключения задокументированы дословно: "This event doesn't fire for tool calls rejected before execution: an unknown tool name, input that fails schema or tool-specific validation, or a permission denial. Validation rejections are returned as `tool_use_error` results and happen before hooks run, so they fire neither `PreToolUse` nor `PostToolUseFailure`. Permission denials fire `PreToolUse` but not this event" | **подтверждено** | https://code.claude.com/docs/en/hooks#posttooluse-failure |
| P8b | СЛЕДСТВИЕ ДЛЯ LEDGER (3.1): `Bash`, завершившийся ненулевым кодом, - это ОТКАЗ инструмента; пример в доках - `npm test` с `"error": "Exit code 1..."` в payload `PostToolUseFailure`. `rg`/`grep` БЕЗ СОВПАДЕНИЙ выходит с кодом 1 -> такой вызов приходит в `PostToolUseFailure`, а НЕ в `PostToolUse`. Ledger, слушающий только `PostToolUse`, систематически теряет пустые лексические поиски и завышает долю `semantic` | вывод из P8/P8a | https://code.claude.com/docs/en/hooks#posttooluse-failure |
| P9 | OTel: событие `claude_code.tool_result` (`tool_name`, `tool_use_id`, `success`, `duration_ms`, `error_type`, `decision_type`, `decision_source`, `tool_input_size_bytes`, `tool_result_size_bytes`, `mcp_server_scope`; `tool_parameters` и полный `error` - только при `OTEL_LOG_TOOL_DETAILS=1`) и `claude_code.tool_decision` (`tool_name`, `tool_use_id`, `decision` = `accept`/`reject`, `source`, и `tool_source` из `builtin`/`mcp`/`sdk_host_builtin_mcp` - последнее требует v2.1.214+). Метрики попыток по каждому инструменту НЕТ - единственная tool-метрика `claude_code.code_edit_tool.decision` покрывает только `Edit`/`Write`/`NotebookEdit`; счёт вызовов выводится из потока событий. `tool_use_id` - ключ корреляции OTel <-> hooks | подтверждено | https://code.claude.com/docs/en/monitoring-usage |
| P10 | Каналы вывода хука (exit 0, stdout-JSON): `hookSpecificOutput.additionalContext`, `systemMessage`, `hookSpecificOutput.permissionDecision` = `allow`/`deny`/`ask`/`defer` (+`permissionDecisionReason`), `hookSpecificOutput.updatedInput` (PreToolUse/PermissionRequest), `hookSpecificOutput.updatedToolOutput` (PostToolUse), `decision: "block"` (+`reason`), `continue`/`stopReason`, `suppressOutput`, `terminalSequence`. Exit-коды: 0 - stdout парсится как JSON; 2 - блокирующая ошибка, JSON игнорируется, stderr идёт модели как причина; прочие - неблокирующая ошибка. Exit 1 неблокирующий | подтверждено, с уточнением: доступен ещё `ask`/`defer`, а не только `allow\|deny` | https://code.claude.com/docs/en/hooks |
| P11 | `SubagentStart` существует, и его `additionalContext` попадает в транскрипт САБАГЕНТА: "For `SubagentStart`, the notice appears in the subagent's own transcript, not in the parent conversation." | подтверждено | https://code.claude.com/docs/en/hooks |

### Факты semble (перепроверены по установленному пакету)

Пакет: `uvx --from semble[mcp]==0.5.4 semble --content code docs config`,
`SEMBLE_CACHE_LOCATION=~/Library/Caches/semble-code`, `alwaysLoad: true`.

| # | Факт | Источник |
|---|------|----------|
| S1 | `_MIN_REVALIDATE_FACTOR = 3` - "Don't recheck staleness sooner than this many times the last build's duration". После сборки: `_revalidate_after[cache_key] = finished + (finished - start) * 3`. Внутри окна `_evict_if_stale` пропускается | `semble/mcp.py:29`, `:212` |
| S2 | Watcher-а/демона нет; индекс строится ВНУТРИ tool-call. Значит первый вызов после истечения cooldown может занять секунды-минуты, и это происходит внутри одного `mcp__semble_code__search` | `semble/mcp.py` `_build_and_track`, `_evict_if_stale` |
| S3 | Semble уже ведёт свой лог `<cacheRoot>/savings.jsonl`, файл на диске подтверждён 2026-08-08, строки ровно такие: `{"ts": 1785954621.091636, "call": "search", "results": 5, "snippet_chars": 2548, "file_chars": 27879}` (`ts` - float epoch-seconds, НЕ ISO); CLI-команды `semble savings` и `semble clear savings`. Это счётчик СОБСТВЕННЫХ вызовов semble, глобальный на cache-root, без знаменателя (grep-вызовов) и без разделения по проектам/сессиям | `~/Library/Caches/semble-code/savings.jsonl`, semble 0.5.4 `semble/cli.py:166` (`_clear_savings`), `:252` (subparser), `:280` (`savings`) |
| S4 | Вне корпуса: `.html`/`.htm` (классифицируются как docs) и `.json`/`.json5`/`.csv`/`.tsv`/`.psv` | `assets/semble-first.md.template` -> `.claude/rules/semble-first.md` |

---

## 3. Предложения

Ограничение пользователя, соблюдается строго: НИКАКИХ сложных тумблеров, переключателей
и конфигурационной поверхности на стороне ENFORCEMENT. JSONL допустим ТОЛЬКО для
аналитики/статистики и никогда для принуждения.

Проверка на соблюдение (2026-08-08): ни одно из пяти предложений не вводит настройки,
уровня, порога в конфиге или тумблера. Пороги в 3.3 и троттлы в 3.4 - константы в коде
хука, как уже существующий `THROTTLE_MS`, а не конфигурационная поверхность. JSONL
появляется только в 3.1 и только как счётчик; ни один enforcement-путь его не читает.
Единственная маркерная запись на стороне enforcement - `.deny-<session_id>` в 3.5, и это
булев факт "уже сработало", а не настройка.

### 3.1 Statistics ledger - статус: не реализовано

| Поле | Значение |
|------|----------|
| Что | Append-only JSONL-журнал: одна строка на каждый релевантный tool-call, с вердиктом `semantic` или `lexical` |
| Зачем | Реально незанятая ниша. Никто в поле не измеряет ДОЛЮ семантического поиска против grep: semble считает только собственные вызовы (S3, без знаменателя); serena держит счётчики в эфемерных per-session pickle, удаляемых на SessionEnd; cognee меряет recall hit-rate; mem0 использует поведенческий прокси `adds < msgs/3`; graphify, cbm, graphiti, graphrag, claude-context не меряют ничего. Без знаменателя нельзя ответить на единственный важный вопрос: помогает ли вообще вся эта hook-обвязка |
| Событие + matcher | `PostToolUse` И `PostToolUseFailure` (см. ДЕФЕКТ ПОЛНОТЫ), matcher `Bash\|Grep\|mcp__semble_code__search\|mcp__semble_code__find_related`. Charset - буквы/цифры/`_`/`\|` -> трактуется как точный список (P4), regex-ветка не задействуется, version-gate не нужен (запятые и дефисы не используются). `PostToolUseFailure` "matches on tool name, same values as PreToolUse", так что matcher переиспользуется дословно |
| Механизм | Один `appendFileSync(file, line, {flag:'a'})` = `O_APPEND`; строка короткая (целимся в <=256 байт), так что она уходит одним `write()` и конкурентные `PostToolUse` (P2/P2a) не перемешиваются. Обоснование через `PIPE_BUF` НЕВЕРНО и отозвано - см. P2a. Шардирование по сессии: имя файла содержит `session_id`. Запись ИНКРЕМЕНТАЛЬНАЯ на каждом вызове; flush на `SessionEnd` запрещён (бюджет 1.5 s, P3). `duration_ms` берётся из payload, НО он Optional (P6) -> `ms` пишется как `null`, когда поля нет |
| Файл | `<cwd>/.claude/semble/usage-<session_id>.jsonl`, добавить `.claude/semble/usage-*.jsonl` в `.gitignore` тем же механизмом, что и `.reminder-ts` |
| Форма записи | `{"ts":"2026-08-08T09:12:03.114Z","sid":"abc123","tool":"Bash","verdict":"lexical","exact":false,"ok":true,"bin":"rg","ms":142}` - для semble-вызовов `{"ts":...,"sid":...,"tool":"mcp__semble_code__search","verdict":"semantic","exact":null,"ok":true,"bin":null,"ms":1830}`. `exact` = вердикт `isExactIntent()`, `ok` = `PostToolUse` против `PostToolUseFailure`, `ms` = `duration_ms` или `null` (поле Optional, P6). Ключи короткие намеренно - строка должна уходить одним `write()`. Ни `command`, ни `pattern`, ни `tool_response`, ни `error` НЕ пишутся - журнал не должен становиться утечкой |
| Вердикт | `semantic` для двух MCP-инструментов; `lexical` для `Grep` и для `Bash`, чья команда матчится существующим `SEARCH_RE`; всё остальное не пишется вовсе |
| ДЕФЕКТ ФОРМЫ ЗАПИСИ | Двух значений `semantic`/`lexical` НЕДОСТАТОЧНО для метрики, ради которой всё затевается. `SEARCH_RE` ловит и `rg -l 'AuthService'` (законный exhaustive-поиск, semble для него не предназначен, см. `.claude/rules/semble-first.md`), и `rg "how does auth work"` (промах маршрутизации). Сложив их в один `lexical`, получаем отношение, которое не отвечает на вопрос "маршрутизирует ли модель ПРАВИЛЬНО" - оно лишь считает, сколько раз запускался grep. Минимально необходимое добавление: третье поле с вердиктом уже существующего `isExactIntent()` (`{"verdict":"lexical","exact":true\|false}`), тогда знаменателем становится `lexical && !exact` - ровно те вызовы, которые reminder считает достойными подсказки |
| ДЕФЕКТ ПОЛНОТЫ | См. P8b: `PostToolUse` срабатывает только после УСПЕХА. `rg`/`grep` без совпадений завершается кодом 1 -> уходит в `PostToolUseFailure`. Регистрация только на `PostToolUse` теряет весь класс "искал грепом и не нашёл" - именно тот, где семантический поиск помог бы сильнее всего, - и систематически завышает долю `semantic`. Чинится второй регистрацией того же скрипта на `PostToolUseFailure` с тем же matcher'ом (`error`/`is_interrupt` в журнал НЕ пишутся, только флаг `ok:false`) |
| Риск | Рост файла на длинной сессии (митигируется: одна короткая строка на поисковый вызов, не на каждый tool-call); `session_id` в имени файла плодит файлы (нужна retention-политика на стороне `/brewcode:semble-setup status`); PII в журнале исключён отказом от записи команд |
| Статус | **не реализовано** |

### 3.2 Расширение PreToolUse на `Read`/`Glob` - статус: не реализовано

| Поле | Значение |
|------|----------|
| Что | Добавить регистрации `PreToolUse`/`Read` и `PreToolUse`/`Glob` к текущим `Bash` и `Grep` |
| Зачем | Гипотеза: модель иногда идёт "читать директорию глазами" вместо семантического запроса |
| Событие + matcher | `PreToolUse`, matchers `Read`, `Glob` (или один `Bash\|Grep\|Read\|Glob`) |
| Механизм | Тот же advisory-`additionalContext` под тем же 600-секундным троттлом |
| Честная оценка | **Скорее шум, чем польза.** `Read` вызывается на порядок чаще любого поиска, и подавляющее большинство `Read` - это как раз ОТКРЫТИЕ ХИТА, который semble только что вернул (`open the hit at start_line`), то есть желаемое поведение, за которое хук наказывал бы напоминанием. Для `Read` не существует дешёвого синтаксического аналога `isExactIntent()`: у него нет паттерна, только путь. `Glob` на macOS-сборке - no-op наравне с `Grep`, то есть регистрация была бы инертна там, где чаще всего работает пользователь. Плюс каждая регистрация - это Node-старт на КАЖДЫЙ `Read` |
| Риск | Высокий шум, ноль наблюдаемой пользы, заметный runtime-оверхед |
| Рекомендация | Не делать вслепую. Сначала 3.1: ledger даст фактическое соотношение `Read`-без-предшествующего-поиска, и решение станет измеримым, а не гипотетическим |
| Статус | **не реализовано** |

### 3.3 Index-freshness awareness - статус: не реализовано

| Поле | Значение |
|------|----------|
| Что | Сообщать модели, что индекс может быть холодным и первый вызов окажется медленным |
| Зачем | S1/S2: watcher-а нет, ревалидация ленивая за `_MIN_REVALIDATE_FACTOR = 3`, пересборка происходит ВНУТРИ tool-call. Модель, получив многосекундный `mcp__semble_code__search`, склонна счесть инструмент сломанным и уйти в `rg` - ровно то поведение, которое вся обвязка пытается предотвратить |
| Событие + matcher | `SessionStart` (без matcher, расширение существующего `semble-session.mjs`) - одна фраза в уже эмитируемый `additionalContext`, когда с `last_verified_at` прошло много времени |
| Механизм | Чистое чтение: сравнить `state.last_verified_at` (уже есть в `state.json`, `YYYY-MM-DD`) с текущей датой, и при превышении порога добавить в текст "первый вызов может строить индекс несколько секунд - это нормально, дождись его, не переключайся на rg". Никакого нового файла, никакого зонда, никакого спавна процесса - ограничение "хук не спавнит процессов" сохраняется |
| Почему не PreToolUse на MCP-вызове | Можно было бы вешать matcher `mcp__semble_code__search` (P5 - имя валидно как точная строка), но контекст, вставленный ПЕРЕД вызовом, модель прочитает уже после того, как вызов вернётся; предупреждать надо заранее, на старте сессии |
| Риск | Порог - эвристика; слишком низкий порог даёт постоянное предупреждение-шум. `last_verified_at` отражает дату верификации setup-а, а не время последней сборки индекса, то есть это приблизительный прокси, а не точная свежесть |
| ИЗБЫТОЧНОСТЬ | Установленный `.claude/rules/semble-first.md` УЖЕ несёт эту мысль дословно: "Semble has no background watcher. The index is (re)built inside a tool call and cached; the first call on a cold cache is slow, later calls are fast." Rule-файл автозагружается в тот же момент, что и `SessionStart`-хук, поэтому предложение НЕ добавляет новой позиции в контексте - оно дублирует уже присутствующий текст. Единственное, чего в rule нет, - "не переключайся на rg, дождись" как явная инструкция поведения. Правильный ход - ОДНА фраза в шаблон `semble-first.md.template`, без изменения хука вообще; вариант с хуком оправдан только если нужен порог по `last_verified_at`, чего rule выразить не может |
| Статус | **не реализовано; в текущем виде - в основном дубликат rule-файла** |

### 3.4 Coverage/completeness signal - статус: не реализовано

| Поле | Значение |
|------|----------|
| Что | Сказать модели, чего в корпусе НЕТ, в момент, когда это имеет значение, а не только один раз в rule-файле |
| Зачем | В духе coverage-контракта cbm. Сегодня список "не индексируется" (S4) лежит в `.claude/rules/semble-first.md` и в блоке CLAUDE.md - то есть в начале контекста, задолго до момента, когда модель ищет что-то в `package.json` или в `.html`. Симптом: пустой результат semble по конфигу трактуется как "такого в проекте нет" |
| Событие + matcher | `PostToolUse`, matcher `mcp__semble_code__search` (точная строка, P5) |
| Механизм | Если `tool_response` (именно так называется поле в payload `PostToolUse`, P6) содержит пустой/почти пустой `results`, добавить `hookSpecificOutput.additionalContext`: "semble не индексирует `.html`/`.htm` и `.json`/`.json5`/`.csv`/`.tsv`/`.psv` - пустой результат может означать, что цель вне корпуса; для этих типов используй rg". Читать только длину `results` - парсить содержимое хитов не нужно |
| Альтернатива | `updatedToolOutput` (P10) позволил бы дописать примечание прямо в результат инструмента, но это переписывание вывода MCP-сервера - заметно инвазивнее, чем отдельная строка контекста. Брать `additionalContext` |
| Риск | Парсинг `tool_response` завязан на формат ответа semble; при смене формата хук должен деградировать в молчание, а не в мусорную подсказку. Нужен свой троттл, иначе примечание будет повторяться на каждом пустом поиске |
| Статус | **не реализовано** |

### 3.5 One-deny-per-session escalation - статус: не реализовано, ВЫСШИЙ РИСК

| Поле | Значение |
|------|----------|
| Что | Ровно один раз за сессию заблокировать выраженно "интентный" `grep` и потребовать сначала один `mcp__semble_code__search` |
| Зачем | Advisory-контекст можно проигнорировать, и он игнорируется. Один-единственный deny за сессию - самый дешёвый способ реально изменить траекторию, не превращая хук в надзирателя |
| Событие + matcher | `PreToolUse`, matchers `Bash` и `Grep` (уже зарегистрированы) |
| Механизм | Гейт - `openSync(path, 'wx')` = `O_CREAT\|O_EXCL` на `<cwd>/.claude/semble/.deny-<session_id>`. Успех создания = право на единственный deny; `EEXIST` = навсегда молчать до конца сессии. `O_EXCL` атомарен, поэтому параллельные `PreToolUse` (P2) не смогут выдать два deny. Далее `hookSpecificOutput.permissionDecision: "deny"` + `permissionDecisionReason` с точной инструкцией, каким вызовом заменить (P10). Никаких настроек, никаких уровней - поведение фиксировано |
| Прямой конфликт | Header `semble-reminder.mjs` гласит: "ADVISORY ONLY. It emits at most one `additionalContext` and NEVER a `permissionDecision`, a deny, or an `updatedInput`". `INSTALL.md` section 3 повторяет это как контракт, а текст сообщения заканчивается словами "this is a reminder, not a block." Реализация 3.5 ЛОМАЕТ заявленный контракт: её нельзя добавить внутрь `semble-reminder.mjs`, не переписав его header, документацию и тесты. Разумнее отдельный файл `semble-deny.mjs` с собственной, явно не-advisory документацией |
| Риск | Наивысший в списке. `isExactIntent()` смещён в молчание, но не безошибочен: один ложный deny на легитимном exhaustive-поиске стоит пользователю доверия ко всей интеграции, а окно ошибки - вся сессия. `permissionDecision: "deny"` - жёсткая семантика, в отличие от `"ask"`, которая оставляет решение человеку и была бы куда более безопасным первым шагом. Маркерный файл требует уборки (иначе он утечёт в git или переживёт сессию, если `session_id` совпадёт). Если реализовывать - то `"ask"`, не `"deny"`, и только после того, как ledger из 3.1 покажет, что advisory-канал действительно не работает |
| ПОДВОХ ЗАПАСНОГО ВАРИАНТА | Переход на `"ask"` ЛОМАЕТ доставку инструкции. Дословно: "`permissionDecisionReason`: For `"allow"` and `"ask"`, shown to the user but not Claude. For `"deny"`, shown to Claude." То есть при `"ask"` текст "вызови вместо этого `mcp__semble_code__search`" увидит ЧЕЛОВЕК, а не модель - именно тот адресат, которому он не нужен. Чтобы `"ask"` вообще имел обучающий эффект, инструкцию надо дублировать в `hookSpecificOutput.additionalContext` (он для PreToolUse доступен и игнорируется только при `"defer"`). Без этого "ask" сводится к чистой фрикции: лишний промпт без объяснения |
| Статус | **не реализовано** |

---

## 4. Порядок, если делать

| Шаг | Что | Почему первым |
|-----|-----|---------------|
| 0 | Переустановить semble в этом репозитории (`--part all`) | `timeout: 5000` и отсутствие `SubagentStart` - прямые дефекты текущей установки |
| 1 | 3.1 Statistics ledger | Единственное предложение, дающее данные; 3.2 и 3.5 без него - гадание |
| 2 | 3.3 Index freshness | Самое дешёвое: одна фраза в уже существующем хуке, ноль новых файлов |
| 3 | 3.4 Coverage signal | Новый хук, но безопасный (advisory, PostToolUse) |
| 4 | 3.2 Read/Glob | Только если ledger покажет проблему |
| 5 | 3.5 Escalation | Последним, через `"ask"`, и только после явного решения пересмотреть advisory-контракт |
