# TypeScript/JavaScript/React Reference

> Language-specific rules for text-human skill

## File Classification

### Haiku (Simple)

| Type | Patterns |
|------|----------|
| Config | `*.json`, `tsconfig.json`, `package.json`, `.eslintrc.*` |
| Constants | `constants.ts`, `config.ts` (pure exports) |
| Types only | `*.d.ts`, `types.ts`, `interfaces.ts` |
| Styles | `*.css`, `*.scss`, `*.less` |

### Sonnet (Complex)

| Type | Patterns |
|------|----------|
| Components | `*.tsx`, `*.jsx` with logic |
| Hooks | `use*.ts`, `use*.tsx` |
| Services | `*Service.ts`, `*Api.ts` |
| Tests | `*.test.ts`, `*.spec.ts`, `*.test.tsx` |
| Utilities | `utils/*.ts` with business logic |
| State | `*Slice.ts`, `*Store.ts`, `*Context.tsx` |

### Classification Logic

| Extension | Condition | Result |
|-----------|-----------|--------|
| ts, tsx | Contains `describe(`, `it(`, `test(` | COMPLEX |
| ts, tsx | <30 lines, only types/interfaces | SIMPLE |
| ts, tsx | React component with hooks/effects | COMPLEX |
| js, jsx | Otherwise | COMPLEX |
| json | Pure data | SIMPLE (often skip) |

---

## JSDoc Cleanup

Remove JSDoc from: private functions, test files, obvious components. Keep public API docs.

| Remove | Keep |
|--------|------|
| Internal/private functions | Exported public API |
| Test files (`*.test.ts`, `*.spec.ts`) | Complex utility functions |
| Obvious components (name = purpose) | Non-obvious side effects |
| Trivial `@param` restating name | `@throws`, `@deprecated` |
| Trivial `@returns` restating function name | `@example` with usage |
| `@type` when TypeScript infers | Generic type explanations |

### JSDoc vs TypeScript

Prefer TypeScript types over JSDoc when both exist:

```typescript
// REMOVE - redundant JSDoc with TS types:
/**
 * @param {string} name - The user name
 * @param {number} age - The user age
 * @returns {User} The created user
 */
function createUser(name: string, age: number): User { }

// KEEP - only TS types:
function createUser(name: string, age: number): User { }

// KEEP - adds context beyond types:
/** Creates user and sends welcome email. Throws if email fails. */
function createUser(name: string, age: number): User { }
```

### React Components

```tsx
// REMOVE - obvious component:
/** Button component that renders a button. */
const Button: FC<ButtonProps> = ({ onClick, children }) => { }

/** User profile card component. */
const UserCard: FC<UserCardProps> = ({ user }) => { }

// KEEP - non-obvious behavior:
/** Debounces input by 300ms. Calls onChange only after user stops typing. */
const DebouncedInput: FC<InputProps> = ({ onChange }) => { }

// KEEP - complex props explanation:
/**
 * @param renderItem - Custom renderer, receives (item, index, isLast)
 * @param onEndReached - Called when scroll reaches 80% of list
 */
const VirtualList: FC<ListProps> = ({ renderItem, onEndReached }) => { }
```

### Hooks

```tsx
// REMOVE - obvious hook:
/** Hook that manages loading state. */
const useLoading = () => { }

/** Hook for user data. */
const useUser = (id: string) => { }

// KEEP - non-obvious behavior:
/** Fetches on mount + refetches every 30s. Pauses when tab inactive. */
const usePolling = (url: string, interval = 30000) => { }

/** Returns memoized callback. Deps auto-tracked via proxy. */
const useAutoCallback = <T extends Function>(fn: T): T => { }
```

---

## Comments

| Remove | Keep |
|--------|------|
| `// Initialize state` | `// Workaround for React 18 strict mode` |
| `// Map over items` | `// Must be sync for Safari compatibility` |
| `// Check if null` | `// Intentionally not memoized - cheap to compute` |
| `// TODO: fix later` | `// HACK: workaround for webpack/webpack#12345` |

### ESLint/TSLint Comments

| Action | Example |
|--------|---------|
| KEEP | `// eslint-disable-next-line @typescript-eslint/no-explicit-any` |
| KEEP | `/* eslint-disable */` at file top with reason |
| REMOVE | `// eslint-disable` without explanation |
| REVIEW | Multiple disables in one file (code smell) |

### Preserve

- `// @ts-expect-error` with explanation
- `// @ts-ignore` (but prefer @ts-expect-error)
- Region comments `// #region`, `// #endregion`

---

## Test Files

Remove all JSDoc from: test files, test utilities, mocks, fixtures.

```typescript
// REMOVE - test file:
/** Tests for UserService. */
describe('UserService', () => {
  /** Should create user with valid data. */
  it('creates user', () => { })
})

// CORRECT - no JSDoc, clear descriptions:
describe('UserService', () => {
  it('creates user with valid data', () => {
    // Arrange
    // Act
    // Assert
  })
})

// REMOVE - test utilities:
/** Creates mock user for tests. */
export const createMockUser = () => { }

// CORRECT:
export const createMockUser = () => { }
```

---

## Pre-Completion Checklist

| Check | Rule |
|-------|------|
| [ ] | No JSDoc on internal/unexported functions |
| [ ] | No JSDoc on test files (`*.test.ts`, `*.spec.ts`) |
| [ ] | No redundant JSDoc when TS types exist |
| [ ] | No JSDoc on obvious React components |
| [ ] | ESLint disables have explanations |
| [ ] | No `@param`/`@returns` restating obvious info |

### Scan Pattern

```
# Semantic search:
grepai_search("jsdoc on private functions")
grepai_search("redundant type annotations")
grepai_search("test file documentation")

# Fallback grep:
grep -n "/\*\*" <file>              // Find JSDoc
grep -n "^const.*=" <file>         // Find functions
```

---

## File Inclusion

| Include | Exclude |
|---------|---------|
| `*.ts`, `*.tsx`, `*.js`, `*.jsx` | `*.d.ts` (generated) |
| `*.mjs`, `*.cjs` | `node_modules/` |
| `*.json` (with comments) | `dist/`, `build/`, `.next/` |
| `*.md`, `*.mdx` | `coverage/` |
| Config files | Lock files (`*.lock`, `*-lock.json`) |
