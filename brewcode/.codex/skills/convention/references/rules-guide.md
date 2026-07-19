# Direct rule extraction

1. Extract durable avoid and best-practice candidates from accepted convention evidence.
2. Read all existing `.codex/rules/*.md` files and the applicable `AGENTS.md` files.
3. Skip semantic duplicates, merge partial overlaps, and keep the higher-priority instruction when guidance conflicts.
4. Apply accepted English rule text directly to the narrowest existing rule file.
5. Update the root `AGENTS.md` index with columns `Rule`, `Load when`, and `Purpose`.
6. Invoke `$brewtools:text-optimize -l` for each changed rule and index file, compare semantics, then validate the full inventory.
