import type { StudentYear } from "../domain/types";

export type CareerProgram = {
  id: string;
  company: string;
  title: string;
  description: string;
  url: string;
  years: StudentYear[];
  availability: "current" | "check-live" | "no-internship";
  verifiedAt: string;
};

export const careerPrograms: CareerProgram[] = [
  {
    id: "jane-street-first-year",
    company: "Jane Street",
    title: "FTTP and FOCUS",
    description: "Short discovery programs for first-year university students interested in trading, technology, math, and problem solving.",
    url: "https://www.janestreet.com/join-jane-street/programs-and-events/",
    years: ["first-year"],
    availability: "current",
    verifiedAt: "2026-09-19",
  },
  {
    id: "microsoft-explore",
    company: "Microsoft",
    title: "Explore Microsoft",
    description: "A summer internship designed for first- and second-year students to try software engineering roles with a project team.",
    url: "https://careers.microsoft.com/v2/global/en/exploremicrosoft",
    years: ["first-year", "sophomore"],
    availability: "current",
    verifiedAt: "2026-09-19",
  },
  {
    id: "nvidia-ignite",
    company: "NVIDIA",
    title: "University and early-talent programs",
    description: "Year-round internships plus a summer pre-internship program aimed at current freshmen and sophomores.",
    url: "https://www.nvidia.com/en-us/about-nvidia/careers/university-recruiting/",
    years: ["first-year", "sophomore", "junior", "senior", "graduate"],
    availability: "check-live",
    verifiedAt: "2026-09-19",
  },
  {
    id: "google-internships",
    company: "Google",
    title: "Student internships",
    description: "Google's official student portal for current internship listings; individual roles state their academic-year requirements.",
    url: "https://www.google.com/about/careers/applications/students/internships",
    years: ["first-year", "sophomore", "junior", "senior", "graduate"],
    availability: "check-live",
    verifiedAt: "2026-09-19",
  },
  {
    id: "jane-street-internships",
    company: "Jane Street",
    title: "Internships",
    description: "Internships in software engineering, machine learning, quantitative trading and research, and strategy and product.",
    url: "https://www.janestreet.com/join-jane-street/internships/",
    years: ["sophomore", "junior", "senior", "graduate"],
    availability: "check-live",
    verifiedAt: "2026-09-19",
  },
  {
    id: "openai-emerging-talent",
    company: "OpenAI",
    title: "Emerging Talent",
    description: "OpenAI's official hub for internships, the Research Residency, and early-career roles. Check the live listings for current eligibility.",
    url: "https://openai.com/careers/emerging-talent/",
    years: ["sophomore", "junior", "senior", "graduate"],
    availability: "check-live",
    verifiedAt: "2026-09-19",
  },
  {
    id: "anthropic-careers",
    company: "Anthropic",
    title: "Careers and fellows programs",
    description: "Anthropic's current careers page says it does not offer internships. Use its live roles page to check fellows and early-career opportunities instead.",
    url: "https://www.anthropic.com/careers",
    years: ["first-year", "sophomore", "junior", "senior", "graduate"],
    availability: "no-internship",
    verifiedAt: "2026-09-19",
  },
];

export function programsForYear(programs: CareerProgram[], studentYear: StudentYear) {
  if (studentYear === "unspecified") return programs;
  return [...programs].sort((a, b) => {
    const aMatch = a.availability !== "no-internship" && a.years.includes(studentYear) ? 1 : 0;
    const bMatch = b.availability !== "no-internship" && b.years.includes(studentYear) ? 1 : 0;
    return bMatch - aMatch || Number(a.availability === "no-internship") - Number(b.availability === "no-internship");
  });
}
