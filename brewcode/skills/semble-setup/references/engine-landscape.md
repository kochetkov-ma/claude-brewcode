# Engine landscape: semantic / structural code search

Назначение: зафиксировать проверенную фактуру по движкам поиска по коду, которые мы рассматривали, чтобы будущее решение (добавить что-то / сменить движок) не требовало повторного research.

**Данные проверены: 2026-08-08** (GitHub REST API + чтение исходников + PyPI/npm registry).

> Звёзды, номера релизов и каденция протухают быстро. Перед любым решением о смене движка перепроверить: `curl -s https://api.github.com/repos/<owner>/<repo> | jq -r .stargazers_count` и `.../releases?per_page=30`. Числа ниже — снимок на 2026-08-08, не константы.

## Контекст: звёзды (GitHub API, 2026-08-08)

| Repo | Stars |
|------|------:|
| Graphify-Labs/graphify | 104,234 |
| mem0ai/mem0 | 62,810 |
| upstash/context7 | 60,417 |
| DeusData/codebase-memory-mcp | 38,149 |
| microsoft/graphrag | 35,327 |
| topoteretes/cognee | 29,862 |
| getzep/graphiti | 29,682 |
| oraios/serena | 27,739 |
| zilliztech/claude-context | 12,323 |
| MinishLab/semble | 5,845 |

> Звёзды != пригодность. graphify лидирует по звёздам и при этом не имеет эмбеддингов вообще; semble последний по звёздам и выигрывает по NDCG@10 в собственном бенчмарке.

---

## 1. semble (наш текущий движок)

### Источники

| Что | Где |
|-----|-----|
| Repo | https://github.com/MinishLab/semble |
| PyPI | https://pypi.org/pypi/semble/json |
| Бенчмарки | `benchmarks/README.md`, `benchmarks/results/*.json` (19 файлов результатов + `.gitkeep`) |
| Кэш-логика | `_MIN_REVALIDATE_FACTOR = 3` в источнике semble |
| Наши хуки | `brewcode/skills/semble-setup/assets/semble-{session,reminder,explore}.mjs` |
| Наше правило | `.claude/rules/semble-first.md` |

### Тип

Embedding-based семантический поиск по коду. MCP-сервер `semble_code`. Ставится как `semble[mcp]`, мы пиним `0.5.4`.

### Что делает

| Tool | Аргументы | Отдаёт |
|------|-----------|--------|
| `search` | `query`, `repo` (обязателен), `top_k`, `max_snippet_lines` | `file_path`, `start_line`, `end_line`, `score`, `content` |
| `find_related` | `file_path`, `line`, `repo` (обязателен) | то же |

`repo` — абсолютный корень проекта или https git URL. Угадывать URL нельзя.

### Как работает

| Аспект | Реализация |
|--------|-----------|
| Модель | static / distilled embeddings (класс model2vec), CPU-only |
| Индекс | чанки кода + конфигов, косинусная близость |
| Когда строится | лениво, ВНУТРИ вызова тула. Нет демона, нет watcher, нет фонового треда |
| Ревалидация | pull-based, `_MIN_REVALIDATE_FACTOR = 3` — перестройка рассматривается только после 3x времени предыдущей сборки |
| Кэш | macOS `$HOME/Library/Caches/semble`; Linux `${XDG_CACHE_HOME:-$HOME/.cache}/semble`; переопределяется `SEMBLE_CACHE_LOCATION` (`src/semble/cache.py`, `name = "semble"`) |
| Корпус | `--content code docs config` — три бакета, 342 суффикса. `docs` обязателен: `markdown` лежит в `_DOC_LANGUAGES` (`index/files.py`), поэтому корпус `code config` индексировал НОЛЬ `.md` |
| НЕ индексируется | `.json`, `.json5`, `.csv`, `.tsv`, `.psv` (бакет data не принадлежит ни одному content type); `.mdx`, `.txt` и любой суффикс, отсутствующий в `_EXTENSION_TO_LANGUAGE`. `.html`/`.htm` теперь индексируются вместе с docs |
| Один content set на всех | Директория кэша ключуется ТОЛЬКО путём проекта (`cache.py:27-36`), но `_metadata_matches` (`cache.py:111`) требует `set(content_type) == set(content)`. Разные наборы у MCP и CLI делят одну директорию и вытесняют друг друга — полная пересборка на каждом чередовании |
| Телеметрия | пишет `savings.jsonl` (flock, drop-on-contention) — считает ТОЛЬКО собственные вызовы, сравнения grep-vs-semantic там нет |

> **Важная поправка.** Upstream README НЕ заявляет ни watcher, ни демона (grep по README: 0 совпадений на `watch`/`daemon`/`background`). Наш `brewcode/skills/semble-setup/SKILL.md` говорит РОВНО ТО ЖЕ («There is no watcher and no daemon», строка 28) — расхождения нет. Неточна лишь ремарка в скобках там же: «Its own README claims otherwise» — README ничего такого не заявляет.

### Плюсы

| # | Плюс |
|---|------|
| 1 | Лучшее качество/скорость в собственном открытом бенчмарке: NDCG@10 0.854 при индексе 518 ms и p50 запроса 0.91 ms |
| 2 | Настоящая natural-language семантика — запрос это предложение, а не список ключевых слов |
| 3 | Полностью offline и CPU-only, без внешних API-ключей и без векторной БД |
| 4 | Нет демона -> нет фонового процесса, который надо чистить, и нет гонок за кэш |
| 5 | Открытый воспроизводимый харнесс с сырыми JSON-результатами в репозитории |

### Минусы

| # | Минус |
|---|-------|
| 1 | Нет watcher — индекс освежается лениво, и `_MIN_REVALIDATE_FACTOR = 3` может держать устаревший индекс на большом репозитории |
| 2 | Первый вызов после изменений платит стоимостью пересборки внутри тула (видимая задержка агенту) |
| 3 | `.json`/`.csv`/`.html` вне корпуса — конфиги в JSON и HTML-шаблоны не находятся вообще |
| 4 | Нет структурного графа: нет call-path, нет referencing symbols, нет inheritance |
| 5 | `savings.jsonl` не даёт сравнительной метрики — нельзя доказать выигрыш над grep из собственных данных |
| 6 | Молодой проект (первый релиз 2026-04-26), самый низкий star-count в списке |

### Звёзды / релизы / каденция

