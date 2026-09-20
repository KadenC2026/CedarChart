import type { PlannedCourse } from "./types";

export type SocialTheme = {
  id: string;
  title: string;
  description: string;
  searchTerms: string[];
  url: string;
  sourceLabel: string;
  keywords: string[];
  coursePrefixes: string[];
};

export type SocialThemeRecommendation = SocialTheme & {
  reason: string;
};

const ENGAGE_URL = "https://engage.mit.edu/club_signup?view=all";

export const socialThemes: SocialTheme[] = [
  {
    id: "technology",
    title: "AI, computing & robotics groups",
    description: "Meet students building software, robots, autonomous systems, and new computing tools.",
    searchTerms: ["artificial intelligence", "computing", "robotics", "makers"],
    url: ENGAGE_URL,
    sourceLabel: "Search MIT Engage",
    keywords: ["ai", "artificial", "intelligence", "computer", "computing", "software", "robot", "robotics", "machine", "learning", "data", "cyber", "programming"],
    coursePrefixes: ["6", "16"],
  },
  {
    id: "science-health",
    title: "Science, health & biotech groups",
    description: "Find communities exploring biology, health, chemistry, neuroscience, and medical technology.",
    searchTerms: ["biotechnology", "health", "neuroscience", "science"],
    url: ENGAGE_URL,
    sourceLabel: "Search MIT Engage",
    keywords: ["biology", "biotech", "health", "medical", "medicine", "neuroscience", "brain", "chemistry", "genetics", "science"],
    coursePrefixes: ["5", "7", "9", "10", "20", "HST"],
  },
  {
    id: "climate-impact",
    title: "Climate, energy & public-impact groups",
    description: "Connect with teams working on sustainability, energy, cities, policy, and public service.",
    searchTerms: ["climate", "energy", "sustainability", "public service"],
    url: ENGAGE_URL,
    sourceLabel: "Search MIT Engage",
    keywords: ["climate", "energy", "sustainability", "environment", "policy", "public", "service", "city", "cities", "impact"],
    coursePrefixes: ["1", "11", "12", "17", "22", "STS"],
  },
  {
    id: "arts-media",
    title: "Arts, music & media groups",
    description: "Explore performance, visual art, design, writing, film, games, and creative technology.",
    searchTerms: ["music", "arts", "design", "media"],
    url: ENGAGE_URL,
    sourceLabel: "Search MIT Engage",
    keywords: ["art", "arts", "music", "design", "media", "film", "writing", "theater", "theatre", "game", "games", "creative"],
    coursePrefixes: ["4", "21", "CMS", "MAS"],
  },
  {
    id: "math-research",
    title: "Math, research & academic societies",
    description: "Find peers who enjoy theory, research talks, competitions, and academic communities.",
    searchTerms: ["mathematics", "research", "academic society", "science"],
    url: ENGAGE_URL,
    sourceLabel: "Search MIT Engage",
    keywords: ["math", "mathematics", "theory", "research", "physics", "economics", "academic", "quantitative"],
    coursePrefixes: ["8", "14", "18"],
  },
  {
    id: "community-culture",
    title: "Culture, identity & community groups",
    description: "Meet people through cultural, affinity, service, faith, and campus community organizations.",
    searchTerms: ["culture", "community", "service", "identity"],
    url: ENGAGE_URL,
    sourceLabel: "Search MIT Engage",
    keywords: ["community", "culture", "cultural", "identity", "service", "language", "faith", "education", "mentoring"],
    coursePrefixes: ["17", "21", "24"],
  },
  {
    id: "sports-outdoors",
    title: "Sports, outdoors & movement groups",
    description: "Join instructional and competitive clubs, outdoor groups, and active communities.",
    searchTerms: ["club sports", "outdoors", "dance", "fitness"],
    url: "https://clubsports.mit.edu/",
    sourceLabel: "Browse MIT Club Sports",
    keywords: ["sport", "sports", "fitness", "outdoor", "outdoors", "dance", "climbing", "sailing", "running", "movement"],
    coursePrefixes: ["PE"],
  },
];

function tokens(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function coursePrefix(courseId: string) {
  return courseId.split(".")[0].toUpperCase();
}

export function recommendSocialThemes({
  interestQuery,
  plannedCourses,
  limit = 4,
}: {
  interestQuery: string;
  plannedCourses: PlannedCourse[];
  limit?: number;
}): SocialThemeRecommendation[] {
  const profileText = [interestQuery, ...plannedCourses.map((course) => course.title)].join(" ");
  const profileTokens = tokens(profileText);
  const prefixes = new Set(plannedCourses.map((course) => coursePrefix(course.courseId)));

  const ranked = socialThemes.map((theme, index) => {
    const matchedWords = theme.keywords.filter((keyword) => profileTokens.has(keyword));
    const matchedCourse = theme.coursePrefixes.some((prefix) => prefixes.has(prefix));
    const score = matchedWords.length * 3 + (matchedCourse ? 2 : 0);
    const reason = matchedWords.length
      ? `Suggested from your ${matchedWords.slice(0, 2).join(" and ")} interests.`
      : matchedCourse
        ? "Suggested from courses on your plan."
        : "A broad way to meet people across MIT.";
    return { theme, index, score, reason };
  });

  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked.slice(0, limit).map(({ theme, reason }) => ({ ...theme, reason }));
}
