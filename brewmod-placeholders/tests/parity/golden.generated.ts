// Frozen spec from brewtools v6.7.0 (real hook output): VECTORS never edited by hand; PLACEHOLDER_FILES = placeholders/*.md (m.plan `plan: add` since 6.9.2).
// expected = additionalContext of brewtools for hookPrompt (null = hook answered {}); prefix != ++ rewrites header tokens only.

export type GoldenFile = { legacy: string; layer: 'project' | 'global'; raw: string }
export type GoldenVector = {
  id: string
  group: string
  prompt: string
  hookPrompt: string
  mode: string | null
  prefix: string
  files: GoldenFile[]
  expected: string | null
  length: number | null
  sha: string | null
  note?: string
}

export const PLACEHOLDER_FILES: Record<string, string> = {
  "+": "---\nname: \"+\"\ndescription: \"Anti-drift cron plan addon, active in Plan mode only\"\ninsert: context\nwhen: plan\norder: 10\nheader: \"User typed `{token}` in Plan mode — plan the task anti-drift cron:\"\nlegacy: cron-plan\n---\n# [ADDON: ANTI-DRIFT CRON PLAN]\n\nStay read-only in Plan mode: plan the schedule now, never create it before execution. Add an execution step to the task-board plan: announce and create one unique session cron per top-level task, hourly by default or at the user's interval, using available native scheduling tools. Record its task-specific prompt, schedule ID, timezone, tick count and stop rule in that task's methodology. If scheduling is unavailable, report the gap without claiming a schedule exists.\n\nEach tick rereads the goal, task-specific methodology and anti-drift rules; collects active agent updates; reconciles task statuses, dependencies and remaining work; repairs stale dependencies; updates the task graph, keeping all unfinished entries and only the latest 10 completed entries, with older completion evidence preserved outside the active graph. It checks delivered work against the end goal, corrects drift, and identifies remaining acceptance criteria, progress, problems, blockers and user questions.\n\nThen it emits an extremely compact, clearly formatted report: `HH:MM TZ · tick N · elapsed`; `🟢 completed`; `🔵 active / remaining / next`; `🔴 problems / blockers / questions`; `⚪ anti-drift verdict`. Omit empty rows; use only these circles. Stop and verify cron removal on task completion or cancellation.\n",
  "a": "---\nname: \"a\"\ndescription: \"Architecture-first: delegate the design to expert agents before implementing\"\ninsert: context\nwhen: always\norder: 30\nheader: \"User typed `{token}` — Architecture-first discipline is active for this turn:\"\nlegacy: architect\n---\n[DIRECTIVE: ARCHITECTURE-FIRST]\n\nBefore implementing, delegate the design to a matching architect/reviewer\nexpert agent, else general-purpose - never design inline. Split a large\ndesign by area across several agents, never one long pass. Brief each: area +\nout-of-bounds, what's decided (must not reopen), who consumes the design next.\n\nRequired of the design:\n- Fits existing architecture/patterns/rules/conventions - breaks nothing that\n  works.\n- As simple as possible while staying scalable - no over-engineering.\n- Abstractions only where earned: reuse the closest well-built repo\n  counterpart's patterns/classes, new pattern only if nothing fits - additive\n  to conventions/rules/docs, never instead.\n- Clean seams/boundaries so the code stays easy to modify.\n\nDeliverable before coding: a short, concrete plan - components, boundaries,\ndata flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,\nwrite it into the plan.\n",
  "m": "---\nname: \"m\"\ndescription: \"Manager mode: orchestrate and delegate, never code in the main context\"\ninsert: context\nwhen: always\norder: 20\nheader: \"User typed `{token}` — Manager mode is active for this turn:\"\nlegacy: full\n---\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.\n",
  "m.plan": "---\nname: \"m\"\ndescription: \"Manager mode in Plan mode: the manager text plus the plan addon\"\ninsert: context\nwhen: plan\nplan: add\norder: 20\nheader: \"User typed `{token}` — Manager + Plan Mode is active for this turn:\"\nlegacy: planmode\n---\n[ADDON: PLAN MODE]\n\nStay read-only: no code, board/task-state writes, installation, configuration,\nor cron creation. Read-only expert exploration is allowed.\n\nInclude in the plan (English, token economy):\n- PREAMBLE: [ROLE: MANAGER] + the 5-step protocol restated verbatim as the\n  plan's opening section - this addon expires, so the plan carries the role\n  into implementation, no hook needed.\n- STEP 0, stated literally: \"Re-assume the MANAGER role. Call TaskList; if no\n  graph exists, create the ENTIRE TaskGraph now - TaskCreate for every node, or\n  the numbered checklist if task tools are absent - then delegate.\" On exit\n  this comes first: not code, not one task.\n- The full TaskGraph: every task decomposed (subject, acceptance, owner\n  agent, bounded scope+acceptance per spawn), dependencies marked, parallel\n  branches explicit, critical path named.\n\nInclude the task-board execution step: announce and create one unique session\nanti-drift cron per top-level task, hourly unless the user chooses another tick;\nduring execution record its task-specific methodology/prompt, timezone, ID,\ntick count and stop rule. Scheduling unavailable -> explicit gap, never a\nclaimed schedule. Each tick: reread methodology/anti-drift rules, collect agent\nupdates, reconcile status/dependencies/goal, keep all unfinished + latest 10\ncompleted graph entries, preserve older evidence outside the active graph.\nThe tick report is `HH:MM TZ · tick N · elapsed`, then only the nonempty rows:\n🟢 completed, 🔵 active/remaining/next, 🔴 problems/blockers/questions,\n⚪ anti-drift verdict. Completion/cancellation -> stop and verify cron removal.\n\nDeliver the embedded role + graph + deferred cron step, not implementation code.\n",
  "r": "---\nname: \"r\"\ndescription: \"Two-phase review: review every significant change, then double-check each finding\"\ninsert: context\nwhen: always\norder: 40\ngroup: review\npriority: 1\nheader: \"User typed `{token}` — Two-phase review discipline is active for this turn:\"\nlegacy: review-double\n---\n[REVIEW DISCIPLINE: DOUBLE-CHECK]\nEvery significant change: multi-agent review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\n1) Review - finding = defect with path:line + evidence (failing command/input).\n2) Double-check - reproduce each finding.\n3) Fix - confirmed findings only.\nBig review -> split by area, never one long pass. Brief each: goal + area +\nacceptance, what's covered (don't re-litigate), who consumes the verdict;\nreturn verdict first, then findings.\n",
  "rr": "---\nname: \"rr\"\ndescription: \"Anti-regression review: regression, project standard and functional correctness axes\"\ninsert: context\nwhen: always\norder: 40\ngroup: review\npriority: 2\nheader: \"User typed `{token}` — Anti-regression review discipline is active for this turn:\"\nlegacy: review-regression\n---\n[REVIEW DISCIPLINE: ANTI-REGRESSION]\nEvery significant phase: one review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\nAxes: 1) no regression (primary) - existing behavior intact; 2) project\nstandard - existing conventions/patterns; 3) functional correctness - the new\nfunctionality works.\na) Review - finding = defect on an axis with path:line + evidence (failing\ncommand/input or broken caller).\nb) Double-check - reproduce each finding before acting.\nc) Fix - confirmed findings only, then re-review the fix.\nTask end: final cross-review across all phases, regression first.\nLarge review -> split by area across reviewers, never one long pass. Brief\neach: goal + area + acceptance, what's reviewed (don't re-litigate), who\nconsumes the verdict; return verdict first, then findings.\n"
}