| Метрика | Значение |
|---------|----------|
| Stars | 5,845 |
| GitHub releases | 24 (`v0.1.0` 2026-04-26 ... `v0.5.3` 2026-08-03) |
| Каденция | ~4.1 дня на релиз (99 дней / 24 релиза) |
| Последний GitHub release | `v0.5.3`, 2026-08-03 |
| Тег `v0.5.4` | существует в `git/refs/tags`, но GitHub Release для него НЕ опубликован |
| PyPI latest | `0.5.4`, upload 2026-08-06T07:00:12Z |
| Наш пин | `0.5.4` — дрейфа нет (поднят с `0.5.2` 2026-08-08) |

> Поправка к исходной фактуре: `0.5.4` вышел на PyPI 2026-08-06, но GitHub Release на него отсутствует — тег есть, релиза нет. Формулировка «released 2026-08-06» верна только для PyPI.

### Бенчмарки

Публикуются, `benchmarks/README.md`. GAP закрыт: бенчмарки есть, с сырыми результатами.

Main results (NDCG@10 / cold index / warm query p50):

| Method | NDCG@10 | Index | Query p50 |
|--------|--------:|------:|----------:|
| **semble** | **0.854** | **518 ms** | **0.91 ms** |
| CodeRankEmbed | 0.839 | 116 s | 16 ms |
| ColGREP | 0.693 | 5.4 s | 122 ms |
| BM25 | 0.673 | 47 ms | 0.17 ms |
| ck | 0.642 | 96 s | 187 ms |
| codebase-memory-mcp | 0.630 | 454 ms | 46 ms |
| grepai | 0.561 | 35 s | 48 ms |
| probe | 0.387 | - | 207 ms |
| cs | 0.200 | - | 22 ms |
| ripgrep | 0.126 | - | 14 ms |

Token efficiency (1251 запросов, `cl100k_base`):

| Method | Expected tokens per query | Savings |
|--------|--------------------------:|--------:|
| ripgrep + read file | 45,587 | baseline |
| **semble** | **348** | **99% fewer** |

Recall при фиксированном token-бюджете:

| Method | 500 | 1k | 2k | 4k | 8k | 16k | 32k |
|--------|----:|---:|---:|---:|---:|---:|----:|
| **semble** | **0.842** | **0.923** | **0.967** | **0.988** | **0.995** | **0.995** | **0.995** |
| ripgrep + read file | 0.001 | 0.008 | 0.037 | 0.086 | 0.207 | 0.374 | 0.583 |

> Оговорка: это бенчмарк самого semble, на его собственном харнессе и датасете. Числа конкурентов взяты из ИХ харнесса, не из независимой третьей стороны.

### Хуки для Claude Code

**Upstream не поставляет НИ ОДНОГО хука.** Всё, что есть вокруг semble — наше.

| Артефакт | Событие / matcher | Поведение |
|----------|-------------------|-----------|
| `assets/semble-session.mjs` | `SessionStart`, без matcher | читает `<cwd>/.claude/semble/state.json`; при `phase === 'ready'` шлёт `systemMessage` + `additionalContext`. Никогда не блокирует |
| `assets/semble-prefetch.mjs` | `UserPromptSubmit`, без matcher | gate v3 -> дистилляция промпта -> ОДИН `uvx … semble search` (жёсткий cap 3 s, SIGKILL) -> `additionalContext` с top-3 ПУТЯМИ без сниппетов. Троттл 30 s, cooldown 600 s по `<cwd>/.claude/semble/.prefetch-ts`. Fail-open: любая ошибка -> `{}` и exit 0 |
| `assets/semble-stats.mjs` | `PostToolUse` + `PostToolUseFailure`, один pipe-matcher | чистый наблюдатель: JSONL в `<cwd>/.claude/semble/telemetry.jsonl`, всегда `{}` |
| ~~`assets/semble-reminder.mjs`~~ / ~~`assets/semble-explore.mjs`~~ | ретайрены в 5.0.0 | обе эмитили только advisory `additionalContext`; конверсия 0/18 (main) и 0/11 (Explore) при доказанной доставке. `install`/`upgrade` удаляет файлы и снимает их строки |
| `.claude/rules/semble-first.md` | - | правило «semantic-first» |
| маркерный блок в `CLAUDE.md` | - | инструкция для сессии |
| `semble-agents.sh` | - | патчит frontmatter агентов, добавляя 2 MCP-тула в `tools:` |
| permissions | - | allow-only |

Телеметрии использования у нас нет: в `state.json` нет ни одного счётчика вызовов. Ключи — `schema` (константа 1), `phase`, `enabled`, `scope`, `cacheRoot`, `repoHash`, `completed[]`, `notes[]`, `version`, `generated_by`, `last_updated` (дата последней записи, `YYYY-MM-DD`, `sc_state_patch` в `scripts/lib/semble-common.sh`).

---

## 2. codebase-memory-mcp (cbm)

### Источники

| Что | Где |
|-----|-----|
| Repo | https://github.com/DeusData/codebase-memory-mcp (default branch `main`) |
| Претрейн-блоб + словарь | `vendored/nomic/{code_vectors.bin, code_vectors.h, code_vectors_blob.S, code_tokens.h, code_tokens.txt}` — верхний уровень репо, НЕ под `internal/cbm/` |
| Единственный потребитель блоба | `src/semantic/semantic.c` (+ `.h`) |
| Проход индексации, который его зовёт | `src/pipeline/pass_semantic_edges.c` |
| Векторный поиск на стороне запроса | `src/store/store.c` (310 KB) |
| Схема MCP-тула | `src/mcp/mcp.c:395-398` (режимы), `:434-439` (`query`), `:444-447` (`semantic_query`) |
| Векторы в БД | `internal/cbm/sqlite_writer.c:2248-2254` (`node_vectors`, `token_vectors`) — путь перепроверён curl 2026-08-08, 200 OK, строки совпадают |
| Пропуск векторного прохода | `src/pipeline/pipeline.c:951` |
| Мёртвый флаг | `src/semantic/semantic.c:134` (`CBM_SEMANTIC_ENABLED`) |
| Устаревшие комментарии | `src/pipeline/pipeline_internal.h:624` |
| Query path | `src/mcp/mcp.c:3105` (`run_semantic_query_core`) |
| Ключевая слабость | `src/store/store.c:8250` (`vs_build_keyword_vectors`), `:8181` (`vs_load_enriched_vector`), `:8207` (`vs_fill_sparse_random`) |
| Веса | `vendored/nomic/code_vectors.bin` (31 MB) |
| Бенчмарк | `docs/BENCHMARK.md` |
| Интеграции | `README.md:447` |

