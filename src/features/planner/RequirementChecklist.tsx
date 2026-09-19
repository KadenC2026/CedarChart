import type { RemoteCourse, Requirement } from "../../domain/types";
import { evaluateRequirement } from "../../domain/requirements";
import { useApp } from "../../state/AppContext";

type Props = { requirement: Requirement; catalog: Map<string, RemoteCourse>; earned: Set<string>; planned: Set<string> };
export default function RequirementChecklist({ requirement: req, catalog, earned, planned }: Props) {
  const { state, dispatch } = useApp();
  if (req.req) {
    const course = catalog.get(req.req);
    const progress = evaluateRequirement(req, earned, catalog);
    const credit = state.priorCredits.find(c => c.courseId === `mit:${req.req}`);
    return <div className="requirement-leaf">
      {course && !req["plain-string"] ? <label className="check-row">
        <input type="checkbox" checked={earned.has(req.req)} disabled={Boolean(credit)}
          onChange={() => dispatch({ type: "TOGGLE_COMPLETED", courseId: `mit:${req.req}` })} />
        <span><strong>{req.req}</strong> {course.title}
          <small>{credit ? credit.source === "ase" ? "Passed ASE · edit in Prior credit" : "Prior credit · edit below" : earned.has(req.req) ? "Completed" : planned.has(req.req) ? "Planned" : "Not completed"}</small>
        </span>
      </label> : <p className="data-note">{progress.fraction === 1 ? "✓ " : "○ "}{req.req} {progress.review ? "· Requires advisor review" : ""}</p>}
    </div>;
  }
  const progress = evaluateRequirement(req, earned, catalog);
  return <div className="requirement-group">
    <div className="requirement-group-heading"><strong>{req.title ?? (req["connection-type"] === "any" ? "Choose an option" : "Required subjects")}</strong>
      <small>{req["threshold-desc"] ?? (req["connection-type"] === "any" ? "Choose one" : "Complete all")} {progress.fraction === 1 ? "✓" : ""}</small></div>
    {(req.reqs ?? []).map((child, index) => <RequirementChecklist key={index} requirement={child} catalog={catalog} earned={earned} planned={planned} />)}
  </div>;
}
