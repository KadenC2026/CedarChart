import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import DiscoveryPage from "./features/discovery/DiscoveryPage";
import PlannerPage from "./features/planner/PlannerPage";
import PathwayPage from "./features/pathway/PathwayPage";
import CourseMapPage from "./features/courseMap/CourseMapPage";
import SchedulePage from "./features/schedule/SchedulePage";

export default function App() {
  const location = useLocation();
  const isCourseMap = location.pathname === "/map";

  return (
    <div className={isCourseMap ? "app-shell course-map-app-shell" : "app-shell"}>
      {!isCourseMap && (
        <header className="topbar">
          <NavLink to="/planner" className="brand">CedarChart</NavLink>
          <nav>
            <NavLink to="/planner">Plan</NavLink>
            <NavLink to="/">Discover</NavLink>
            <NavLink to="/map">Map</NavLink>
            <NavLink to="/schedule">Schedule</NavLink>
          </nav>
        </header>
      )}
      <main>
        <Routes>
          <Route path="/" element={<DiscoveryPage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/map" element={<CourseMapPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/explore" element={<Navigate to="/planner" replace />} />
          <Route path="/course/:courseId" element={<PathwayPage />} />
        </Routes>
      </main>
    </div>
  );
}