> Раскладка репозитория ПОМЕНЯЛАСЬ: стора теперь `src/store/store.c`, а не `internal/cbm/store.c`. Каталог `internal/cbm/` жив, но держит только слой extractor/LSP/grammar плюс `sqlite_writer.c`. Все ссылки вида `internal/cbm/store.c` в более ранних записях — устаревшие.

### Тип

Единый статический C-бинарник, MCP-сервер. Граф + FTS5 + НАСТОЯЩИЕ эмбеддинги.

### Что делает

Строит граф кода (nodes/edges/labels/rel types) + FTS5-индекс + векторный индекс. Тулы: `index_repository`, `search_graph`, `search_code`, `get_code_snippet`, `trace_path` (алиас `trace_call_path`), `query_graph` (Cypher), `get_graph_schema`, `check_index_coverage`. Всего 15 MCP-тулов (`TOOL_ANNOTATIONS`, `src/mcp/mcp.c:708-724`); `list_directory` в их числе НЕТ — он встречается только в `docs/BENCHMARK.md` (вопрос Q12 харнесса) и `src/cli/agent_profiles.c`.

### Как работает

| Аспект | Реализация (прочитано в исходниках, не маркетинг) |
|--------|--------------------------------------------------|
| Эмбеддинги | ВКЛЮЧЕНЫ ПО УМОЛЧАНИЮ и полностью offline |
| Веса | `vendored/nomic/code_vectors.bin`, 31,377,416 B = 8 байт заголовка + 40856*768: nomic-embed-code, дистиллировано до 40,856 токенов x 768 dims, int8 unit-vector quantization, вкомпилировано через `.incbin` |
| Хранение | SQLite-таблицы `node_vectors` / `token_vectors` (`internal/cbm/sqlite_writer.c:2248-2254`), SQL-функция `cbm_cosine_i8` |
| Режимы | `index_repository`: `"enum":["full","moderate","fast",...],"default":"full"` (`src/mcp/mcp.c:395-398`) |
| Когда векторов нет | векторный проход пропускается ТОЛЬКО в режиме `fast` (`src/pipeline/pipeline.c:951`) |
| `CBM_SEMANTIC_ENABLED` | МЁРТВАЯ функция (`src/semantic/semantic.c:134`), ноль вызывающих. Комментарии про «opt-in» в `src/pipeline/pipeline_internal.h:624` УСТАРЕЛИ |
| Query path | `search_graph(semantic_query=[...])` -> `run_semantic_query_core` (`mcp.c:3105`) -> `cbm_store_vector_search` |
| Watcher | есть, плюс общий per-account демон на все клиенты (`README.md:107`) |

> Любое утверждение «семантика в cbm — opt-in» неверно. Она включена по умолчанию во всех режимах кроме `fast`.

### Блоб и символы (подтверждено curl 2026-08-08)

| Что | Источник |
|-----|----------|
| Вкомпиляция блоба | `vendored/nomic/code_vectors_blob.S:10` `.incbin "vendored/nomic/code_vectors.bin"`; идентично на `:24` (COFF) и `:49` (ELF) |
| Публичные символы | `vendored/nomic/code_vectors.h:23-33`: `PRETRAINED_TOKEN_COUNT 40856`, `PRETRAINED_DIM 768`, `PRETRAINED_VECTOR_BLOB[]`, `pretrained_vec_at(int i)` |
| Словарь ПОСТАВЛЯЕТСЯ | `vendored/nomic/code_tokens.h:5` `static const char *PRETRAINED_TOKENS[40856]`; `code_tokens.txt` — ровно 40,856 строк |
| Размер блоба | 31,377,416 B = 8 + 40856*768 |

### КЛЮЧЕВАЯ СЛАБОСТЬ (перепроверено в исходниках 2026-08-08)

Раньше здесь стояло «`store.c` никогда не обращается к `PRETRAINED_*`, значит запрос идёт по хеш-шуму». Первое верно, вывод был ПЕРЕОЦЕНЁН. Механика:

| Факт | Источник |
|------|----------|
| `query=` — FTS5/BM25 со сплитом camelCase, сам себя описывает как "recommended for natural-language discovery"; это лексика, не эмбеддинг | `src/mcp/mcp.c:416`, схема `:434-439` |
| Свободный текст не эмбеддится НИ НА ОДНОМ пути | grep по `mcp.c`: 0 совпадений `PRETRAINED_*` / `cbm_sem_*` |
| `semantic_query=` принимает МАССИВ ключевых слов; строка отвергается уже на уровне схемы | `mcp.c:444-447`: `"MUST be an ARRAY of keyword strings (e.g. [\"send\",\"pubsub\",\"publish\"]) - NOT a single string.` |
| И в рантайме | `mcp.c:3120-3122` `if (sq_val && !yyjson_is_arr(sq_val)) { type_error = true;` -> текст ошибки `mcp.c:3692` «semantic_query must be an array of keyword strings ... not a single string.» |
| Токенизатора на пути запроса НЕТ: элементы массива копируются дословно, многословный элемент хешируется целиком через `XXH3_64bits(token, strlen(token))` | `extract_semantic_keywords`, `mcp.c:3060-3075` |
| `PRETRAINED_*` встречается ТОЛЬКО на пути ИНДЕКСАЦИИ | `src/semantic/semantic.c:17,419,421-422,449-451,806,817,1097-1104` |
| Реальные точки использования | `cbm_sem_random_index()` `semantic.c:437-457` — сначала претрейн, хеш только как fallback; `build_src_entry()` `semantic.c:1104` -> `out->dense_int8 = pretrained_vec_at((int)idx)` |
| Вызывающие | только `src/pipeline/pass_semantic_edges.c:511,527,534,550` и `:1373` (`cbm_sem_ensure_ready()`), плюс `tests/test_semantic.c` |
| `src/store/store.c` и `src/mcp/mcp.c` не содержат НИ ОДНОГО `PRETRAINED_*` / `cbm_sem_*`; в списке инклюдов `store.c:11-88` нет `semantic/semantic.h` | grep = 0 в обоих файлах |
| Fallback на стороне запроса | `store.c:8259-8261`: `if (!vs_load_enriched_vector(s, project, keywords[k], kw_f)) { vs_fill_sparse_random(keywords[k], kw_f); }` |
| `vs_load_enriched_vector` | `store.c:8181` — `SELECT vector, idf FROM token_vectors WHERE project = ?1 AND token = ?2 LIMIT 1` |
| `vs_fill_sparse_random` | `store.c:8207` — 8 позиций XXH3, `VS_RI_SEED = 0x52494E44` (`store.c:8173`) |
| Сборка векторов запроса | `vs_build_keyword_vectors` `store.c:8250`, единственный вызов — из `cbm_store_vector_search` `store.c:8337` |

