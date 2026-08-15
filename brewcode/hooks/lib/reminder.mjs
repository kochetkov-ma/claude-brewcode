/**
 * Manager-role reminder text — the single normative copy.
 *
 * Two hooks on DIFFERENT events must inject byte-identical text: forced-eval.mjs
 * (UserPromptSubmit) and role-recall.mjs (SessionStart/compact). Kept here because
 * a duplicated copy drifts on the first wording edit.
 */

// MANAGER_ROLE trigger is expert match, not task size — "heavy" wording let domain
// tasks (ssh, deploy) bypass delegation even when a project expert existed.
// SPLIT covers what models still get wrong: subagent sizing + context handoff.
// No skill-activation nudge: modern models pick skills on their own.
export const MANAGER_ROLE = '[ROLE] Manager: scan agents (project .claude/agents/ first) - expert for this domain exists -> delegate regardless of size; no expert or trivial one-off -> self.';
export const SPLIT = '[SPLIT] One agent for an hour = drift you cannot observe: split into bounded units (1 deliverable, ~5 files, ~20 min), fan out in ONE message; a dependency must be a REAL data handoff, else parallel; every spawn prompt carries goal + scope + what is already done + who consumes the result + acceptance.';
// BRANCH: sessions default to main and inherit the whole workspace - a branch/PR
// is opt-in, stated by the user, never inferred.
export const BRANCH = '[BRANCH] Stay on the current branch; none chosen -> main. No explicit branch/PR instruction -> work on main and take over ALL workspace changes, incl. from other sessions.';

export const REMINDER_TEXT = `${MANAGER_ROLE}\n${SPLIT}\n${BRANCH}`;
