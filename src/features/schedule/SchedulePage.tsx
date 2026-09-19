import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCatalog } from "../../data/catalog";
import { emptyFilters, searchCourses } from "../../domain/courseSearch";
import { earnedCourseIds, localId } from "../../domain/requirements";
import {
  buildScheduleCandidates,
  dayLabels,
  defaultConstraints,
  exclusionLabels,
  formatHour,
  formatMeeting,
  mentionedPrerequisites,
  parseSchedule,
  scheduleDays,
  unavoidableConflicts,
  type MeetingBlock,
  type ScheduleCandidate,
  type ScheduleConstraints,
  type ScheduleCourseInput,
} from "../../domain/schedule";
import { plannerTerms } from "../../domain/terms";
import type { RemoteCourse } from "../../domain/types";
import { useApp } from "../../state/AppContext";

const hourHeight = 34;

function meetingSummary(course: RemoteCourse) {
  const sections = parseSchedule(course.schedule);
  if (!sections.length) return "No meeting times in the imported snapshot";
  return sections
    .map((section) => {
      const first = formatMeeting(section.options[0].blocks);
      return section.options.length > 1
        ? `${section.kind} ${first} (+${section.options.length - 1} other option${section.options.length === 2 ? "" : "s"})`
        : `${section.kind} ${first}`;
    })
    .join(" · ");
}

