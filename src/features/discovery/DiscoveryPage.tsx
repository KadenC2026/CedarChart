import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { courses, courseById } from "../../data/mitCatalog";
import type { InterestSearchResult } from "../../domain/types";
import { useApp } from "../../state/AppContext";

const examples = [
  "I want to understand machine learning and AI",
  "I like math and programming",
  "I want to learn computer graphics",
];

function keywordSearch(query: string): InterestSearchResult[] {
  const terms = query.toLowerCase().split(/\W+/).filter((term) => term.length > 2);
  return courses
    .map((course) => {
      const haystack = [
        course.localCourseId,
        course.title,
        course.description,
        course.department,
        ...course.aliases,
      ].join(" ").toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { course, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ course }) => ({
      courseId: course.id,
      relevanceExplanation: `Matches your interest through ${course.title.toLowerCase()} and related catalog topics.`,
      supportingCatalogText: course.description,
      recommendationMethod: "keyword" as const,
    }));
}

export default function DiscoveryPage() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [methodNote, setMethodNote] = useState<string | null>(null);

  const results = useMemo(
    () => state.recommendations.filter((result) => courseById.has(result.courseId)),
    [state.recommendations],
  );

  async function discover() {
    const query = state.interestQuery.trim();
    if (!query) return;
    setLoading(true);
    setMethodNote(null);

    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          courses: courses.map(({ id, localCourseId, title, description, department }) => ({
            id,
            localCourseId,
            title,
            description,
            department,
          })),
        }),
      });
      if (!response.ok) throw new Error("recommendation endpoint unavailable");
      const data = await response.json();
      const validated = (data.results ?? [])
        .filter((result: InterestSearchResult) => courseById.has(result.courseId))
        .slice(0, 5);
      if (!validated.length) throw new Error("no valid AI results");
      dispatch({ type: "SET_RECOMMENDATIONS", results: validated });
      setMethodNote("AI-assisted results, grounded in the supported MIT catalog subset.");
    } catch {
      const fallback = keywordSearch(query);
      dispatch({ type: "SET_RECOMMENDATIONS", results: fallback });
      setMethodNote("AI was unavailable, so CedarChart is showing deterministic keyword matches.");
    } finally {
      setLoading(false);
    }
  }

  function showOnMap(courseId: string) {
    dispatch({ type: "SHOW_ON_MAP", courseId });
    navigate("/explore");
  }

  function seePathway(courseId: string) {
    dispatch({ type: "OPEN_PATHWAY", courseId });
    navigate(`/course/${encodeURIComponent(courseId)}`);
  }

  return (
    <section className="page hero-page">
      <div className="eyebrow">MIT course discovery</div>
      <h1>Find classes by what you want to learn.</h1>
      <p className="lede">
        Describe an interest in normal language. CedarChart connects it to real courses, then shows how those courses fit into the prerequisite graph.
      </p>

      <div className="search-card">
        <label htmlFor="interest">What are you interested in?</label>
        <textarea
          id="interest"
          value={state.interestQuery}
          onChange={(event) => dispatch({ type: "SET_QUERY", query: event.target.value })}
          placeholder="I want to understand how computers learn from data."
          rows={3}
        />
        <div className="example-row">
          {examples.map((example) => (
            <button
              className="chip"
              key={example}
              onClick={() => dispatch({ type: "SET_QUERY", query: example })}
            >
              {example}
            </button>
          ))}
        </div>
        <button className="primary-button" onClick={discover} disabled={loading || !state.interestQuery.trim()}>
          {loading ? "Finding courses…" : "Discover courses"}
        </button>
      </div>

      {methodNote && <p className="method-note">{methodNote}</p>}

      <div className="results-grid">
        {results.map((result) => {
          const course = courseById.get(result.courseId)!;
          return (
            <article className="course-card" key={course.id}>
              <div className="course-number">{course.localCourseId}</div>
              <h2>{course.title}</h2>
              <p>{result.relevanceExplanation}</p>
              <p className="supporting">{result.supportingCatalogText}</p>
              <div className="card-actions">
                <button onClick={() => showOnMap(course.id)}>Show on map</button>
                <button onClick={() => seePathway(course.id)}>See pathway</button>
                <a href={course.sourceUrl} target="_blank" rel="noreferrer">Catalog source ↗</a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
