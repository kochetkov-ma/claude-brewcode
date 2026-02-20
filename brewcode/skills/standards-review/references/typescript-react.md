# TypeScript/React Standards Reference

Standards for TypeScript/React projects.

## File Patterns

| Type | Patterns |
|------|----------|
| Components | `*.tsx`, `*.jsx` |
| Logic | `*.ts`, `*.js` |
| Styles | `*.styled.ts`, `**/styles.ts`, `*.css`, `*.scss` |
| Tests | `*.test.tsx`, `*.spec.ts`, `**/__tests__/*` |
| Config | `package.json`, `tsconfig.json`, `.eslintrc*` |

## Component Patterns

### Functional Components Only

| Rule | Evidence | Verdict |
|------|----------|---------|
| Functional components | React 18+ standard | ✅ REQ |
| No class components | Legacy pattern | ❌ VIOLATION |
| Arrow functions for components | Consistent style | ✅ PREF |

**Pattern:**
```typescript
// ✅ Functional component
const UserCard: React.FC<UserCardProps> = ({ user, onEdit }) => {
  return <div>{user.name}</div>;
};

// ❌ Class component
class UserCard extends React.Component { ... }
```

### Component Structure

| Order | Section |
|-------|---------|
| 1 | Type definitions (Props, State) |
| 2 | Component declaration |
| 3 | Hooks (useState, useEffect, custom) |
| 4 | Handlers (event handlers, callbacks) |
| 5 | Render helpers (if needed) |
| 6 | Return JSX |

## Hooks

### Built-in Hooks

| Hook | Usage | Common Mistakes |
|------|-------|-----------------|
| `useState` | Local state | Over-using for derived state |
| `useEffect` | Side effects | Missing cleanup, deps array |
| `useMemo` | Expensive calculations | Premature optimization |
| `useCallback` | Stable callbacks | Over-using everywhere |
| `useRef` | DOM refs, mutable values | Using for state |

### Custom Hooks

| Rule | Evidence | Verdict |
|------|----------|---------|
| Extract reusable logic | DRY principle | ✅ REQ |
| `use*` prefix | React convention | ✅ REQ |
| Return object for >2 values | Destructuring clarity | ✅ PREF |

**Check existing hooks before creating:** `hooks/` or `**/hooks/` directories, `use*.ts` files, grepai_search for similar functionality

## Styling

### Theme Tokens

| Rule | Evidence | Verdict |
|------|----------|---------|
| Use theme tokens | Consistency, theming | ✅ REQ |
| No hardcoded colors | `#fff`, `rgb()` | ❌ VIOLATION |
| No hardcoded spacing | `8px`, `16px` | ❌ VIOLATION |
| No hardcoded fonts | `Arial`, `16px` | ❌ VIOLATION |

**Violations:**
```typescript
// ❌ Hardcoded values
const Button = styled.button`
  color: #3498db;
  padding: 8px 16px;
  font-size: 14px;
`;

// ✅ Theme tokens
const Button = styled.button`
  color: ${({ theme }) => theme.colors.primary};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.body.size};
`;
```

### Styled Components

| Rule | Evidence | Verdict |
|------|----------|---------|
| Colocate styles | Component-scoped | ✅ PREF |
| Extend base components | Reuse patterns | ✅ REQ |
| Check `Components/Common/` | Avoid duplication | ✅ REQ |

## TypeScript

### Type Safety

| Rule | Evidence | Verdict |
|------|----------|---------|
| Explicit prop types | Type safety | ✅ REQ |
| No `any` type | Type erasure | ❌ VIOLATION |
| `unknown` over `any` | Safe narrowing | ✅ PREF |
| Interface for objects | Extensible | ✅ PREF |
| Type for unions/primitives | Clarity | ✅ PREF |

### Common Patterns

