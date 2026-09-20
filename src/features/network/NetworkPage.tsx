import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import resourceData from "../../../public/data/networkResources.json";
import { careerPrograms, programsForYear } from "../../data/careerPrograms";
import {
  rankNetworkResources,
  type NetworkMatch,
  type NetworkResource,
} from "../../domain/networkRecommendations";
import { useApp } from "../../state/AppContext";

const resources = resourceData as NetworkResource[];
const kindLabels: Record<NetworkResource["kind"], string> = {
  lab: "Research lab",
  urop: "UROP resource",
  maker: "Makerspace",
  innovation: "Innovation",
  career: "Career",
};

export default function NetworkPage() {
  const { state, dispatch } = useApp();
  const courseIds = useMemo(
    () => [...new Set([...state.completedCourseIds, ...state.plannedCourses.map((course) => course.courseId)])],
    [state.completedCourseIds, state.plannedCourses],
  );
  const profile = useMemo(() => ({
    interestQuery: state.interestQuery,
    careerGoal: state.careerGoal,
    backgroundExperience: state.backgroundExperience,
    courseIds,
    studentYear: state.studentYear,
  }), [courseIds, state.backgroundExperience, state.careerGoal, state.interestQuery, state.studentYear]);
  const fallback = useMemo(() => rankNetworkResources(resources, profile), [profile]);
  const [matches, setMatches] = useState<NetworkMatch[]>(fallback);
  const [status, setStatus] = useState<"loading" | "AI" | "profile" | "error">("loading");

  const loadMatches = useCallback(async (signal?: AbortSignal) => {
    setStatus("loading");
    try {
      const response = await fetch("/api/network-recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
        signal,
      });
      if (!response.ok) throw new Error("Recommendation request failed");
      const data = await response.json() as { results?: NetworkMatch[]; method?: "AI" | "profile" };
      if (!Array.isArray(data.results) || !data.results.length) throw new Error("No recommendations returned");
      setMatches(data.results);
      setStatus(data.method === "AI" ? "AI" : "profile");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMatches(fallback);
      setStatus("error");
    }
  }, [fallback, profile]);

  useEffect(() => {
    setMatches(fallback);
    const controller = new AbortController();
    void loadMatches(controller.signal);
    return () => controller.abort();
  }, [fallback, loadMatches]);

  const hasProfile = Boolean(
    profile.interestQuery || profile.careerGoal || profile.backgroundExperience || profile.courseIds.length,
  );
  const careerResources = resources.filter((resource) => resource.kind === "career");
  const companyPrograms = useMemo(() => programsForYear(careerPrograms, state.studentYear), [state.studentYear]);

  return (
    <section className="page network-page">
      <div className="eyebrow">Research & career</div>
      <h1>Find the right MIT doors.</h1>
      <p className="lede">
        TrackMIT matches your interests, goals, experience, and coursework with current labs, UROPs,
        makerspaces, innovation programs, and career events.
      </p>

      <div className="network-profile-bar">
        <div>
          <strong>{hasProfile ? "Using your TrackMIT profile" : "Add profile context for personal matches"}</strong>
          <span>
            {hasProfile
              ? [profile.interestQuery, profile.careerGoal, `${courseIds.length} course${courseIds.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")
              : "Add interests on Discover or courses on Plan. Network updates automatically."}
          </span>
        </div>
        <div className="network-profile-actions">
          <label className="network-year-select">
            <span>Student year</span>
            <select
              value={state.studentYear}
              onChange={(event) => dispatch({ type: "SET_STUDENT_YEAR", studentYear: event.target.value as typeof state.studentYear })}
              aria-label="Student year"
            >
              <option value="unspecified">Choose year</option>
              <option value="first-year">First-year</option>
              <option value="sophomore">Sophomore</option>
              <option value="junior">Junior</option>
              <option value="senior">Senior</option>
              <option value="graduate">Graduate</option>
            </select>
          </label>
          {!hasProfile && <Link className="secondary-button link-button" to="/discover">Add interests</Link>}
          <button className="secondary-button" type="button" onClick={() => void loadMatches()} disabled={status === "loading"}>
            {status === "loading" ? "Matching…" : "Refresh matches"}
          </button>
        </div>
      </div>

      <div className="network-section-heading">
        <div>
          <span className="network-kicker">Suggested for you</span>
          <h2>Places to explore and people to contact</h2>
        </div>
        <span className={`network-method ${status === "AI" ? "ai" : ""}`}>
          {status === "loading" ? "Updating" : status === "AI" ? "AI ranked" : status === "error" ? "Profile match · AI unavailable" : "Profile match"}
        </span>
      </div>

      <div className="network-match-grid" aria-live="polite">
        {matches.map((match) => (
          <article className="network-match-card" key={match.id}>
            <div className="network-card-topline">
              <span>{kindLabels[match.kind]}</span>
              <small>Checked {match.verifiedAt}</small>
            </div>
            <h3>{match.name}</h3>
            <p>{match.description}</p>
            <div className="network-reason"><strong>Why it fits</strong>{match.matchReason}</div>
            <div className="network-next-step"><strong>Next step</strong>{match.contactApproach}</div>
            <div className="network-card-actions">
              <a className="primary-link" href={match.url} target="_blank" rel="noreferrer">Explore ↗</a>
              <a href={match.contactUrl} target={match.contactUrl.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer">
                {match.contactLabel} ↗
              </a>
            </div>
          </article>
        ))}
      </div>

      <div className="network-section-heading internship-heading">
        <div>
          <span className="network-kicker">Internships by student year</span>
          <h2>{state.studentYear === "first-year" ? "Discovery programs and internships for first-years" : "Top-company student opportunities"}</h2>
        </div>
        <a className="network-handshake-link" href="https://mit.joinhandshake.com/" target="_blank" rel="noreferrer">Search MIT Handshake ↗</a>
      </div>
      <div className="network-program-grid">
        {companyPrograms.map((program) => {
          const matchesYear = program.availability !== "no-internship"
            && (state.studentYear === "unspecified" || program.years.includes(state.studentYear));
          return (
            <a className={matchesYear ? "year-match" : ""} href={program.url} target="_blank" rel="noreferrer" key={program.id}>
              <div>
                <span>{program.company}</span>
                {matchesYear && state.studentYear !== "unspecified" && <em>Fits {state.studentYear}</em>}
              </div>
              <strong>{program.title}</strong>
              <small>{program.description}</small>
              <b>{program.availability === "no-internship" ? "No internship currently · view alternatives ↗" : "Check current openings ↗"}</b>
            </a>
          );
        })}
      </div>

      <div className="network-section-heading career-heading">
        <div>
          <span className="network-kicker">Career calendar</span>
          <h2>Current recruiting and department events</h2>
        </div>
      </div>
      <div className="network-career-grid">
        {careerResources.map((resource) => (
          <a href={resource.url} target="_blank" rel="noreferrer" key={resource.id}>
            <span>{resource.name}</span>
            <small>{resource.statusNote}</small>
            <strong>Open official page ↗</strong>
          </a>
        ))}
      </div>

      <p className="network-source-note">
        TrackMIT ranks only the official MIT resources shown here.
        A lab may welcome a thoughtful inquiry even when it has no advertised UROP; confirm availability with the listed contact.
      </p>
    </section>
  );
}
