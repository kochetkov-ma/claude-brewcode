---
doc_type: llm
version: "{PLUGIN_VERSION}"
content_version: "{CONTENT_VERSION}"
generated_by: "{GENERATED_BY}"
last_updated: "{LAST_UPDATED}"
---

# Python Standards Reference

GENERIC modern-Python guidance (type hints, docstrings, imports, exceptions, comprehensions, testing). The project's
own rules in `.claude/rules/*` + `.claude/convention/*` are authoritative — where this guidance conflicts with a
project rule, the **project rule WINS**. Cite the project rule # when enforcing.

## Tech-Specific Checks (priority dimensions)

| Category | Checks |
|----------|--------|
| Type hints | Function signatures, return types, generics, `X \| None` over `Optional[X]` |
| Exceptions | Specific exception types, `raise X from e`, context managers, no bare `except:` |
| Async | `asyncio` patterns, event-loop handling, no blocking calls in async paths |
| Reuse | stdlib (`itertools`, `functools`, `pathlib`) + existing project modules before new code |
| Security | SQL parameterization, input validation; never log secrets (report only if CRITICAL/P0) |
| Style | PEP8, docstrings, comprehensions, no `print()` in prod |

## File Patterns

| Type | Patterns |
|------|----------|
| Source | `*.py` |
| Tests | `test_*.py`, `*_test.py`, `**/tests/*.py` |
| Config | `pyproject.toml`, `requirements*.txt` (`setup.py`/`setup.cfg` legacy) |
| Types | `py.typed`, `*.pyi` |

## Type Hints

All params typed, return type annotated; class attributes typed in `__init__` or class body.

> **Python 3.10+:** `X | Y` over `Union[X, Y]`, `list[X]` over `List[X]`.

## Docstrings (Google style)

Module + public class + public function docstrings required; private (`_*`) optional.

## Imports (isort order)

1. Standard library  2. Third-party  3. Local. Absolute imports, one per line, no wildcards.

## Error Handling

| Rule | Verdict |
|------|---------|
| Specific catch (no bare `except:`) | REQ |
| Chain exceptions `raise X from e` | REQ |
| Context managers for resources | REQ |

## Testing (pytest)

| Rule | Verdict |
|------|---------|
| pytest over unittest | PREF |
| Fixtures + `conftest.py` for shared setup | REQ |
| Fakes over mocks (capture state, assert at end) | REQ |
| Parametrize via HELPER functions, not always `@pytest.mark.parametrize` | per project convention |
| No `if` in test bodies (assert precondition, then unconditional assert) | VIOL |
| Concrete equality (`== expected`) over weak `is not None` / `>=` checks | REQ |

```python
def test_get_user_returns_user_when_exists(self, user_service, sample_user):
    # GIVEN
    user_id = sample_user.id
    # WHEN
    result = user_service.get_user(user_id)
    # THEN — full-object equality
    assert result == sample_user
```

## Logging

| Rule | Verdict |
|------|---------|
| `logging` module, logger per module | REQ |
| No `print()` in prod | VIOL |
| Lazy formatting `log.info("User: %s", id)` | PREF |
| NEVER log secrets/tokens | VIOL (security — P0) |

> Tests emit NO logs; main code logs at warn/error only.

## Style & Tooling

Black (format), Ruff (lint), isort (imports), mypy (types). Prefer comprehensions for simple transforms;
generator expressions for large/lazy iteration.

## Search Locations (reuse-first)

`**/app/`, `**/adapters/`, `**/domain/`, `**/utils/`, `**/common/`, `**/lib/`, `**/helpers/`, `**/tests/`.

## Dependency Management

Pin every dependency to an exact `pkg==X.Y.Z` in `requirements*.txt` / `pyproject.toml`. Shared packages must pin
identically across modules. The canonical pin table (if the project has one) is authoritative — bump in lockstep.

## Tools

pip / Poetry / uv (per project), pytest, respx/httpx-mock, testcontainers, mypy, Black, Ruff, isort.
