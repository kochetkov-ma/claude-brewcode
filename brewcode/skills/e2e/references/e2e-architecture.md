# Layered E2E Test Architecture

Stack-agnostic reference for e2e-architect and e2e-automation-tester agents.

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│  Test Classes (by domain)                   │
│  extends BaseE2E / BaseDomainE2E            │
│  contains: parameterized tests + steps      │
├─────────────────────────────────────────────┤
│  Steps Layer (business steps)               │
│  reusable across tests                      │
│  Given/When/Then steps                      │
├─────────────────────────────────────────────┤
│  Verification Layer (assertion steps)       │
│  strict checks, full comparison             │
├─────────────────────────────────────────────┤
│  Data Layer                                 │
│  generation / storage / preparation         │
│  API default; DB exception only per D2      │
├─────────────────────────────────────────────┤
│  Support Layer                              │
│  KafkaSupport, DatabaseSupport, HttpSupport │
│  technical integration utilities            │
├─────────────────────────────────────────────┤
│  Config Layer                               │
│  test environment settings                  │
│  credentials, endpoints, timeouts           │
└─────────────────────────────────────────────┘
```

## Key Architecture Requirements

| # | Requirement | Details |
|---|-------------|---------|
| 1 | No direct code in tests | No API calls, no UI element access -- everything through Steps layer |
| 2 | Steps = business language | `givenUserIsAuthorized("admin")`, not `httpClient.post("/auth", ...)` |
| 3 | Parameterized tests | One test method handles multiple data sets; data lives outside test logic |
| 4 | Base classes | `BaseE2E` (shared) -> `Base{Domain}E2E` (per domain) -> concrete tests |
| 5 | Support, not Utils | Naming: `{Technology}Support` (e.g. `KafkaSupport`, `DatabaseSupport`) |
| 6 | Given/When/Then separation | Via framework features if available, otherwise via `// GIVEN` `// WHEN` `// THEN` comments |
| 7 | Annotations and metadata | Maximize framework features: display names, tags, step annotations, severity |
| 8 | Reporting via framework | Reporter > Logger > nothing; never rely on stdout for test results |

## Layer Details

### Test Classes

**Purpose:** Domain-specific test scenarios. Each class covers one bounded context or feature area.

**Naming:** `{Domain}{Feature}E2ETest` (e.g. `PaymentRefundE2ETest`)

**Depends on:** Steps, base classes only.

```pseudo
class OrderCreationE2ETest extends BaseOrderE2E:

    @ParameterizedTest(dataSets: standardOrders)
    @DisplayName("Order is created and confirmed for {orderType}")
    test createOrder(orderType, expectedStatus):
        // GIVEN
        steps.givenAuthenticatedUser("buyer")
        steps.givenProductAvailable(orderType.productId)
        // WHEN
        steps.whenUserCreatesOrder(orderType)
        // THEN
        steps.thenOrderHasStatus(expectedStatus)
```

### Steps Layer

**Purpose:** Business-readable actions. Each method is one logical step in domain language.

**Naming:** `{Domain}Steps` (e.g. `OrderSteps`, `PaymentSteps`)

**Depends on:** Verification, Data, Support layers.

```pseudo
class OrderSteps:

    @Step("User creates order of type {orderType}")
    whenUserCreatesOrder(orderType):
        payload = orderData.buildOrderPayload(orderType)
        response = httpSupport.post("/api/orders", payload)
        context.storeOrderId(response.body.id)

    @Step("Order has status {expectedStatus}")
    thenOrderHasStatus(expectedStatus):
        verification.thenOrderHasStatus(expectedStatus)
```

### Verification Layer

**Purpose:** Assertion logic isolated from test flow. Strict checks with full object comparison.

**Naming:** `{Domain}Verification` (e.g. `OrderVerification`)

**Depends on:** Support layer (to fetch actual state), Config (timeouts).

```pseudo
class OrderVerification:

    @Step("Order has status {expectedStatus}")
    thenOrderHasStatus(expectedStatus):
        orderId = context.getOrderId()
        actual = httpSupport.get("/api/orders/{orderId}")
        assertThat(actual.status)
            .describedAs("Order %s status", orderId)
            .isEqualTo(expectedStatus)
```

### Data Layer

**Purpose:** Test data generation, preparation, and cleanup. Public API is preferred; UI is
acceptable. Direct DB mutation is a last resort ONLY after explicit user confirmation (D2),
encapsulated as Data -> DatabaseSupport -> Config; tests never write DB directly.

**Naming:** `{Domain}Data` (e.g. `OrderData`, `UserData`)

**Depends on:** Support and Config (generation/settings) only; no upward dependencies.

```pseudo
class OrderData:

    buildOrderPayload(orderType):
        return OrderPayload(
            type: orderType,
            items: generateItems(orderType),
            timestamp: now()
        )

    prepareTestProduct(productId):
        httpSupport.post("/api/admin/products", defaultProduct(productId))
```

