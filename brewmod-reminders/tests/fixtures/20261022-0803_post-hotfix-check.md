due: 2026-10-22T08:03:00Z
status: pending

Post-hotfix prod check for v1.115.1 (main 24e2f198, deployed 2026-10-21 ~13:30Z). As manager, delegate read-only checks (abuse-defence + platform-ops; brief with NO-TRUST clause, not alone, no Git writes, never run rm, no files on VPS, never print secrets/IPs; non-public namespaces aggregates only):
- Nightly AutoBlockReclassifyJob at 03:40Z on 2026-10-22 logged `auto-block reclassify nightly run Summary(...)` on logger `abuse.blocklist.reclassify`; `brewpage_abuse_autoblock_reclassify_total` grew; shared list refresh ok.
- Blocklist hit log throttle: `abuse.blocklist.hit.*` WARN lines carry `suppressed=`; share of backend log lines vs 78% before; `brewpage_abuse_blocklist_hit_total` still counts every hit.
- S1 fix: `PhishingHeuristicScanner` blocks since deploy by rule; any public takedown/cleanup -> score+reasons, false-positive class? Restored page `public/em1gCKdLBf` still returns 200 (do not inspect its content).
- General: version 1.115.1, health, ERROR count, restarts/OOM, memory vs limits, LLM error outcomes.
Any red -> fix task and deliver per CLAUDE.md delivery authority. Report to Maksim in Russian, Lisbon times, compact. Then mark this file done and commit+push.