```typescript
// ✅ Props interface
interface UserCardProps {
  user: User;
  onEdit?: (id: string) => void;
  isLoading?: boolean;
}

// ✅ Discriminated unions
type ApiResponse<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

// ❌ Avoid any
const handleData = (data: any) => { ... }

// ✅ Use unknown + narrowing
const handleData = (data: unknown) => {
  if (isUser(data)) { ... }
};
```

## State Management

### Local vs Global

| Scope | Solution | When |
|-------|----------|------|
| Component | `useState` | UI state, form inputs |
| Subtree | Context + `useReducer` | Theme, auth, localized state |
| Global | Redux/Zustand/Jotai | Cross-cutting, cached data |

### Avoid Prop Drilling

| Depth | Solution |
|-------|----------|
| 2-3 levels | Props OK |
| 4+ levels | Context or state management |

## Testing

### Jest + React Testing Library

| Rule | Evidence | Verdict |
|------|----------|---------|
| Test behavior, not implementation | RTL philosophy | ✅ REQ |
| Query by role/label | Accessibility | ✅ PREF |
| `screen` over destructure | Clarity | ✅ PREF |
| `userEvent` over `fireEvent` | Realistic events | ✅ PREF |

**Queries Priority:**

| Priority | Query | When |
|----------|-------|------|
| 1 | `getByRole` | Buttons, inputs, headings |
| 2 | `getByLabelText` | Form fields |
| 3 | `getByText` | Static text |
| 4 | `getByTestId` | Last resort |

### Test Structure

```typescript
describe('UserCard', () => {
  it('renders user name', () => {
    // GIVEN
    const user = { id: '1', name: 'John' };

    // WHEN
    render(<UserCard user={user} />);

    // THEN
    expect(screen.getByText('John')).toBeInTheDocument();
  });
});
```

## Performance

### Memoization

| Pattern | When | Verdict |
|---------|------|---------|
| `React.memo` | Expensive render, stable props | ✅ AS NEEDED |
| `useMemo` | Expensive calculations | ✅ AS NEEDED |
| `useCallback` | Stable callback for child | ✅ AS NEEDED |

> **Avoid premature optimization.** Profile first, optimize second.

### Code Splitting

| Pattern | Usage |
|---------|-------|
| `React.lazy()` | Route-level splitting |
| Dynamic imports | Feature modules |
| Suspense boundaries | Loading states |

## Common Violations Summary

| # | Violation | Fix |
|---|-----------|-----|
| 1 | Hardcoded colors | Use theme tokens |
| 2 | Class component | Convert to functional |
| 3 | Missing TypeScript types | Add explicit types |
| 4 | `any` type | Use `unknown` or specific type |
| 5 | Duplicate styled component | Check Common/, extend existing |
| 6 | Missing useEffect cleanup | Return cleanup function |
| 7 | Prop drilling >3 levels | Use Context |
| 8 | Testing implementation | Test behavior/output |
| 9 | No error boundary | Add for async components |
| 10 | Inline function in render | Extract to useCallback |

## Search Locations

| Type | Paths |
|------|-------|
| Common components | `**/components/common/`, `**/components/shared/` |
| Hooks | `**/hooks/`, `**/use*.ts` |
| Utils | `**/utils/`, `**/helpers/` |
| Types | `**/types/`, `**/*.types.ts` |
| Styles/Theme | `**/theme/`, `**/styles/` |

## Function Declaration Style

| Pattern | Usage | Verdict |
|---------|-------|---------|
| Arrow function | Components, callbacks | ✅ PREF |
| Function declaration | Hoisted utilities | ✅ OK |
| Consistent per file | Pick one style | ✅ REQ |

## Import Order

| Order | Type |
|-------|------|
| 1 | React |
| 2 | External libraries |
| 3 | Internal modules (absolute) |
| 4 | Relative imports |
| 5 | Styles/assets |

## Tools

| Tool | Purpose |
|------|---------|
| npm/yarn/pnpm | Package management |
| TypeScript | Type safety |
| ESLint | Linting |
| Prettier | Formatting |
| Jest | Testing |
| React Testing Library | Component testing |
| Storybook | Component docs |