Поправка по существу: `phase3c_export_token_vectors()` (`pass_semantic_edges.c:1101`, вызов `:1292`) пишет per-project строки `token_vectors`, а они засеяны ИЗ претрейн-таблицы. Значит претрейн-эмбеддинги ДОХОДЯТ до результатов запроса — косвенно, для каждого токена, присутствующего в проиндексированном проекте. Теряется ровно одно: слово ВНЕ проекта. Оно не дотянется до претрейн-таблицы, даже когда входит в те самые 40,856 токенов, и падает в детерминированный хеш-шум без единого сигнала об ошибке.

Спросить «как работает authentication», когда в проекте символы называются `Guardian`, по-прежнему даёт шум — но потому, что слова `authentication` нет в корпусе проекта, а не потому, что претрейн не используется вообще.

Открытый issue #1112 показывает это на живом примере: запрос `"match comprobante bancario con lote de pagos"` (испаноязычный домен) возвращает цели Makefile со скорами 0.121-0.132.

### Эмбеддятся только метаданные, не тела функций

Источник — ОТКРЫТЫЙ issue #1462 «Feature: hybrid BM25+vector via RRF, and option to embed function bodies in semantic_query». Автор утверждает: векторы узлов строятся из name/signature/docstring, поэтому `semantic_query` матчит только то, КАК код назван, а не то, что он ДЕЛАЕТ; и что metadata-only embedding — «the single most common cause of "semantic search returned nothing relevant"».

> Это ЗАЯВЛЕНИЕ в пользовательском issue, а не вычитанное нами поведение кода. По исходникам мы его не подтверждали.

### Плюсы

| # | Плюс |
|---|------|
| 1 | Ноль зависимостей, один статический бинарник, полностью offline |
| 2 | 158 языков |
| 3 | Миллисекундная индексация |
| 4 | Явный контракт coverage / completeness |
| 5 | File watcher + разделяемый демон между клиентами |
| 6 | Структурные возможности, которых нет у semble: call trace, inheritance, Cypher |
| 7 | Богатейшая интеграция с агентами из всех рассмотренных (см. хуки ниже) |

### Минусы

| # | Минус |
|---|-------|
| 1 | `semantic_query` — не natural language, а массив ключевых слов; предложение отвергается схемой (`mcp.c:444-447`) и рантаймом (`mcp.c:3120-3122`) |
| 2 | Out-of-corpus слово -> детерминированный шум вместо ошибки (`vs_fill_sparse_random`, `store.c:8207`) |
| 3 | Претрейн-словарь на 40,856 токенов недоступен на пути запроса НАПРЯМУЮ (`store.c` не инклюдит `semantic/semantic.h`); косвенно он всё же доходит через `token_vectors`, засеянные на индексации. Реально теряется только слово вне проекта |
| 4 | Метаданные вместо тел функций — по заявлению открытого issue #1462, не по нашему чтению кода |
| 5 | NDCG@10 0.630 против 0.854 у semble в бенчмарке semble. ВАЖНО: semble гоняет cbm в режиме `fast` (`benchmarks/README.md`, раздел Methods) — то есть ровно в том единственном режиме, где векторный проход выключен. Число меряет BM25-путь cbm, а не его семантику |
| 6 | Общий демон = shared state между сессиями; конфликт версий/кэш-рута отвергается жёстко (`README.md:119`) |
| 7 | Устаревшие комментарии в исходниках (`pipeline_internal.h:624`) — маркер расхождения кода и документации |
| 8 | Последний стабильный релиз `v0.9.0` от 2026-07-08; свежее только pre-release |

### Что может измениться (главная причина держать cbm под наблюдением)

| Изменение | Объём | Что уже есть в репо |
|-----------|-------|---------------------|
| Пустить слова ВНЕ проекта через претрейн-таблицу | ~10 строк + одно ребро линковки | словарь поставляется (`code_tokens.h:5`, `code_tokens.txt` — 40,856 строк); `ensure_pretrained_map()` `semantic.c:399-431` уже строит token -> row-index; `semantic.h:112` уже экспортирует `cbm_sem_random_index()`. Работа = заинклюдить `semantic/semantic.h` в `store.c` и подменить fallback `vs_fill_sparse_random`. Оговорки: масштаб `CBM_SEM_INT8_MAX` против `CBM_STORE_INT8_MAX`, ранний `cbm_sem_ensure_ready()` до старта потоков. Размерности уже сходятся (768) |
| Поддержка предложений | ОТДЕЛЬНАЯ задача и крупнее: ~50-150 строк плюс смена контракта | словарь — цельные слова в нижнем регистре (`aa`, `aaa`, `aalborg`, `aantal`), не BPE/subword, значит нужен настоящий токенизатор (lowercase, срезание пунктуации, сплит camelCase/snake) плюс правило пулинга (естественно — IDF-weighted mean, IDF уже лежит в `token_vectors`) плюс ослабление array-only схемы. Ничего, чего нет в репо, при этом не требуется |

### Upstream: заявленных планов нет

Файла `CHANGELOG.md` в репо нет (contents API -> 404). Последние пять релизов (`v0.9.1-rc.1`, `v0.9.0`, `v0.8.1`, `0.8.0`, `0.7.0`) упоминают семантический поиск только в контексте языковой обвязки и фиксов Cypher-движка. Поиск `sentence OR "free text" OR "free-form" in:title` по репо -> 0 попаданий.

Открытые issue по теме:

| # | Заголовок |
|---|-----------|
| 1462 | hybrid BM25+vector via RRF + опция эмбеддить тела функций |
| 1402 | `semantic_query` — English-only: не-латиница даёт отрицательный скор против каждого узла. Автор независимо реверс-инженерил ту же механику и называет `vendored/nomic/` и `code_vectors_blob.S` |
| 1112 | pluggable / multilingual embedding model |
| 1238 | TurboVec/TurboQuant как опциональный бэкенд векторного индекса |
| 915, 1417, 1295, 938 | баги качества и ранжирования семантического поиска |

