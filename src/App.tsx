import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import DiscoveryPage from "./features/discovery/DiscoveryPage";
import PlannerPage from "./features/planner/PlannerPage";
import PathwayPage from "./features/pathway/PathwayPage";

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/planner" className="brand">CedarChart</NavLink>
        <nav>
          <NavLink to="/planner">Plan</NavLink>
          <NavLink to="/">Discover</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<DiscoveryPage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/explore" element={<Navigate to="/planner" replace />} />
          <Route path="/course/:courseId" element={<PathwayPage />} />
        </Routes>
      </main>
    </div>
  );
}
