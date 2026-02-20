# Python Standards Reference

Standards for modern Python projects.

## File Patterns

| Type | Patterns |
|------|----------|
| Source | `*.py` |
| Tests | `test_*.py`, `*_test.py`, `**/tests/*.py` |
| Config | `pyproject.toml`, `setup.py`, `setup.cfg`, `requirements.txt` |
| Types | `py.typed`, `*.pyi` |

## Type Hints

### Required Annotations

| Location | Requirement | Verdict |
|----------|-------------|---------|
| Function parameters | All params typed | ✅ REQ |
| Function returns | Return type annotated | ✅ REQ |
| Class attributes | Typed in `__init__` or class body | ✅ REQ |
| Module-level vars | Type annotation | ✅ PREF |

**Pattern:**
```python
# ✅ Fully typed
def process_user(user_id: int, options: dict[str, Any] | None = None) -> User:
    ...

# ❌ Missing types
def process_user(user_id, options=None):
    ...
```

### Common Type Patterns

| Need | Type | Example |
|------|------|---------|
| Optional | `X | None` | `name: str | None` |
| List | `list[X]` | `items: list[str]` |
| Dict | `dict[K, V]` | `mapping: dict[str, int]` |
| Callable | `Callable[[Args], Return]` | `handler: Callable[[int], str]` |
| Any dict | `dict[str, Any]` | Config objects |
| Union | `X | Y` | `id: int | str` |

> **Python 3.10+:** Use `X | Y` over `Union[X, Y]`, `list[X]` over `List[X]`

## Docstrings

### Required Locations

| Location | Requirement | Verdict |
|----------|-------------|---------|
| Modules | Module-level docstring | ✅ REQ |
| Public classes | Class docstring | ✅ REQ |
| Public functions | Function docstring | ✅ REQ |
| Private (`_*`) | Optional | ⚠️ PREF |

### Format (Google Style)

```python
def fetch_user(user_id: int, include_profile: bool = False) -> User | None:
    """Fetch user by ID from database.

    Args:
        user_id: The unique identifier of the user.
        include_profile: Whether to include full profile data.

    Returns:
        User object if found, None otherwise.

    Raises:
        DatabaseError: If database connection fails.
    """
```

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Modules | snake_case | `user_service.py` |
| Classes | PascalCase | `UserService` |
| Functions | snake_case | `get_user_by_id` |
| Constants | UPPER_SNAKE | `MAX_RETRIES` |
| Private | `_prefix` | `_internal_method` |
| Protected | `__prefix` | `__mangled_name` |

## Imports

### Order (isort)

| Order | Type | Example |
|-------|------|---------|
| 1 | Standard library | `import os`, `from pathlib import Path` |
| 2 | Third-party | `import requests`, `from pydantic import BaseModel` |
| 3 | Local | `from .models import User`, `from myapp.utils import ...` |

### Style

| Rule | Evidence | Verdict |
|------|----------|---------|
| Absolute imports | Clarity | ✅ PREF |
| One import per line | Readability | ✅ PREF |
| No wildcard imports | Namespace pollution | ❌ VIOL |
| Group by package | Organization | ✅ REQ |

```python
# ✅ Good
from collections.abc import Callable, Iterable
from pathlib import Path

import httpx
from pydantic import BaseModel, Field

from myapp.models import User
from myapp.utils import validate

# ❌ Bad
from os import *
from myapp.utils import validate, parse, format, convert, transform
```

## Classes

### Dataclasses

| Rule | Evidence | Verdict |
|------|----------|---------|
| Use `@dataclass` for data | Less boilerplate | ✅ PREF |
| `frozen=True` for immutable | Thread safety | ✅ PREF |
| Pydantic for validation | Input validation | ✅ PREF |

```python
# ✅ Dataclass
from dataclasses import dataclass

@dataclass(frozen=True)
class User:
    id: int
    name: str
    email: str | None = None

# ✅ Pydantic (with validation)
from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    name: str
    email: EmailStr
```

### No `__init__` Boilerplate

| Pattern | When | Example |
|---------|------|---------|
| `@dataclass` | Simple data containers | Most DTOs |
| `pydantic.BaseModel` | Validation needed | API inputs |
| `attrs` | Advanced features | Complex models |

## Error Handling

### Exceptions

| Rule | Evidence | Verdict |
|------|----------|---------|
| Custom exceptions | Clear error types | ✅ PREF |
| Specific catch | No bare `except:` | ✅ REQ |
| Chain exceptions | `raise X from e` | ✅ REQ |
| Context managers | Resource cleanup | ✅ REQ |

```python
# ✅ Specific exception handling
try:
    user = fetch_user(user_id)
except UserNotFoundError:
    logger.warning(f"User {user_id} not found")
    raise
except DatabaseError as e:
    raise ServiceError("Database unavailable") from e

# ❌ Bare except
try:
    ...
except:  # Catches everything including KeyboardInterrupt
    pass
```

