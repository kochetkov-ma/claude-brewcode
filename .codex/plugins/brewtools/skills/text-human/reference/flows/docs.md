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
Apply that section and the global hard-guards.

## Sub-profile: PR / commit (terse)
Triggered by pr/pull request/commit/changelog intent or commit-message content: apply the
human-patterns.md "commit / PR" section instead.

## Surface-for-review
Hallucinated URLs/refs and fabricated tickets -> surface, never silently insert or delete.
