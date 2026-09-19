import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { InterestSearchResult } from "../../domain/types";
import { useApp } from "../../state/AppContext";

const examples = [
  "I want to build robots that help people",
  "I like music and programming",
  "I want to understand how computers generate images",
  "I care about climate change and data",
];

export default function DiscoveryPage() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [methodNote, setMethodNote] = useState<string | null>(null);

  async function discover() {
    const query = state.interestQuery.trim();
    if (!query) return;
    setLoading(true);
    setMethodNote(null);

    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) throw new Error("recommendation endpoint unavailable");
      const data = await response.json();
      const results = Array.isArray(data.results) ? data.results.slice(0, 5) as InterestSearchResult[] : [];
      dispatch({ type: "SET_RECOMMENDATIONS", results });
      const keywordOnly = results.length > 0 && results.every((result) => result.recommendationMethod === "keyword");
      setMethodNote(keywordOnly
        ? "Showing deterministic matches from the current MIT catalog."
        : "AI-assisted recommendations grounded in the current MIT catalog.");
    } catch {
      dispatch({ type: "SET_RECOMMENDATIONS", results: [] });
      setMethodNote("Course discovery is temporarily unavailable.");
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
        CedarChart searches the current MIT catalog, recommends real subjects, and opens a generated
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
        <button className="primary-button" onClick={discover} disabled={loading || !state.interestQuery.trim()}>
          {loading ? "Finding courses…" : "Discover courses"}
        </button>
      </div>

      {methodNote && <p className="method-note">{methodNote}</p>}

      <div className="results-grid">
        {state.recommendations.map((result) => {
          const localId = result.courseId.replace(/^mit:/, "");
          return (
            <article className="course-card" key={result.courseId}>
              <div className="course-number">{localId}</div>
              <h2>{result.title ?? "MIT course"}</h2>
              <p>{result.relevanceExplanation}</p>
              <p className="supporting">{result.supportingCatalogText}</p>
              <div className="card-actions">
                <button onClick={() => openProgression(result.courseId)}>View course progression</button>
                <button
                  className="secondary-action"
                  onClick={() => dispatch({
                    type: "ADD_PLANNED_COURSE",
                    course: { courseId: localId, title: result.title ?? localId, term: 0 },
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
