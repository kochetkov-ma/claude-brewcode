# think-short e2e test fixture

Minimal project root used by `run-e2e.sh` as the working directory for each scenario.

Each test copies this directory into a fresh temp location under `tests/e2e/results/<ts>/<scenario>/`
so that state files and log files are isolated between runs.

No source code is present — only the `.claude/` directory skeleton required by the skill and hooks.
