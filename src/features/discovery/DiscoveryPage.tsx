import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { InterestSearchResult } from "../../domain/types";
import { loadCatalog } from "../../data/catalog";
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
      const catalogData = await loadCatalog();
      const validIds = new Set(catalogData.courses.map(c => `mit:${c.subject_id}`));
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) throw new Error("recommendation endpoint unavailable");
      const data = await response.json();
      const results = Array.isArray(data.results) ? (data.results as InterestSearchResult[]).filter(result => validIds.has(result.courseId)).slice(0, 5) : [];
      dispatch({ type: "SET_RECOMMENDATIONS", results });
      const keywordOnly = results.length > 0 && results.every((result) => result.recommendationMethod === "keyword");
      setMethodNote(keywordOnly
        ? "Showing deterministic matches from the imported MIT catalog."
        : "AI-assisted recommendations grounded in the imported MIT catalog.");
    } catch {
      try {
        const { courses } = await loadCatalog();
        const terms = query.toLowerCase().split(/[^\w.]+/).filter(term => term.length > 2);
        const matches = courses.map(course => {
          const text = `${course.subject_id} ${course.title} ${course.description ?? ""}`.toLowerCase();
          return { course, score: terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0) };
        }).filter(match => match.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
        dispatch({ type: "SET_RECOMMENDATIONS", results: matches.map(({ course }) => ({ courseId: `mit:${course.subject_id}`, title: course.title, relevanceExplanation: "Keyword match from the imported MIT catalog.", supportingCatalogText: course.description ?? course.title, recommendationMethod: "keyword" })) });
        setMethodNote(matches.length ? "Showing local keyword matches from the imported MIT catalog." : "No catalog matches. Try a subject number or a more specific interest.");
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
