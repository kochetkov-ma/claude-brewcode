# Java/Kotlin Standards Reference

Rules validated against industry best practices and common enterprise patterns.

## File Patterns

| Type | Patterns |
|------|----------|
| Source | `*.java`, `*.kt`, `*.kts` |
| Build | `pom.xml`, `build.gradle`, `build.gradle.kts` |
| Tests | `*Test.java`, `*Test.kt`, `*IT.java` |
| Config | `application.yml`, `application.properties` |

## Naming Conventions

### Classes

| Type | Convention | Example | Verdict |
|------|------------|---------|---------|
| Entity | `*Entity` suffix | `UserEntity`, `OrderEntity` | ✅ REQ |
| DTO Response | `*Response` suffix | `UserResponse`, `OrderListResponse` | ✅ REQ |
| DTO Request | `*Request` suffix | `CreateUserRequest` | ✅ REQ |
| Repository | `*Repository` suffix | `UserRepository` | ✅ REQ |
| Service | `*Service` suffix | `UserService`, `OrderService` | ✅ REQ |
| Controller | `*Controller` suffix | `UserController` | ✅ REQ |

### Methods

| Pattern | Example | Status |
|---------|---------|--------|
| Verbs for actions | `createUser`, `findById` | ✅ |
| Boolean prefix | `isActive`, `hasPermission`, `canEdit` | ✅ |
| Stream operations | `toUserResponse`, `mapToEntity` | ✅ |

## Dependency Injection

| Rule | Evidence | Verdict |
|------|----------|---------|
| Constructor injection only | Spring recommends, testability | ✅ REQ |
| `@RequiredArgsConstructor` + final fields | Lombok best practice | ✅ REQ |
| No field injection (`@Autowired` on field) | Harder to test, hidden deps | ❌ VIOL |

**Pattern:**
```java
@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;  // final + constructor
    private final EmailService emailService;
}
```

## Stream API & Functional Style

| Rule | Evidence | Verdict |
|------|----------|---------|
| Prefer Stream API over loops | Declarative, readable | ✅ REQ |
| Method references over lambdas | `User::getName` vs `u -> u.getName()` | ✅ PREF |
| No side effects in streams | Functional purity | ✅ REQ |
| `collect(Collectors.toList())` → `toList()` | Java 16+ | ✅ PREF |

**Violations:**
```java
// ❌ Imperative loop
List<String> names = new ArrayList<>();
for (User user : users) {
    names.add(user.getName());
}

// ✅ Stream API
List<String> names = users.stream()
    .map(User::getName)
    .toList();
```

## Immutability

| Pattern | Usage | Verdict |
|---------|-------|---------|
| `final` fields | All fields unless mutation required | ✅ REQ |
| `List.of()`, `Set.of()`, `Map.of()` | Immutable collections | ✅ PREF |
| `@Value` (Lombok) | Immutable DTOs | ✅ PREF |
| `@Builder` | Complex object construction | ✅ PREF |

## Library Usage Priority

> Check existing libraries before writing utility code.

| Priority | Library | Common APIs |
|----------|---------|-------------|
| 1 | JDK | `Objects`, `Optional`, `String`, `Math`, `Arrays`, `Collections`, `Files`, `Path` |
| 2 | Apache Commons | `StringUtils`, `CollectionUtils`, `Validate`, `FileUtils`, `IOUtils` |
| 3 | Guava | `Preconditions`, `Strings`, `Iterables`, `Lists`, `Maps`, `Multimap` |

**Common JDK Utilities:** Null check → `Objects.requireNonNull(x, "msg")`, Empty → `str.isBlank()` / `collection.isEmpty()`, Null-safe equals → `Objects.equals(a, b)`, Optional chain → `Optional.ofNullable(x).map(...).orElse(...)`

## Lombok Annotations

| Annotation | Usage | Verdict |
|------------|-------|---------|
| `@Slf4j` | Logging | ✅ REQ |
| `@RequiredArgsConstructor` | DI | ✅ REQ |
| `@Builder` | Complex objects | ✅ PREF |
| `@Value` | Immutable DTOs | ✅ PREF |
| `@Data` | Mutable entities only | ⚠️ CAUTION |
| `@Getter/@Setter` | Fine-grained control | ✅ OK |

## Logging

