export default async function handler(req: any, res: any) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const listId = String(req.query?.listId ?? "").trim();
  const courses = String(req.query?.courses ?? "").trim();
  if (!listId) return res.status(400).json({ error: "listId is required" });

  try {
    const suffix = courses ? "/" + encodeURIComponent(courses) : "";
    const response = await fetch(
      "https://fireroad.mit.edu/requirements/progress/" + encodeURIComponent(listId) + suffix,
    );
    if (!response.ok) throw new Error("FireRoad progress request failed");
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: "Unable to calculate requirement progress" });
  }
}
