import { useMemo } from "react";
import { Link } from "react-router-dom";
import { courseWebsiteFor } from "../../data/courseSites";
import { recommendSocialThemes } from "../../domain/socialRecommendations";
import { termLabel } from "../../domain/terms";
import { useApp } from "../../state/AppContext";

const PSET_PARTNERS_URL = "https://psetpartners.mit.edu/";

export default function SocialPage() {
  const { state } = useApp();
  const planned = useMemo(
    () => [...state.plannedCourses].sort((a, b) => a.term - b.term || a.courseId.localeCompare(b.courseId)),
    [state.plannedCourses],
  );
  const uniqueCourses = useMemo(
    () => [...new Map(planned.map((course) => [course.courseId, course])).values()],
    [planned],
  );
  const clubThemes = useMemo(() => recommendSocialThemes({
    interestQuery: state.interestQuery,
    plannedCourses: planned,
    limit: 4,
  }), [planned, state.interestQuery]);

  const hasProfile = Boolean(state.interestQuery.trim() || planned.length);

  return (
    <section className="page social-page">
      <div className="eyebrow">Community</div>
      <h1>Find your MIT people.</h1>
      <p className="lede">
        cedar uses your plan and interests to point you toward classmates, course communities, and clubs.
      </p>

      <div className="social-context-bar">
        <div>
          <strong>{hasProfile ? "Personalized from your cedar profile" : "Add context for better suggestions"}</strong>
          <span>
            {hasProfile
              ? state.interestQuery || `${planned.length} planned course${planned.length === 1 ? "" : "s"}`
              : "Add interests on Discover or courses on Plan; this page updates automatically."}
          </span>
        </div>
        {!hasProfile && <Link className="secondary-button link-button" to="/discover">Add interests</Link>}
      </div>

      <div className="social-primary-grid">
        <article className="social-feature-card">
          <span className="social-card-kicker">Study together</span>
          <h2>Meet classmates through Pset Partners</h2>
          <p>
            Pset Partners matches MIT students by class, availability, and preferred group style. MIT login is required.
          </p>
          {uniqueCourses.length ? (
            <div className="social-course-list" aria-label="Courses from your cedar plan">
              {uniqueCourses.slice(0, 8).map((course) => (
                <span key={course.courseId} title={`${course.title} · ${termLabel(course.term)}`}>{course.courseId}</span>
              ))}
            </div>
          ) : (
            <p className="data-note">Add courses on Plan and they will appear here as prompts for your Pset Partners profile.</p>
          )}
          <div className="social-card-actions">
            <a className="primary-link" href={PSET_PARTNERS_URL} target="_blank" rel="noreferrer">Open Pset Partners ↗</a>
            <Link to="/planner">Review your plan</Link>
          </div>
        </article>

        <article className="social-feature-card">
          <span className="social-card-kicker">Course communities</span>
          <h2>Continue from the classes you chose</h2>
          <p>Open current course sites or MIT Canvas to find the communication spaces your instructors use.</p>
          {uniqueCourses.some((course) => courseWebsiteFor(course.courseId)) && (
            <div className="social-course-sites">
              {uniqueCourses
                .filter((course) => courseWebsiteFor(course.courseId))
                .slice(0, 4)
                .map((course) => (
                  <a key={course.courseId} href={courseWebsiteFor(course.courseId)} target="_blank" rel="noreferrer">
                    <strong>{course.courseId}</strong>
                    <span>{course.title}</span>
                  </a>
                ))}
            </div>
          )}
          <div className="social-card-actions">
            <a className="primary-link" href="https://canvas.mit.edu/" target="_blank" rel="noreferrer">Open MIT Canvas ↗</a>
          </div>
        </article>
      </div>

      <div className="social-section-heading">
        <div>
          <span className="social-card-kicker">Clubs for you</span>
          <h2>Explore communities that match your interests</h2>
        </div>
        <a href="https://studentlife.mit.edu/campus-communities/student-activities/" target="_blank" rel="noreferrer">
          MIT Student Activities ↗
        </a>
      </div>
      <div className="social-theme-grid">
        {clubThemes.map((theme) => (
          <article className="social-theme-card" key={theme.id}>
            <h3>{theme.title}</h3>
            <p>{theme.description}</p>
            <small>{theme.reason}</small>
            <div className="social-search-terms">
              {theme.searchTerms.map((term) => <span key={term}>{term}</span>)}
            </div>
            <a href={theme.url} target="_blank" rel="noreferrer">{theme.sourceLabel} ↗</a>
          </article>
        ))}
      </div>

      <p className="social-privacy-note">
        cedar suggests official places to connect, including club officers listed on MIT Engage. It does not publish
        another student’s plan, profile, or contact details.
      </p>
    </section>
  );
}
