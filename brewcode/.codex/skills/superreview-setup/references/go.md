---
doc_type: llm
version: "{PLUGIN_VERSION}"
content_version: "{CONTENT_VERSION}"
generated_by: "{GENERATED_BY}"
last_updated: "{LAST_UPDATED}"
---

# Go Standards Reference

Standards for Go projects. The project's own rules in `.codex/rules/*` + `.codex/convention/*` are authoritative —
where this guidance conflicts, the **project rule WINS**. Cite the project rule # when enforcing.

## Tech-Specific Checks (priority dimensions)

| Category | Checks |
|----------|--------|
| Error handling | Wrap with `fmt.Errorf("...: %w", err)`, sentinel errors, `errors.Is`/`errors.As`, never ignore `err` |
| Concurrency | Goroutine leaks, channel close ownership, `context.Context` propagation, `sync` primitives, race-free |
| Memory | Slice capacity/aliasing, pointer vs value semantics, `defer` for cleanup |
| Reuse | stdlib (`strings`, `slices`, `maps`, `errors`, `io`) + existing internal packages before new code |
| Security | SQL parameterization, input validation, no command injection (report only if CRITICAL/P0) |
| Interfaces | Small interfaces (1-3 methods) defined at the consumer, accept interfaces / return structs, composition (embedding) over large interfaces |

## File Patterns

| Type | Patterns |
|------|----------|
| Source | `*.go` (non-test) |
| Tests | `*_test.go` |
| Build/Config | `go.mod`, `go.sum`, `Dockerfile*`, `docker-compose.yml`, `.github/workflows/*.yml` |

## Error Handling

| Rule | Verdict |
|------|---------|
| Never discard `err` (`_ = f()`) without justification | VIOL |
| Wrap with `%w` to preserve chain | REQ |
| `errors.Is`/`errors.As` over `==`/type assert | PREF |
| No `panic` for ordinary errors (only truly unrecoverable) | REQ |

## Concurrency

| Rule | Verdict |
|------|---------|
| Propagate `context.Context` as first arg | REQ |
| Channel close owned by the sender | REQ |
| Guard shared state (`sync.Mutex` / channels) — no data races | REQ |
| No goroutine leaks (every goroutine has a clear exit) | REQ |
| `errgroup` / `sync.WaitGroup` for fan-out | PREF |

## Logging

Use the project logger (`slog` / `zap` / `zerolog`); no `fmt.Println` in prod; structured fields over string
concatenation; never log secrets (security — P0); main code at warn/error level.

## Testing

| Rule | Verdict |
|------|---------|
| Table-driven tests via HELPER, GIVEN/WHEN/THEN comments | REQ |
| `t.Run(name, ...)` subtests for scenarios | PREF |
| Concrete assertions (`got == want`, full struct compare) over weak nil checks | REQ |
| No conditional asserts (`if` deciding which assert runs) | VIOL |
| `t.Parallel()` only where the test is truly isolated | PREF |
| Real deps / testcontainers where integration matters; fakes over mocks | REQ |

```go
func TestGetUser(t *testing.T) {
    // GIVEN
    svc := newServiceWithFake(t)
    // WHEN
    got, err := svc.GetUser(ctx, 1)
    // THEN
    require.NoError(t, err)
    want := User{ID: 1, Name: "John"}
    require.Equal(t, want, got)
}
```

## Search Locations (reuse-first)

`internal/`, `pkg/`, `cmd/`, `**/util/`, `**/common/`, `**/shared/`.

## Dependency Management

`go.mod` with exact module versions; run `go mod tidy`; avoid `replace` to a moving branch. Pin tool versions used in
CI. The project's canonical version policy (if any) is authoritative — bump in lockstep.

## Tools

`go build` / `go test` / `go vet`, `golangci-lint`, `gofmt`/`goimports`, `testify` or stdlib `testing`,
testcontainers-go, `errgroup`.
