import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import DiscoveryPage from "./features/discovery/DiscoveryPage";
import PlannerPage from "./features/planner/PlannerPage";
import PathwayPage from "./features/pathway/PathwayPage";
import CourseMapPage from "./features/courseMap/CourseMapPage";
import SchedulePage from "./features/schedule/SchedulePage";
import SocialPage from "./features/social/SocialPage";
import NetworkPage from "./features/network/NetworkPage";
import AccountMenu from "./components/AccountMenu";

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand">TrackMIT</NavLink>
        <nav>
          <NavLink to="/" end>Map</NavLink>
          <NavLink to="/planner">Plan</NavLink>
          <NavLink to="/discover">Discover</NavLink>
          <NavLink to="/schedule">Schedule</NavLink>
          <NavLink to="/social">Social</NavLink>
          <NavLink to="/network">Network</NavLink>
        </nav>
        <AccountMenu />
      </header>
      <main>
        <Routes>
          <Route path="/" element={<CourseMapPage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/discover" element={<DiscoveryPage />} />
          <Route path="/map" element={<Navigate to="/" replace />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/social" element={<SocialPage />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/explore" element={<Navigate to="/planner" replace />} />
          <Route path="/course/:courseId" element={<PathwayPage />} />
        </Routes>
      </main>
      <footer className="privacy-footer">
        <strong>Privacy:</strong> Signed-in plans sync to your private account. Guest plans stay in this browser.
      </footer>
    </div>
  );
}
