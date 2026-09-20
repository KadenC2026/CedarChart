import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { clubSpotlights } from "../../data/clubSpotlights";
import { courseWebsiteFor } from "../../data/courseSites";
import { recommendClubs } from "../../domain/socialRecommendations";
import { termLabel } from "../../domain/terms";
import { useApp } from "../../state/AppContext";

const PSET_PARTNERS_URL = "https://psetpartners.mit.edu/";

export default function SocialPage() {
  const { state } = useApp();
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const planned = useMemo(
    () => [...state.plannedCourses].sort((a, b) => a.term - b.term || a.courseId.localeCompare(b.courseId)),
    [state.plannedCourses],
  );
  const uniqueCourses = useMemo(
    () => [...new Map(planned.map((course) => [course.courseId, course])).values()],
    [planned],
  );
  const clubs = useMemo(() => recommendClubs({
    interestQuery: state.interestQuery,
    plannedCourses: planned,
    matchLimit: 4,
    surpriseLimit: 2,
  }), [planned, state.interestQuery]);

  const hasProfile = Boolean(state.interestQuery.trim() || planned.length);
  const spotlight = clubSpotlights[spotlightIndex];

  useEffect(() => {
    if (carouselPaused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setSpotlightIndex((current) => (current + 1) % clubSpotlights.length),
      6500,
    );
    return () => window.clearInterval(timer);
  }, [carouselPaused]);

  const changeSpotlight = (direction: number) => {
    setSpotlightIndex((current) => (current + direction + clubSpotlights.length) % clubSpotlights.length);
  };

  return (
    <section className="page social-page">
      <div className="eyebrow">Community</div>
      <h1>Find your MIT people.</h1>
      <p className="lede">
        cedar uses your plan and interests to point you toward classmates, course communities, and clubs.
      </p>

      <section
        className="club-carousel"
        aria-label="Featured MIT clubs"
        onMouseEnter={() => setCarouselPaused(true)}
        onMouseLeave={() => setCarouselPaused(false)}
        onFocus={() => setCarouselPaused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setCarouselPaused(false);
        }}
      >
        <img src={spotlight.imageUrl} alt={`Students and projects from ${spotlight.club}`} />
        <div className="club-carousel-shade" />
        <div className="club-carousel-caption">
          <span className="social-card-kicker">Club spotlight · {spotlightIndex + 1} of {clubSpotlights.length}</span>
          <h2>{spotlight.club}</h2>
          <p>{spotlight.caption}</p>
          <a href={spotlight.clubUrl} target="_blank" rel="noreferrer">Explore this club ↗</a>
          <small>Photo from {spotlight.imageSource}’s official website</small>
        </div>
        <div className="club-carousel-controls">
          <button type="button" aria-label="Previous club" onClick={() => changeSpotlight(-1)}>←</button>
          <div className="club-carousel-dots" aria-label="Choose a club spotlight">
            {clubSpotlights.map((item, index) => (
              <button
                key={`${item.club}-${index}`}
                type="button"
                className={index === spotlightIndex ? "active" : ""}
                aria-label={`Show ${item.club}`}
                aria-current={index === spotlightIndex ? "true" : undefined}
                onClick={() => setSpotlightIndex(index)}
              />
            ))}
          </div>
          <button type="button" aria-label="Next club" onClick={() => changeSpotlight(1)}>→</button>
        </div>
      </section>

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
          <h2>Meet clubs picked for you</h2>
        </div>
        <a href="https://studentlife.mit.edu/campus-communities/student-activities/" target="_blank" rel="noreferrer">
          MIT Student Activities ↗
        </a>
      </div>
      <div className="social-club-grid">
        {clubs.map((club) => (
          <article className="social-club-card" key={club.id}>
            <div className="social-club-topline">
              <span className="social-club-icon" aria-hidden="true">{club.icon}</span>
              <span className={`social-club-badge ${club.kind}`}>
                {club.kind === "surprise" ? "Surprise pick" : "For you"}
              </span>
            </div>
            <h3>{club.name}</h3>
            <p>{club.description}</p>
            <small>{club.reason}</small>
            <a href={club.url} target="_blank" rel="noreferrer">{club.linkLabel} ↗</a>
          </article>
        ))}
      </div>

      <div className="social-browse-all">
        <div>
          <strong>Still exploring?</strong>
          <span>MIT Engage lists hundreds of student organizations, events, and officer contacts.</span>
        </div>
        <a className="secondary-button link-button" href="https://engage.mit.edu/club_signup?view=all" target="_blank" rel="noreferrer">
          Browse every group ↗
        </a>
      </div>

      <p className="social-privacy-note">
        cedar suggests official places to connect, including club officers listed on MIT Engage. It does not publish
        another student’s plan, profile, or contact details.
      </p>
    </section>
  );
}