### Звёзды / релизы / каденция

| Метрика | Значение |
|---------|----------|
| Stars | 38,149 |
| Repo создан | 2026-02-24, последний push 2026-08-08 |
| GitHub releases | 37 (`v0.0.2` 2026-02-25 ... `v0.9.1-rc.1` 2026-07-30) |
| Каденция | ~4.2 дня на релиз (155 дней / 37 релизов) |
| Последний стабильный | `v0.9.0`, 2026-07-08 |
| Последний вообще | `v0.9.1-rc.1`, 2026-07-30, `prerelease=true` |
| Аномалия | теги `0.6.0` / `0.6.1` / `0.7.0` / `0.8.0` опубликованы одной датой 2026-06-12 — ретроспективное проставление релизов, реальные даты выхода этим не подтверждаются |

### Бенчмарки

GAP закрыт: `docs/BENCHMARK.md` существует. Плюс `docs/EVALUATION_PLAN.md`.

Содержимое — **не** retrieval-качество, а language coverage:

| Параметр | Значение |
|----------|----------|
| Заголовок | "Codebase Memory MCP -- v0.3.0 Language Benchmark" |
| Дата прогона | 2026-03-01 (версия v0.3.0 — бенчмарк УСТАРЕЛ относительно v0.9.x) |
| Объём | заявлено «63 languages (27 programming + 8 config/markup)», 12 вопросов на язык (4 для config). Заголовок противоречит содержимому: 27+8=35, и сводная таблица содержит ровно 35 строк. Реально протестировано 35 языков |
| Оценка | PASS 1.0 / PARTIAL 0.5 / FAIL 0.0, до 5 попыток на вопрос |
| Платформа | Apple M3 Pro, macOS Darwin 25.3.0 |
| Tier 1 (>=90%) | 17 языков: Lua, Kotlin, C++, Perl, Objective-C, Groovy, C, Bash, Zig, Swift, CSS, YAML, TOML, HTML, SCSS, HCL, Dockerfile |
| Tier 2 (75-89%) | 16: Python, TypeScript, TSX, Go, Rust, Java, R, Dart, JavaScript, Erlang, Elixir, Scala, Ruby, PHP, C#, SQL |
| Tier 3 (<75%) | 2: OCaml 72%, Haskell 62% |

> Ни одного числа про качество семантического поиска в `docs/BENCHMARK.md` нет. Единственная сравнительная цифра по retrieval — NDCG@10 0.630 из бенчмарка semble, то есть из харнесса конкурента.

### Хуки для Claude Code

GAP закрыт с поправкой к исходной фактуре.

В самом репозитории `.claude/`, `hooks/`, `skills/`, `.claude-plugin/` — **отсутствуют** (contents API отдаёт `Not Found` на все четыре пути; поиск по `filename:SKILL.md` в репо даёт 0). Артефакты не лежат в дереве — они **генерируются командой `cbm install`**, которая автодетектит установленных агентов (`README.md:103`).

Что именно ставится в Claude Code (`README.md:447`):

| Компонент | Детали |
|-----------|--------|
| Конфиг | `~/.claude.json` |
| Skill | один |
| Агенты | три exact-tool graph-агента |
| Хуки | `SessionStart`, `SubagentStart`, **non-blocking** `PreToolUse` для `Grep`/`Glob`, и post-`Read` coverage |

Плюс аналогичные интеграции для Codex CLI, Zed, OpenCode, VS Code, Cursor, Kiro, Junie, Hermes, OpenHands, Cline, Warp, Qwen Code, GitHub Copilot CLI. `cbm uninstall` снимает записи, скиллы, хуки, инструкции и бинарник (`README.md:184`).

> Форма хуков совпадает с нашей: `PreToolUse` на `Grep`/`Glob` явно non-blocking, то есть advisory. Это независимое подтверждение, что nudge-модель — рабочий дизайн, а не наша самодеятельность.

---

## 3. Другие codebase MCP

### 3.1 oraios/serena

#### Источники

| Что | Где |
|-----|-----|
| Repo | https://github.com/oraios/serena |
| Контекст для CC | `src/serena/resources/config/contexts/claude-code.yml` |
| Хуки | `src/serena/hooks.py` |
| Тесты хуков | `test/serena/test_hooks.py` |

#### Тип

LSP-based символьный retrieval + editing. **НЕ эмбеддинги.**

#### Что делает

`find_symbol`, `find_referencing_symbols`, `get_symbols_overview`, `replace_symbol_body`, `insert_*_symbol`, `replace_content`. То есть это и поиск, и редактор.

#### Как работает

Поднимает языковой сервер (LSP) на проект и запрашивает у него символьную структуру. Никакого векторного индекса. `excluded_tools` в `claude-code.yml` выключает у себя все шесть: `create_text_file`, `read_file`, `execute_shell_command`, `find_file`, `list_dir`, `search_for_pattern` — то есть намеренно отдаёт эти операции клиенту.

#### Плюсы

| # | Плюс |
|---|------|
| 1 | Точность LSP: referencing symbols — это реальные ссылки, а не похожие строки |
| 2 | Умеет редактировать по символам, а не по строкам |
| 3 | Самая агрессивная и самая проработанная enforcement-модель из всех (см. хуки) |
| 4 | Зрелость: релизы с 2025-05-19 |

#### Минусы

| # | Минус |
|---|-------|
| 1 | Нулевая семантика: вопрос «где обрабатывается авторизация» без знания имени символа не решается |
| 2 | Требует работающего language server на каждый язык проекта |
| 3 | Хуки блокируют (`deny`) — но это rate-limit, а не запрет: deny срабатывает после серии подряд идущих несимвольных вызовов, счётчик тут же сбрасывается («You can continue using grep now if needed, the counter was reset»), следующий вызов проходит |
| 4 | Per-session счётчики использования эфемерны: pickle-файлы в `${SERENA_HOME}/hook_data/<session_id>`, удаляются на SessionEnd -> накопленной метрики нет |
| 5 | Медленная каденция релизов относительно остальных |

#### Звёзды / релизы / каденция

| Метрика | Значение |
|---------|----------|
| Stars | 27,739 |
| GitHub releases | 15 (первый `2025-05-19` от 2025-05-19) |
| Последний | `v1.6.1`, 2026-07-21 |
| Предыдущий | `v1.6.0`, 2026-07-16 |
| Каденция | ~28 дней на релиз (~428 дней / 15 релизов) — самая медленная в подборке |

