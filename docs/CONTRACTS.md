# Shared contracts

Canonical definitions live in `src/domain/types.ts`.

## Course IDs

Every course uses:

```
mit:<localCourseId>
```

Example: `mit:18.06`.

## PrerequisiteRule

- `course`: one course is required.
- `all`: every child is required.
- `any`: at least one child is required.
- `permission`: approval is required and must be reviewed.
- `unknown`: original requirement is unresolved and must be reviewed.

An empty `all` means no listed prerequisites.

## Shared state

- completedCourseIds
- selectedCourseId
- highlightedCourseIds
- targetCourseId
- interestQuery
- recommendations

## Shared actions

- SELECT_COURSE
- SHOW_ON_MAP
- OPEN_PATHWAY
- TOGGLE_COMPLETED
- SET_QUERY
- SET_RECOMMENDATIONS
- RESET

Feature code must consume these contracts instead of redefining them.
