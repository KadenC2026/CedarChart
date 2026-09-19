import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { InterestSearchResult, RemoteCourse } from "../../domain/types";
import { loadCatalog, useCatalog } from "../../data/catalog";
import {
  activeFilterCount,
  compareSubjectIds,
  departmentOptions,
  emptyFilters,
  matchesFilters,
  type CourseFilters,
} from "../../domain/courseSearch";
import { localId } from "../../domain/requirements";
import { useApp } from "../../state/AppContext";
import CourseFilterMenu from "../../components/CourseFilterMenu";

const examples = [
  "I want to build robots that help people",
  "I like music and programming",
  "I want to understand how computers generate images",
  "I care about climate change and data",
];

/**
 * Deterministic interest matching used when the AI endpoint is unavailable or when no
 * AI recommendation survives the filters. Subject-number and title hits outrank
 * description mentions so one department cannot dominate on a single shared word.
 */
function interestMatches(
  courses: RemoteCourse[],
  query: string,
  filters: CourseFilters,
): InterestSearchResult[] {
  const terms = query.toLowerCase().split(/[^\w.]+/).filter((term) => term.length > 2);
  if (!terms.length) return [];

  return courses
    .filter((course) => matchesFilters(course, filters))
    .map((course) => {
      const id = course.subject_id.toLowerCase();
      const title = course.title.toLowerCase();
      const description = (course.description ?? "").toLowerCase();
      const score = terms.reduce(
        (total, term) =>
          total +
          (id.includes(term) ? 4 : 0) +
          (title.includes(term) ? 3 : 0) +
          (description.includes(term) ? 1 : 0),
        0,
      );
      return { course, score };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || compareSubjectIds(a.course.subject_id, b.course.subject_id))
    .slice(0, 5)
    .map(({ course }) => ({
      courseId: `mit:${course.subject_id}`,
      title: course.title,
      relevanceExplanation: "Keyword match from the imported MIT catalog.",
      supportingCatalogText: course.description ?? course.title,
      recommendationMethod: "keyword" as const,
    }));
}

export default function DiscoveryPage() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const { data } = useCatalog();
  const [loading, setLoading] = useState(false);
  const [methodNote, setMethodNote] = useState<string | null>(null);
  const [filters, setFilters] = useState<CourseFilters>(emptyFilters);

  const catalog = data?.courses ?? [];
  const departments = useMemo(() => departmentOptions(catalog), [catalog]);
  const courseById = useMemo(
    () => new Map(catalog.map((course) => [course.subject_id, course])),
    [catalog],
  );

  const visibleResults = useMemo(() => {
    if (!catalog.length) return state.recommendations;
    return state.recommendations.filter((result) => {
      const course = courseById.get(localId(result.courseId));
      return course ? matchesFilters(course, filters) : false;
    });
  }, [state.recommendations, courseById, filters, catalog.length]);

  const hiddenCount = state.recommendations.length - visibleResults.length;

  async function discover() {
    const query = state.interestQuery.trim();
    if (!query) return;
    setLoading(true);
    setMethodNote(null);

    try {
      const catalogData = await loadCatalog();
      const catalogById = new Map(catalogData.courses.map((course) => [course.subject_id, course]));
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) throw new Error("recommendation endpoint unavailable");
      const data = await response.json();
      const returned = Array.isArray(data.results) ? (data.results as InterestSearchResult[]) : [];
      // Every AI-returned id must exist in the checked-in catalog before it is shown.
      const grounded = returned.filter((result) => catalogById.has(localId(result.courseId)));
      const results = grounded
        .filter((result) => matchesFilters(catalogById.get(localId(result.courseId))!, filters))
        .slice(0, 5);

      if (!results.length && grounded.length && activeFilterCount(filters) > 0) {
        const fallback = interestMatches(catalogData.courses, query, filters);
        dispatch({ type: "SET_RECOMMENDATIONS", results: fallback });
        setMethodNote(fallback.length
          ? "No AI recommendation matched your filters, so these are deterministic keyword matches inside them."
          : "No subject matches your interest inside the current filters.");
        return;
      }

      dispatch({ type: "SET_RECOMMENDATIONS", results });
      const keywordOnly = results.length > 0 && results.every((result) => result.recommendationMethod === "keyword");
      setMethodNote(!results.length
        ? "No catalog matches. Try a subject number, a broader interest, or fewer filters."
        : keywordOnly
          ? "Showing deterministic matches from the imported MIT catalog."
          : "AI-assisted recommendations grounded in the imported MIT catalog.");
    } catch {
      try {
        const { courses } = await loadCatalog();
        const matches = interestMatches(courses, query, filters);
        dispatch({ type: "SET_RECOMMENDATIONS", results: matches });
        setMethodNote(matches.length
          ? "Showing local keyword matches from the imported MIT catalog."
          : "No catalog matches. Try a subject number, a broader interest, or fewer filters.");
      } catch {
        dispatch({ type: "SET_RECOMMENDATIONS", results: [] });
        setMethodNote("Course discovery is temporarily unavailable.");
      }
    } finally {
      setLoading(false);
    }
  }

  function openProgression(courseId: string) {
    dispatch({ type: "OPEN_PATHWAY", courseId });
    navigate("/course/" + encodeURIComponent(courseId));
  }

  return (
    <section className="page hero-page">
      <div className="eyebrow">AI course discovery</div>
      <h1>Tell us what interests you. We’ll find where it leads.</h1>
      <p className="lede">
        CedarChart searches the imported MIT catalog, recommends real subjects, and opens a generated
        progression showing what comes before the course and what it can lead to.
      </p>

      <div className="search-card">
        <label htmlFor="interest">What do you want to learn or build?</label>
        <textarea
          id="interest"
          value={state.interestQuery}
          onChange={(event) => dispatch({ type: "SET_QUERY", query: event.target.value })}
          placeholder="I want to build robots that help people."
          rows={3}
        />
        <div className="example-row">
          {examples.map((example) => (
            <button className="chip" key={example} onClick={() => dispatch({ type: "SET_QUERY", query: example })}>
              {example}
            </button>
          ))}
        </div>

        <CourseFilterMenu filters={filters} onChange={setFilters} departments={departments} />

        <button className="primary-button" onClick={discover} disabled={loading || !state.interestQuery.trim()}>
          {loading ? "Finding courses…" : "Discover courses"}
        </button>
      </div>

      {methodNote && <p className="method-note">{methodNote}</p>}
      {hiddenCount > 0 && (
        <p className="method-note">
          {hiddenCount} recommendation{hiddenCount === 1 ? "" : "s"} hidden by your filters.
        </p>
      )}

      <div className="results-grid">
        {visibleResults.map((result) => {
          const subjectId = localId(result.courseId);
          return (
            <article className="course-card" key={result.courseId}>
              <div className="course-number">{subjectId}</div>
              <h2>{result.title ?? "MIT course"}</h2>
              <p>{result.relevanceExplanation}</p>
              <p className="supporting">{result.supportingCatalogText}</p>
              <div className="card-actions">
                <button onClick={() => openProgression(result.courseId)}>View course progression</button>
                <button
                  className="secondary-action"
                  onClick={() => dispatch({
                    type: "ADD_PLANNED_COURSE",
                    course: {
                      courseId: subjectId,
                      title: result.title ?? subjectId,
                      units: courseById.get(subjectId)?.total_units,
                      term: 0,
                    },
                  })}
                >
                  + Add to road
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
