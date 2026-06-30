# TypeScript / Node / React Standards Reference

Standards for TypeScript, Node.js and React projects. The project's own rules in `.claude/rules/*` +
`.claude/convention/*` are authoritative — where this guidance conflicts, the **project rule WINS**. Cite the rule #.

## Tech-Specific Checks (priority dimensions)

| Category | Checks |
|----------|--------|
| Async | Promise handling, unhandled rejections, correct async/await, no floating promises |
| Types | Strict null checks, type guards, generics; no `any` (use `unknown` + narrowing) |
| Validation | Input sanitization, schema validation (Zod/Joi) at boundaries |
| Reuse | existing hooks/components/utils before new ones (check `common/`, `shared/`) |
| Security | XSS prevention, CSRF, no injected HTML (report only if CRITICAL/P0) |
| Imports | ESM vs CJS consistency, barrel exports, no circular deps |

## File Patterns

| Type | Patterns |
|------|----------|
| Components | `*.tsx`, `*.jsx` |
| Logic | `*.ts`, `*.js` |
| Styles | `*.styled.ts`, `**/styles.ts`, `*.css`, `*.scss` |
| Tests | `*.test.tsx`, `*.spec.ts`, `**/__tests__/*` |
| Config | `package.json`, `tsconfig.json`, `.eslintrc*` |

## Component Patterns (React)

Functional components only (no class components). Arrow functions for components. Structure order: types -> declaration
-> hooks -> handlers -> render helpers -> JSX.

```tsx
const UserCard: React.FC<UserCardProps> = ({ user, onEdit }) => {
  return <div>{user.name}</div>;
};
```

## Hooks

| Hook | Common mistake |
|------|----------------|
| `useState` | Over-using for derived state |
| `useEffect` | Missing cleanup / deps array |
| `useMemo`/`useCallback` | Premature optimization |
| `useRef` | Using for state |

Custom hooks: `use*` prefix, extract reusable logic, return object for >2 values. **Check existing hooks first**
(`hooks/`, `use*.ts`, grepai_search) before creating.

## TypeScript Type Safety

| Rule | Verdict |
|------|---------|
| Explicit prop/return types | REQ |
| No `any` | VIOLATION |
| `unknown` over `any` + narrowing | PREF |
| Interface for objects, type for unions | PREF |

```tsx
interface UserCardProps { user: User; onEdit?: (id: string) => void; }

type ApiResponse<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };
```

## Styling (if styled-components / theme)

Use theme tokens; no hardcoded colors/spacing/fonts. Colocate styles; extend base components; check
`components/common/` before adding a new styled component.

## State Management

| Scope | Solution |
|-------|----------|
| Component | `useState` |
| Subtree | Context + `useReducer` |
| Global | Redux/Zustand/Jotai |

Prop drilling >3 levels -> Context or state management.

## Testing (Jest + React Testing Library)

| Rule | Verdict |
|------|---------|
| Test behavior, not implementation | REQ |
| Query priority: `getByRole` > `getByLabelText` > `getByText` > `getByTestId` | PREF |
| `screen` over destructure; `userEvent` over `fireEvent` | PREF |
| GIVEN/WHEN/THEN structure | REQ |

```tsx
it('renders user name', () => {
  // GIVEN
  const user = { id: '1', name: 'John' };
  // WHEN
  render(<UserCard user={user} />);
  // THEN
  expect(screen.getByText('John')).toBeInTheDocument();
});
```

## Performance

`React.memo` / `useMemo` / `useCallback` AS NEEDED — profile first, optimize second. `React.lazy()` + Suspense for
route-level code splitting.

## Common Violations

| # | Violation | Fix |
|---|-----------|-----|
| 1 | `any` type | `unknown` or specific type |
| 2 | Class component | Convert to functional |
| 3 | Missing types | Add explicit types |
| 4 | Hardcoded colors | Theme tokens |
| 5 | Duplicate styled component | Check Common/, extend existing |
| 6 | Missing useEffect cleanup | Return cleanup function |
| 7 | Prop drilling >3 levels | Use Context |
| 8 | Testing implementation | Test behavior/output |
| 9 | Floating promise / unhandled rejection | await / `.catch` |
| 10 | Floating/`@latest` dependency | Pin exact `X.Y.Z` |

## Search Locations (reuse-first)

`**/components/common/`, `**/components/shared/`, `**/hooks/`, `**/utils/`, `**/helpers/`, `**/types/`, `**/theme/`.

## Import Order

1. React  2. External libraries  3. Internal (absolute)  4. Relative  5. Styles/assets.

## Tools

npm/yarn/pnpm, TypeScript, ESLint, Prettier, Jest, React Testing Library, Vite/webpack, Storybook.
