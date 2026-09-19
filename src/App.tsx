import { NavLink, Route, Routes } from "react-router-dom";
import DiscoveryPage from "./features/discovery/DiscoveryPage";
import CatalogPage from "./features/catalog/CatalogPage";
import PathwayPage from "./features/pathway/PathwayPage";

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand">CedarChart</NavLink>
        <nav>
          <NavLink to="/">Discover</NavLink>
          <NavLink to="/explore">Explore</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<DiscoveryPage />} />
          <Route path="/explore" element={<CatalogPage />} />
          <Route path="/course/:courseId" element={<PathwayPage />} />
        </Routes>
      </main>
    </div>
  );
}
