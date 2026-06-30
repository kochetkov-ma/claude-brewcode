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

| Location | Requirement |
|----------|-------------|
| Function parameters | All params typed |
| Function returns | Return type annotated |
| Class attributes | Typed in `__init__` or class body |

> **Python 3.10+:** `X | Y` over `Union[X, Y]`, `list[X]` over `List[X]`.

```python
# Fully typed
def process_user(user_id: int, options: dict[str, Any] | None = None) -> User:
    ...
```

## Docstrings (Google style)

Module + public class + public function docstrings required; private (`_*`) optional.

```python
def fetch_user(user_id: int, include_profile: bool = False) -> User | None:
    """Fetch user by ID.

    Args:
        user_id: Unique identifier.
        include_profile: Whether to include full profile data.

    Returns:
        User if found, None otherwise.

    Raises:
        DatabaseError: If the database connection fails.
    """
```

## Naming

| Type | Convention | Example |
|------|------------|---------|
| Modules | snake_case | `user_service.py` |
| Classes | PascalCase | `UserService` |
| Functions | snake_case | `get_user_by_id` |
| Constants | UPPER_SNAKE | `MAX_RETRIES` |
| Private | `_prefix` | `_internal_method` |

## Imports (isort order)

1. Standard library  2. Third-party  3. Local. Absolute imports, one per line, no wildcards.

```python
from collections.abc import Callable
from pathlib import Path

import httpx
from pydantic import BaseModel

from app.models import User
```

## Classes

| Pattern | When |
|---------|------|
| `@dataclass` | Simple data containers |
| `@dataclass(frozen=True)` | Immutable values |
| `pydantic.BaseModel` | Validation needed (API inputs) |

## Error Handling

| Rule | Verdict |
|------|---------|
| Specific catch (no bare `except:`) | REQ |
| Chain exceptions `raise X from e` | REQ |
| Context managers for resources | REQ |

```python
try:
    user = fetch_user(user_id)
except UserNotFoundError:
    logger.warning("User %s not found", user_id)
    raise
except DatabaseError as e:
    raise ServiceError("Database unavailable") from e
```

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

## Common Violations

| # | Violation | Fix |
|---|-----------|-----|
| 1 | Missing type hints | Add param + return types |
| 2 | No docstring on public API | Add Google-style docstring |
| 3 | Bare `except:` | Catch specific exceptions |
| 4 | `print()` in prod | Use logging |
| 5 | Wildcard import | Import specific names |
| 6 | Missing `from e` in reraise | Chain exceptions |
| 7 | Mutable default arg | Use `None` + conditional |
| 8 | `Union[X, Y]` on 3.10+ | Use `X | Y` |
| 9 | Logged/committed secret | Env + validation only (P0) |
| 10 | Floating/`@latest` dependency | Pin exact `X.Y.Z` |
| 11 | Reinventing stdlib/existing module | Reuse-first: grep + import |

## Search Locations (reuse-first)

`**/app/`, `**/adapters/`, `**/domain/`, `**/utils/`, `**/common/`, `**/lib/`, `**/helpers/`, `**/tests/`.

## Dependency Management

Pin every dependency to an exact `pkg==X.Y.Z` in `requirements*.txt` / `pyproject.toml`. Shared packages must pin
identically across modules. The canonical pin table (if the project has one) is authoritative — bump in lockstep.

## Tools

pip / Poetry / uv (per project), pytest, respx/httpx-mock, testcontainers, mypy, Black, Ruff, isort.
