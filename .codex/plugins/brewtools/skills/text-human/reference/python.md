# Python Reference

> Language-specific rules for text-human skill

## File Classification

### fast model (Simple)

| Type | Patterns |
|------|----------|
| Config | `*.toml`, `pyproject.toml`, `setup.cfg` |
| Requirements | `requirements*.txt`, `constraints.txt` |
| Constants | `constants.py`, `config.py` (pure values) |
| Init files | `__init__.py` (imports only) |
| Type stubs | `*.pyi` |

### balanced model (Complex)

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

Remove only redundant docstrings, never by visibility/test location alone. Keep public API, meaningful private/test contracts and tool/runtime-consumed docs or doctests.

| Remove | Keep |
|--------|------|
| Redundant `_method`/`__method` prose | Meaningful contracts at any visibility |
| Redundant `test_*.py` prose | Fixture/test assumptions, complex algorithms and GIVEN/WHEN/THEN/AND |
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
# REMOVE - these private-method docstrings only restate their names:
def _validate_input(self, data: dict) -> bool:
    """Validate the input data."""

def __calculate_hash(self, value: str) -> int:
    """Calculate hash for value."""

# CORRECT - only the redundant examples above lose docstrings:
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
# REMOVE - these dunder docs add no information:
def __init__(self, name: str):
    """Initialize with name."""

def __str__(self) -> str:
    """Return string representation."""

def __len__(self) -> int:
    """Return length."""

# CORRECT - redundant dunder doc removed; meaningful contracts remain:
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
# KEEP - functional legacy type comments; styling never converts them:
x = []  # type: List[int]
y = None  # type: Optional[str]

# PROPOSE ONLY - annotation migration needs explicit scope + target-version/type/runtime checks:
x: list[int] = []
y: str | None = None

# KEEP - type-checker directive, unchanged:
# type: ignore[arg-type]  # mypy false positive
```

### Noqa Comments

| Action | Example |
|--------|---------|
| KEEP | `# noqa: E501 - long URL` (with reason) |
| KEEP | `# type: ignore[override]` (mypy) |
| KEEP + SURFACE | `# noqa` without code/reason; it suppresses checks, never remove during styling |
| KEEP + REVIEW | Multiple noqa in one file; report narrowing/removal proposals only |

---

## Test Files

Remove only redundant docs in tests, fixtures and conftest.py. Keep fixture lifetime/side effects, test invariants, doctests and tool-consumed docs. Preserve GIVEN/WHEN/THEN/AND and Arrange/Act/Assert.

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
| [ ] | `_method` docs retain meaningful private contracts |
| [ ] | Dunder docs lose only redundancy; non-standard contracts retained |
| [ ] | Test/fixture docs retain useful assumptions and GIVEN/WHEN/THEN |
| [ ] | No trivial Args/Returns in docstrings |
| [ ] | Type comments and annotations unchanged; migrations proposal-only |
| [ ] | `# noqa`/type/security/tool directives unchanged; missing explanations surfaced |

### Scan Pattern

```
# grep patterns:
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
