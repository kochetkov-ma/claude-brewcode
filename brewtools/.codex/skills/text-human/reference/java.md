# Java/Kotlin Reference

## File Classification

### fast model (Simple)

| Type | Patterns |
|------|----------|
| Resources | `logback*.xml`, `pom.xml`, `build.gradle` |
| Small DTOs | `*.java` <50 lines, no logic |
| Properties | `application.properties`, `bootstrap.yml` |

### balanced model (Complex)

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

Remove only redundant JavaDoc, regardless of visibility or test location. Keep useful contracts, logic, security/tool directives and non-obvious behavior; strip only trivial @param/@return.

| Remove | Keep |
|--------|------|
| Redundant private/package-private docs | Useful contracts on any visibility, including protected methods |
| Redundant test/helper docs (`*Test.java`, `*Spec.kt`) | Test invariants, fixture contracts, @DisplayName and GIVEN/WHEN/THEN/AND |
| Obvious DTOs/Entities, Lombok `@Value`/`@Data`/`@Builder` classes (name describes purpose) | Complex business logic explanation |
| All @param (restates param name) | `@throws` with specific conditions |
| All @return (restates method name) | Non-obvious side effects |
| Class doc when class name is self-explanatory | External API contracts |

### Logic vs Parameters Rule

**NEVER convert JavaDoc `/** */` to inline `//` comment.** Two rules:

1. **JavaDoc adds no information** → delete only redundant prose, no replacement; visibility alone proves nothing.
2. **Useful description with trivial @param/@return** → strip only trivial tags, retain `/** ... */`; single-line only if formatting preserves tags/contract.

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
// REMOVE - these private-method docs merely restate their names:
/** Validates the filter. */
private boolean isValidFilter(Filter f) { }

/** Rounds value to scale. @param value the value @param scale the scale */
private Double roundToScale(double value, int scale) { }
```

### Obvious DTOs/Entities

```java
// REMOVE - class name is self-explanatory:
/** Filter DTO for rates history queries. */
@Value @Builder
public class RatesHistoryFilter { }

// KEEP - adds non-obvious context:
/** Cached for 1 hour. Thread-safe via copy-on-write. */
public class CompanyCache { }
```

### Test Files

Review test classes (`*Test.java`, `*Spec.kt`), helpers (`*Data.java`, `*Requests.java`, `*Fixtures.java`) and `src/test/`; remove only redundant docs. Preserve fixture assumptions, edge cases, GIVEN/WHEN/THEN/AND and docs consumed by tools.

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

// CORRECT - redundant JavaDoc removed; useful test/fixture contracts stay:
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

Comments, BDD markers and issue references: `flows/code.md`.

---

## File Inclusion

| Include | Exclude |
|---------|---------|
| `*.java`, `*.kt`, `*.groovy` | `*.class`, `*.jar`, `*.war` |
| `pom.xml`, `build.gradle`, `build.gradle.kts` | `target/`, `build/`, `.gradle/` |
| `*.xml` (Spring, MyBatis) | Generated sources |
| `*.properties`, `*.yaml`, `*.yml` | IDE files (`.idea/`, `*.iml`) |
