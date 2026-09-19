import OpenAI from "openai";

type CatalogCourse = {
  subject_id: string;
  title: string;
  description?: string;
};

function prefilter(query: string, courses: CatalogCourse[]) {
  const terms = query.toLowerCase().split(/\W+/).filter((term) => term.length > 2);
  return courses
    .map((course) => {
      const haystack = (course.subject_id + " " + course.title + " " + (course.description ?? "")).toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { course, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 80)
    .map(({ course }) => course);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const query = String(req.body?.query ?? "").trim();
  if (!query) return res.status(400).json({ error: "query is required" });

  const catalogResponse = await fetch("https://fireroad.mit.edu/courses/all?full=true");
  if (!catalogResponse.ok) return res.status(502).json({ error: "Catalog unavailable" });
  const catalog = await catalogResponse.json() as CatalogCourse[];
  const candidates = prefilter(query, catalog);

  if (!process.env.OPENAI_API_KEY) {
    return res.status(200).json({
      results: candidates.slice(0, 5).map((course) => ({
        courseId: "mit:" + course.subject_id,
        title: course.title,
        relevanceExplanation: "Keyword match from the current MIT catalog.",
        supportingCatalogText: course.description ?? course.title,
        recommendationMethod: "keyword",
      })),
    });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const allowed = new Set(candidates.map((course) => course.subject_id));

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input: [
        {
          role: "system",
          content: "Recommend only from the supplied MIT course candidates. Return JSON only with a results array. Each result needs subjectId, relevanceExplanation, supportingCatalogText. Never invent facts or courses.",
        },
        { role: "user", content: JSON.stringify({ query, candidates }) },
      ],
    });

    const parsed = JSON.parse(response.output_text);
    const results = Array.isArray(parsed.results)
      ? parsed.results
          .filter((result: any) => allowed.has(result.subjectId))
          .slice(0, 5)
          .map((result: any) => {
            const course = candidates.find((candidate) => candidate.subject_id === result.subjectId)!;
            return {
              courseId: "mit:" + result.subjectId,
              title: course.title,
              relevanceExplanation: String(result.relevanceExplanation ?? ""),
              supportingCatalogText: String(result.supportingCatalogText ?? course.description ?? course.title),
              recommendationMethod: "AI",
            };
          })
      : [];

    return res.status(200).json({ results });
  } catch (error) {
    console.error(error);
    return res.status(200).json({
      results: candidates.slice(0, 5).map((course) => ({
        courseId: "mit:" + course.subject_id,
        title: course.title,
        relevanceExplanation: "Keyword match from the current MIT catalog.",
        supportingCatalogText: course.description ?? course.title,
        recommendationMethod: "keyword",
      })),
    });
  }
}
