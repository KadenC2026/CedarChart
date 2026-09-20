# Cedar project brief

Cedar helps students discover interesting courses and understand the pathways leading to them.

## Core journey

1. Student describes an interest.
2. Cedar returns relevant supported courses with grounded explanations.
3. Student selects a recommendation and shows it on the catalog graph.
4. The correct course is highlighted.
5. Student opens the course pathway.
6. Prerequisite structure is shown.
7. Student marks completed courses.
8. Remaining requirements update.
9. Student can open the official catalog source.

## MVP

- Interactive visual catalog.
- Natural-language course discovery.
- Focused prerequisite pathway.
- Completed-course marking.
- Source-backed course information.
- One shared application and shared state.

MIT is the first supported institution. Course IDs are globally scoped as `mit:<local id>`.

Academic rule evaluation is deterministic. AI is used only to identify relevant courses from the supplied catalog subset.
