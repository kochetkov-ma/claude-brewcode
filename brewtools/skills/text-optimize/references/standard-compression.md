# Standard Compression Mode

## 1. Scope

Standard mode compresses text while keeping it human-readable. Target: **30-50% reduction**. Unlike deep mode, output must remain clear to humans, not just LLMs. Use for README files, documentation, API references, and user-facing docs.

## 2. Filler Removal Patterns

Apply filler removal from `rules-review.md` rule T.6 as baseline. Standard mode additional patterns:

| Pattern | Replace With |
|---------|-------------|
| "In order to" | "To" |
| "Due to the fact that" | "Because" |
| "At this point in time" | "Now" |
| "For the purpose of" | "For" |
| "In the event that" | "If" |
| "With regard to" | "About" |
| "A large number of" | "Many" |
| "Is able to" / "Has the ability to" | "Can" |
| "In spite of the fact that" | "Although" |
| Passive voice | Active voice where possible |
| "You should" / "You need to" | Imperative verb directly |

## 3. Structural Techniques

- Convert verbose paragraphs to bullet points when listing items
- Use tables for comparisons (3+ attributes across 2+ items)
- Merge paragraphs that repeat the same idea
- Replace long examples with concise ones
- Convert step-by-step prose to numbered lists
- Remove redundant section headers
- Combine related short sections

## 4. Abbreviation Rules (Conservative)

Only abbreviate in:

- Tables (space-constrained)
- Inline code references
- Well-known acronyms (API, URL, CLI, etc.)

Keep full words in prose for readability.

## 5. Verification Checklist

After compression, verify:

- [ ] All facts preserved (names, numbers, dates, URLs, paths, versions)
- [ ] No semantic changes to rules or instructions
- [ ] Negative rules remain negative
- [ ] Examples still present (at least one per concept)
- [ ] Document still readable by a human unfamiliar with the topic
- [ ] Compression ratio is 30-50%
- [ ] No information merged incorrectly (two different concepts collapsed into one)
- [ ] Headers and structure still logical

## 6. What NOT to Compress

- Code blocks (compress surrounding prose, not code)
- API signatures and parameters
- Error messages (exact text matters)
- Legal/compliance text
- Version numbers, dates, URLs
- Command-line examples

## 7. Before/After Examples

### Example 1: README Intro

**Before** (~80 words):
> This project is a command-line tool that is able to help developers in order to automate the process of deploying their applications. It is important to note that the tool supports a large number of cloud providers. Due to the fact that deployment can be complex, this tool simplifies it for the purpose of reducing errors and saving time.

**After** (~35 words):
> CLI tool that automates application deployment. Supports many cloud providers. Simplifies complex deployments to reduce errors and save time.

### Example 2: Installation Instructions

**Before**:
> In order to install this tool, you should first make sure to have Node.js installed on your system. You need to verify that your Node.js version is 18 or higher. After you have confirmed this, you should run the following command. Please note that you may need administrator privileges.

**After**:
1. Install Node.js 18+
2. Run the install command (may require admin privileges):
   ```
   npm install -g tool-name
   ```

### Example 3: Prose Comparison to Table

**Before**:
> The free plan supports up to 3 projects and provides 1 GB of storage with community support. The pro plan supports unlimited projects and provides 50 GB of storage with email support. The enterprise plan also supports unlimited projects but provides 500 GB of storage with dedicated support.

**After**:

| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| Projects | 3 | Unlimited | Unlimited |
| Storage | 1 GB | 50 GB | 500 GB |
| Support | Community | Email | Dedicated |
