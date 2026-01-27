# Python Reference

> Language-specific rules for text-human skill

## File Classification

### Haiku (Simple)

| Type | Patterns |
|------|----------|
| Config | `*.toml`, `pyproject.toml`, `setup.cfg` |
| Requirements | `requirements*.txt`, `constraints.txt` |
| Constants | `constants.py`, `config.py` (pure values) |
| Init files | `__init__.py` (imports only) |
| Type stubs | `*.pyi` |

### Sonnet (Complex)

| Type | Patterns |
|------|----------|
| Business logic | `*.py` with classes/functions |
| Tests | `test_*.py`, `*_test.py`, `conftest.py` |
| CLI | `cli.py`, `__main__.py` |
| APIs | `*_api.py`, `routes.py`, `views.py` |
| Models | `models.py`, `schemas.py` |
| Services | `*_service.py`, `services/*.py` |

### Classification Logic

| Extension | Condition | Result |
|-----------|-----------|--------|
| py | Contains `def test_`, `@pytest`, `class Test` | COMPLEX |
| py | <30 lines, only imports/constants | SIMPLE |
| py | Has classes with methods | COMPLEX |
| py | Otherwise | COMPLEX |
| pyi | Type stubs | SIMPLE |

---

## Docstring Cleanup

Remove docstrings from: private methods, test files, obvious functions. Keep public API docs.

| Remove | Keep |
|--------|------|
| Private methods (`_method`, `__method`) | Public API |
| Test files (`test_*.py`) | Complex algorithms |
| Obvious functions (name = purpose) | Non-obvious side effects |
| Trivial Args restating name | Raises with conditions |
| Trivial Returns restating function | Examples with edge cases |
| Class docstring when name is clear | Type explanations for Any/Union |

### Docstring Styles

Handle all common styles (Google, NumPy, Sphinx):

```python
# REMOVE - trivial Google style:
def get_user(user_id: int) -> User:
    """Get user by ID.

    Args:
        user_id: The user ID.

    Returns:
        The user object.
    """

# CORRECT - no docstring needed:
def get_user(user_id: int) -> User:
    ...

# KEEP - adds context:
def get_user(user_id: int) -> User:
    """Fetches from cache first, falls back to DB. Returns None if not found."""
```

### Private Methods

```python
# REMOVE - private methods don't need docstrings:
def _validate_input(self, data: dict) -> bool:
    """Validate the input data."""

def __calculate_hash(self, value: str) -> int:
    """Calculate hash for value."""

# CORRECT - no docstrings:
def _validate_input(self, data: dict) -> bool:
    ...

def __calculate_hash(self, value: str) -> int:
    ...
```

### Classes

```python
# REMOVE - obvious class:
class UserRepository:
    """Repository for user operations."""

class OrderService:
    """Service for order management."""

# CORRECT - no docstring:
class UserRepository:
    ...

# KEEP - non-obvious behavior:
class RateLimiter:
    """Token bucket algorithm. Thread-safe. Tokens refill every 100ms."""
```

### Dunder Methods

```python
# REMOVE - dunder methods are well-known:
def __init__(self, name: str):
    """Initialize with name."""

def __str__(self) -> str:
    """Return string representation."""

def __len__(self) -> int:
    """Return length."""

# CORRECT - no docstrings on dunders:
def __init__(self, name: str):
    self.name = name

# EXCEPTION - keep if non-standard behavior:
def __eq__(self, other) -> bool:
    """Compares by ID only, ignores other fields."""
```

---

## Comments

| Remove | Keep |
|--------|------|
| `# Initialize variable` | `# Workaround for Python 3.9 bug` |
| `# Loop through items` | `# Must be eager (not lazy) for thread safety` |
| `# Check if None` | `# noqa: E501 - URL cannot be split` |
| `# TODO: refactor` | `# HACK: see https://bugs.python.org/12345` |

### Type Comments

```python
# REMOVE - use type hints instead:
x = []  # type: List[int]
y = None  # type: Optional[str]

# CORRECT - inline type hints:
x: list[int] = []
y: str | None = None

# KEEP - when type hints not possible:
# type: ignore[arg-type]  # mypy false positive
```

### Noqa Comments

| Action | Example |
|--------|---------|
| KEEP | `# noqa: E501 - long URL` (with reason) |
| KEEP | `# type: ignore[override]` (mypy) |
| REMOVE | `# noqa` without code or reason |
| REVIEW | Multiple noqa in one file (code smell) |

---

## Test Files

Remove all docstrings from: test files, fixtures, conftest.py.

```python
# REMOVE - test file:
class TestUserService:
    """Tests for UserService."""

    def test_create_user(self):
        """Test creating a user."""

# CORRECT - no docstrings:
class TestUserService:
    def test_create_user(self):
        # Arrange
        # Act
        # Assert
        ...

# REMOVE - fixtures:
@pytest.fixture
def mock_user():
    """Create mock user for tests."""

# CORRECT:
@pytest.fixture
def mock_user():
    ...
```

---

## Pre-Completion Checklist

| Check | Rule |
|-------|------|
| [ ] | No docstrings on private methods (`_method`) |
| [ ] | No docstrings on dunder methods (unless non-standard) |
| [ ] | No docstrings on test files |
| [ ] | No trivial Args/Returns in docstrings |
| [ ] | No type comments when type hints work |
| [ ] | `# noqa` comments have explanations |

### Scan Pattern

```
# Semantic search:
grepai_search("private methods with docstrings")
grepai_search("trivial docstring parameters")
grepai_search("test file documentation")

# Fallback grep:
grep -n '"""' <file>              # Find docstrings
grep -n "def _" <file>            # Find private methods
```

---

## File Inclusion

| Include | Exclude |
|---------|---------|
| `*.py`, `*.pyi` | `__pycache__/` |
| `*.toml`, `*.cfg`, `*.ini` | `*.pyc`, `*.pyo` |
| `*.txt` (requirements) | `.venv/`, `venv/`, `.env/` |
| `*.md`, `*.rst` | `dist/`, `build/`, `*.egg-info/` |
| `Makefile`, `Dockerfile` | `.tox/`, `.pytest_cache/` |
