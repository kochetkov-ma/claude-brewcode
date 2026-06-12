# AI Tells -- Strip / Surface (PASS 1)

Condensed from validated catalog. Tiers:
- HIGH = mechanical artifact, ~zero human FP, single hit actionable.
- MED = real LLM-skew but present in human writing, act ONLY on co-occurring density (cluster), never on one instance.
- weak = high-FP folklore, tiebreaker inside an already-flagged passage only. Listed in section 6 as DROPPED -- do not flag standalone.

Action key: strip = remove safely. rewrite = reword to neutral/concrete. flag = surface to human, NEVER auto-edit (behavior-changing).

Core rule: never act on a single MED/weak surface feature. Detectors hit 61% FP on non-native English and flag the US Constitution. Position as "removes AI surface artifacts", not "detects AI authorship".

---

## 1. Universal-strip (HIGH, safe all flows)

| Pattern | Action | Scope | Src |
|---|---|---|---|
| Chat scaffolding: "Certainly!", "Absolutely!", "Great question!", "Sure, here's", "I hope this helps", "Here's the rewritten/revised" | strip | prose+chat | DeGPT |
| Self-reference: "As an AI language model", "As a large language model", knowledge-cutoff/refusal phrasing | strip | all | Wikipedia |
| Broken model markup: `oaicite`, `contentReference`, invalid DOIs, stray tokens | strip | all | Wikipedia |
| AI self-attribution comment: `// AI-generated`, `// Added by AI`, `# Claude suggestion`, `# TODO (AI)` | strip | code | Gatech |
| Co-author/bot trailer, generator banner: `Co-Authored-By: <bot>` | strip | code/commit | Gatech |
| Prompt/instruction residue as comment: `# Remember to paste...`, `// Replace with your...` placeholder narration | strip | code | Netcraft |
| Unicode in code/text: em-dash, smart quotes, arrows in comments/strings | normalize-ASCII | all | Gatech |

## 2. Prose tells

| Pattern | Action | Tier | Src |
|---|---|---|---|
| Opener "In today's fast-paced world / rapidly evolving landscape" | rewrite | HIGH | GPTZero (107x) |
| High-ratio phrases: "plays a significant role in shaping" (182x), "aims to explore" (50x), "notable works include" (120x) | rewrite | HIGH | GPTZero |
| "It's important to note / worth noting / worth mentioning" | strip/rewrite | MED-HIGH | Wikipedia |
| Trailing "-ing" significance tail: "...reshaping industries, highlighting their significance" | rewrite | MED-HIGH | Wikipedia |
| Copula avoidance: "serves as / stands as a testament" for is/are | rewrite | MED | Wikipedia |
| "Despite its... challenges" / "Challenges and Future" rigid template | rewrite | MED-HIGH | Wikipedia |
| Bold lead-in label: `**Key point:** ...` | strip-bold | MED | Wikipedia |

## 3. Code tells

| Pattern | Action | Tier | Src |
|---|---|---|---|
| Comment restates the line below, zero added info: `// Loop through users` over a `for`, `// Initialize the list`, `// Check if null` | strip | HIGH on density | Symantec |
| Comment on nearly every line / line-by-line narration | strip-redundant | HIGH density | Infosecurity |
| Tutorial framing: "Here we...", "Now we...", "First, we...", "Note that..." | strip/rewrite | MED-HIGH | Sohail |
| Emoji in comments/debug: `// 🔍 Search`, `print("✅ Done")` | strip | HIGH | Netcraft |
| Docstring/JavaDoc restates signature: `@param userId The user ID` = reworded identifier | strip-redundant | MED | Kuryuliya |
| Print/log narrating trivial steps: `print("Starting loop...")` | strip | MED | Netcraft |

> Strip docstring lines ONLY when text == reworded identifier. Never blanket-strip -- high-level JavaDoc is where AI is good.

## 4. Density-signals (MED -- act ONLY when several co-occur)

Never flag one. Weight by count; act when cluster crosses threshold.

| Pattern | Action | Src |
|---|---|---|
| Excess-vocabulary cluster: delve, underscore, showcase, meticulous, tapestry, intricate, pivotal, testament, resonate + crucial/comprehensive/notably | rewrite | PMC |
| Spatial-metaphor set: landscape, realm, ecosystem, navigate, foster | rewrite | Dead Language Society |
| Corporate verbs: leverage, harness, utilize, robust, seamless, streamline, embark | rewrite | Decrypt |
| Promotional tone on neutral topic: "nestled in the heart of", "rich cultural heritage" | rewrite | Wikipedia |
| Transition stacking: "Furthermore, Moreover, Additionally" (esp. moreover) | rewrite | Wikipedia |
| "plays a crucial/vital/significant role" | rewrite | Wikipedia |
| "a wide range / myriad of / treasure trove of / diverse array" | rewrite | hyacinth.ai |
| Empty hedge "both approaches have merit / it depends" with no stance | rewrite | DeGPT |
| Negative parallelism "It's not X, it's Y" / "not just X, but Y" -- density only, common in humans | rewrite | Wikipedia |
| Low burstiness / metronomic cadence (sentences 18-24 words, uniform paragraphs) | flag-rewrite | duey.ai |
| Section-banner overuse `# ===== HELPERS =====` in trivial files | strip | Diatom |

## 5. Surface-for-review (behavior-changing -- NEVER auto-strip)

Flag to human; silently editing changes meaning. Fabricated refs are BUGS, not cosmetics.

| Pattern | Tier | Src |
|---|---|---|
| Hallucinated package/method/URL refs: `import superjson_utils`, fake github URLs | HIGH | CACM (>half generated URLs hallucinated) |
| Fabricated issue/ticket refs: `// Fixes BUG-001` -- only strip if ID resolves to nothing, else surface | MED | R2 |
| Try/except wrapping everything | MED | Sohail |
| Repeated defensive checks: `if (arr && arr.length>0)` repeated | MED | R2 |
| Empty/generic catch-all: `catch (Exception e) {}` | MED | Diatom |
| Placeholder TODO logic in otherwise-complete code | MED | R2 |
| Ceremonial naming: `currentLoggedInUserAuthTokenValue` | MED | Kuryuliya |
| Unnecessary helper/abstraction layers, duplicated utilities | MED-HIGH | GitHub Blog |
| Inconsistent naming drift in one unit: `userData`->`user_data`->`data` | MED | R2 |
| Tests asserting only happy path, CI gaming (`npm test \|\| true`, deleted tests) | HIGH | GitHub Blog |

## 6. DROPPED / weak-only (do NOT flag standalone)

>50% FP, mislabels non-native writers. At most a faint tiebreaker inside an already-flagged passage.

| Pattern | Why dropped |
|---|---|
| Em-dash overuse | folklore; heavy in essayists; suppressed in GPT-5.1 |
| Rule of three / tricolon | standard human device |
| "Not only...but also" | common in humans, esp. listicles |
| Smart/curly quotes | auto-inserted by Word/Docs/CMS -- tool artifact |
| Clean grammar, standalone "In conclusion" | classic FP (Constitution, ESL) |
| Single vocab word (one "delve") | corpus signal is statistical over millions |
| Title Case headings | also house style |
| "Picture this / Imagine this" | standard human hook |
| Sterile/"too clean" code | formatters confound; AI code "usually looks fantastic" |
| 3+ blank lines, trailing whitespace | formatters collapse; safe cosmetic but weak tell |
