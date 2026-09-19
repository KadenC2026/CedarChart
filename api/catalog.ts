export default async function handler(req: any, res: any) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const response = await fetch("https://fireroad.mit.edu/courses/all?full=true");
    if (!response.ok) throw new Error("FireRoad catalog request failed");
    const data = await response.json();
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json(data);
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: "Unable to load MIT catalog" });
  }
}
