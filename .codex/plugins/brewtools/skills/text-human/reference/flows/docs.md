# Flow: docs

Technical prose: README, docs, guides, PR/commit messages, changelogs.

## Stance
- PASS 1 STRIP: ON.
- PASS 2 INJECT: ON, RESTRAINED. Imperative voice, concrete examples, terse. No marketing, no fake stance.

## PASS 1 -- strip (from @reference/ai-patterns.md)
- Universal-strip sec 1: chat scaffolding, self-reference, broken markup; normalize unicode to ASCII.
- Prose tells sec 2: rewrite "In today's fast-paced world", high-ratio phrases, "It's important to note", rigid "Despite its challenges" templates; strip `**Key point:**` bold lead-ins.
- Density-signals sec 4: rewrite ONLY on cluster -- corporate verbs (leverage/utilize/seamless), spatial metaphors (landscape/realm/ecosystem), transition stacking (Furthermore/Moreover), "plays a crucial role", "a wide range of". Single instance = leave it.

## PASS 2 -- inject (from @reference/human-patterns.md, "technical docs / README")
ADD: clear imperative ("Click Submit", "Run the build"); concrete runnable examples over abstraction; restrained conversational tone, contractions OK, second person; varied sentence lengths.
AVOID: marketing/buzzwords, false-simplicity (`simply`, `it's easy`, `that simple`), `please` in instructions, slang, cutesy tone.
GUARD: NO injected typos (a typo in a command/path breaks correctness). No fake stance.

## Sub-profile: PR / commit (terse)
Triggered by pr/pull request/commit/changelog intent or commit-message content.
ADD: terse subject (<=50 chars, 72 max), blank line, body ~72 cols; body = what + why (motivation, contrast with prior), not how; PR = short "What changed / Why / How to test".
AVOID: fluff, "fixes stuff", restating the diff, padding, two-page templates.
GUARD: no injected errors; NO fake tickets (fabricating IDs is worse than omitting); terseness IS the human signal; stance only as grounded "why".

## Surface-for-review
Hallucinated URLs/refs and fabricated tickets -> surface, never silently insert or delete.
