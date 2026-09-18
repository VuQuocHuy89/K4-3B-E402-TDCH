# Pathwise context memory

This is the compact, human-readable project memory for future agents. It is not
a replacement for source code; it records the decisions that are expensive to
rediscover.

## Retrieval protocol

1. Recall only the concepts relevant to the requested feature (for example,
   `diagnostic`, `roadmap`, `micro-lessons`, `tutor-grounding`, or `study-time`).
2. Read the named file/function from the retrieved memory before editing.
3. Preserve these invariants and save a new memory only when a decision changes.
4. Do not save secrets, user answers, or verbose source copies.

## Product invariants

- Diagnostic is a one-time onboarding signal. It disappears after completion.
- Credit only consecutive demonstrated foundations before the first gap. The
  first gap is the learner's starting position; missing knowledge is prioritized
  before new material.
- A chapter contains ordered micro-lessons (the section concepts). A learner
  must visit every micro-lesson and complete its checklist before mastery.
- A section unlocks the next section only after mastery >= 80%.
- Tutor answers must cite mapped `GML-*` sources. If the answer is not grounded,
  it must say so; ML-adjacent fallbacks cite the relevant foundation chapter.
- Study time is counted only while the Study screen is visible and is stored by
  local calendar day.

## Main component links

| Concern | Source of truth | Connected behavior |
|---|---|---|
| Learning content, questions, source IDs | `codebase/content-pack.js`, `server/topic-context.js` | Slides, diagnostic, tutor citations |
| Learner state and UI flow | `codebase/app.js` | persistence, roadmap, micro-lessons, timer |
| API validation/fallback | `server/index.js` | safe citations and content fallback |
| Visual motion and responsive UI | `codebase/styles.css` | roadmap, guide character, reduced motion |

## Memory query examples

- `Pathwise diagnostic assessed start`
- `Pathwise ordered micro lessons mastery`
- `Pathwise tutor PDF source grounding`
- `Pathwise study time visibility`
