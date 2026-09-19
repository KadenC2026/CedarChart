import { useState } from "react";
import type { PriorCredit, RemoteCourse } from "../../domain/types";
import { localId } from "../../domain/requirements";
import { useApp } from "../../state/AppContext";
export default function PriorCreditPanel({ catalog }: { catalog: RemoteCourse[] }) {
  const { state, dispatch } = useApp();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<PriorCredit["source"]>("prior");
  const normalized = query.trim().toLowerCase();
  const matches = normalized ? catalog.filter(c => `${c.subject_id} ${c.title}`.toLowerCase().includes(normalized)).slice(0, 15) : [];
  return <section className="prior-credit-panel">
    <div><div className="eyebrow">Already earned</div><h2>Prior credit</h2>
      <p className="data-note">Add the MIT subject credit you were awarded for AP, IB, transfer work, or an ASE you passed. It counts toward completion across your plan.</p></div>
    <div className="credit-controls">
      <label>Credit type<select value={source} onChange={e => setSource(e.target.value as PriorCredit["source"])}><option value="prior">Prior credit · AP / IB / transfer</option><option value="ase">Passed ASE</option></select></label>
      <label>MIT subject credited<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search 18.01 or Calculus" /></label>
    </div>
    {normalized && <div className="catalog-results">{matches.length ? matches.map(course => <div className="catalog-result" key={course.subject_id}>
      <span className="credit-course"><strong>{course.subject_id}</strong> {course.title}</span>
      <button className="add-course-button" disabled={state.priorCredits.some(c => localId(c.courseId) === course.subject_id)} onClick={() => {
        dispatch({ type: "SET_PRIOR_CREDIT", credit: { courseId: `mit:${course.subject_id}`, source } }); setQuery("");
      }}>Add credit</button>
    </div>) : <p>No matching subjects.</p>}</div>}
    <div className="credit-list">{state.priorCredits.map(credit => <div className="credit-item" key={credit.courseId}>
      <span><strong>{localId(credit.courseId)}</strong> {catalog.find(c => c.subject_id === localId(credit.courseId))?.title}<small>{credit.source === "ase" ? "Passed ASE" : "Prior credit"}</small></span>
      <button className="remove-course" aria-label={`Remove credit for ${localId(credit.courseId)}`} onClick={() => dispatch({ type: "REMOVE_PRIOR_CREDIT", courseId: credit.courseId })}>×</button>
    </div>)}</div>
    {!state.priorCredits.length && <p className="supporting">No prior credit added yet.</p>}
  </section>;
}
