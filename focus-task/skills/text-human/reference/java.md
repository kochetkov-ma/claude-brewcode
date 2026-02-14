# Java/Kotlin Reference

> Language-specific rules for text-human skill

## File Classification

### Haiku (Simple)

| Type | Patterns |
|------|----------|
| Resources | `logback*.xml`, `pom.xml`, `build.gradle` |
| Small DTOs | `*.java` <50 lines, no logic |
| Properties | `application.properties`, `bootstrap.yml` |

### Sonnet (Complex)

| Type | Patterns |
|------|----------|
| Business logic | `*.java`, `*.kt` with logic |
| Tests | `*Test.java`, `*Spec.kt`, `*IT.java` |
| Config classes | `*Configuration.java`, `*Config.java` |
| Controllers | `*Controller.java`, `*RestController.java` |
| Services | `*Service.java`, `*ServiceImpl.java` |
| Repositories | `*Repository.java`, `*Dao.java` |
| Mapper XML | MyBatis/JOOQ dynamic SQL |

### Classification Logic

| Extension | Condition | Result |
|-----------|-----------|--------|
| java, kt | Contains `@Test`, `@Configuration`, `@Service`, `@Repository` | COMPLEX |
| java, kt | <50 lines, no nested classes | SIMPLE |
| java, kt | Otherwise | COMPLEX |
| groovy | Spock tests, Gradle scripts | COMPLEX |

---

## JavaDoc Cleanup

Remove JavaDoc from: private methods, test files, obvious classes. Keep logic description, remove trivial @param/@return.

| Remove | Keep |
|--------|------|
| All private/package-private methods | Public API docs with non-obvious behavior |
| All test files (`*Test.java`, `*Spec.kt`, test helpers) | @DisplayName on test methods |
| Obvious DTOs/Entities (name describes purpose) | Complex business logic explanation |
| All @param (restates param name) | `@throws` with specific conditions |
| All @return (restates method name) | Non-obvious side effects |
| Class doc when class name is self-explanatory | External API contracts |

### Logic vs Parameters Rule

**NEVER convert JavaDoc `/** */` to inline `//` comment.** Two rules:

1. **JavaDoc is unnecessary** (private method, obvious class) → DELETE entirely, no replacement
2. **JavaDoc has useful description but trivial @param/@return** → strip @param/@return, keep description as single-line `/** ... */`

```java
// BEFORE - useful description + trivial @param/@return:
/**
 * Converts USD to target currency. Returns unchanged if USD.
 * @param amount the amount
 * @param currency the currency
 * @return converted amount
 */

// AFTER - keep description as single-line JavaDoc, strip @param/@return:
/** Converts USD to target currency. Returns unchanged if USD. */
BigDecimal convertCurrency(BigDecimal amount, CurrencyCode currency) { }

// KEEP @param - explains non-obvious behavior:
/**
 * @param hasExtraStops true=include ALL loads, false/null=only WITHOUT extra stops
 */
```

### Private Methods

```java
// REMOVE - private methods don't need JavaDoc:
/** Validates the filter. */
private boolean isValidFilter(Filter f) { }

/** Builds full condition. */
private Condition buildFullCondition() { }

/** Rounds value to scale. @param value the value @param scale the scale */
private Double roundToScale(double value, int scale) { }
```

### Obvious DTOs/Entities

```java
// REMOVE - class name is self-explanatory:
/** Filter DTO for rates history queries. */
@Value @Builder
public class RatesHistoryFilter { }

/** Entity for rate history data. */
@Value @Builder
public class HistoryRateEntity { }

// KEEP - adds non-obvious context:
/** Cached for 1 hour. Thread-safe via copy-on-write. */
public class CompanyCache { }
```

### Test Files

Remove all JavaDoc from: test classes (`*Test.java`, `*Spec.kt`), test helpers (`*Data.java`, `*Requests.java`, `*Fixtures.java`), any file in `src/test/`.

```java
// REMOVE - test class:
/** Test class for LoadsHistoryRepository. */
class LoadsHistoryRepositoryTest {
    /** Tests filtering by company ID. */
    @Test void testFilterByCompanyId() { }
}

// REMOVE - test helper classes:
/** Expected data for rates stats tests. */
@UtilityClass
public class RatesStatsExpectedData {
    /** Factory method for expected stats. */
    public static Stats expected() { }
}

// CORRECT - no JavaDoc, clear method names:
class LoadsHistoryRepositoryTest {
    @Test
    @DisplayName("Should filter loads by company ID")
    void filterByCompanyId() {
        // GIVEN
        // WHEN
        // THEN
    }
}

@UtilityClass
public class RatesStatsExpectedData {
    public static Stats expected() { }
}
```

---

## Comments

| Remove | Keep |
|--------|------|
| `// Initialize the list` | `// Retry 3x due to flaky external API` |
| `// Loop through items` | `// Uses UTC to match database timezone` |
| `// Check if null` | `// Thread-safe: synchronized on class lock` |
| Stale `// TODO: refactor this` | `// HACK: workaround for JDK-12345` |

Preserve all BDD comments: `// GIVEN`, `// WHEN`, `// THEN`, `// AND`

---

## Issue References

```java
// REMOVE - AI-invented numbers:
// BUG-001 fix: ...
// FIX-123: ...
// ISSUE-42: ...

// KEEP - real ClickUp/Jira tickets:
// INTELDEV-19207: ...
// Workaround for JIRA-12345
```

Keep project-specific ticket patterns (INTELDEV-XXXXX, JIRA-XXXXX). Remove generic patterns (BUG-001, FIX-123).

---

## Pre-Completion Checklist

| Check | Rule |
|-------|------|
| [ ] | Private methods: no JavaDoc on private/protected/package-private methods |
| [ ] | Test files: no JavaDoc on `*Test.java`, `*Spec.kt`, or any file in `src/test/` |
| [ ] | Test helpers: no JavaDoc on `*Data.java`, `*Requests.java`, `*Fixtures.java` |
| [ ] | Obvious DTOs: no JavaDoc if class name is self-explanatory |
| [ ] | Trivial @param: no `@param id the id` or similar restating param name |
| [ ] | Trivial @return: no `@return` that restates method name |
| [ ] | Lombok: no docs on `@Value`, `@Data`, `@Builder` classes unless non-obvious |

### Scan Pattern

```
# Semantic search queries for grepai_search:
grepai_search("private methods with javadoc")
grepai_search("trivial param documentation")
grepai_search("test helper classes")
grepai_search("DTO classes with javadoc")

# Fallback grep patterns:
grep -n "^\s*/\*\*" <file>           // Find all JavaDoc
grep -n "private.*{" <file>          // Find private methods
```

### Files to Double-Check

Repository classes (private helper methods), Service classes (internal methods), Test helper classes (not ending in `Test`), DTOs/Entities (redundant class-level JavaDoc).

---

## File Inclusion

| Include | Exclude |
|---------|---------|
| `*.java`, `*.kt`, `*.groovy` | `*.class`, `*.jar`, `*.war` |
| `pom.xml`, `build.gradle`, `build.gradle.kts` | `target/`, `build/`, `.gradle/` |
| `*.xml` (Spring, MyBatis) | Generated sources |
| `*.properties`, `*.yaml`, `*.yml` | IDE files (`.idea/`, `*.iml`) |