export const VECTORS: GoldenVector[] = [
  {
    "id": "spec-1",
    "group": "spec",
    "prompt": "++m",
    "hookPrompt": "++m",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.",
    "length": 1790,
    "sha": "ef80457928218ee8bd4fe9f7dd420818c7240308ab928f34db258e33ecd4ee68"
  },
  {
    "id": "spec-2",
    "group": "spec",
    "prompt": "++m",
    "hookPrompt": "++m",
    "mode": "plan",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager + Plan Mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.\n\n[ADDON: PLAN MODE]\n\nStay read-only: no code, board/task-state writes, installation, configuration,\nor cron creation. Read-only expert exploration is allowed.\n\nInclude in the plan (English, token economy):\n- PREAMBLE: [ROLE: MANAGER] + the 5-step protocol restated verbatim as the\n  plan's opening section - this addon expires, so the plan carries the role\n  into implementation, no hook needed.\n- STEP 0, stated literally: \"Re-assume the MANAGER role. Call TaskList; if no\n  graph exists, create the ENTIRE TaskGraph now - TaskCreate for every node, or\n  the numbered checklist if task tools are absent - then delegate.\" On exit\n  this comes first: not code, not one task.\n- The full TaskGraph: every task decomposed (subject, acceptance, owner\n  agent, bounded scope+acceptance per spawn), dependencies marked, parallel\n  branches explicit, critical path named.\n\nInclude the task-board execution step: announce and create one unique session\nanti-drift cron per top-level task, hourly unless the user chooses another tick;\nduring execution record its task-specific methodology/prompt, timezone, ID,\ntick count and stop rule. Scheduling unavailable -> explicit gap, never a\nclaimed schedule. Each tick: reread methodology/anti-drift rules, collect agent\nupdates, reconcile status/dependencies/goal, keep all unfinished + latest 10\ncompleted graph entries, preserve older evidence outside the active graph.\nThe tick report is `HH:MM TZ · tick N · elapsed`, then only the nonempty rows:\n🟢 completed, 🔵 active/remaining/next, 🔴 problems/blockers/questions,\n⚪ anti-drift verdict. Completion/cancellation -> stop and verify cron removal.\n\nDeliver the embedded role + graph + deferred cron step, not implementation code.",
    "length": 3515,
    "sha": "72ba858d91c946618d41557cc886e212807ce70160906235b7f48953bc508bb2"
  },
  {
    "id": "spec-3",
    "group": "spec",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\n[DIRECTIVE: ARCHITECTURE-FIRST]\n\nBefore implementing, delegate the design to a matching architect/reviewer\nexpert agent, else general-purpose - never design inline. Split a large\ndesign by area across several agents, never one long pass. Brief each: area +\nout-of-bounds, what's decided (must not reopen), who consumes the design next.\n\nRequired of the design:\n- Fits existing architecture/patterns/rules/conventions - breaks nothing that\n  works.\n- As simple as possible while staying scalable - no over-engineering.\n- Abstractions only where earned: reuse the closest well-built repo\n  counterpart's patterns/classes, new pattern only if nothing fits - additive\n  to conventions/rules/docs, never instead.\n- Clean seams/boundaries so the code stays easy to modify.\n\nDeliverable before coding: a short, concrete plan - components, boundaries,\ndata flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,\nwrite it into the plan.",
    "length": 1019,
    "sha": "b8bdf3ab00aeef340fbc4cce7963d466af8b55f2600f99e2a15325d8d5878db4"
  },
  {
    "id": "spec-4",
    "group": "spec",
    "prompt": "++r",
    "hookPrompt": "++r",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++r` — Two-phase review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: DOUBLE-CHECK]\nEvery significant change: multi-agent review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\n1) Review - finding = defect with path:line + evidence (failing command/input).\n2) Double-check - reproduce each finding.\n3) Fix - confirmed findings only.\nBig review -> split by area, never one long pass. Brief each: goal + area +\nacceptance, what's covered (don't re-litigate), who consumes the verdict;\nreturn verdict first, then findings.",
    "length": 571,
    "sha": "53e00875c72b3e4838df5447e9c32497484429229197eea3c1b2ea105e55f8a9"
  },
  {
    "id": "spec-5",
    "group": "spec",
    "prompt": "++rr",
    "hookPrompt": "++rr",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++rr` — Anti-regression review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: ANTI-REGRESSION]\nEvery significant phase: one review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\nAxes: 1) no regression (primary) - existing behavior intact; 2) project\nstandard - existing conventions/patterns; 3) functional correctness - the new\nfunctionality works.\na) Review - finding = defect on an axis with path:line + evidence (failing\ncommand/input or broken caller).\nb) Double-check - reproduce each finding before acting.\nc) Fix - confirmed findings only, then re-review the fix.\nTask end: final cross-review across all phases, regression first.\nLarge review -> split by area across reviewers, never one long pass. Brief\neach: goal + area + acceptance, what's reviewed (don't re-litigate), who\nconsumes the verdict; return verdict first, then findings.",
    "length": 895,
    "sha": "4a76c6b4176b8bf88477ed5d8a7e98a01432e95f0c69d110c09bfca6467cc89c"
  },
  {
    "id": "spec-6",
    "group": "spec",
    "prompt": "+++",
    "hookPrompt": "+++",
    "mode": "plan",
    "prefix": "++",
    "files": [],
    "expected": "User typed `+++` in Plan mode — plan the task anti-drift cron:\n\n# [ADDON: ANTI-DRIFT CRON PLAN]\n\nStay read-only in Plan mode: plan the schedule now, never create it before execution. Add an execution step to the task-board plan: announce and create one unique session cron per top-level task, hourly by default or at the user's interval, using available native scheduling tools. Record its task-specific prompt, schedule ID, timezone, tick count and stop rule in that task's methodology. If scheduling is unavailable, report the gap without claiming a schedule exists.\n\nEach tick rereads the goal, task-specific methodology and anti-drift rules; collects active agent updates; reconciles task statuses, dependencies and remaining work; repairs stale dependencies; updates the task graph, keeping all unfinished entries and only the latest 10 completed entries, with older completion evidence preserved outside the active graph. It checks delivered work against the end goal, corrects drift, and identifies remaining acceptance criteria, progress, problems, blockers and user questions.\n\nThen it emits an extremely compact, clearly formatted report: `HH:MM TZ · tick N · elapsed`; `🟢 completed`; `🔵 active / remaining / next`; `🔴 problems / blockers / questions`; `⚪ anti-drift verdict`. Omit empty rows; use only these circles. Stop and verify cron removal on task completion or cancellation.",
    "length": 1395,
    "sha": "d20cc630a056a2293da3449348b44761d08435e031840bf9f46966bb9126033f"
  },
  {
    "id": "spec-7",
    "group": "spec",
    "prompt": "+++ ++m ++a ++rr",
    "hookPrompt": "+++ ++m ++a ++rr",
    "mode": "plan",
    "prefix": "++",
    "files": [],
    "expected": "User typed `+++` in Plan mode — plan the task anti-drift cron:\n\n# [ADDON: ANTI-DRIFT CRON PLAN]\n\nStay read-only in Plan mode: plan the schedule now, never create it before execution. Add an execution step to the task-board plan: announce and create one unique session cron per top-level task, hourly by default or at the user's interval, using available native scheduling tools. Record its task-specific prompt, schedule ID, timezone, tick count and stop rule in that task's methodology. If scheduling is unavailable, report the gap without claiming a schedule exists.\n\nEach tick rereads the goal, task-specific methodology and anti-drift rules; collects active agent updates; reconciles task statuses, dependencies and remaining work; repairs stale dependencies; updates the task graph, keeping all unfinished entries and only the latest 10 completed entries, with older completion evidence preserved outside the active graph. It checks delivered work against the end goal, corrects drift, and identifies remaining acceptance criteria, progress, problems, blockers and user questions.\n\nThen it emits an extremely compact, clearly formatted report: `HH:MM TZ · tick N · elapsed`; `🟢 completed`; `🔵 active / remaining / next`; `🔴 problems / blockers / questions`; `⚪ anti-drift verdict`. Omit empty rows; use only these circles. Stop and verify cron removal on task completion or cancellation.\n\n---\n\nUser typed `++m` — Manager + Plan Mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.\n\n[ADDON: PLAN MODE]\n\nStay read-only: no code, board/task-state writes, installation, configuration,\nor cron creation. Read-only expert exploration is allowed.\n\nInclude in the plan (English, token economy):\n- PREAMBLE: [ROLE: MANAGER] + the 5-step protocol restated verbatim as the\n  plan's opening section - this addon expires, so the plan carries the role\n  into implementation, no hook needed.\n- STEP 0, stated literally: \"Re-assume the MANAGER role. Call TaskList; if no\n  graph exists, create the ENTIRE TaskGraph now - TaskCreate for every node, or\n  the numbered checklist if task tools are absent - then delegate.\" On exit\n  this comes first: not code, not one task.\n- The full TaskGraph: every task decomposed (subject, acceptance, owner\n  agent, bounded scope+acceptance per spawn), dependencies marked, parallel\n  branches explicit, critical path named.\n\nInclude the task-board execution step: announce and create one unique session\nanti-drift cron per top-level task, hourly unless the user chooses another tick;\nduring execution record its task-specific methodology/prompt, timezone, ID,\ntick count and stop rule. Scheduling unavailable -> explicit gap, never a\nclaimed schedule. Each tick: reread methodology/anti-drift rules, collect agent\nupdates, reconcile status/dependencies/goal, keep all unfinished + latest 10\ncompleted graph entries, preserve older evidence outside the active graph.\nThe tick report is `HH:MM TZ · tick N · elapsed`, then only the nonempty rows:\n🟢 completed, 🔵 active/remaining/next, 🔴 problems/blockers/questions,\n⚪ anti-drift verdict. Completion/cancellation -> stop and verify cron removal.\n\nDeliver the embedded role + graph + deferred cron step, not implementation code.\n\n---\n\nUser typed `++a` — Architecture-first discipline is active for this turn:\n\n[DIRECTIVE: ARCHITECTURE-FIRST]\n\nBefore implementing, delegate the design to a matching architect/reviewer\nexpert agent, else general-purpose - never design inline. Split a large\ndesign by area across several agents, never one long pass. Brief each: area +\nout-of-bounds, what's decided (must not reopen), who consumes the design next.\n\nRequired of the design:\n- Fits existing architecture/patterns/rules/conventions - breaks nothing that\n  works.\n- As simple as possible while staying scalable - no over-engineering.\n- Abstractions only where earned: reuse the closest well-built repo\n  counterpart's patterns/classes, new pattern only if nothing fits - additive\n  to conventions/rules/docs, never instead.\n- Clean seams/boundaries so the code stays easy to modify.\n\nDeliverable before coding: a short, concrete plan - components, boundaries,\ndata flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,\nwrite it into the plan.\n\n---\n\nUser typed `++rr` — Anti-regression review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: ANTI-REGRESSION]\nEvery significant phase: one review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\nAxes: 1) no regression (primary) - existing behavior intact; 2) project\nstandard - existing conventions/patterns; 3) functional correctness - the new\nfunctionality works.\na) Review - finding = defect on an axis with path:line + evidence (failing\ncommand/input or broken caller).\nb) Double-check - reproduce each finding before acting.\nc) Fix - confirmed findings only, then re-review the fix.\nTask end: final cross-review across all phases, regression first.\nLarge review -> split by area across reviewers, never one long pass. Brief\neach: goal + area + acceptance, what's reviewed (don't re-litigate), who\nconsumes the verdict; return verdict first, then findings.",
    "length": 6845,
    "sha": "3e8ee98e12fea6dd396f0c77f30aa28f565589d3d1536a8d444b4eceab592d5f"
  },
  {
    "id": "spec-8",
    "group": "spec",
    "prompt": "+++ ++m ++a ++r",
    "hookPrompt": "+++ ++m ++a ++r",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.\n\n---\n\nUser typed `++a` — Architecture-first discipline is active for this turn:\n\n[DIRECTIVE: ARCHITECTURE-FIRST]\n\nBefore implementing, delegate the design to a matching architect/reviewer\nexpert agent, else general-purpose - never design inline. Split a large\ndesign by area across several agents, never one long pass. Brief each: area +\nout-of-bounds, what's decided (must not reopen), who consumes the design next.\n\nRequired of the design:\n- Fits existing architecture/patterns/rules/conventions - breaks nothing that\n  works.\n- As simple as possible while staying scalable - no over-engineering.\n- Abstractions only where earned: reuse the closest well-built repo\n  counterpart's patterns/classes, new pattern only if nothing fits - additive\n  to conventions/rules/docs, never instead.\n- Clean seams/boundaries so the code stays easy to modify.\n\nDeliverable before coding: a short, concrete plan - components, boundaries,\ndata flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,\nwrite it into the plan.\n\n---\n\nUser typed `++r` — Two-phase review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: DOUBLE-CHECK]\nEvery significant change: multi-agent review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\n1) Review - finding = defect with path:line + evidence (failing command/input).\n2) Double-check - reproduce each finding.\n3) Fix - confirmed findings only.\nBig review -> split by area, never one long pass. Brief each: goal + area +\nacceptance, what's covered (don't re-litigate), who consumes the verdict;\nreturn verdict first, then findings.",
    "length": 3394,
    "sha": "e64f6487bee319570b8b5e91fd50ca70790ef93e3e13954b4f88f8431c055d80"
  },
  {
    "id": "e01-nonascii-after",
    "group": "edge",
    "prompt": "++mé",
    "hookPrompt": "++mé",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.",
    "length": 1790,
    "sha": "ef80457928218ee8bd4fe9f7dd420818c7240308ab928f34db258e33ecd4ee68"
  },
  {
    "id": "e02-dot-after",
    "group": "edge",
    "prompt": "++m.",
    "hookPrompt": "++m.",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.",
    "length": 1790,
    "sha": "ef80457928218ee8bd4fe9f7dd420818c7240308ab928f34db258e33ecd4ee68"
  },
  {
    "id": "e03-parens",
    "group": "edge",
    "prompt": "(++m)",
    "hookPrompt": "(++m)",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.",
    "length": 1790,
    "sha": "ef80457928218ee8bd4fe9f7dd420818c7240308ab928f34db258e33ecd4ee68"
  },
  {
    "id": "e04-upper",
    "group": "edge",
    "prompt": "++M",
    "hookPrompt": "++M",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.",
    "length": 1790,
    "sha": "ef80457928218ee8bd4fe9f7dd420818c7240308ab928f34db258e33ecd4ee68"
  },
  {
    "id": "e05-double-letter",
    "group": "edge",
    "prompt": "++mm",
    "hookPrompt": "++mm",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "e06-word-before",
    "group": "edge",
    "prompt": "x++m",
    "hookPrompt": "x++m",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "e07-plus-before-plan",
    "group": "edge",
    "prompt": "+++m",
    "hookPrompt": "+++m",
    "mode": "plan",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "e08-underscore-after",
    "group": "edge",
    "prompt": "++m_",
    "hookPrompt": "++m_",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "e09-space-inside",
    "group": "edge",
    "prompt": "++ rr",
    "hookPrompt": "++ rr",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "e10-letter-before-cron",
    "group": "edge",
    "prompt": "é+++",
    "hookPrompt": "é+++",
    "mode": "plan",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "e11-cjk-around-cron",
    "group": "edge",
    "prompt": "字+++字",
    "hookPrompt": "字+++字",
    "mode": "plan",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "e12-digit-after-cron",
    "group": "edge",
    "prompt": "+++5",
    "hookPrompt": "+++5",
    "mode": "plan",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "e13-four-plus",
    "group": "edge",
    "prompt": "++++",
    "hookPrompt": "++++",
    "mode": "plan",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "e14-punct-after-cron",
    "group": "edge",
    "prompt": "+++!",
    "hookPrompt": "+++!",
    "mode": "plan",
    "prefix": "++",
    "files": [],
    "expected": "User typed `+++` in Plan mode — plan the task anti-drift cron:\n\n# [ADDON: ANTI-DRIFT CRON PLAN]\n\nStay read-only in Plan mode: plan the schedule now, never create it before execution. Add an execution step to the task-board plan: announce and create one unique session cron per top-level task, hourly by default or at the user's interval, using available native scheduling tools. Record its task-specific prompt, schedule ID, timezone, tick count and stop rule in that task's methodology. If scheduling is unavailable, report the gap without claiming a schedule exists.\n\nEach tick rereads the goal, task-specific methodology and anti-drift rules; collects active agent updates; reconciles task statuses, dependencies and remaining work; repairs stale dependencies; updates the task graph, keeping all unfinished entries and only the latest 10 completed entries, with older completion evidence preserved outside the active graph. It checks delivered work against the end goal, corrects drift, and identifies remaining acceptance criteria, progress, problems, blockers and user questions.\n\nThen it emits an extremely compact, clearly formatted report: `HH:MM TZ · tick N · elapsed`; `🟢 completed`; `🔵 active / remaining / next`; `🔴 problems / blockers / questions`; `⚪ anti-drift verdict`. Omit empty rows; use only these circles. Stop and verify cron removal on task completion or cancellation.",
    "length": 1395,
    "sha": "d20cc630a056a2293da3449348b44761d08435e031840bf9f46966bb9126033f"
  },
  {
    "id": "e15-zwj-after-cron",
    "group": "edge",
    "prompt": "+++‍",
    "hookPrompt": "+++‍",
    "mode": "plan",
    "prefix": "++",
    "files": [],
    "expected": "User typed `+++` in Plan mode — plan the task anti-drift cron:\n\n# [ADDON: ANTI-DRIFT CRON PLAN]\n\nStay read-only in Plan mode: plan the schedule now, never create it before execution. Add an execution step to the task-board plan: announce and create one unique session cron per top-level task, hourly by default or at the user's interval, using available native scheduling tools. Record its task-specific prompt, schedule ID, timezone, tick count and stop rule in that task's methodology. If scheduling is unavailable, report the gap without claiming a schedule exists.\n\nEach tick rereads the goal, task-specific methodology and anti-drift rules; collects active agent updates; reconciles task statuses, dependencies and remaining work; repairs stale dependencies; updates the task graph, keeping all unfinished entries and only the latest 10 completed entries, with older completion evidence preserved outside the active graph. It checks delivered work against the end goal, corrects drift, and identifies remaining acceptance criteria, progress, problems, blockers and user questions.\n\nThen it emits an extremely compact, clearly formatted report: `HH:MM TZ · tick N · elapsed`; `🟢 completed`; `🔵 active / remaining / next`; `🔴 problems / blockers / questions`; `⚪ anti-drift verdict`. Omit empty rows; use only these circles. Stop and verify cron removal on task completion or cancellation.",
    "length": 1395,
    "sha": "d20cc630a056a2293da3449348b44761d08435e031840bf9f46966bb9126033f"
  },
  {
    "id": "e16-standalone-cron",
    "group": "edge",
    "prompt": "x +++ y",
    "hookPrompt": "x +++ y",
    "mode": "plan",
    "prefix": "++",
    "files": [],
    "expected": "User typed `+++` in Plan mode — plan the task anti-drift cron:\n\n# [ADDON: ANTI-DRIFT CRON PLAN]\n\nStay read-only in Plan mode: plan the schedule now, never create it before execution. Add an execution step to the task-board plan: announce and create one unique session cron per top-level task, hourly by default or at the user's interval, using available native scheduling tools. Record its task-specific prompt, schedule ID, timezone, tick count and stop rule in that task's methodology. If scheduling is unavailable, report the gap without claiming a schedule exists.\n\nEach tick rereads the goal, task-specific methodology and anti-drift rules; collects active agent updates; reconciles task statuses, dependencies and remaining work; repairs stale dependencies; updates the task graph, keeping all unfinished entries and only the latest 10 completed entries, with older completion evidence preserved outside the active graph. It checks delivered work against the end goal, corrects drift, and identifies remaining acceptance criteria, progress, problems, blockers and user questions.\n\nThen it emits an extremely compact, clearly formatted report: `HH:MM TZ · tick N · elapsed`; `🟢 completed`; `🔵 active / remaining / next`; `🔴 problems / blockers / questions`; `⚪ anti-drift verdict`. Omit empty rows; use only these circles. Stop and verify cron removal on task completion or cancellation.",
    "length": 1395,
    "sha": "d20cc630a056a2293da3449348b44761d08435e031840bf9f46966bb9126033f"
  },
  {
    "id": "x01-r-then-rr",
    "group": "extra",
    "prompt": "++r ++rr",
    "hookPrompt": "++r ++rr",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++rr` — Anti-regression review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: ANTI-REGRESSION]\nEvery significant phase: one review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\nAxes: 1) no regression (primary) - existing behavior intact; 2) project\nstandard - existing conventions/patterns; 3) functional correctness - the new\nfunctionality works.\na) Review - finding = defect on an axis with path:line + evidence (failing\ncommand/input or broken caller).\nb) Double-check - reproduce each finding before acting.\nc) Fix - confirmed findings only, then re-review the fix.\nTask end: final cross-review across all phases, regression first.\nLarge review -> split by area across reviewers, never one long pass. Brief\neach: goal + area + acceptance, what's reviewed (don't re-litigate), who\nconsumes the verdict; return verdict first, then findings.",
    "length": 895,
    "sha": "4a76c6b4176b8bf88477ed5d8a7e98a01432e95f0c69d110c09bfca6467cc89c"
  },
  {
    "id": "x02-glued-r-rr",
    "group": "extra",
    "prompt": "++r++rr",
    "hookPrompt": "++r++rr",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++r` — Two-phase review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: DOUBLE-CHECK]\nEvery significant change: multi-agent review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\n1) Review - finding = defect with path:line + evidence (failing command/input).\n2) Double-check - reproduce each finding.\n3) Fix - confirmed findings only.\nBig review -> split by area, never one long pass. Brief each: goal + area +\nacceptance, what's covered (don't re-litigate), who consumes the verdict;\nreturn verdict first, then findings.",
    "length": 571,
    "sha": "53e00875c72b3e4838df5447e9c32497484429229197eea3c1b2ea105e55f8a9"
  },
  {
    "id": "x03-upper-r",
    "group": "extra",
    "prompt": "++R",
    "hookPrompt": "++R",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++r` — Two-phase review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: DOUBLE-CHECK]\nEvery significant change: multi-agent review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\n1) Review - finding = defect with path:line + evidence (failing command/input).\n2) Double-check - reproduce each finding.\n3) Fix - confirmed findings only.\nBig review -> split by area, never one long pass. Brief each: goal + area +\nacceptance, what's covered (don't re-litigate), who consumes the verdict;\nreturn verdict first, then findings.",
    "length": 571,
    "sha": "53e00875c72b3e4838df5447e9c32497484429229197eea3c1b2ea105e55f8a9"
  },
  {
    "id": "x04-upper-rr",
    "group": "extra",
    "prompt": "++RR",
    "hookPrompt": "++RR",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++rr` — Anti-regression review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: ANTI-REGRESSION]\nEvery significant phase: one review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\nAxes: 1) no regression (primary) - existing behavior intact; 2) project\nstandard - existing conventions/patterns; 3) functional correctness - the new\nfunctionality works.\na) Review - finding = defect on an axis with path:line + evidence (failing\ncommand/input or broken caller).\nb) Double-check - reproduce each finding before acting.\nc) Fix - confirmed findings only, then re-review the fix.\nTask end: final cross-review across all phases, regression first.\nLarge review -> split by area across reviewers, never one long pass. Brief\neach: goal + area + acceptance, what's reviewed (don't re-litigate), who\nconsumes the verdict; return verdict first, then findings.",
    "length": 895,
    "sha": "4a76c6b4176b8bf88477ed5d8a7e98a01432e95f0c69d110c09bfca6467cc89c"
  },
  {
    "id": "x05-upper-a",
    "group": "extra",
    "prompt": "++A",
    "hookPrompt": "++A",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\n[DIRECTIVE: ARCHITECTURE-FIRST]\n\nBefore implementing, delegate the design to a matching architect/reviewer\nexpert agent, else general-purpose - never design inline. Split a large\ndesign by area across several agents, never one long pass. Brief each: area +\nout-of-bounds, what's decided (must not reopen), who consumes the design next.\n\nRequired of the design:\n- Fits existing architecture/patterns/rules/conventions - breaks nothing that\n  works.\n- As simple as possible while staying scalable - no over-engineering.\n- Abstractions only where earned: reuse the closest well-built repo\n  counterpart's patterns/classes, new pattern only if nothing fits - additive\n  to conventions/rules/docs, never instead.\n- Clean seams/boundaries so the code stays easy to modify.\n\nDeliverable before coding: a short, concrete plan - components, boundaries,\ndata flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,\nwrite it into the plan.",
    "length": 1019,
    "sha": "b8bdf3ab00aeef340fbc4cce7963d466af8b55f2600f99e2a15325d8d5878db4"
  },
  {
    "id": "x06-glued-a-m",
    "group": "extra",
    "prompt": "++a++m",
    "hookPrompt": "++a++m",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\n[DIRECTIVE: ARCHITECTURE-FIRST]\n\nBefore implementing, delegate the design to a matching architect/reviewer\nexpert agent, else general-purpose - never design inline. Split a large\ndesign by area across several agents, never one long pass. Brief each: area +\nout-of-bounds, what's decided (must not reopen), who consumes the design next.\n\nRequired of the design:\n- Fits existing architecture/patterns/rules/conventions - breaks nothing that\n  works.\n- As simple as possible while staying scalable - no over-engineering.\n- Abstractions only where earned: reuse the closest well-built repo\n  counterpart's patterns/classes, new pattern only if nothing fits - additive\n  to conventions/rules/docs, never instead.\n- Clean seams/boundaries so the code stays easy to modify.\n\nDeliverable before coding: a short, concrete plan - components, boundaries,\ndata flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,\nwrite it into the plan.",
    "length": 1019,
    "sha": "b8bdf3ab00aeef340fbc4cce7963d466af8b55f2600f99e2a15325d8d5878db4"
  },
  {
    "id": "x07-cron-default",
    "group": "extra",
    "prompt": "+++",
    "hookPrompt": "+++",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "x08-mode-PLAN-uppercase",
    "group": "extra",
    "prompt": "++m",
    "hookPrompt": "++m",
    "mode": "PLAN",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.",
    "length": 1790,
    "sha": "ef80457928218ee8bd4fe9f7dd420818c7240308ab928f34db258e33ecd4ee68"
  },
  {
    "id": "x09-mode-absent",
    "group": "extra",
    "prompt": "++m",
    "hookPrompt": "++m",
    "mode": null,
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.",
    "length": 1790,
    "sha": "ef80457928218ee8bd4fe9f7dd420818c7240308ab928f34db258e33ecd4ee68"
  },
  {
    "id": "x10-mode-acceptEdits",
    "group": "extra",
    "prompt": "++m",
    "hookPrompt": "++m",
    "mode": "acceptEdits",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.",
    "length": 1790,
    "sha": "ef80457928218ee8bd4fe9f7dd420818c7240308ab928f34db258e33ecd4ee68"
  },
  {
    "id": "x11-synthetic-task",
    "group": "extra",
    "prompt": "<task-notification>++m",
    "hookPrompt": "<task-notification>++m",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "x12-synthetic-agent",
    "group": "extra",
    "prompt": "  \n<agent-message from=x> ++m",
    "hookPrompt": "  \n<agent-message from=x> ++m",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "x13-bare-agent-message",
    "group": "extra",
    "prompt": "<agent-message>++m",
    "hookPrompt": "<agent-message>++m",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.",
    "length": 1790,
    "sha": "ef80457928218ee8bd4fe9f7dd420818c7240308ab928f34db258e33ecd4ee68"
  },
  {
    "id": "x14-upper-task-notification",
    "group": "extra",
    "prompt": "<TASK-NOTIFICATION>++m",
    "hookPrompt": "<TASK-NOTIFICATION>++m",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.",
    "length": 1790,
    "sha": "ef80457928218ee8bd4fe9f7dd420818c7240308ab928f34db258e33ecd4ee68"
  },
  {
    "id": "x15-synthetic-not-leading",
    "group": "extra",
    "prompt": "see <task-notification>++m",
    "hookPrompt": "see <task-notification>++m",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.",
    "length": 1790,
    "sha": "ef80457928218ee8bd4fe9f7dd420818c7240308ab928f34db258e33ecd4ee68"
  },
  {
    "id": "x16-all-four-default",
    "group": "extra",
    "prompt": "++m ++a ++r ++rr",
    "hookPrompt": "++m ++a ++r ++rr",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.\n\n---\n\nUser typed `++a` — Architecture-first discipline is active for this turn:\n\n[DIRECTIVE: ARCHITECTURE-FIRST]\n\nBefore implementing, delegate the design to a matching architect/reviewer\nexpert agent, else general-purpose - never design inline. Split a large\ndesign by area across several agents, never one long pass. Brief each: area +\nout-of-bounds, what's decided (must not reopen), who consumes the design next.\n\nRequired of the design:\n- Fits existing architecture/patterns/rules/conventions - breaks nothing that\n  works.\n- As simple as possible while staying scalable - no over-engineering.\n- Abstractions only where earned: reuse the closest well-built repo\n  counterpart's patterns/classes, new pattern only if nothing fits - additive\n  to conventions/rules/docs, never instead.\n- Clean seams/boundaries so the code stays easy to modify.\n\nDeliverable before coding: a short, concrete plan - components, boundaries,\ndata flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,\nwrite it into the plan.\n\n---\n\nUser typed `++rr` — Anti-regression review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: ANTI-REGRESSION]\nEvery significant phase: one review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\nAxes: 1) no regression (primary) - existing behavior intact; 2) project\nstandard - existing conventions/patterns; 3) functional correctness - the new\nfunctionality works.\na) Review - finding = defect on an axis with path:line + evidence (failing\ncommand/input or broken caller).\nb) Double-check - reproduce each finding before acting.\nc) Fix - confirmed findings only, then re-review the fix.\nTask end: final cross-review across all phases, regression first.\nLarge review -> split by area across reviewers, never one long pass. Brief\neach: goal + area + acceptance, what's reviewed (don't re-litigate), who\nconsumes the verdict; return verdict first, then findings.",
    "length": 3718,
    "sha": "e6128ad51e55072090d0e8258527d56dfb91e2235de777b085322c8b8d0493f9"
  },
  {
    "id": "x17-order-a-then-m",
    "group": "extra",
    "prompt": "++a ++m",
    "hookPrompt": "++a ++m",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.\n\n---\n\nUser typed `++a` — Architecture-first discipline is active for this turn:\n\n[DIRECTIVE: ARCHITECTURE-FIRST]\n\nBefore implementing, delegate the design to a matching architect/reviewer\nexpert agent, else general-purpose - never design inline. Split a large\ndesign by area across several agents, never one long pass. Brief each: area +\nout-of-bounds, what's decided (must not reopen), who consumes the design next.\n\nRequired of the design:\n- Fits existing architecture/patterns/rules/conventions - breaks nothing that\n  works.\n- As simple as possible while staying scalable - no over-engineering.\n- Abstractions only where earned: reuse the closest well-built repo\n  counterpart's patterns/classes, new pattern only if nothing fits - additive\n  to conventions/rules/docs, never instead.\n- Clean seams/boundaries so the code stays easy to modify.\n\nDeliverable before coding: a short, concrete plan - components, boundaries,\ndata flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,\nwrite it into the plan.",
    "length": 2816,
    "sha": "d7577c5548d63d00ad41ae4da269c90a2edb4ab2ed1799b81f02f7043db89e15"
  },
  {
    "id": "x18-cron-m-plan",
    "group": "extra",
    "prompt": "+++ ++m",
    "hookPrompt": "+++ ++m",
    "mode": "plan",
    "prefix": "++",
    "files": [],
    "expected": "User typed `+++` in Plan mode — plan the task anti-drift cron:\n\n# [ADDON: ANTI-DRIFT CRON PLAN]\n\nStay read-only in Plan mode: plan the schedule now, never create it before execution. Add an execution step to the task-board plan: announce and create one unique session cron per top-level task, hourly by default or at the user's interval, using available native scheduling tools. Record its task-specific prompt, schedule ID, timezone, tick count and stop rule in that task's methodology. If scheduling is unavailable, report the gap without claiming a schedule exists.\n\nEach tick rereads the goal, task-specific methodology and anti-drift rules; collects active agent updates; reconciles task statuses, dependencies and remaining work; repairs stale dependencies; updates the task graph, keeping all unfinished entries and only the latest 10 completed entries, with older completion evidence preserved outside the active graph. It checks delivered work against the end goal, corrects drift, and identifies remaining acceptance criteria, progress, problems, blockers and user questions.\n\nThen it emits an extremely compact, clearly formatted report: `HH:MM TZ · tick N · elapsed`; `🟢 completed`; `🔵 active / remaining / next`; `🔴 problems / blockers / questions`; `⚪ anti-drift verdict`. Omit empty rows; use only these circles. Stop and verify cron removal on task completion or cancellation.\n\n---\n\nUser typed `++m` — Manager + Plan Mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.\n\n[ADDON: PLAN MODE]\n\nStay read-only: no code, board/task-state writes, installation, configuration,\nor cron creation. Read-only expert exploration is allowed.\n\nInclude in the plan (English, token economy):\n- PREAMBLE: [ROLE: MANAGER] + the 5-step protocol restated verbatim as the\n  plan's opening section - this addon expires, so the plan carries the role\n  into implementation, no hook needed.\n- STEP 0, stated literally: \"Re-assume the MANAGER role. Call TaskList; if no\n  graph exists, create the ENTIRE TaskGraph now - TaskCreate for every node, or\n  the numbered checklist if task tools are absent - then delegate.\" On exit\n  this comes first: not code, not one task.\n- The full TaskGraph: every task decomposed (subject, acceptance, owner\n  agent, bounded scope+acceptance per spawn), dependencies marked, parallel\n  branches explicit, critical path named.\n\nInclude the task-board execution step: announce and create one unique session\nanti-drift cron per top-level task, hourly unless the user chooses another tick;\nduring execution record its task-specific methodology/prompt, timezone, ID,\ntick count and stop rule. Scheduling unavailable -> explicit gap, never a\nclaimed schedule. Each tick: reread methodology/anti-drift rules, collect agent\nupdates, reconcile status/dependencies/goal, keep all unfinished + latest 10\ncompleted graph entries, preserve older evidence outside the active graph.\nThe tick report is `HH:MM TZ · tick N · elapsed`, then only the nonempty rows:\n🟢 completed, 🔵 active/remaining/next, 🔴 problems/blockers/questions,\n⚪ anti-drift verdict. Completion/cancellation -> stop and verify cron removal.\n\nDeliver the embedded role + graph + deferred cron step, not implementation code.",
    "length": 4917,
    "sha": "c50d4a7a911c070ac91384855081191a1b8042aefca2425b5acb94c7b3e38e49"
  },
  {
    "id": "x19-duplicate",
    "group": "extra",
    "prompt": "++m ++m",
    "hookPrompt": "++m ++m",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.",
    "length": 1790,
    "sha": "ef80457928218ee8bd4fe9f7dd420818c7240308ab928f34db258e33ecd4ee68"
  },
  {
    "id": "x20-plain",
    "group": "extra",
    "prompt": "hello world",
    "hookPrompt": "hello world",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "x21-all-plan",
    "group": "extra",
    "prompt": "++rr ++a ++m +++ ++r",
    "hookPrompt": "++rr ++a ++m +++ ++r",
    "mode": "plan",
    "prefix": "++",
    "files": [],
    "expected": "User typed `+++` in Plan mode — plan the task anti-drift cron:\n\n# [ADDON: ANTI-DRIFT CRON PLAN]\n\nStay read-only in Plan mode: plan the schedule now, never create it before execution. Add an execution step to the task-board plan: announce and create one unique session cron per top-level task, hourly by default or at the user's interval, using available native scheduling tools. Record its task-specific prompt, schedule ID, timezone, tick count and stop rule in that task's methodology. If scheduling is unavailable, report the gap without claiming a schedule exists.\n\nEach tick rereads the goal, task-specific methodology and anti-drift rules; collects active agent updates; reconciles task statuses, dependencies and remaining work; repairs stale dependencies; updates the task graph, keeping all unfinished entries and only the latest 10 completed entries, with older completion evidence preserved outside the active graph. It checks delivered work against the end goal, corrects drift, and identifies remaining acceptance criteria, progress, problems, blockers and user questions.\n\nThen it emits an extremely compact, clearly formatted report: `HH:MM TZ · tick N · elapsed`; `🟢 completed`; `🔵 active / remaining / next`; `🔴 problems / blockers / questions`; `⚪ anti-drift verdict`. Omit empty rows; use only these circles. Stop and verify cron removal on task completion or cancellation.\n\n---\n\nUser typed `++m` — Manager + Plan Mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.\n\n[ADDON: PLAN MODE]\n\nStay read-only: no code, board/task-state writes, installation, configuration,\nor cron creation. Read-only expert exploration is allowed.\n\nInclude in the plan (English, token economy):\n- PREAMBLE: [ROLE: MANAGER] + the 5-step protocol restated verbatim as the\n  plan's opening section - this addon expires, so the plan carries the role\n  into implementation, no hook needed.\n- STEP 0, stated literally: \"Re-assume the MANAGER role. Call TaskList; if no\n  graph exists, create the ENTIRE TaskGraph now - TaskCreate for every node, or\n  the numbered checklist if task tools are absent - then delegate.\" On exit\n  this comes first: not code, not one task.\n- The full TaskGraph: every task decomposed (subject, acceptance, owner\n  agent, bounded scope+acceptance per spawn), dependencies marked, parallel\n  branches explicit, critical path named.\n\nInclude the task-board execution step: announce and create one unique session\nanti-drift cron per top-level task, hourly unless the user chooses another tick;\nduring execution record its task-specific methodology/prompt, timezone, ID,\ntick count and stop rule. Scheduling unavailable -> explicit gap, never a\nclaimed schedule. Each tick: reread methodology/anti-drift rules, collect agent\nupdates, reconcile status/dependencies/goal, keep all unfinished + latest 10\ncompleted graph entries, preserve older evidence outside the active graph.\nThe tick report is `HH:MM TZ · tick N · elapsed`, then only the nonempty rows:\n🟢 completed, 🔵 active/remaining/next, 🔴 problems/blockers/questions,\n⚪ anti-drift verdict. Completion/cancellation -> stop and verify cron removal.\n\nDeliver the embedded role + graph + deferred cron step, not implementation code.\n\n---\n\nUser typed `++a` — Architecture-first discipline is active for this turn:\n\n[DIRECTIVE: ARCHITECTURE-FIRST]\n\nBefore implementing, delegate the design to a matching architect/reviewer\nexpert agent, else general-purpose - never design inline. Split a large\ndesign by area across several agents, never one long pass. Brief each: area +\nout-of-bounds, what's decided (must not reopen), who consumes the design next.\n\nRequired of the design:\n- Fits existing architecture/patterns/rules/conventions - breaks nothing that\n  works.\n- As simple as possible while staying scalable - no over-engineering.\n- Abstractions only where earned: reuse the closest well-built repo\n  counterpart's patterns/classes, new pattern only if nothing fits - additive\n  to conventions/rules/docs, never instead.\n- Clean seams/boundaries so the code stays easy to modify.\n\nDeliverable before coding: a short, concrete plan - components, boundaries,\ndata flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,\nwrite it into the plan.\n\n---\n\nUser typed `++rr` — Anti-regression review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: ANTI-REGRESSION]\nEvery significant phase: one review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\nAxes: 1) no regression (primary) - existing behavior intact; 2) project\nstandard - existing conventions/patterns; 3) functional correctness - the new\nfunctionality works.\na) Review - finding = defect on an axis with path:line + evidence (failing\ncommand/input or broken caller).\nb) Double-check - reproduce each finding before acting.\nc) Fix - confirmed findings only, then re-review the fix.\nTask end: final cross-review across all phases, regression first.\nLarge review -> split by area across reviewers, never one long pass. Brief\neach: goal + area + acceptance, what's reviewed (don't re-litigate), who\nconsumes the verdict; return verdict first, then findings.",
    "length": 6845,
    "sha": "3e8ee98e12fea6dd396f0c77f30aa28f565589d3d1536a8d444b4eceab592d5f"
  },
  {
    "id": "x22-emoji-after",
    "group": "extra",
    "prompt": "++m😀",
    "hookPrompt": "++m😀",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.",
    "length": 1790,
    "sha": "ef80457928218ee8bd4fe9f7dd420818c7240308ab928f34db258e33ecd4ee68"
  },
  {
    "id": "x23-newline-separated",
    "group": "extra",
    "prompt": "do this\n++a\nthen ++r",
    "hookPrompt": "do this\n++a\nthen ++r",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\n[DIRECTIVE: ARCHITECTURE-FIRST]\n\nBefore implementing, delegate the design to a matching architect/reviewer\nexpert agent, else general-purpose - never design inline. Split a large\ndesign by area across several agents, never one long pass. Brief each: area +\nout-of-bounds, what's decided (must not reopen), who consumes the design next.\n\nRequired of the design:\n- Fits existing architecture/patterns/rules/conventions - breaks nothing that\n  works.\n- As simple as possible while staying scalable - no over-engineering.\n- Abstractions only where earned: reuse the closest well-built repo\n  counterpart's patterns/classes, new pattern only if nothing fits - additive\n  to conventions/rules/docs, never instead.\n- Clean seams/boundaries so the code stays easy to modify.\n\nDeliverable before coding: a short, concrete plan - components, boundaries,\ndata flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,\nwrite it into the plan.\n\n---\n\nUser typed `++r` — Two-phase review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: DOUBLE-CHECK]\nEvery significant change: multi-agent review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\n1) Review - finding = defect with path:line + evidence (failing command/input).\n2) Double-check - reproduce each finding.\n3) Fix - confirmed findings only.\nBig review -> split by area, never one long pass. Brief each: goal + area +\nacceptance, what's covered (don't re-litigate), who consumes the verdict;\nreturn verdict first, then findings.",
    "length": 1597,
    "sha": "70a5c3ef309ff8d7e53992ef7523c01d7b65720319d16797eea9637a4a89fafe"
  },
  {
    "id": "c01-i-plusplus",
    "group": "extra",
    "prompt": "i++",
    "hookPrompt": "i++",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "c02-cpp",
    "group": "extra",
    "prompt": "C++ code",
    "hookPrompt": "C++ code",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "c03-dashes",
    "group": "extra",
    "prompt": "--flag",
    "hookPrompt": "--flag",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "c04-x-plusplus-y",
    "group": "extra",
    "prompt": "x++y",
    "hookPrompt": "x++y",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "c05-cpp-cron",
    "group": "extra",
    "prompt": "C+++",
    "hookPrompt": "C+++",
    "mode": "plan",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "c06-i-plusplus-semi",
    "group": "extra",
    "prompt": "for (i=0;i<n;i++) {}",
    "hookPrompt": "for (i=0;i<n;i++) {}",
    "mode": "plan",
    "prefix": "++",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "o01-empty-full",
    "group": "override",
    "prompt": "++m",
    "hookPrompt": "++m",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "full",
        "layer": "project",
        "raw": ""
      }
    ],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "o02-empty-full-with-a",
    "group": "override",
    "prompt": "++m ++a",
    "hookPrompt": "++m ++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "full",
        "layer": "project",
        "raw": ""
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\n[DIRECTIVE: ARCHITECTURE-FIRST]\n\nBefore implementing, delegate the design to a matching architect/reviewer\nexpert agent, else general-purpose - never design inline. Split a large\ndesign by area across several agents, never one long pass. Brief each: area +\nout-of-bounds, what's decided (must not reopen), who consumes the design next.\n\nRequired of the design:\n- Fits existing architecture/patterns/rules/conventions - breaks nothing that\n  works.\n- As simple as possible while staying scalable - no over-engineering.\n- Abstractions only where earned: reuse the closest well-built repo\n  counterpart's patterns/classes, new pattern only if nothing fits - additive\n  to conventions/rules/docs, never instead.\n- Clean seams/boundaries so the code stays easy to modify.\n\nDeliverable before coding: a short, concrete plan - components, boundaries,\ndata flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,\nwrite it into the plan.",
    "length": 1019,
    "sha": "b8bdf3ab00aeef340fbc4cce7963d466af8b55f2600f99e2a15325d8d5878db4"
  },
  {
    "id": "o03-empty-planmode",
    "group": "override",
    "prompt": "++m",
    "hookPrompt": "++m",
    "mode": "plan",
    "prefix": "++",
    "files": [
      {
        "legacy": "planmode",
        "layer": "project",
        "raw": ""
      }
    ],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "o04-empty-planmode-with-a",
    "group": "override",
    "prompt": "++m ++a",
    "hookPrompt": "++m ++a",
    "mode": "plan",
    "prefix": "++",
    "files": [
      {
        "legacy": "planmode",
        "layer": "project",
        "raw": ""
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\n[DIRECTIVE: ARCHITECTURE-FIRST]\n\nBefore implementing, delegate the design to a matching architect/reviewer\nexpert agent, else general-purpose - never design inline. Split a large\ndesign by area across several agents, never one long pass. Brief each: area +\nout-of-bounds, what's decided (must not reopen), who consumes the design next.\n\nRequired of the design:\n- Fits existing architecture/patterns/rules/conventions - breaks nothing that\n  works.\n- As simple as possible while staying scalable - no over-engineering.\n- Abstractions only where earned: reuse the closest well-built repo\n  counterpart's patterns/classes, new pattern only if nothing fits - additive\n  to conventions/rules/docs, never instead.\n- Clean seams/boundaries so the code stays easy to modify.\n\nDeliverable before coding: a short, concrete plan - components, boundaries,\ndata flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,\nwrite it into the plan.",
    "length": 1019,
    "sha": "b8bdf3ab00aeef340fbc4cce7963d466af8b55f2600f99e2a15325d8d5878db4"
  },
  {
    "id": "o05-empty-rr-beats-r",
    "group": "override",
    "prompt": "++rr ++r",
    "hookPrompt": "++rr ++r",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "review-regression",
        "layer": "project",
        "raw": ""
      }
    ],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "o06-empty-r",
    "group": "override",
    "prompt": "++r",
    "hookPrompt": "++r",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "review-double",
        "layer": "project",
        "raw": ""
      }
    ],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "o07-empty-cron",
    "group": "override",
    "prompt": "+++ ++a",
    "hookPrompt": "+++ ++a",
    "mode": "plan",
    "prefix": "++",
    "files": [
      {
        "legacy": "cron-plan",
        "layer": "project",
        "raw": ""
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\n[DIRECTIVE: ARCHITECTURE-FIRST]\n\nBefore implementing, delegate the design to a matching architect/reviewer\nexpert agent, else general-purpose - never design inline. Split a large\ndesign by area across several agents, never one long pass. Brief each: area +\nout-of-bounds, what's decided (must not reopen), who consumes the design next.\n\nRequired of the design:\n- Fits existing architecture/patterns/rules/conventions - breaks nothing that\n  works.\n- As simple as possible while staying scalable - no over-engineering.\n- Abstractions only where earned: reuse the closest well-built repo\n  counterpart's patterns/classes, new pattern only if nothing fits - additive\n  to conventions/rules/docs, never instead.\n- Clean seams/boundaries so the code stays easy to modify.\n\nDeliverable before coding: a short, concrete plan - components, boundaries,\ndata flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,\nwrite it into the plan.",
    "length": 1019,
    "sha": "b8bdf3ab00aeef340fbc4cce7963d466af8b55f2600f99e2a15325d8d5878db4"
  },
  {
    "id": "o08-whitespace-only",
    "group": "override",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": "  \n\n\t\n"
      }
    ],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "o09-crlf-fenced",
    "group": "override",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": "```text\r\nline1\r\nline2\r\n```\r\n"
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\nline1\r\nline2",
    "length": 87,
    "sha": "560eecc5bae12537e81ffd8083779183192a0e8beffe10b81875c10186cb84e2"
  },
  {
    "id": "o10-crlf-unfenced",
    "group": "override",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": "line1\r\nline2\r\n"
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\nline1\r\nline2",
    "length": 87,
    "sha": "560eecc5bae12537e81ffd8083779183192a0e8beffe10b81875c10186cb84e2"
  },
  {
    "id": "o11-bom-fenced",
    "group": "override",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": "﻿```\nbom fenced\n```\n"
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\nbom fenced",
    "length": 85,
    "sha": "82f384cbd7a505779e1b4bff07af6e6653c907503b1c111a1a8abea1a090b35f"
  },
  {
    "id": "o12-bom-unfenced",
    "group": "override",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": "﻿bom unfenced\n"
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\nbom unfenced",
    "length": 87,
    "sha": "7be17da8e40ef4a74404f2681cb68189ccacab79c1115e78c07c8bf027d96d2a"
  },
  {
    "id": "o13-four-backticks",
    "group": "override",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": "````\nouter\n```\ninner\n```\n````\n"
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\nouter",
    "length": 80,
    "sha": "7bd718dd6bc5fb12d4d82bd4c7cd40285deff1c3db9c3f296e6707bc76110ab9"
  },
  {
    "id": "o14-tilde-closed-by-backtick",
    "group": "override",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": "~~~\nfoo\n```\n"
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\nfoo",
    "length": 78,
    "sha": "272ff38f5c803efb197b36a2ab3fe37f921ceec35b5cb3cca1d7735bddfebabf"
  },
  {
    "id": "o15-inline-triple-backtick",
    "group": "override",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": "```\nuse ```x``` inline\n```\n"
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\nuse",
    "length": 78,
    "sha": "45cfd59e9f9a809483b7695647c07da124f2f74ffe59fbc2bac4c721f6e3338c"
  },
  {
    "id": "o16-multi-fence-and-outside-text",
    "group": "override",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": "intro\n```\nA\n```\nmid\n~~~md\nB\n~~~\noutro"
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\nA\n\nB",
    "length": 79,
    "sha": "81fa8b3940b4a2cd174dd83809ae7444eb9ce623954384ecaf18b4eb30bff84e"
  },
  {
    "id": "o17-unfenced-plain",
    "group": "override",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": "\n\n  plain override text  \n\n"
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\nplain override text",
    "length": 94,
    "sha": "120b812812d90a9edf752cf6b8a89ef081e9b1917dee6425badd8d8be30d67f1"
  },
  {
    "id": "o18-global-only",
    "group": "override",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "global",
        "raw": "```\nfrom global\n```\n"
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\nfrom global",
    "length": 86,
    "sha": "8b4e811c28b20bb689a2d398b765eab8a96269013b39585bb2d286678a4f56b4"
  },
  {
    "id": "o19-project-over-global",
    "group": "override",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": "```\nfrom project\n```\n"
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\nfrom project",
    "length": 87,
    "sha": "e9b9f05d148d115a773f1d712c1fda4e1844eeee9c1a7eed56ffdd777f1a2674"
  },
  {
    "id": "o20-empty-project-over-global",
    "group": "override",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": ""
      }
    ],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "o21-reference-full-raw",
    "group": "override",
    "prompt": "++m",
    "hookPrompt": "++m",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "full",
        "layer": "project",
        "raw": "# ++m, not Plan mode - manager-prompt.mjs, cap 9000\n\n```\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.\n```\n"
      }
    ],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.",
    "length": 1790,
    "sha": "ef80457928218ee8bd4fe9f7dd420818c7240308ab928f34db258e33ecd4ee68"
  },
  {
    "id": "o22-reference-planmode-raw",
    "group": "override",
    "prompt": "++m",
    "hookPrompt": "++m",
    "mode": "plan",
    "prefix": "++",
    "files": [
      {
        "legacy": "planmode",
        "layer": "project",
        "raw": "# ++m in Plan mode - manager-prompt.mjs, cap 9000; fence 1 = full.md fence, byte-identical\n\n```\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.\n```\n\n```\n[ADDON: PLAN MODE]\n\nStay read-only: no code, board/task-state writes, installation, configuration,\nor cron creation. Read-only expert exploration is allowed.\n\nInclude in the plan (English, token economy):\n- PREAMBLE: [ROLE: MANAGER] + the 5-step protocol restated verbatim as the\n  plan's opening section - this addon expires, so the plan carries the role\n  into implementation, no hook needed.\n- STEP 0, stated literally: \"Re-assume the MANAGER role. Call TaskList; if no\n  graph exists, create the ENTIRE TaskGraph now - TaskCreate for every node, or\n  the numbered checklist if task tools are absent - then delegate.\" On exit\n  this comes first: not code, not one task.\n- The full TaskGraph: every task decomposed (subject, acceptance, owner\n  agent, bounded scope+acceptance per spawn), dependencies marked, parallel\n  branches explicit, critical path named.\n\nInclude the task-board execution step: announce and create one unique session\nanti-drift cron per top-level task, hourly unless the user chooses another tick;\nduring execution record its task-specific methodology/prompt, timezone, ID,\ntick count and stop rule. Scheduling unavailable -> explicit gap, never a\nclaimed schedule. Each tick: reread methodology/anti-drift rules, collect agent\nupdates, reconcile status/dependencies/goal, keep all unfinished + latest 10\ncompleted graph entries, preserve older evidence outside the active graph.\nThe tick report is `HH:MM TZ · tick N · elapsed`, then only the nonempty rows:\n🟢 completed, 🔵 active/remaining/next, 🔴 problems/blockers/questions,\n⚪ anti-drift verdict. Completion/cancellation -> stop and verify cron removal.\n\nDeliver the embedded role + graph + deferred cron step, not implementation code.\n```\n"
      }
    ],
    "expected": "User typed `++m` — Manager + Plan Mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.\n\n[ADDON: PLAN MODE]\n\nStay read-only: no code, board/task-state writes, installation, configuration,\nor cron creation. Read-only expert exploration is allowed.\n\nInclude in the plan (English, token economy):\n- PREAMBLE: [ROLE: MANAGER] + the 5-step protocol restated verbatim as the\n  plan's opening section - this addon expires, so the plan carries the role\n  into implementation, no hook needed.\n- STEP 0, stated literally: \"Re-assume the MANAGER role. Call TaskList; if no\n  graph exists, create the ENTIRE TaskGraph now - TaskCreate for every node, or\n  the numbered checklist if task tools are absent - then delegate.\" On exit\n  this comes first: not code, not one task.\n- The full TaskGraph: every task decomposed (subject, acceptance, owner\n  agent, bounded scope+acceptance per spawn), dependencies marked, parallel\n  branches explicit, critical path named.\n\nInclude the task-board execution step: announce and create one unique session\nanti-drift cron per top-level task, hourly unless the user chooses another tick;\nduring execution record its task-specific methodology/prompt, timezone, ID,\ntick count and stop rule. Scheduling unavailable -> explicit gap, never a\nclaimed schedule. Each tick: reread methodology/anti-drift rules, collect agent\nupdates, reconcile status/dependencies/goal, keep all unfinished + latest 10\ncompleted graph entries, preserve older evidence outside the active graph.\nThe tick report is `HH:MM TZ · tick N · elapsed`, then only the nonempty rows:\n🟢 completed, 🔵 active/remaining/next, 🔴 problems/blockers/questions,\n⚪ anti-drift verdict. Completion/cancellation -> stop and verify cron removal.\n\nDeliver the embedded role + graph + deferred cron step, not implementation code.",
    "length": 3515,
    "sha": "72ba858d91c946618d41557cc886e212807ce70160906235b7f48953bc508bb2"
  },
  {
    "id": "o23-reference-cron-raw",
    "group": "override",
    "prompt": "+++",
    "hookPrompt": "+++",
    "mode": "plan",
    "prefix": "++",
    "files": [
      {
        "legacy": "cron-plan",
        "layer": "project",
        "raw": "# [ADDON: ANTI-DRIFT CRON PLAN]\n\nStay read-only in Plan mode: plan the schedule now, never create it before execution. Add an execution step to the task-board plan: announce and create one unique session cron per top-level task, hourly by default or at the user's interval, using available native scheduling tools. Record its task-specific prompt, schedule ID, timezone, tick count and stop rule in that task's methodology. If scheduling is unavailable, report the gap without claiming a schedule exists.\n\nEach tick rereads the goal, task-specific methodology and anti-drift rules; collects active agent updates; reconciles task statuses, dependencies and remaining work; repairs stale dependencies; updates the task graph, keeping all unfinished entries and only the latest 10 completed entries, with older completion evidence preserved outside the active graph. It checks delivered work against the end goal, corrects drift, and identifies remaining acceptance criteria, progress, problems, blockers and user questions.\n\nThen it emits an extremely compact, clearly formatted report: `HH:MM TZ · tick N · elapsed`; `🟢 completed`; `🔵 active / remaining / next`; `🔴 problems / blockers / questions`; `⚪ anti-drift verdict`. Omit empty rows; use only these circles. Stop and verify cron removal on task completion or cancellation.\n"
      }
    ],
    "expected": "User typed `+++` in Plan mode — plan the task anti-drift cron:\n\n# [ADDON: ANTI-DRIFT CRON PLAN]\n\nStay read-only in Plan mode: plan the schedule now, never create it before execution. Add an execution step to the task-board plan: announce and create one unique session cron per top-level task, hourly by default or at the user's interval, using available native scheduling tools. Record its task-specific prompt, schedule ID, timezone, tick count and stop rule in that task's methodology. If scheduling is unavailable, report the gap without claiming a schedule exists.\n\nEach tick rereads the goal, task-specific methodology and anti-drift rules; collects active agent updates; reconciles task statuses, dependencies and remaining work; repairs stale dependencies; updates the task graph, keeping all unfinished entries and only the latest 10 completed entries, with older completion evidence preserved outside the active graph. It checks delivered work against the end goal, corrects drift, and identifies remaining acceptance criteria, progress, problems, blockers and user questions.\n\nThen it emits an extremely compact, clearly formatted report: `HH:MM TZ · tick N · elapsed`; `🟢 completed`; `🔵 active / remaining / next`; `🔴 problems / blockers / questions`; `⚪ anti-drift verdict`. Omit empty rows; use only these circles. Stop and verify cron removal on task completion or cancellation.",
    "length": 1395,
    "sha": "d20cc630a056a2293da3449348b44761d08435e031840bf9f46966bb9126033f"
  },
  {
    "id": "o24-reference-review-regression-raw",
    "group": "override",
    "prompt": "++rr",
    "hookPrompt": "++rr",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "review-regression",
        "layer": "project",
        "raw": "# ++rr - manager-prompt.mjs, cap 9000\n\n```\n[REVIEW DISCIPLINE: ANTI-REGRESSION]\nEvery significant phase: one review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\nAxes: 1) no regression (primary) - existing behavior intact; 2) project\nstandard - existing conventions/patterns; 3) functional correctness - the new\nfunctionality works.\na) Review - finding = defect on an axis with path:line + evidence (failing\ncommand/input or broken caller).\nb) Double-check - reproduce each finding before acting.\nc) Fix - confirmed findings only, then re-review the fix.\nTask end: final cross-review across all phases, regression first.\nLarge review -> split by area across reviewers, never one long pass. Brief\neach: goal + area + acceptance, what's reviewed (don't re-litigate), who\nconsumes the verdict; return verdict first, then findings.\n```\n"
      }
    ],
    "expected": "User typed `++rr` — Anti-regression review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: ANTI-REGRESSION]\nEvery significant phase: one review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\nAxes: 1) no regression (primary) - existing behavior intact; 2) project\nstandard - existing conventions/patterns; 3) functional correctness - the new\nfunctionality works.\na) Review - finding = defect on an axis with path:line + evidence (failing\ncommand/input or broken caller).\nb) Double-check - reproduce each finding before acting.\nc) Fix - confirmed findings only, then re-review the fix.\nTask end: final cross-review across all phases, regression first.\nLarge review -> split by area across reviewers, never one long pass. Brief\neach: goal + area + acceptance, what's reviewed (don't re-litigate), who\nconsumes the verdict; return verdict first, then findings.",
    "length": 895,
    "sha": "4a76c6b4176b8bf88477ed5d8a7e98a01432e95f0c69d110c09bfca6467cc89c"
  },
  {
    "id": "o31-trailing-blank-lines-in-block",
    "group": "override",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": "```\nA\n\n\n```\n```\nB\n```"
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\nA\n\nB",
    "length": 79,
    "sha": "81fa8b3940b4a2cd174dd83809ae7444eb9ce623954384ecaf18b4eb30bff84e"
  },
  {
    "id": "o25-two-overrides",
    "group": "override",
    "prompt": "++a ++r",
    "hookPrompt": "++a ++r",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": "A!"
      },
      {
        "legacy": "review-double",
        "layer": "project",
        "raw": "R!"
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\nA!\n\n---\n\nUser typed `++r` — Two-phase review discipline is active for this turn:\n\nR!",
    "length": 159,
    "sha": "67fe962392e4087a5cb1255b111d5097bb64362dc3db035ca0bb31d38df4ae60"
  },
  {
    "id": "o26-cap-exactly-9000",
    "group": "cap",
    "prompt": "++m",
    "hookPrompt": "++m",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "full",
        "layer": "project",
        "raw": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    ],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\nxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "length": 9000,
    "sha": "285cac4a3f1c697e68e0db4e5c5b9e6257af51a8a5f4a2b0e905bade3274db2e"
  },
  {
    "id": "o27-cap-9001",
    "group": "cap",
    "prompt": "++m",
    "hookPrompt": "++m",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "full",
        "layer": "project",
        "raw": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    ],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\nxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n...[truncated]",
    "length": 9015,
    "sha": "119e366c5d2646a2d9873bf64de8d6d278396c0129bf6cdb926df0550c667e09"
  },
  {
    "id": "o28-cap-way-over",
    "group": "cap",
    "prompt": "++m",
    "hookPrompt": "++m",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "full",
        "layer": "project",
        "raw": "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"
      }
    ],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\nzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz\n...[truncated]",
    "length": 9015,
    "sha": "c13887fffab3e6c0b68a7583272194168196cb8ff8e1cba31b9469bddc6cf4f1"
  },
  {
    "id": "o29-cap-splits-surrogate",
    "group": "cap",
    "prompt": "++m",
    "hookPrompt": "++m",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "full",
        "layer": "project",
        "raw": "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy😀tail"
      }
    ],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\nyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy\ud83d\n...[truncated]",
    "length": 9015,
    "sha": "66cc44c3b00acc68d8d4f7907cd06a5a85f9d246e73c06f6a5f7ba010d3c496b"
  },
  {
    "id": "o30-cap-combined-plan",
    "group": "cap",
    "prompt": "+++ ++m ++a ++rr",
    "hookPrompt": "+++ ++m ++a ++rr",
    "mode": "plan",
    "prefix": "++",
    "files": [
      {
        "legacy": "planmode",
        "layer": "project",
        "raw": "pppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp"
      }
    ],
    "expected": "User typed `+++` in Plan mode — plan the task anti-drift cron:\n\n# [ADDON: ANTI-DRIFT CRON PLAN]\n\nStay read-only in Plan mode: plan the schedule now, never create it before execution. Add an execution step to the task-board plan: announce and create one unique session cron per top-level task, hourly by default or at the user's interval, using available native scheduling tools. Record its task-specific prompt, schedule ID, timezone, tick count and stop rule in that task's methodology. If scheduling is unavailable, report the gap without claiming a schedule exists.\n\nEach tick rereads the goal, task-specific methodology and anti-drift rules; collects active agent updates; reconciles task statuses, dependencies and remaining work; repairs stale dependencies; updates the task graph, keeping all unfinished entries and only the latest 10 completed entries, with older completion evidence preserved outside the active graph. It checks delivered work against the end goal, corrects drift, and identifies remaining acceptance criteria, progress, problems, blockers and user questions.\n\nThen it emits an extremely compact, clearly formatted report: `HH:MM TZ · tick N · elapsed`; `🟢 completed`; `🔵 active / remaining / next`; `🔴 problems / blockers / questions`; `⚪ anti-drift verdict`. Omit empty rows; use only these circles. Stop and verify cron removal on task completion or cancellation.\n\n---\n\nUser typed `++m` — Manager + Plan Mode is active for this turn:\n\npppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp\n\n---\n\nUser typed `++a` — Architecture-first discipline is active for this turn:\n\n[DIRECTIVE: ARCHITECTURE-FIRST]\n\nBefore implementing, delegate the design to a matching architect/reviewer\nexpert agent, else general-purpose - never design inline. Split a large\ndesign by area across several agents, never one long pass. Brief each: area +\nout-of-bounds, what's decided (must not reopen), who consumes the design next.\n\nRequired of the design:\n- Fits existing architecture/patterns/rules/conventions - breaks nothing that\n  works.\n- As simple as possible while staying scalable - no over-engineering.\n- Abstractions only where earned: reuse the closest well-built repo\n  counterpart's patterns/classes, new pattern only if nothing fits - additive\n  to conventions/rules/docs, never instead.\n- Clean seams/boundaries so the code stays easy to modify.\n\nDeliverable before coding: a short, concrete plan - components, boundaries,\ndata flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,\nwrite it into the plan.\n\n---\n\n\n...[truncated]",
    "length": 9015,
    "sha": "8609438ed21b355e048721563347145f3ffbf34b817a5a49796b5d662cadb41c"
  },
  {
    "id": "l01-launch-dir-override",
    "group": "launch-dir",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": "```\nroot override\n```\n"
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\nroot override",
    "length": 88,
    "sha": "5ca437f7b30c8dbd43d5cfcc47b998711c9c80ef430f5ee47fffb3982f8d5670",
    "note": "CLAUDE_PROJECT_DIR=launch dir, hook cwd=sub"
  },
  {
    "id": "l02-launch-dir-beats-sub-decoy",
    "group": "launch-dir",
    "prompt": "++a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "++",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": "```\nroot override\n```\n"
      }
    ],
    "expected": "User typed `++a` — Architecture-first discipline is active for this turn:\n\nroot override",
    "length": 88,
    "sha": "5ca437f7b30c8dbd43d5cfcc47b998711c9c80ef430f5ee47fffb3982f8d5670",
    "note": "a .claude/ under sub is ignored"
  },
  {
    "id": "l03-launch-dir-defaults",
    "group": "launch-dir",
    "prompt": "++m ++r",
    "hookPrompt": "++m ++r",
    "mode": "default",
    "prefix": "++",
    "files": [],
    "expected": "User typed `++m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.\n\n---\n\nUser typed `++r` — Two-phase review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: DOUBLE-CHECK]\nEvery significant change: multi-agent review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\n1) Review - finding = defect with path:line + evidence (failing command/input).\n2) Double-check - reproduce each finding.\n3) Fix - confirmed findings only.\nBig review -> split by area, never one long pass. Brief each: goal + area +\nacceptance, what's covered (don't re-litigate), who consumes the verdict;\nreturn verdict first, then findings.",
    "length": 2368,
    "sha": "77ddd14ab375d3082451feeb9fa11459af44212d2138611b9a6c56211a9d1d96"
  },
  {
    "id": "p01-m",
    "group": "custom-prefix",
    "prompt": "@@m",
    "hookPrompt": "++m",
    "mode": "default",
    "prefix": "@@",
    "files": [],
    "expected": "User typed `@@m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.",
    "length": 1790,
    "sha": "07358d65a4de176998ed84f5035540b31609009a1cffbed4d1b31cf16c864344"
  },
  {
    "id": "p02-m-plan",
    "group": "custom-prefix",
    "prompt": "@@m",
    "hookPrompt": "++m",
    "mode": "plan",
    "prefix": "@@",
    "files": [],
    "expected": "User typed `@@m` — Manager + Plan Mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.\n\n[ADDON: PLAN MODE]\n\nStay read-only: no code, board/task-state writes, installation, configuration,\nor cron creation. Read-only expert exploration is allowed.\n\nInclude in the plan (English, token economy):\n- PREAMBLE: [ROLE: MANAGER] + the 5-step protocol restated verbatim as the\n  plan's opening section - this addon expires, so the plan carries the role\n  into implementation, no hook needed.\n- STEP 0, stated literally: \"Re-assume the MANAGER role. Call TaskList; if no\n  graph exists, create the ENTIRE TaskGraph now - TaskCreate for every node, or\n  the numbered checklist if task tools are absent - then delegate.\" On exit\n  this comes first: not code, not one task.\n- The full TaskGraph: every task decomposed (subject, acceptance, owner\n  agent, bounded scope+acceptance per spawn), dependencies marked, parallel\n  branches explicit, critical path named.\n\nInclude the task-board execution step: announce and create one unique session\nanti-drift cron per top-level task, hourly unless the user chooses another tick;\nduring execution record its task-specific methodology/prompt, timezone, ID,\ntick count and stop rule. Scheduling unavailable -> explicit gap, never a\nclaimed schedule. Each tick: reread methodology/anti-drift rules, collect agent\nupdates, reconcile status/dependencies/goal, keep all unfinished + latest 10\ncompleted graph entries, preserve older evidence outside the active graph.\nThe tick report is `HH:MM TZ · tick N · elapsed`, then only the nonempty rows:\n🟢 completed, 🔵 active/remaining/next, 🔴 problems/blockers/questions,\n⚪ anti-drift verdict. Completion/cancellation -> stop and verify cron removal.\n\nDeliver the embedded role + graph + deferred cron step, not implementation code.",
    "length": 3515,
    "sha": "416d8dcc7488b728f0d3357cef8f5e221cdf7c61073002afa3bd785d538a17a9"
  },
  {
    "id": "p03-a-rr",
    "group": "custom-prefix",
    "prompt": "@@a @@rr",
    "hookPrompt": "++a ++rr",
    "mode": "default",
    "prefix": "@@",
    "files": [],
    "expected": "User typed `@@a` — Architecture-first discipline is active for this turn:\n\n[DIRECTIVE: ARCHITECTURE-FIRST]\n\nBefore implementing, delegate the design to a matching architect/reviewer\nexpert agent, else general-purpose - never design inline. Split a large\ndesign by area across several agents, never one long pass. Brief each: area +\nout-of-bounds, what's decided (must not reopen), who consumes the design next.\n\nRequired of the design:\n- Fits existing architecture/patterns/rules/conventions - breaks nothing that\n  works.\n- As simple as possible while staying scalable - no over-engineering.\n- Abstractions only where earned: reuse the closest well-built repo\n  counterpart's patterns/classes, new pattern only if nothing fits - additive\n  to conventions/rules/docs, never instead.\n- Clean seams/boundaries so the code stays easy to modify.\n\nDeliverable before coding: a short, concrete plan - components, boundaries,\ndata flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,\nwrite it into the plan.\n\n---\n\nUser typed `@@rr` — Anti-regression review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: ANTI-REGRESSION]\nEvery significant phase: one review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\nAxes: 1) no regression (primary) - existing behavior intact; 2) project\nstandard - existing conventions/patterns; 3) functional correctness - the new\nfunctionality works.\na) Review - finding = defect on an axis with path:line + evidence (failing\ncommand/input or broken caller).\nb) Double-check - reproduce each finding before acting.\nc) Fix - confirmed findings only, then re-review the fix.\nTask end: final cross-review across all phases, regression first.\nLarge review -> split by area across reviewers, never one long pass. Brief\neach: goal + area + acceptance, what's reviewed (don't re-litigate), who\nconsumes the verdict; return verdict first, then findings.",
    "length": 1921,
    "sha": "16e00b8da4ff681c26a8ad65153bd6fa643603a6659dda521106e8ccefd0bda5"
  },
  {
    "id": "p04-cron",
    "group": "custom-prefix",
    "prompt": "@@+",
    "hookPrompt": "+++",
    "mode": "plan",
    "prefix": "@@",
    "files": [],
    "expected": "User typed `@@+` in Plan mode — plan the task anti-drift cron:\n\n# [ADDON: ANTI-DRIFT CRON PLAN]\n\nStay read-only in Plan mode: plan the schedule now, never create it before execution. Add an execution step to the task-board plan: announce and create one unique session cron per top-level task, hourly by default or at the user's interval, using available native scheduling tools. Record its task-specific prompt, schedule ID, timezone, tick count and stop rule in that task's methodology. If scheduling is unavailable, report the gap without claiming a schedule exists.\n\nEach tick rereads the goal, task-specific methodology and anti-drift rules; collects active agent updates; reconciles task statuses, dependencies and remaining work; repairs stale dependencies; updates the task graph, keeping all unfinished entries and only the latest 10 completed entries, with older completion evidence preserved outside the active graph. It checks delivered work against the end goal, corrects drift, and identifies remaining acceptance criteria, progress, problems, blockers and user questions.\n\nThen it emits an extremely compact, clearly formatted report: `HH:MM TZ · tick N · elapsed`; `🟢 completed`; `🔵 active / remaining / next`; `🔴 problems / blockers / questions`; `⚪ anti-drift verdict`. Omit empty rows; use only these circles. Stop and verify cron removal on task completion or cancellation.",
    "length": 1395,
    "sha": "1b2a9ec6a67670762b6ab19edd9bbb219040f7259c455fae126de001133c2de7"
  },
  {
    "id": "p05-r-rr",
    "group": "custom-prefix",
    "prompt": "@@r @@rr",
    "hookPrompt": "++r ++rr",
    "mode": "default",
    "prefix": "@@",
    "files": [],
    "expected": "User typed `@@rr` — Anti-regression review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: ANTI-REGRESSION]\nEvery significant phase: one review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\nAxes: 1) no regression (primary) - existing behavior intact; 2) project\nstandard - existing conventions/patterns; 3) functional correctness - the new\nfunctionality works.\na) Review - finding = defect on an axis with path:line + evidence (failing\ncommand/input or broken caller).\nb) Double-check - reproduce each finding before acting.\nc) Fix - confirmed findings only, then re-review the fix.\nTask end: final cross-review across all phases, regression first.\nLarge review -> split by area across reviewers, never one long pass. Brief\neach: goal + area + acceptance, what's reviewed (don't re-litigate), who\nconsumes the verdict; return verdict first, then findings.",
    "length": 895,
    "sha": "5f16bcd8aa140ead62d831d02e6c6d8d8b8cfe2317260bb45fee220aae326d85"
  },
  {
    "id": "p06-all-plan",
    "group": "custom-prefix",
    "prompt": "@@+ @@m @@a @@rr",
    "hookPrompt": "+++ ++m ++a ++rr",
    "mode": "plan",
    "prefix": "@@",
    "files": [],
    "expected": "User typed `@@+` in Plan mode — plan the task anti-drift cron:\n\n# [ADDON: ANTI-DRIFT CRON PLAN]\n\nStay read-only in Plan mode: plan the schedule now, never create it before execution. Add an execution step to the task-board plan: announce and create one unique session cron per top-level task, hourly by default or at the user's interval, using available native scheduling tools. Record its task-specific prompt, schedule ID, timezone, tick count and stop rule in that task's methodology. If scheduling is unavailable, report the gap without claiming a schedule exists.\n\nEach tick rereads the goal, task-specific methodology and anti-drift rules; collects active agent updates; reconciles task statuses, dependencies and remaining work; repairs stale dependencies; updates the task graph, keeping all unfinished entries and only the latest 10 completed entries, with older completion evidence preserved outside the active graph. It checks delivered work against the end goal, corrects drift, and identifies remaining acceptance criteria, progress, problems, blockers and user questions.\n\nThen it emits an extremely compact, clearly formatted report: `HH:MM TZ · tick N · elapsed`; `🟢 completed`; `🔵 active / remaining / next`; `🔴 problems / blockers / questions`; `⚪ anti-drift verdict`. Omit empty rows; use only these circles. Stop and verify cron removal on task completion or cancellation.\n\n---\n\nUser typed `@@m` — Manager + Plan Mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.\n\n[ADDON: PLAN MODE]\n\nStay read-only: no code, board/task-state writes, installation, configuration,\nor cron creation. Read-only expert exploration is allowed.\n\nInclude in the plan (English, token economy):\n- PREAMBLE: [ROLE: MANAGER] + the 5-step protocol restated verbatim as the\n  plan's opening section - this addon expires, so the plan carries the role\n  into implementation, no hook needed.\n- STEP 0, stated literally: \"Re-assume the MANAGER role. Call TaskList; if no\n  graph exists, create the ENTIRE TaskGraph now - TaskCreate for every node, or\n  the numbered checklist if task tools are absent - then delegate.\" On exit\n  this comes first: not code, not one task.\n- The full TaskGraph: every task decomposed (subject, acceptance, owner\n  agent, bounded scope+acceptance per spawn), dependencies marked, parallel\n  branches explicit, critical path named.\n\nInclude the task-board execution step: announce and create one unique session\nanti-drift cron per top-level task, hourly unless the user chooses another tick;\nduring execution record its task-specific methodology/prompt, timezone, ID,\ntick count and stop rule. Scheduling unavailable -> explicit gap, never a\nclaimed schedule. Each tick: reread methodology/anti-drift rules, collect agent\nupdates, reconcile status/dependencies/goal, keep all unfinished + latest 10\ncompleted graph entries, preserve older evidence outside the active graph.\nThe tick report is `HH:MM TZ · tick N · elapsed`, then only the nonempty rows:\n🟢 completed, 🔵 active/remaining/next, 🔴 problems/blockers/questions,\n⚪ anti-drift verdict. Completion/cancellation -> stop and verify cron removal.\n\nDeliver the embedded role + graph + deferred cron step, not implementation code.\n\n---\n\nUser typed `@@a` — Architecture-first discipline is active for this turn:\n\n[DIRECTIVE: ARCHITECTURE-FIRST]\n\nBefore implementing, delegate the design to a matching architect/reviewer\nexpert agent, else general-purpose - never design inline. Split a large\ndesign by area across several agents, never one long pass. Brief each: area +\nout-of-bounds, what's decided (must not reopen), who consumes the design next.\n\nRequired of the design:\n- Fits existing architecture/patterns/rules/conventions - breaks nothing that\n  works.\n- As simple as possible while staying scalable - no over-engineering.\n- Abstractions only where earned: reuse the closest well-built repo\n  counterpart's patterns/classes, new pattern only if nothing fits - additive\n  to conventions/rules/docs, never instead.\n- Clean seams/boundaries so the code stays easy to modify.\n\nDeliverable before coding: a short, concrete plan - components, boundaries,\ndata flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,\nwrite it into the plan.\n\n---\n\nUser typed `@@rr` — Anti-regression review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: ANTI-REGRESSION]\nEvery significant phase: one review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\nAxes: 1) no regression (primary) - existing behavior intact; 2) project\nstandard - existing conventions/patterns; 3) functional correctness - the new\nfunctionality works.\na) Review - finding = defect on an axis with path:line + evidence (failing\ncommand/input or broken caller).\nb) Double-check - reproduce each finding before acting.\nc) Fix - confirmed findings only, then re-review the fix.\nTask end: final cross-review across all phases, regression first.\nLarge review -> split by area across reviewers, never one long pass. Brief\neach: goal + area + acceptance, what's reviewed (don't re-litigate), who\nconsumes the verdict; return verdict first, then findings.",
    "length": 6845,
    "sha": "7937a5854ca65ec36d3180be1a6df0c7417c0293ee1691e4beba20363e4388c2"
  },
  {
    "id": "p07-word-before",
    "group": "custom-prefix",
    "prompt": "x@@m",
    "hookPrompt": "x++m",
    "mode": "default",
    "prefix": "@@",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "p08-cron-default",
    "group": "custom-prefix",
    "prompt": "@@+",
    "hookPrompt": "+++",
    "mode": "default",
    "prefix": "@@",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "p09-upper",
    "group": "custom-prefix",
    "prompt": "@@M @@R",
    "hookPrompt": "++M ++R",
    "mode": "default",
    "prefix": "@@",
    "files": [],
    "expected": "User typed `@@m` — Manager mode is active for this turn:\n\n[ROLE: MANAGER]\n\nManage; never code/build/test/hand-debug: the main context is for orchestration.\n\nProtocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph\nbefore any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else\nparallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;\ncompleted only when truly done; failure -> follow-up task + re-delegate. 5) all\ncode written -> final task: simplify, strip over-engineering.\nNo Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph\nin the plan or .claude/features/<task>.md.\n\nSizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;\nlarger -> split. An hour-long agent = drift nobody can observe.\nScan all agents: best-matching expert per task, else general-purpose.\n\nSpawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.\nGOAL: task + why it exists - without the why it cannot rank the work.\nROLE: what it owns, must not touch - else two agents edit one file.\nSCOPE: paths/commands in bounds and out - else the task widens.\nCONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.\nCONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.\nDONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.\nCode/test briefs add: follow the closest well-built repo counterpart's\nprinciples - additive to conventions/rules/docs, never instead.\n\nFinish the whole job; decide without routine questions.\n\n---\n\nUser typed `@@r` — Two-phase review discipline is active for this turn:\n\n[REVIEW DISCIPLINE: DOUBLE-CHECK]\nEvery significant change: multi-agent review (matching reviewer expert, else\ngeneral-purpose), simplification pass first.\n1) Review - finding = defect with path:line + evidence (failing command/input).\n2) Double-check - reproduce each finding.\n3) Fix - confirmed findings only.\nBig review -> split by area, never one long pass. Brief each: goal + area +\nacceptance, what's covered (don't re-litigate), who consumes the verdict;\nreturn verdict first, then findings.",
    "length": 2368,
    "sha": "bc75e30850efe71966c0bc65469f3bf031d121ad62dcbc6aaccf4a34443c5665"
  },
  {
    "id": "p10-synthetic",
    "group": "custom-prefix",
    "prompt": "<task-notification>@@m",
    "hookPrompt": "<task-notification>++m",
    "mode": "default",
    "prefix": "@@",
    "files": [],
    "expected": null,
    "length": null,
    "sha": null
  },
  {
    "id": "p11-override-custom-prefix",
    "group": "custom-prefix",
    "prompt": "@@a",
    "hookPrompt": "++a",
    "mode": "default",
    "prefix": "@@",
    "files": [
      {
        "legacy": "architect",
        "layer": "project",
        "raw": "A custom!"
      }
    ],
    "expected": "User typed `@@a` — Architecture-first discipline is active for this turn:\n\nA custom!",
    "length": 84,
    "sha": "63cfb9cb29b458cc2a3a269ad9ab130741b78fc62de30fb9db8bb5f4603803d8"
  }
]
