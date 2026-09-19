import OpenAI from "openai";
import { emptyFilters, searchCourses } from "../src/domain/courseSearch";
import { rankByEmbedding } from "../src/domain/vectorSearch";
import type { RemoteCourse } from "../src/domain/types";

function courseText(course: RemoteCourse) {
  return [
    course.subject_id,
    course.title,
    course.description ?? "",
    course.prerequisites ? "Prerequisites: " + course.prerequisites : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function lexicalCandidates(query: string, catalog: RemoteCourse[]) {
  const ranked = searchCourses(catalog, {
    query,
    filters: emptyFilters,
    limit: 140,
  });

  if (ranked.length >= 80) return ranked;

  const departments = new Set(
    ranked.map((course) => course.subject_id.split(".")[0]),
  );
  const supplement = catalog
    .filter(
      (course) =>
        !course.is_historical &&
        !ranked.some((rankedCourse) => rankedCourse.subject_id === course.subject_id) &&
        (departments.size === 0 || departments.has(course.subject_id.split(".")[0])),
    )
    .slice(0, 140 - ranked.length);

  return [...ranked, ...supplement];
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const query = String(req.body?.query ?? "").trim();
  const careerGoal = String(req.body?.careerGoal ?? "").trim();
  if (!query && !careerGoal) {
    return res.status(400).json({ error: "query or careerGoal is required" });
  }

  const catalogResponse = await fetch("https://fireroad.mit.edu/courses/all?full=true");
  if (!catalogResponse.ok) return res.status(502).json({ error: "Catalog unavailable" });
  const catalog = (await catalogResponse.json()) as RemoteCourse[];
  const liveCatalog = catalog.filter((course) => !course.is_historical);

  const searchText = [
    query,
    careerGoal ? "Career goal: " + careerGoal : "",
  ].filter(Boolean).join("\n");

  const candidates = lexicalCandidates(searchText, liveCatalog);

  if (!process.env.OPENAI_API_KEY) {
    return res.status(200).json({
      method: "keyword",
      results: candidates.slice(0, 5).map((course) => ({
        courseId: "mit:" + course.subject_id,
        title: course.title,
        relevanceExplanation: careerGoal
          ? "Catalog match related to your stated career goal."
          : "Catalog match related to your interests.",
        supportingCatalogText: course.description ?? course.title,
        recommendationMethod: "keyword",
      })),
    });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
    const inputs = [searchText, ...candidates.map(courseText)];
    const embedded = await client.embeddings.create({
      model: embeddingModel,
      input: inputs,
    });

    const queryEmbedding = embedded.data[0]?.embedding;
    if (!queryEmbedding) throw new Error("Missing query embedding");

    const semantic = rankByEmbedding(
      queryEmbedding,
      candidates.map((course, index) => ({
        item: course,
        embedding: embedded.data[index + 1]?.embedding ?? [],
      })),
    )
      .filter((result) => Number.isFinite(result.similarity))
      .slice(0, 16);

    const grounded = semantic.map(({ item, similarity }) => ({
      subjectId: item.subject_id,
      title: item.title,
      description: item.description ?? "",
      semanticSimilarity: Number(similarity.toFixed(4)),
    }));

    const allowed = new Set(grounded.map((course) => course.subjectId));

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input: [
        {
          role: "system",
          content:
            "You rank a grounded list of real MIT courses for a student's interest or career goal. Only return supplied subjectIds. Do not invent courses, prerequisites, or career guarantees. Return JSON only: {results:[{subjectId,relevanceExplanation,supportingCatalogText}]}. Prefer courses that fit the goal and explain concretely why.",
        },
        {
          role: "user",
          content: JSON.stringify({
            query,
            careerGoal,
            semanticCandidates: grounded,
          }),
        },
      ],
    });

    const parsed = JSON.parse(response.output_text);
    const results = Array.isArray(parsed.results)
      ? parsed.results
          .filter((result: any) => allowed.has(result.subjectId))
          .slice(0, 7)
          .map((result: any) => {
            const course = candidates.find((candidate) => candidate.subject_id === result.subjectId)!;
            const similarity = semantic.find(({ item }) => item.subject_id === result.subjectId)?.similarity ?? 0;
            return {
              courseId: "mit:" + result.subjectId,
              title: course.title,
              relevanceExplanation: String(result.relevanceExplanation ?? ""),
              supportingCatalogText: String(
                result.supportingCatalogText ?? course.description ?? course.title,
              ),
              semanticSimilarity: Number(similarity.toFixed(4)),
              recommendationMethod: "AI",
            };
          })
      : [];

    if (!results.length) {
      throw new Error("No grounded ranked results");
    }

    return res.status(200).json({
      method: "vector+AI",
      embeddingModel,
      results,
    });
  } catch (error) {
    console.error(error);
    return res.status(200).json({
      method: "keyword-fallback",
      results: candidates.slice(0, 5).map((course) => ({
        courseId: "mit:" + course.subject_id,
        title: course.title,
        relevanceExplanation: "Fallback catalog match while semantic search is unavailable.",
        supportingCatalogText: course.description ?? course.title,
        recommendationMethod: "keyword",
      })),
    });
  }
}
