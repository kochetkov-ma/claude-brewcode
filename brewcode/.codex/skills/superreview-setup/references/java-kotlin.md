---
doc_type: llm
version: "{PLUGIN_VERSION}"
content_version: "{CONTENT_VERSION}"
generated_by: "{GENERATED_BY}"
last_updated: "{LAST_UPDATED}"
---

# Java/Kotlin Standards Reference

Standards for Java/Kotlin enterprise projects. The project's own rules in `.codex/rules/*` + `.codex/convention/*`
are authoritative — where this guidance conflicts, the **project rule WINS**. Cite the project rule # when enforcing.

## Tech-Specific Checks (priority dimensions)

| Category | Checks |
|----------|--------|
| DI | Constructor injection only (`@RequiredArgsConstructor` + final fields); field `@Autowired` = VIOLATION (harder to test, hidden deps) |
| Transactions | `@Transactional` scope (service not repository), rollback rules, isolation |
| Null-safety | `Optional` usage, `@NonNull`/`@Nullable`, `Objects.requireNonNull` |
| N+1 | Eager vs lazy loading, batch fetching, entity graphs |
| Reuse | JDK -> Apache Commons -> Guava before writing utility code |
| Security | `@PreAuthorize`, input validation, SQL injection (report only if CRITICAL/P0) |
| Lombok | `@Value`/`@Builder`/`@Slf4j`; `@Data` only on mutable entities |
| Pins | exact `X.Y.Z`; no floating/`@1.0.0` dependency |

## File Patterns

| Type | Patterns |
|------|----------|
| Source | `*.java`, `*.kt`, `*.kts` |
| Build | `pom.xml`, `build.gradle`, `build.gradle.kts` |
| Tests | `*Test.java`, `*Test.kt`, `*IT.java` |
| Config | `application.yml`, `application.properties` |

## Naming

| Type | Convention | Example |
|------|------------|---------|
| Entity | `*Entity` suffix | `UserEntity` |
| DTO Response | `*Response` | `UserResponse` |
| DTO Request | `*Request` | `CreateUserRequest` |
| Repository | `*Repository` | `UserRepository` |
| Service | `*Service` | `UserService` |
| Controller | `*Controller` | `UserController` |

## Stream API & Functional Style

| Rule | Verdict |
|------|---------|
| Prefer Stream API over imperative loops | REQ |
| Method references over lambdas (`User::getName`) | PREF |
| No side effects in streams | REQ |
| `toList()` over `collect(Collectors.toList())` (Java 16+) | PREF |

## Immutability

`final` fields by default; `List.of()`/`Set.of()`/`Map.of()` for immutable collections; Lombok `@Value` for
immutable DTOs; `@Builder` for complex construction.

## Logging

`@Slf4j` + SLF4J facade; parameterized `log.info("User: {}", id)`; no `System.out.println`; no logs in tests; main
code at warn/error only. Never log secrets (security — P0).

## Test Patterns

| Rule | Verdict |
|------|---------|
| BDD comments `// GIVEN / // WHEN / // THEN` | REQ |
| `@DisplayName` on methods, not class | REQ |
| No Javadoc in tests | REQ |
| `.as("description")` on EVERY AssertJ assertion | REQ |
| Concrete: `isEqualTo(y)` / `hasSize(n)` over weak `isNotNull()` / `isNotEmpty()` / `>=` | REQ |
| No `if` in tests (assert precondition first, then unconditional assert) | VIOL |
| `allSatisfy()` over `forEach`; `extracting().contains(tuple())` for collections | REQ |

```java
// Weak — avoid
assertThat(result).isNotNull();
// Specific
assertThat(result).as("created user").isEqualTo(expected);
assertThat(list).as("result size").hasSize(3);
```

## Spring Boot Patterns

`@Transactional` on service; `ResponseEntity<T>` in controllers; `@Valid` on request bodies;
profile-specific `application-{profile}.yml`.

## Kotlin-Specific

`data class` for DTOs; extension functions for utilities; `?.let {}` over null checks; `when` over `if-else` chains;
`Duration` conversions explicit.

## Search Locations (reuse-first)

`**/util/`, `**/common/`, `**/shared/`, `**/core/`, `**/helper/`.

## Tools

Maven/Gradle, Spring Boot, JUnit 5, AssertJ, Mockito, Lombok, WireMock, Testcontainers.
