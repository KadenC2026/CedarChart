import OpenAI from "openai";

type RequestCourse = {
  id: string;
  localCourseId: string;
  title: string;
  description: string;
  department: string;
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "AI is not configured" });
  }

  const { query, courses } = req.body as { query?: string; courses?: RequestCourse[] };
  if (!query || !Array.isArray(courses) || !courses.length) {
    return res.status(400).json({ error: "query and courses are required" });
  }

  const allowedIds = new Set(courses.map((course) => course.id));
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input: [
        {
          role: "system",
          content:
            "You recommend courses ONLY from the supplied catalog. Return JSON only with a results array. Each result needs courseId, relevanceExplanation, and supportingCatalogText. Never invent a course, prerequisite, offering, or match percentage. Explain relevance using only supplied title/description text.",
        },
        {
          role: "user",
          content: JSON.stringify({ query, courses }),
        },
      ],
    });

    const parsed = JSON.parse(response.output_text);
    const results = Array.isArray(parsed.results)
      ? parsed.results
          .filter((result: any) => allowedIds.has(result.courseId))
          .slice(0, 5)
          .map((result: any) => ({
            courseId: result.courseId,
            relevanceExplanation: String(result.relevanceExplanation ?? ""),
            supportingCatalogText: String(result.supportingCatalogText ?? ""),
            recommendationMethod: "AI",
          }))
      : [];

    return res.status(200).json({ results });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Recommendation failed" });
  }
}
