export default async function handler(req: any, res: any) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const subjectId = String(req.query?.id ?? "").trim();
  if (!subjectId) return res.status(400).json({ error: "id is required" });
  try {
    const response = await fetch("https://fireroad.mit.edu/courses/lookup/" + encodeURIComponent(subjectId));
    if (!response.ok) return res.status(response.status).json({ error: "Course not found" });
    const data = await response.json();
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json(data);
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: "Unable to load course" });
  }
}
