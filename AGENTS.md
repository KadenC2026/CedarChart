# Cedar coding rules

Before editing:
1. Read docs/PROJECT_BRIEF.md.
2. Read docs/CONTRACTS.md.
3. Inspect the existing implementation.

Rules:
- Keep this as one application.
- Do not redefine shared domain types inside a feature.
- Do not invent MIT catalog facts.
- Keep prerequisite evaluation deterministic.
- AI may recommend supported courses but must never determine prerequisite satisfaction.
- Validate all AI-returned course IDs against the checked-in catalog.
- Never expose API keys in browser code.
- Preserve AND, OR, unknown, permission, and corequisite distinctions.
- Avoid unrelated refactors during the hackathon.
- Keep main runnable.
