export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  // Only allow competitionsuite.com domains
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("competitionsuite.com")) {
      return res.status(403).json({ error: "Only CompetitionSuite URLs are allowed" });
    }
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "JudgePro/1.0",
        "Accept": "text/html",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `CompetitionSuite returned ${response.status}` });
    }

    const html = await response.text();

    // Extract visible text from HTML (strip tags, decode entities)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<\/td>/gi, "\t")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\t+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).send(text);
  } catch (err) {
    return res.status(500).json({ error: `Fetch failed: ${err.message}` });
  }
}
