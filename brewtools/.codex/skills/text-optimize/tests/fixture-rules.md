# Deploy Rules

| # | Rule |
|---|------|
| 1 | Pin the image to `myapp:2.4.1` — !=latest, !=stable. |
| 2 | The health probe lives at `/api/v2/health` and MUST NOT be disabled. |
| 3 | Deploy hits port 8443 only. NEVER open port 22 to the internet. |
| 4 | Rollback entry point is `scripts/rollback.sh` — REQUIRED before every release. |

Connect timeout is 30 seconds. Retries capped at 3.
