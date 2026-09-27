import OpenAI from "openai";

type Candidate = {
  subjectId: string;
  title: string;
  description?: string;
  relationship: "required-next" | "recommended-next" | "related-direction";
  deterministicScore: number;
  deterministicReasons: string[];
};

const rankingSchema = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          subjectId: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["subjectId", "explanation"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
} as const;

function similarity(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

function candidateText(candidate: Candidate) {
  return [
    candidate.subjectId,
    candidate.title,
    candidate.description ?? "",
    "Relationship: " + candidate.relationship,
    ...candidate.deterministicReasons,
  ]
    .filter(Boolean)
    .join("\n");
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    currentCourse,
    interests,
    careerGoal,
    majorLabel,
    candidates,
  } = req.body as {
    currentCourse?: { subjectId: string; title: string; description?: string };
    interests?: string;
    careerGoal?: string;
    majorLabel?: string;
    candidates?: Candidate[];
  };

  if (!currentCourse || !Array.isArray(candidates) || !candidates.length) {
    return res.status(400).json({ error: "currentCourse and candidates are required" });
  }

  const safeCandidates = candidates.slice(0, 60);
  const fallback = safeCandidates.slice(0, 8).map((candidate) => ({
    subjectId: candidate.subjectId,
    explanation:
      candidate.deterministicReasons[0] ??
      "Logical continuation from your current course.",
    method: "deterministic",
  }));

  if (!process.env.OPENAI_API_KEY) {
    return res.status(200).json({ method: "deterministic", results: fallback });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const semanticQuery = [
      "Current course: " + currentCourse.subjectId + " " + currentCourse.title,
      currentCourse.description ?? "",
      majorLabel ? "Academic program: " + majorLabel : "",
      interests ? "Interests: " + interests : "",
      careerGoal ? "Career goal: " + careerGoal : "",
      "Find logical next MIT courses.",
    ]
      .filter(Boolean)
      .join("\n");

    const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
    const embeddings = await client.embeddings.create({
      model: embeddingModel,
      input: [semanticQuery, ...safeCandidates.map(candidateText)],
    });

    const queryEmbedding = embeddings.data[0]?.embedding;
    if (!queryEmbedding) throw new Error("Missing query embedding");

    const semantic = safeCandidates
      .map((candidate, index) => ({
        item: candidate,
        similarity: similarity(queryEmbedding, embeddings.data[index + 1]?.embedding ?? []),
      }))
      .sort((a, b) => b.similarity - a.similarity);

    // Blend deterministic academic structure with semantic relevance.
    const blended = semantic
      .map(({ item, similarity }) => ({
        ...item,
        semanticSimilarity: similarity,
        blendedScore: item.deterministicScore * 0.35 + Math.max(0, similarity) * 100 * 0.65,
      }))
      .sort((a, b) => b.blendedScore - a.blendedScore)
      .slice(0, 20);

    const allowedIds = new Set(blended.map((candidate) => candidate.subjectId));

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      store: false,
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: "next_course_recommendations",
          strict: true,
          schema: rankingSchema,
        },
      },
      max_output_tokens: 2_500,
      input: [
        {
          role: "system",
          content:
            "Rank the supplied real MIT courses by how closely they fit the student's current course plus any stated interests/career goal. Semantic similarity should be the primary signal for broader recommendations, while explicit prerequisite continuations and program requirements remain strong academic signals. Only return supplied subjectIds. Do not invent prerequisites, requirements, course content, or career guarantees. Explicitly distinguish a direct prerequisite-based continuation from a broader recommendation.",
        },
        {
          role: "user",
          content: JSON.stringify({
            currentCourse,
            interests: interests ?? "",
            careerGoal: careerGoal ?? "",
            majorLabel: majorLabel ?? "",
            candidates: blended,
          }),
        },
      ],
    });

    if (response.status !== "completed" || !response.output_text) {
      throw new Error(`AI response ${response.status}: ${response.incomplete_details?.reason ?? "no output text"}`);
    }
    const parsed = JSON.parse(response.output_text);
    const results = Array.isArray(parsed.results)
      ? parsed.results
          .filter((result: any) => allowedIds.has(result.subjectId))
          .slice(0, 8)
          .map((result: any) => ({
            subjectId: result.subjectId,
            explanation: String(result.explanation ?? ""),
            method: "vector+AI",
            semanticSimilarity:
              blended.find((candidate) => candidate.subjectId === result.subjectId)
                ?.semanticSimilarity ?? 0,
          }))
      : [];

    if (!results.length) throw new Error("No valid AI results");

    return res.status(200).json({
      method: "vector+AI",
      embeddingModel,
      results,
    });
  } catch (error) {
    console.error(error);
    return res.status(200).json({ method: "deterministic-fallback", results: fallback });
  }
}