#### Бенчмарки

Не удалось подтвердить: опубликованных retrieval-метрик у serena не найдено.

#### Хуки для Claude Code

GAP закрыт — и это **существенная поправка** к исходной фактуре. Serena поставляет не только текстовый контекст, но и полноценные исполняемые хуки с **блокирующими** решениями.

`src/serena/hooks.py`, `HookClient` перечисляет `claude-code`, `codebuddy`, `vscode`, `codex`, `grok`. Хуки регистрируются как CLI-подкоманды (`HookCommands`, `hooks.py:594+`):

| Класс | Событие | Что делает |
|-------|---------|-----------|
| `SessionStartActivateProjectHook` (`hooks.py:523`) | `SessionStart` | активирует проект |
| `SessionEndCleanupHook` (`hooks.py:540`) | SessionEnd | удаляет hook-данные сессии |
| `PreToolUseRemindAboutSymbolicToolsHook` (`hooks.py:115`) | `PreToolUse` | напоминает использовать символьные тулы вместо `read_file`/`grep` |
| `PreToolUseAutoApproveSerenaHook` (`hooks.py:545`) | `PreToolUse` | авто-одобряет вызовы тулов Serena |

Внутри reminder-хука — три отдельных **deny**-построителя: `_build_grep_deny` (`hooks.py:487`), `_build_code_read_deny` (`hooks.py:498`), `_build_non_symbolic_deny` (`hooks.py:509`); все три возвращают `permission_decision="deny"`. То есть хук реально блокирует `Grep` и `Read`, а не только советует — но как порог: deny выдаётся при превышении счётчика подряд идущих несимвольных вызовов, счётчик сразу сбрасывается, и повторный вызов проходит.

Отдельно — текстовое давление в `contexts/claude-code.yml`:

| Правило (verbatim) | |
|---|---|
| `Read           -> FORBIDDEN for discovery.` | |
| `Glob (by name) -> Allowed for discovery only.` | |
| `Grep (content) -> Allowed for discovery only; follow up reads or reference searches must be Serena.` | |
| `Edit           -> FORBIDDEN.` | |

Плюс блок `Disallowed reasoning`, перечисляющий отговорки, которыми модели оправдывают возврат к своим тулам:

> `Disallowed reasoning. Do NOT use any of the following to justify Read/Edit on a code file:`
> `- "I already know the path"`
> `- "one Read call is faster than three Serena calls"`
> `- "the built-in tool description says to use Read for known paths"`
> `If you catch yourself reaching for one of these, that is the signal to switch to Serena.`

> Существует ОТДЕЛЬНЫЙ `cc_system_prompt_override` с ДРУГИМИ формулировками. Это два разных источника; не цитировать их как один.

### 3.2 zilliztech/claude-context

#### Источники

| Что | Где |
|-----|-----|
| Repo | https://github.com/zilliztech/claude-context |
| npm | `@zilliz/claude-context-mcp` |

#### Тип

Эмбеддинги + векторная БД Milvus / Zilliz.

#### Как работает

Требует ВНЕШНЕГО провайдера эмбеддингов (OpenAI и т.п.) и внешнего векторного хранилища. Следствие — зависимость от сети и API-ключа на каждый запрос индексации.

#### Плюсы

| # | Плюс |
|---|------|
| 1 | Настоящие natural-language эмбеддинги |
| 2 | Масштабируется на очень большие корпуса за счёт Milvus |

#### Минусы

| # | Минус |
|---|-------|
| 1 | Сеть + API-ключ обязательны: offline не работает |
| 2 | Внешнее векторное хранилище — отдельная инфраструктура на сопровождении |
| 3 | Стоимость эмбеддинга платная и растёт с размером репозитория |
| 4 | Собственные метрики есть, но слабые: F1 не растёт (0.40 -> 0.40), выигрыш только в токенах и числе вызовов; n=30 задач SWE-bench_Verified, GPT-4o-mini, 3 прогона |
| 5 | Мёртвая каденция GitHub-релизов (см. ниже) |

#### Звёзды / релизы / каденция

| Метрика | Значение |
|---------|----------|
| Stars | 12,323 |
| GitHub releases | **0** — releases API отдаёт пустой массив |
| Последний git-тег | `v0.1.11`, commit date 2026-04-28 |
| Дата тега `v0.1.10` | 2026-04-27 (lightweight-тег `005c90d`; дата берётся с коммита, не с tag-объекта) |
| npm latest | `@zilliz/claude-context-mcp` `0.1.15`, published 2026-06-22 |
| Каденция | не удалось подтвердить по GitHub-релизам (их нет). По npm: последняя публикация 2026-06-22, то есть ~47 дней без выпуска на 2026-08-08 |

#### Бенчмарки

Публикует — `evaluation/README.md` (ветка `master`). Не NDCG, а эффективность агента: 30 инстансов SWE-bench_Verified (2 файла на правку, 15-60 мин), LangGraph ReAct, GPT-4o-mini, по 3 прогона на метод.

| Метрика | Baseline (grep only) | + claude-context MCP | Дельта |
|---------|---------------------:|---------------------:|-------:|
| Average F1 | 0.40 | 0.40 | без изменений |
| Average tokens | 73,373 | 44,449 | -39.4% |
| Average tool calls | 8.3 | 5.3 | -36.3% |

То есть качество retrieval не улучшается вовсе — заявлена только экономия контекста. Сопоставимости с NDCG@10 semble нет: другой датасет, другая метрика, другой харнесс.

#### Хуки для Claude Code

Не поставляет. В корне репозитория есть `CLAUDE.md` и `AGENTS.md` (инструкции), но каталогов `.claude/`, `hooks/`, `skills/` нет. Интеграция — только MCP-конфиг.

---

## 4. graphify

### Источники

| Что | Где |
|-----|-----|
| Repo | https://github.com/Graphify-Labs/graphify (default branch **`v8`**, не `main`) |
| Токенизация запроса | `graphify/serve.py:253` (`_query_terms()`) |
| Скоринг | `graphify/serve.py:439` (`_score_query()`) |
| MinHash | `graphify/_minhash.py`, применяется в `graphify/dedup.py:533` |
| Бенчмарки | `BENCHMARKS.md` (в корне, ветка `v8`) |
| Skill для CC | `graphify/skill.md` + `graphify/skills/claude/references/` |
| CC-хуки | `graphify/install.py:291` (`_claude_pretooluse_hooks`) |
| Git-хуки | `graphify/hooks.py` |
| Лог использования | `graphify/querylog.py` |

