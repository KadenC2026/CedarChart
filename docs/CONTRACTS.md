# Shared contracts

Canonical definitions live in `src/domain/types.ts`.

## Course IDs

Every course uses:

```
mit:<localCourseId>
```

Example: `mit:18.06`.

`plannedCourses` and `priorityCourses` hold the local subject id without the `mit:`
prefix. Use `localId()` from `src/domain/requirements.ts` when comparing ids that may
carry the prefix.

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
- plannedCourses
- instructorPermissionCourseIds (explicit student-recorded approval only; never inferred)
- hiddenMapCourseIds: planned subjects the user chose to hide from the persistent map
- priorityCourses: subjects the student wants to take, ordered most to least important,
  each marked `required` or `preferred`

## Shared actions

- SELECT_COURSE
- SHOW_ON_MAP
- OPEN_PATHWAY
- TOGGLE_COMPLETED
- SET_QUERY
- SET_RECOMMENDATIONS
- SET_MAP_COURSE_VISIBILITY
- ADD_PRIORITY_COURSE
- REPLACE_PLANNED_COURSE
- REMOVE_PRIORITY_COURSE
- MOVE_PRIORITY_COURSE
- SET_PRIORITY_TIER
- CLEAR_PRIORITY_COURSES
- RESET

## Schedule data

`RemoteCourse.schedule` is the raw FireRoad string, e.g.
`Lecture,26-100/TR/0/2.30-4;Recitation,26-168/WF/0/10,38-166/WF/0/1`. Sections are
separated by `;`, and the options inside one section are alternatives to choose between.
Only `src/domain/schedule.ts` parses it. Times carry no meridiem, so 1-7 mean afternoon
and the evening flag or a trailing `PM` marks later meetings. Suggested schedules are
solved deterministically from these times; AI is never involved.

Feature code must consume these contracts instead of redefining them.