| Rule | Evidence | Verdict |
|------|----------|---------|
| Use `@Slf4j` | Lombok, SLF4J facade | ✅ REQ |
| No `System.out.println()` | Not production-ready | ❌ VIOL |
| No logs in tests | Clutter, slow | ❌ VIOL |
| Main code: warn/error only | Performance | ✅ PREF |
| Parameterized logging | `log.info("User: {}", userId)` | ✅ REQ |

## Test Patterns

### Structure

| Rule | Pattern | Verdict |
|------|---------|---------|
| BDD comments | `// GIVEN`, `// WHEN`, `// THEN` | ✅ REQ |
| `@DisplayName` on methods | Readable test names | ✅ REQ |
| No `@DisplayName` on class | Redundant | ✅ PREF |
| No Javadoc in tests | Unnecessary | ✅ REQ |

### AssertJ

| Pattern | Status |
|---------|--------|
| `.as("description")` on every assertion | ✅ REQ |
| `assertThat(x).isEqualTo(y)` | ✅ Specific value |
| `assertThat(list).hasSize(5)` | ✅ Specific count |
| `assertThat(x).isNotNull()` | ❌ Too weak |
| `assertThat(x).isNotEmpty()` | ❌ Too weak |
| `assertThat(x).isGreaterThanOrEqualTo(0)` | ❌ Too weak |
| `allSatisfy()` over `forEach` | ✅ REQ |
| `extracting().contains(tuple())` | ✅ For collections |

**Violations:**
```java
// ❌ Too weak
assertThat(result).isNotNull();
assertThat(list).isNotEmpty();

// ✅ Specific
assertThat(result).isEqualTo(expected);
assertThat(list).hasSize(3);
```

### No Conditionals

| Rule | Evidence | Verdict |
|------|----------|---------|
| No `if` in tests | Unpredictable paths | ❌ VIOL |
| Assert preconditions first | Then unconditional assert | ✅ REQ |

```java
// ❌ Conditional assertion
if (list.size() > 1) {
    assertThat(list.get(1)).isEqualTo(expected);
}

// ✅ Assert precondition, then assert
assertThat(list).as("precondition").hasSizeGreaterThan(1);
assertThat(list.get(1)).as("second element").isEqualTo(expected);
```

## Kotlin-Specific

| Pattern | Usage | Verdict |
|---------|-------|---------|
| `data class` for DTOs | Immutable by default | ✅ REQ |
| Extension functions | Utility methods | ✅ PREF |
| `?.let {}` over null checks | Idiomatic | ✅ PREF |
| `Duration` conversion | `1.seconds.toJavaDuration()` | ✅ REQ |
| `when` over `if-else` chains | Exhaustive matching | ✅ PREF |

## Spring Boot Patterns

| Pattern | Description | Verdict |
|---------|-------------|---------|
| `@Transactional` on service | Not repository | ✅ REQ |
| `ResponseEntity<T>` in controller | Proper HTTP responses | ✅ REQ |
| `@Valid` on request body | Input validation | ✅ REQ |
| Profile-specific config | `application-{profile}.yml` | ✅ REQ |

## SQL in Code

| Rule | Evidence | Verdict |
|------|----------|---------|
| No comments in SQL strings | Clutter logs | ✅ REQ |
| Use `.formatted()` | Java 15+ string formatting | ✅ PREF |
| Named parameters | `:paramName` in JPA | ✅ REQ |

## Common Violations Summary

| # | Violation | Fix |
|---|-----------|-----|
| 1 | Missing Entity suffix | Add `Entity` to JPA entities |
| 2 | Field injection | Use constructor injection |
| 3 | Loop instead of Stream | Convert to Stream API |
| 4 | `System.out.println` | Use `@Slf4j` |
| 5 | Missing `.as()` in test | Add description to assertion |
| 6 | `isNotNull()` assertion | Use specific value assertion |
| 7 | `if` in test | Assert precondition first |
| 8 | Writing utility that exists | Check JDK/Commons/Guava |
| 9 | Logs in tests | Remove all logging |
| 10 | `@Autowired` on field | Constructor injection |

## Tools

| Tool | Purpose |
|------|---------|
| Maven/Gradle | Build |
| Spring Boot | Framework |
| JUnit 5 | Testing |
| AssertJ | Assertions |
| Mockito | Mocking |
| Lombok | Boilerplate |
| WireMock | HTTP mocking |