### Тип

Чистый структурный граф кода. **ЭМБЕДДИНГОВ НЕТ ВООБЩЕ** — дисквалифицирующий фактор для нашего сценария.

Собственная формулировка, `README.md:32` (ветка `v8`), verbatim:

> **Not a vector index.** No embeddings, no vector store: a real graph you traverse.

И из их же skill-референса `graphify/skills/claude/references/query.md:25`, verbatim:

> graphify's `query` CLI matches nodes via case-folded substring + IDF - there is **no stemming, no synonyms, no cross-language match** inside the binary, and the inline fallback below matches the same way. If the user's question uses different language or different domain vocabulary than the graph's labels (user says "обработчик" / graph says "handler"; user says "authentication" / graph says "Guardian"), the literal matcher returns 0 hits and the answer collapses to noise.

> Оговорка к «эмбеддингов нет вообще»: сами авторы себе противоречат. `BENCHMARKS.md` («Cost and token economics») пишет `graphify extracts with tree-sitter ... and a local embedder`. В OSS-коде на ветке `v8` подтверждения этому нет: `graphify/serve.py` (весь путь запроса) не содержит ни одного упоминания `embed`/`vector`. Считаем: в поставляемом CLI эмбеддингов на пути запроса нет; фраза в `BENCHMARKS.md` относится либо к хостед-продукту, либо к SurrealDB-адаптеру харнесса.

### Что делает

Превращает каталог файлов (код, документы, статьи, изображения, видео) в persistent knowledge graph: интерактивный HTML, GraphRAG-ready JSON, `GRAPH_REPORT.md`. Тулы query / path / explain, community detection, god nodes.

### Как работает

| Аспект | Реализация |
|--------|-----------|
| Токенизация запроса | `_query_terms()` (`serve.py:253`) — `re.findall(r"\w+")` |
| Скоринг | `_score_query()` (`serve.py:439`), IDF-взвешенный |
| Веса совпадений | `_EXACT_MATCH_BONUS = 1000.0`, `_PREFIX_MATCH_BONUS = 100.0`, `_SUBSTRING_MATCH_BONUS = 1.0`, `_SOURCE_MATCH_BONUS = 0.5` |
| Предфильтр | триграммный |
| Раскрытие | BFS/DFS обход графа после скоринга |
| MinHash | `_minhash.py` -> используется для ДЕДУПА (`dedup.py:533`), не для retrieval |
| Обновление индекса | git post-commit / post-checkout хуки (`graphify/hooks.py`), плюс `graphify/watch.py` |

### Плюсы

| # | Плюс |
|---|------|
| 1 | Детерминированность: одинаковый запрос — одинаковый результат, объяснимый скор |
| 2 | Граф реально обходится: path / explain между сущностями |
| 3 | Ноль LLM-кредитов на построение индекса |
| 4 | Работает не только по коду: документы, изображения, видео (транскрипция) |
| 5 | Самая широкая мультиклиентная поставка: 14 каталогов скиллов (claude, codex, amp, copilot, droid, kilo, kiro, opencode, pi, trae, vscode, claw, agents, windows) |
| 6 | Экспорт в Neo4j / FalkorDB / GraphML / SVG |

### Минусы

| # | Минус |
|---|-------|
| 1 | Нет эмбеддингов -> нет семантики. Расхождение словаря убивает запрос молча, признано самими авторами (цитата выше) |
| 2 | Их обходной путь — вручную расширять запрос по словарю графа перед traversal (`query.md:23`, «Step 0 — Constrained query expansion (REQUIRED before traversal)»); это перекладывает работу семантики на агента |
| 3 | Бенчмарки меряют conversational memory (LOCOMO / LongMemEval), а не code retrieval — прямой сопоставимости с semble нет |
| 4 | Каденция релизов ~1.5 в день (182 релиза за 124 дня): неустойчивый API, дорогой пин |
| 5 | Версионирование непредсказуемо: `v1.0.0` — САМЫЙ СТАРЫЙ опубликованный релиз (2026-04-05), после него нумерация ушла назад на `v0.7.x` и растёт до `v0.9.36` |
| 6 | Default branch `v8`, а не `main` — легко получить 404 при обращении к сырым файлам |

### Звёзды / релизы / каденция

| Метрика | Значение |
|---------|----------|
| Stars | 104,234 |
| Repo создан | 2026-04-03 |
| GitHub releases | 182 (две страницы по 100; `v1.0.0` 2026-04-05 ... `v0.9.36` 2026-08-07) |
| Каденция | ~0.68 дня на релиз (124 дня / 182 релиза) — примерно 1.5 релиза в день |
| Последний release | `v0.9.36`, 2026-08-07 |
| `v1.0.0` | и тег, и опубликованный релиз (2026-04-05, `draft=false`, `prerelease=false`) — это первый релиз репозитория, дальше нумерация откатилась к `v0.7.x` |

### Бенчмарки

GAP закрыт: `BENCHMARKS.md` в корне ветки `v8`, «Last updated: 2026-07-05».

| Suite | Dataset (n) | Metric | graphify | Поле сравнения |
|-------|-------------|--------|---------:|----------------|
| Memory | LOCOMO (300) | QA accuracy | 45.3% | supermemory 49.7% (11x стоимость ingest), bm25 31.3%, mem0 27.3% |
| Memory | LOCOMO (300) | recall@10 | 0.497 | bm25 0.362, mem0 0.048 |
| Memory | LongMemEval-S (50) | QA accuracy | 76% | dense RAG 76%, hybrid 74%, mem0 70% |
| Cost | LOCOMO ingest | USD | ~$1.40 | supermemory $15.67, mem0 $3.48 |
| Cost | graph build | LLM credits | $0 | n/a |

Харнесс: собственный, конкуренты (mem0, supermemory) запущены адаптерами внутри него, единая модель Kimi K2.6, единый бюджет, единый грейдер. Judge blind-validated против второго независимого судьи: 90.6% agreement, Cohen's kappa 0.81. Формула грейдинга: `coverage = (covered + 0.5 * partial) / total`.

