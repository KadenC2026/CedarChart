import OpenAI from "openai";

type Candidate = {
  subjectId: string;
  title: string;
  description?: string;
  relationship: "required-next" | "recommended-next" | "related-direction";
  deterministicScore: number;
  deterministicReasons: string[];
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    currentCourse,
    interests,
    majorLabel,
    candidates,
  } = req.body as {
    currentCourse?: { subjectId: string; title: string; description?: string };
    interests?: string;
    majorLabel?: string;
    candidates?: Candidate[];
  };

  if (!currentCourse || !Array.isArray(candidates) || !candidates.length) {
    return res.status(400).json({ error: "currentCourse and candidates are required" });
  }

  const safeCandidates = candidates.slice(0, 15);
  const allowedIds = new Set(safeCandidates.map((candidate) => candidate.subjectId));

  if (!process.env.OPENAI_API_KEY) {
    return res.status(200).json({
      results: safeCandidates.slice(0, 8).map((candidate) => ({
        subjectId: candidate.subjectId,
        explanation: candidate.deterministicReasons[0] ?? "Logical continuation from your current course.",
        method: "deterministic",
      })),
    });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input: [
        {
          role: "system",
          content:
            "You are ranking a pre-vetted list of MIT courses. You may ONLY return supplied candidate subjectIds. Do not invent prerequisites, requirements, or enrollment claims. Distinguish an explicit prerequisite relationship from a recommendation. Return JSON only: {results:[{subjectId, explanation}]}. Rank for a logical next course given the current course, selected major/minor, and stated interests. Keep explanations concise and grounded in supplied candidate information.",
        },
        {
          role: "user",
          content: JSON.stringify({
            currentCourse,
            interests: interests ?? "",
            majorLabel: majorLabel ?? "",
            candidates: safeCandidates,
          }),
        },
      ],
    });

    const parsed = JSON.parse(response.output_text);
    const results = Array.isArray(parsed.results)
      ? parsed.results
          .filter((result: any) => allowedIds.has(result.subjectId))
          .slice(0, 8)
          .map((result: any) => ({
            subjectId: result.subjectId,
            explanation: String(result.explanation ?? ""),
            method: "AI",
          }))
      : [];

    if (!results.length) throw new Error("No valid AI results");
    return res.status(200).json({ results });
  } catch (error) {
    console.error(error);
    return res.status(200).json({
      results: safeCandidates.slice(0, 8).map((candidate) => ({
        subjectId: candidate.subjectId,
        explanation: candidate.deterministicReasons[0] ?? "Logical continuation from your current course.",
        method: "deterministic",
      })),
    });
  }
}
