import { useState } from "react";
import { courseWebsiteFor } from "../../data/courseSites";
import { localId } from "../../domain/requirements";
import type { PetitionSuggestion, RemoteCourse } from "../../domain/types";
import { useApp } from "../../state/AppContext";

export default function PetitionAdvisor({ catalog }: { catalog: RemoteCourse[] }) {
  const { state, dispatch } = useApp();
  const [suggestions, setSuggestions] = useState<PetitionSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function suggestPetitions() {
    const backgroundExperience = state.backgroundExperience.trim();
    if (!backgroundExperience) return;
    setLoading(true);
    setNote(null);
    try {
      const excludedCourseIds = [
        ...state.completedCourseIds.map(localId),
        ...state.priorCredits.map((credit) => localId(credit.courseId)),
      ];
      const response = await fetch("/api/petition-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backgroundExperience,
          careerGoal: state.careerGoal,
          plannedCourseIds: state.plannedCourses.map((course) => localId(course.courseId)),
          excludedCourseIds,
        }),
      });
      if (!response.ok) throw new Error("petition endpoint unavailable");
      const payload = await response.json();
      const catalogIds = new Set(catalog.map((course) => course.subject_id));
      const grounded = (Array.isArray(payload.results) ? payload.results : [])
        .filter((result: PetitionSuggestion) => catalogIds.has(result.courseId))
        .slice(0, 5) as PetitionSuggestion[];
      setSuggestions(grounded);
      setNote(grounded.length
        ? payload.method === "AI"
          ? "AI matched your experience to real catalog subjects."
          : "Showing catalog matches while AI ranking is unavailable."
        : "No strong overlap found. Add more detail about topics, projects, exams, or prior coursework.");
    } catch {
      setSuggestions([]);
      setNote("Petition suggestions are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="petition-advisor">
      <div className="eyebrow">Preparation check</div>
      <h2>Courses you may be ready to discuss skipping</h2>
      <p className="data-note">
        Describe prior coursework, exams, or projects. cedar compares it with real catalog descriptions and the prerequisites in your plan.
      </p>
      <label htmlFor="background-experience">Your background</label>
      <textarea
        id="background-experience"
        value={state.backgroundExperience}
        maxLength={1200}
        rows={5}
        onChange={(event) => {
          dispatch({ type: "SET_BACKGROUND_EXPERIENCE", backgroundExperience: event.target.value });
          setSuggestions([]);
          setNote(null);
        }}
        placeholder="Example: I completed multivariable calculus and linear algebra, built Python projects, and competed in robotics for three years."
      />
      <button className="primary-button" onClick={suggestPetitions} disabled={loading || !state.backgroundExperience.trim()}>
        {loading ? "Checking preparation…" : "Suggest conversations"}
      </button>
      <p className="petition-caution">
        These are conversation starters, not waivers or credit. Confirm placement and enrollment permission with the instructor or your academic advisor.
      </p>
      {note && <p className="method-note" aria-live="polite">{note}</p>}
      <div className="petition-results">
        {suggestions.map((suggestion) => {
          const website = courseWebsiteFor(suggestion.courseId);
          return (
            <article key={suggestion.courseId}>
              <div className="petition-course-heading">
                <strong>{suggestion.courseId}</strong>
                <span>{suggestion.title}</span>
              </div>
              {suggestion.prerequisiteFor.length > 0 && (
                <small>Listed before {suggestion.prerequisiteFor.join(", ")} in your plan</small>
              )}
              <p>{suggestion.overlapExplanation}</p>
              <blockquote>{suggestion.petitionQuestion}</blockquote>
              <details>
                <summary>Catalog basis</summary>
                <p>{suggestion.supportingCatalogText}</p>
              </details>
              {website && <a href={website} target="_blank" rel="noreferrer">Course website ↗</a>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
