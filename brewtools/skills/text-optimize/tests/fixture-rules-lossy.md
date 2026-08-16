# Deploy Rules

| # | Rule |
|---|------|
| 1 | Pin the image to `myapp:2.4.1` — !=latest. |
| 2 | Health probe `/api/v2/health` MUST NOT be disabled. |
| 3 | Deploy hits port 8443 only. |
| 4 | Run the rollback entry point — REQUIRED before every release. |

Connect timeout 30 s, retries capped at 3.