Code suite (`crosstool/`): фиксированный агент Claude Opus 4.8, максимум 14 ходов, floor из grep/read/list плюс один code-intelligence тул, на ERPNext (~1M LOC, `frappe/erpnext`), с temporal-подсьютом из 689 недельных AST-чекпоинтов 2011-2026. В сводной таблице этих чисел нет, но они есть в разделе «Results: code intelligence»: key-fact coverage 70.8% (grep+read baseline) -> 82.0% с одним тулом graphify, при ~140K токенов на запрос. Выборка — **n=6 вопросов**, то есть статистически ничего не значит.

> Оговорка: все числа — самоотчёт на собственном харнессе. LOCOMO и LongMemEval — это память диалога, а не поиск по коду; переносить эти проценты на наш сценарий нельзя.

### Хуки для Claude Code

GAP закрыт. Поставляется и skill, и настоящие блокирующие хуки.

Skill: `graphify/skill.md` (frontmatter `name: graphify`), устанавливается в `.claude/skills/graphify/SKILL.md` (`graphify/install.py`, `_PLATFORM_CONFIG["claude"]`). Плюс восемь reference-файлов в `graphify/skills/claude/references/`:

| Файл | Размер |
|------|-------:|
| `add-watch.md` | 2,486 |
| `exports.md` | 3,362 |
| `extraction-spec.md` | 7,960 |
| `github-and-merge.md` | 2,177 |
| `hooks.md` | 1,267 |
| `query.md` | 13,456 |
| `transcribe.md` | 3,173 |
| `update.md` | 10,425 |

CC-хуки, `graphify/install.py:291` (`_claude_pretooluse_hooks`):

| Matcher | Команда | Режим |
|---------|---------|-------|
| `Bash\|Grep` | `graphify hook-guard search` | advisory nudge, fail-open |
| `Read\|Glob` | `graphify hook-guard read` (+`--strict`) | при `strict` **блокирует первое сырое чтение за сессию** (только Claude Code) |

Переключатель `GRAPHIFY_HOOK_STRICT` меняет строгость в рантайме без переустановки. Комментарий в исходнике фиксирует важное наблюдение (`install.py:299-301`):

> `"Grep" is in the search matcher because current Claude Code routes content search through its dedicated Grep tool, not Bash (#1986) - a Bash-only matcher never fired on the agent's primary search path.`

Git-хуки (отдельно от CC): `graphify hook install|uninstall|status` ставит post-commit и post-checkout, которые по `git diff HEAD~1` доиндексируют изменённые файлы и пересобирают `graph.json` + `GRAPH_REPORT.md`; если post-commit уже есть, graphify дописывается, а не затирает. Плюс `graphify claude install` пишет секцию H1 `# graphify` в `.claude/CLAUDE.md` (`install.py:317` `_skill_registration`; в исходнике специально оговорено, что это именно H1, чтобы не задеть пользовательский `## graphify`).

Телеметрия: opt-in `graphify/querylog.py`.

---

## Известные дефекты у нас

| # | Дефект | Где | Что не так | Проверено |
|---|--------|-----|-----------|-----------|
| 1 | ~~Устаревший пин semble~~ ЗАКРЫТ 2026-08-08 | пин `0.5.4` | Пин поднят `0.5.2` -> `0.5.4`. `src/semble/index/` и `src/semble/mcp.py` побайтово идентичны между двумя sdist, `cache_version` остался `1`, совместимость кэша двусторонняя (замерено). GitHub Release для `0.5.4` по-прежнему не опубликован — есть только тег и пакет на PyPI | `diff -rq` по двум sdist; PyPI JSON API, GitHub releases/tags API |
| 2 | Неточная ремарка про README | `brewcode/skills/semble-setup/SKILL.md:28` | SKILL.md правильно пишет «There is no watcher and no daemon», но добавляет «(Its own README claims otherwise; the code does not.)». Upstream README ничего подобного не заявляет — в нём нет ни одного вхождения `watch`/`daemon`/`background`. Скобку надо снять | grep по upstream README + `src/semble/mcp.py:29,212` |

Дополнительно к учёту (не дефекты, но расхождения с ранее зафиксированной фактурой):

| # | Расхождение | Было записано | Проверено 2026-08-08 |
|---|-------------|---------------|----------------------|
| 1 | serena и хуки | «только текстовый контекст + эфемерные pickle-счётчики» | serena поставляет исполняемые хуки `SessionStart` / SessionEnd / два `PreToolUse`, из них reminder-хук содержит три **deny**-построителя (`hooks.py:487,498,509`) и реально блокирует `Grep`/`Read` — но по счётчику подряд идущих вызовов, со сбросом счётчика при deny |
| 2 | cbm и хуки | «искать `.claude/`, `hooks`, `skills` в дереве репозитория» | в дереве их нет; артефакты генерирует `cbm install`. Для Claude Code ставятся skill + 3 агента + `SessionStart`, `SubagentStart`, non-blocking `PreToolUse` на `Grep`/`Glob`, post-`Read` coverage (`README.md:447`) |
| 3 | semble `0.5.4` | «released 2026-08-06» | верно для PyPI; GitHub Release отсутствует, есть только тег |
| 4 | graphify default branch | не зафиксирован | `v8`, не `main` — `raw.githubusercontent.com/.../main/...` отдаёт 404 |
| 5 | graphify и CC-хуки | «ships a Claude Code skill» | не только skill: два `PreToolUse`-хука с matcher `Bash\|Grep` и `Read\|Glob`, причём read-хук в `--strict` блокирует |
| 6 | semble и бенчмарки | GAP | публикует полный харнесс, NDCG@10 0.854, 99% экономии токенов против `ripgrep + read` |
| 7 | раскладка репо cbm | ссылки вида `internal/cbm/store.c` | стора переехала в `src/store/store.c` (310 KB); `internal/cbm/` остался под extractor/LSP/grammar плюс `sqlite_writer.c` (последний перепроверён curl — 200 OK, строки `2248-2254` совпадают). Претрейн лежит в `vendored/nomic/` на верхнем уровне, а не под `internal/cbm/vendored/` |
| 8 | cbm и претрейн на пути запроса | «массив ключевых слов даёт хеш-шум, претрейн не используется» | утверждение ПЕРЕОЦЕНЕНО. `store.c`/`mcp.c` действительно не видят `PRETRAINED_*`, но `phase3c_export_token_vectors()` (`pass_semantic_edges.c:1101`) засевает per-project `token_vectors` ИЗ претрейн-таблицы, и через них претрейн доходит до результатов для каждого токена, присутствующего в проекте. Шум остаётся только для слова ВНЕ проекта (`store.c:8259-8261`) |
