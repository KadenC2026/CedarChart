import { useMemo, useState } from "react";
import {
  activeFilterCount,
  courseAttributes,
  emptyFilters,
  termKeys,
  termLabels,
  type CourseAttribute,
  type CourseFilters,
  type TermKey,
} from "../domain/courseSearch";

export type DepartmentOption = { department: string; count: number };

type Props = {
  filters: CourseFilters;
  onChange: (filters: CourseFilters) => void;
  departments: DepartmentOption[];
  resultCount?: number;
};

function toggle<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

function parseUnits(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export default function CourseFilterMenu({ filters, onChange, departments, resultCount }: Props) {
  const [open, setOpen] = useState(false);
  const [departmentQuery, setDepartmentQuery] = useState("");
  const count = activeFilterCount(filters);

  const visibleDepartments = useMemo(() => {
    const normalized = departmentQuery.trim().toLowerCase();
    if (!normalized) return departments;
    return departments.filter((option) => option.department.toLowerCase().startsWith(normalized));
  }, [departments, departmentQuery]);

  const activeChips: Array<{ key: string; label: string; clear: () => void }> = [
    ...filters.departments.map((department) => ({
      key: "dept-" + department,
      label: "Course " + department,
      clear: () => onChange({ ...filters, departments: filters.departments.filter((entry) => entry !== department) }),
    })),
    ...(filters.level !== "any"
      ? [{
          key: "level",
          label: filters.level === "U" ? "Undergraduate" : "Graduate",
          clear: () => onChange({ ...filters, level: "any" as const }),
        }]
      : []),
    ...filters.terms.map((term) => ({
      key: "term-" + term,
      label: termLabels[term],
      clear: () => onChange({ ...filters, terms: filters.terms.filter((entry) => entry !== term) }),
    })),
    ...filters.attributes.map((attribute) => ({
      key: "attr-" + attribute,
      label: attribute,
      clear: () => onChange({ ...filters, attributes: filters.attributes.filter((entry) => entry !== attribute) }),
    })),
    ...(filters.unitsMin !== null || filters.unitsMax !== null
      ? [{
          key: "units",
          label:
            filters.unitsMin !== null && filters.unitsMax !== null
              ? `${filters.unitsMin}–${filters.unitsMax} units`
              : filters.unitsMin !== null
                ? `${filters.unitsMin}+ units`
                : `≤ ${filters.unitsMax} units`,
          clear: () => onChange({ ...filters, unitsMin: null, unitsMax: null }),
        }]
      : []),
    ...(filters.hideRetired ? [] : [{
      key: "retired",
      label: "Including retired subjects",
      clear: () => onChange({ ...filters, hideRetired: true }),
    }]),
  ];

  return (
    <div className="course-filter-menu">
      <div className="course-filter-bar">
        <button
          type="button"
          className={count ? "course-filter-trigger active" : "course-filter-trigger"}
          aria-expanded={open}
          aria-controls="course-filter-panel"
          onClick={() => setOpen((value) => !value)}
        >
          Filters{count ? ` · ${count}` : ""}
        </button>

        {activeChips.map((chip) => (
          <button type="button" className="course-filter-chip" key={chip.key} onClick={chip.clear}>
            {chip.label} <span aria-hidden="true">×</span>
            <span className="visually-hidden"> (remove filter)</span>
          </button>
        ))}

        {count > 0 && (
          <button type="button" className="course-filter-clear" onClick={() => onChange({ ...emptyFilters })}>
            Clear all
          </button>
        )}

        {typeof resultCount === "number" && (
          <span className="course-filter-count">{resultCount.toLocaleString()} matching subjects</span>
        )}
      </div>

      {open && (
        <div className="course-filter-panel" id="course-filter-panel">
          <section>
            <h3>Course number</h3>
            <input
              className="course-filter-search"
              value={departmentQuery}
              onChange={(event) => setDepartmentQuery(event.target.value)}
              placeholder="Find a course number, e.g. 6"
              aria-label="Find a course number"
            />
            <div className="course-filter-department-list">
              {visibleDepartments.map((option) => (
                <label key={option.department}>
                  <input
                    type="checkbox"
                    checked={filters.departments.includes(option.department)}
                    onChange={() => onChange({ ...filters, departments: toggle(filters.departments, option.department) })}
                  />
                  <span>Course {option.department}</span>
                  <small>{option.count.toLocaleString()}</small>
                </label>
              ))}
              {!visibleDepartments.length && <p className="data-note">No course number starts with that.</p>}
            </div>
          </section>

          <section>
            <h3>Level</h3>
            <div className="course-filter-options">
              {([
                { value: "any", label: "Any" },
                { value: "U", label: "Undergraduate" },
                { value: "G", label: "Graduate" },
              ] as const).map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="course-filter-level"
                    checked={filters.level === option.value}
                    onChange={() => onChange({ ...filters, level: option.value })}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>

            <h3>Offered</h3>
            <div className="course-filter-options">
              {termKeys.map((term: TermKey) => (
                <label key={term}>
                  <input
                    type="checkbox"
                    checked={filters.terms.includes(term)}
                    onChange={() => onChange({ ...filters, terms: toggle(filters.terms, term) })}
                  />
                  <span>{termLabels[term]}</span>
                </label>
              ))}
            </div>
            <p className="data-note">Term flags come from the imported catalog snapshot, not live registration data.</p>
          </section>

          <section>
            <h3>Requirement attribute</h3>
            <div className="course-filter-options">
              {courseAttributes.map((attribute: CourseAttribute) => (
                <label key={attribute}>
                  <input
                    type="checkbox"
                    checked={filters.attributes.includes(attribute)}
                    onChange={() => onChange({ ...filters, attributes: toggle(filters.attributes, attribute) })}
                  />
                  <span>{attribute}</span>
                </label>
              ))}
            </div>

            <h3>Units</h3>
            <div className="course-filter-units">
              <label>
                <span>Min</span>
                <input
                  type="number"
                  min={0}
                  value={filters.unitsMin ?? ""}
                  onChange={(event) => onChange({ ...filters, unitsMin: parseUnits(event.target.value) })}
                />
              </label>
              <label>
                <span>Max</span>
                <input
                  type="number"
                  min={0}
                  value={filters.unitsMax ?? ""}
                  onChange={(event) => onChange({ ...filters, unitsMax: parseUnits(event.target.value) })}
                />
              </label>
            </div>

            <label className="course-filter-retired">
              <input
                type="checkbox"
                checked={filters.hideRetired}
                onChange={(event) => onChange({ ...filters, hideRetired: event.target.checked })}
              />
              <span>Hide retired subjects</span>
            </label>
          </section>
        </div>
      )}
    </div>
  );
}
