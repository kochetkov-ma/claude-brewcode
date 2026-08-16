# Deploy Rules

1. Image `myapp:2.4.1` — !=latest, !=stable.
2. Probe `/api/v2/health` MUST NOT be disabled.
3. Port 8443 only; NEVER open port 22 outward.
4. Rollback `scripts/rollback.sh` — REQUIRED per release.

Connect timeout 30 s, retries 3.