### Support Layer

**Purpose:** Technical integration wrappers. One class per technology. Stateless where possible.

**Naming:** `{Technology}Support` (e.g. `HttpSupport`, `KafkaSupport`, `DatabaseSupport`)

**Depends on:** Config layer only.

```pseudo
class KafkaSupport:

    constructor(config):
        this.bootstrapServers = config.get("kafka.bootstrap-servers")
        this.consumer = createConsumer(this.bootstrapServers)

    consumeMessages(topic, timeout):
        return this.consumer.poll(topic, timeout)

    publishMessage(topic, key, payload):
        this.producer.send(topic, key, serialize(payload))
```

### Config Layer

**Purpose:** Environment-specific settings. Single source of truth for endpoints, credentials, timeouts.

**Naming:** `TestConfig`, `E2EConfig`, or framework-specific config file.

**Depends on:** Nothing. This is the bottom layer.

```pseudo
class TestConfig:

    baseUrl = env("BASE_URL", "http://localhost:8080")
    dbHost = env("DB_HOST", "localhost")
    kafkaServers = env("KAFKA_SERVERS", "localhost:9092")
    defaultTimeout = duration("30s")
    retryAttempts = 3
```

## Stack Mapping

| Concept | Java/JUnit5 | Python/pytest | JS/Playwright | C#/NUnit |
|---------|-------------|---------------|---------------|----------|
| Test class | `class *E2ETest` + `@ExtendWith` | `class Test*` | `test.describe(...)` | `[TestFixture] class *E2ETest` |
| Parameterized | `@ParameterizedTest` + `@MethodSource` | `@pytest.mark.parametrize` | `for...of testData` | `[TestCaseSource]` |
| Base class | `extends BaseE2E` | `class BaseE2E:` | `class BaseE2E` | `: BaseE2E` |
| Steps | Allure `@Step` methods | `allure.step()` context | `test.step("...", ...)` | `[AllureStep]` attribute |
| Assertions | AssertJ `assertThat()` | `assert` + pytest introspection | `expect()` | FluentAssertions `Should()` |
| Reporter | Allure / ExtentReports | Allure / pytest-html | Playwright HTML reporter | Allure / ExtentReports |
| Support class | `KafkaSupport.java` | `kafka_support.py` | `kafkaSupport.ts` | `KafkaSupport.cs` |
| Config | `application-test.yml` | `conftest.py` + env | `playwright.config.ts` | `appsettings.test.json` |
| Tags/Groups | `@Tag("smoke")` | `@pytest.mark.smoke` | `test.describe.configure({tag})` | `[Category("smoke")]` |
| Display name | `@DisplayName("...")` | docstring or `ids=` param | test title string | `[Description("...")]` |
| Lifecycle hooks | `@BeforeAll` / `@AfterAll` | `setup_class` / fixtures | `beforeAll` / `afterAll` | `[OneTimeSetUp]` / `[OneTimeTearDown]` |

## Dependency Rules

Diagram: primary flow. The table below defines every allowed direct edge, including fan-out
and the separate base lifecycle preparation context.

```
Test Classes
    |
    v
Steps Layer
    |
    +------+------+
    |             |
    v             v
Verification   Data Layer
    |             |
    +------+------+
           |
           v
    Support Layer
           |
           v
    Config Layer
```

**Allowed direct dependencies (only these top-down edges):**

| Source Layer | Can Access |
|-------------|-----------|
| Test Classes | Steps, base classes |
| Base-class lifecycle setup only | Data, Support, Config for environment/data preparation; scenario actions remain in Steps |
| Steps | Verification, Data, Support |
| Verification | Support, Config |
| Data | Support, Config |
| Support | Config |
| Config | Nothing (leaf layer) |

**Forbidden:**

| Rule | Reason |
|------|--------|
| Test Classes -> Support | Tests must not bypass Steps; keeps tests readable |
| Test Classes -> Data | Data preparation belongs in Steps or base class setup |
| Test Classes -> Verification | Assertions enter through business Steps, which delegate to Verification |
| Test Classes -> Config | Use the base-class API or Steps' permitted Verification/Data/Support collaborators; Steps does not gain a direct Config edge |
| Steps -> Test Classes | No upward dependencies; breaks reusability |
| Support -> Steps | Support is generic; must not know about business logic |
| Config -> anything | Config is passive; read-only, no side effects |
| Any unlisted direct dependency | Only the edges in the allowed table are legal: Steps fan out to Verification/Data/Support; Verification and Data may also read Config; Support reads Config; Config is a leaf. No arbitrary bypass |

Base lifecycle setup retains its existing preparation responsibility: it may call Data/Support
and read Config only during setup/cleanup, never expose those calls as test-method shortcuts.
It does not let test methods call Verification directly. The D2 DB exception remains ONLY
after explicit user confirmation through Data -> DatabaseSupport, including base-initiated setup.
