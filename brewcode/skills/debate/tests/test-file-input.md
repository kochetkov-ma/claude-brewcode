# Test: File-Based Topic Input

## Setup

Create a temp file first, then invoke:

```bash
cat > /tmp/debate-topic.md << 'EOF'
# Proposal: Switch from PostgreSQL to MongoDB

## Current State
- PostgreSQL 15 with 200+ tables
- Complex JOIN queries for reporting
- 50M rows in largest table

## Proposed Change
- Migrate to MongoDB 7
- Denormalize data models
- Use aggregation pipeline for reporting

## Motivation
- Schema flexibility for rapid feature development
- Better horizontal scaling
- JSON-native storage for our API-first architecture
EOF
```

```
/brewcode:debate /tmp/debate-topic.md -m critic -n 4
```

## Expected Behavior

1. Phase 1: Detects `/tmp/debate-topic.md` as file path, reads content
2. Auto-detect mode = `critic` (matches `-m critic`)
3. 4 critics analyze the migration proposal
4. Issues should include: data integrity, migration complexity, reporting regression

## Assertions

- [ ] File content loaded into topic (not the path string)
- [ ] JSONL entries reference specific points from the document (table counts, JOIN queries)
- [ ] At least 1 issue about data migration risk
- [ ] At least 1 issue about reporting capability regression
- [ ] `decisions.md` references the specific PostgreSQL-to-MongoDB context
- [ ] Temp file is NOT modified