## Testing

### pytest Patterns

| Rule | Evidence | Verdict |
|------|----------|---------|
| pytest over unittest | Modern, less boilerplate | ✅ PREF |
| Fixtures for setup | Reusable, composable | ✅ REQ |
| Parametrize for variants | DRY testing | ✅ PREF |
| `conftest.py` for shared | Fixture organization | ✅ REQ |

### Structure

```python
# test_user_service.py

import pytest
from myapp.services import UserService

class TestUserService:
    """Tests for UserService."""

    def test_get_user_returns_user_when_exists(self, user_service: UserService, sample_user: User):
        # GIVEN
        user_id = sample_user.id

        # WHEN
        result = user_service.get_user(user_id)

        # THEN
        assert result is not None
        assert result.id == user_id
        assert result.name == sample_user.name

    def test_get_user_returns_none_when_not_found(self, user_service: UserService):
        # GIVEN
        nonexistent_id = 99999

        # WHEN
        result = user_service.get_user(nonexistent_id)

        # THEN
        assert result is None
```

### Assertions

| Pattern | Usage | Verdict |
|---------|-------|---------|
| `assert x == expected` | Equality | ✅ |
| `assert x is None` | None check | ✅ |
| `pytest.raises(Error)` | Exception testing | ✅ REQ |
| `pytest.approx(x)` | Float comparison | ✅ REQ |

## Logging

| Rule | Evidence | Verdict |
|------|----------|---------|
| Use `logging` module | Standard, configurable | ✅ REQ |
| No `print()` in prod | Not production-ready | ❌ VIOL |
| Lazy formatting | `log.info("User: %s", user_id)` | ✅ PREF |
| Logger per module | `logging.getLogger(__name__)` | ✅ REQ |

```python
# ✅ Proper logging
import logging

logger = logging.getLogger(__name__)

def process(data: dict) -> None:
    logger.info("Processing data: %s", data.get("id"))
    # ...
    logger.error("Failed to process: %s", error, exc_info=True)

# ❌ Print statements
def process(data):
    print(f"Processing {data}")
```

## Code Style

### Line Length & Formatting

| Tool | Purpose | Config |
|------|---------|--------|
| Black | Formatting | `pyproject.toml` |
| Ruff | Linting (fast) | `pyproject.toml` |
| isort | Import sorting | `pyproject.toml` |
| mypy | Type checking | `pyproject.toml` |

### Comprehensions

| Pattern | When | Verdict |
|---------|------|---------|
| List comprehension | Simple transforms | ✅ PREF |
| Generator expression | Large/lazy iteration | ✅ PREF |
| `map()`/`filter()` | Simple function application | ✅ OK |
| Multi-line for complex | >1 condition/transform | ✅ OK |

```python
# ✅ Simple comprehension
names = [user.name for user in users if user.active]

# ✅ Generator for large data
active_ids = (user.id for user in users if user.active)

# ✅ Multi-line for complex
results = [
    transform(item)
    for item in items
    if item.valid
    if item.score > threshold
]
```

## Common Violations Summary

| # | Violation | Fix |
|---|-----------|-----|
| 1 | Missing type hints | Add parameter and return types |
| 2 | No docstring | Add Google-style docstring |
| 3 | Bare `except:` | Catch specific exceptions |
| 4 | `print()` in production | Use logging module |
| 5 | Wildcard import | Import specific names |
| 6 | Missing `from e` in reraise | Chain exceptions properly |
| 7 | Mutable default argument | Use `None` + conditional |
| 8 | No `__init__.py` | Add for package recognition |
| 9 | `Union[X, Y]` on 3.10+ | Use `X | Y` syntax |
| 10 | No type: ignore comment | Fix type error or add explanation |

## Search Locations

| Type | Paths |
|------|-------|
| Utils | `**/utils/`, `**/helpers/`, `**/lib/` |
| Models | `**/models/`, `**/schemas/`, `**/entities/` |
| Services | `**/services/`, `**/core/` |
| Tests | `**/tests/`, `test_*.py` |
| Config | `**/config/`, `**/settings/` |

## Dependency Management

| Tool | Config File | Verdict |
|------|-------------|---------|
| Poetry | `pyproject.toml` | ✅ PREF |
| pip-tools | `requirements.in` → `requirements.txt` | ✅ OK |
| pip | `requirements.txt` | ⚠️ BASIC |

## Tools

| Tool | Purpose |
|------|---------|
| pip/poetry | Package management |
| pytest | Testing |
| mypy | Type checking |
| Black | Formatting |
| Ruff | Fast linting |
| isort | Import sorting |
| coverage | Test coverage |