function WeekGrid({ candidate }: { candidate: ScheduleCandidate }) {
  const blocks = candidate.entries.flatMap((entry) =>
    entry.blocks.map((block) => ({ ...block, subjectId: entry.subjectId })),
  );
  if (!blocks.length) return null;

  const start = Math.floor(Math.min(...blocks.map((block) => block.start), 9));
  const end = Math.ceil(Math.max(...blocks.map((block) => block.end), 16));
  const hours = Array.from({ length: end - start }, (_, index) => start + index);

  function position(block: MeetingBlock) {
    return { top: (block.start - start) * hourHeight, height: (block.end - block.start) * hourHeight };
  }

  return (
    <div className="week-grid" style={{ ["--week-grid-height" as string]: `${hours.length * hourHeight}px` }}>
      <div className="week-grid-hours">
        {hours.map((hour) => (
          <div key={hour} style={{ height: hourHeight }}>{formatHour(hour)}</div>
        ))}
      </div>
      {scheduleDays.map((day) => (
        <div className="week-grid-day" key={day}>
          <span className="week-grid-day-label">{dayLabels[day]}</span>
          <div className="week-grid-column">
            {hours.map((hour) => (
              <div className="week-grid-line" key={hour} style={{ height: hourHeight }} />
            ))}
            {blocks
              .filter((block) => block.day === day)
              .map((block, index) => (
                <div
                  className="week-grid-block"
                  key={block.subjectId + index}
                  style={position(block)}
                  title={`${block.subjectId} ${formatHour(block.start)}–${formatHour(block.end)}`}
                >
                  <strong>{block.subjectId}</strong>
                  <span>{formatHour(block.start)}</span>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SchedulePage() {
  const { state, dispatch } = useApp();
  const { data, error, retry } = useCatalog();
  const catalog = data?.courses ?? [];
  const [query, setQuery] = useState("");
  const [constraints, setConstraints] = useState<ScheduleConstraints>(defaultConstraints);
  const [applyTerm, setApplyTerm] = useState(0);
  const [importTerm, setImportTerm] = useState(0);

  const courseById = useMemo(
    () => new Map(catalog.map((course) => [course.subject_id, course])),
    [catalog],
  );

  const inputs = useMemo<ScheduleCourseInput[]>(
    () =>
      state.priorityCourses
        .map((entry) => {
          const course = courseById.get(localId(entry.courseId));
          return course ? { course, tier: entry.tier } : null;
        })
        .filter((entry): entry is ScheduleCourseInput => entry !== null),
    [state.priorityCourses, courseById],
  );

  const candidates = useMemo(() => buildScheduleCandidates(inputs, constraints), [inputs, constraints]);
  const conflicts = useMemo(() => unavoidableConflicts(inputs), [inputs]);

  const earned = useMemo(() => earnedCourseIds(state), [state]);
  const advisories = useMemo(
    () =>
      inputs
        .map((entry) => ({
          subjectId: entry.course.subject_id,
          missing: mentionedPrerequisites(entry.course, catalog, earned),
          rule: entry.course.prerequisites ?? "",
        }))
        .filter((entry) => entry.missing.length > 0),
    [inputs, catalog, earned],
  );

  const results = useMemo(
    () => (query.trim() ? searchCourses(catalog, { query, filters: emptyFilters, limit: 6 }) : []),
    [catalog, query],
  );

  const listed = new Set(state.priorityCourses.map((entry) => localId(entry.courseId)));
  const untimed = inputs.filter((entry) => !parseSchedule(entry.course.schedule).length);

  function applyToPlan(candidate: ScheduleCandidate) {
    for (const entry of candidate.entries) {
      const course = courseById.get(entry.subjectId);
      dispatch({
        type: "ADD_PLANNED_COURSE",
        course: {
          courseId: entry.subjectId,
          title: entry.title,
          units: course?.total_units,
          term: applyTerm,
        },
      });
    }
  }

  function importPlannedTerm() {
    for (const planned of state.plannedCourses.filter((course) => course.term === importTerm)) {
      dispatch({
        type: "ADD_PRIORITY_COURSE",
        course: { courseId: localId(planned.courseId), tier: "preferred" },
      });
    }
  }

  if (error) {
    return (
      <section className="page">
        <p className="error-note">{error}</p>
        <button onClick={retry}>Retry</button>
      </section>
    );
  }

  if (!data) return <section className="page"><p>Loading MIT course data…</p></section>;

  return (
    <section className="page schedule-page">
      <div className="eyebrow">Schedule lab · experimental</div>
      <h1>Rank the classes you want, then compare schedules that actually fit.</h1>
      <p className="lede">
        Add the subjects you are considering, mark the ones you refuse to drop, and CedarChart
        reads the published meeting times to show which combinations are possible.
      </p>
      <p className="data-note">
        Meeting times come from the imported FireRoad snapshot, which carries one term of section
        listings, so subjects taught in another term show no times and cannot be placed. Always confirm
        against the registrar before registering.
      </p>

      <div className="schedule-layout">
        <div className="schedule-builder">
          <article className="detail-card">
            <h2>Priority list</h2>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a subject to add, e.g. 6.1200"
              aria-label="Search a subject to add to your priority list"
            />
            {results.length > 0 && (
              <div className="schedule-search-results">
                {results.map((course) => (
                  <button
                    key={course.subject_id}
                    disabled={listed.has(course.subject_id)}
                    onClick={() => {
                      dispatch({
                        type: "ADD_PRIORITY_COURSE",
                        course: { courseId: course.subject_id, tier: "preferred" },
                      });
                      setQuery("");
                    }}
                  >
                    <strong>{course.subject_id}</strong>
                    <span>{course.title}</span>
                    <small>{parseSchedule(course.schedule).length ? "has times" : "no times"}</small>
                  </button>
                ))}
              </div>
            )}

            <div className="schedule-import">
              <label>
                <span>Import a plan term</span>
                <select value={importTerm} onChange={(event) => setImportTerm(Number(event.target.value))}>
                  {plannerTerms.map((term, index) => (
                    <option value={index} key={term}>{term}</option>
                  ))}
                </select>
              </label>
              <button className="secondary-button" onClick={importPlannedTerm}>Add those courses</button>
            </div>

            {!state.priorityCourses.length && (
              <p className="data-note">
                Nothing ranked yet. Add subjects here, or drop them in from the{" "}
                <Link to="/planner">planner</Link> and the{" "}
                <Link to="/map">course map</Link>.
              </p>
            )}

            <ol className="priority-list">
              {inputs.map((entry, index) => (
                <li key={entry.course.subject_id}>
                  <div className="priority-rank">{index + 1}</div>
                  <div className="priority-main">
                    <strong>{entry.course.subject_id}</strong> {entry.course.title}
                    <span className="data-note">
                      {entry.course.total_units ?? "?"} units · {meetingSummary(entry.course)}
                    </span>
                  </div>
                  <div className="priority-actions">
                    <button
                      className={entry.tier === "required" ? "chip chip-on" : "chip"}
                      aria-pressed={entry.tier === "required"}
                      onClick={() =>
                        dispatch({
                          type: "SET_PRIORITY_TIER",
                          courseId: entry.course.subject_id,
                          tier: entry.tier === "required" ? "preferred" : "required",
                        })
                      }
                    >
                      {entry.tier === "required" ? "Must take" : "Nice to have"}
                    </button>
                    <button
                      aria-label={"Move " + entry.course.subject_id + " up"}
                      disabled={index === 0}
                      onClick={() => dispatch({ type: "MOVE_PRIORITY_COURSE", courseId: entry.course.subject_id, direction: -1 })}
                    >
                      ↑
                    </button>
                    <button
                      aria-label={"Move " + entry.course.subject_id + " down"}
                      disabled={index === inputs.length - 1}
                      onClick={() => dispatch({ type: "MOVE_PRIORITY_COURSE", courseId: entry.course.subject_id, direction: 1 })}
                    >
                      ↓
                    </button>
                    <button
                      aria-label={"Remove " + entry.course.subject_id}
                      onClick={() => dispatch({ type: "REMOVE_PRIORITY_COURSE", courseId: entry.course.subject_id })}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ol>

            {state.priorityCourses.length > 0 && (
              <button className="text-button" onClick={() => dispatch({ type: "CLEAR_PRIORITY_COURSES" })}>
                Clear the list
              </button>
            )}
          </article>

          <article className="detail-card">
            <h2>Limits</h2>
            <div className="schedule-constraints">
              <label>
                <span>Max units</span>
                <input
                  type="number"
                  min={0}
                  value={constraints.maxUnits}
                  onChange={(event) =>
                    setConstraints((current) => ({
                      ...current,
                      maxUnits: Math.max(0, Number.parseInt(event.target.value, 10) || 0),
                    }))
                  }
                />
              </label>
              <label>
                <span>No class before</span>
                <select
                  value={constraints.earliestStart ?? ""}
                  onChange={(event) =>
                    setConstraints((current) => ({
                      ...current,
                      earliestStart: event.target.value ? Number(event.target.value) : null,
                    }))
                  }
                >
                  <option value="">Any time</option>
                  <option value={9}>9:00 AM</option>
                  <option value={10}>10:00 AM</option>
                  <option value={11}>11:00 AM</option>
                </select>
              </label>
              <label>
                <span>No class after</span>
                <select
                  value={constraints.latestEnd ?? ""}
                  onChange={(event) =>
                    setConstraints((current) => ({
                      ...current,
                      latestEnd: event.target.value ? Number(event.target.value) : null,
                    }))
                  }
                >
                  <option value="">Any time</option>
                  <option value={17}>5:00 PM</option>
                  <option value={18}>6:00 PM</option>
                  <option value={21}>9:00 PM</option>
                </select>
              </label>
            </div>
          </article>

          {conflicts.length > 0 && (
            <article className="detail-card">
              <h2>Overlaps in your list</h2>
              <ul className="conflict-list">
                {conflicts.map((conflict) => (
                  <li key={conflict.a + conflict.b}>
                    <strong>{conflict.a} vs {conflict.b}</strong>
                    <span className="data-note">{conflict.detail}</span>
                  </li>
                ))}
              </ul>
              <p className="data-note">
                These pairs clash under every listed section option, so no schedule can hold both.
              </p>
            </article>
          )}

          {untimed.length > 0 && (
            <article className="detail-card">
              <h2>Not placeable</h2>
              <p className="data-note">
                {untimed.map((entry) => entry.course.subject_id).join(", ")} have no section listings in
                this snapshot, so they are left out of every suggestion.
              </p>
            </article>
          )}

          {advisories.length > 0 && (
            <article className="detail-card">
              <h2>Prerequisite reading</h2>
              {advisories.map((advisory) => (
                <div className="prereq-advisory" key={advisory.subjectId}>
                  <strong>{advisory.subjectId}</strong>
                  <span className="data-note">
                    Names {advisory.missing.slice(0, 6).join(", ")} which you have not marked complete.
                  </span>
                  <span className="data-note">Catalog rule: {advisory.rule}</span>
                </div>
              ))}
              <p className="data-note">
                This lists subjects named in the catalog text. It does not decide whether the rule is
                satisfied: AND, OR, permission, and unwritten conditions stay with the catalog rule above.
              </p>
            </article>
          )}
        </div>

        <div className="schedule-results">
          <h2>Suggested schedules</h2>
          {!inputs.length && <p className="data-note">Rank a few subjects to see suggestions.</p>}
          {inputs.length > 0 && !candidates.length && (
            <p className="data-note">
              No suggestion fits these limits. Try raising the unit cap, relaxing the hours, or adding a
              subject that has listed meeting times.
            </p>
          )}

          {candidates.map((candidate) => (
            <article className="schedule-candidate" key={candidate.id}>
              <header>
                <div>
                  <h3>{candidate.label}</h3>
                  <p className="data-note">{candidate.rationale}</p>
                </div>
                <div className="schedule-candidate-stats">
                  <span><strong>{candidate.totalUnits}</strong> units</span>
                  <span><strong>{candidate.entries.length}</strong> classes</span>
                  <span><strong>{candidate.daysOnCampus.length}</strong> days on campus</span>
                  {candidate.earliestStart !== null && (
                    <span>starts <strong>{formatHour(candidate.earliestStart)}</strong></span>
                  )}
                </div>
              </header>

              <WeekGrid candidate={candidate} />

              <ul className="schedule-entry-list">
                {candidate.entries.map((entry) => (
                  <li key={entry.subjectId}>
                    <strong>{entry.subjectId}</strong> {entry.title}
                    <span className="data-note">
                      {entry.choices
                        .map((choice) => `${choice.kind} ${formatMeeting(choice.option.blocks)} · ${choice.option.location}`)
                        .join(" | ")}
                    </span>
                    {entry.tier === "required" && <span className="chip chip-on">Must take</span>}
                  </li>
                ))}
              </ul>

              {candidate.excluded.length > 0 && (
                <p className="data-note">
                  Left out:{" "}
                  {candidate.excluded
                    .map((entry) => `${entry.subjectId} (${exclusionLabels[entry.reason]})`)
                    .join("; ")}
                </p>
              )}

              <div className="schedule-apply">
                <label>
                  <span>Add these to</span>
                  <select value={applyTerm} onChange={(event) => setApplyTerm(Number(event.target.value))}>
                    {plannerTerms.map((term, index) => (
                      <option value={index} key={term}>{term}</option>
                    ))}
                  </select>
                </label>
                <button className="secondary-button" onClick={() => applyToPlan(candidate)}>
                  Add {candidate.entries.length} course{candidate.entries.length === 1 ? "" : "s"} to plan
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
