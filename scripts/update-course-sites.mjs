import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRAR_ROOT = "https://student.mit.edu/catalog/";
const INDEX_URL = new URL("index.cgi", REGISTRAR_ROOT).href;
const OUTPUT_PATH = resolve(ROOT, "src/data/courseSites.json");
const CATALOG_PATH = resolve(ROOT, "public/data/catalog.json");
const PAGE_BATCH_SIZE = 12;
const URL_BATCH_SIZE = 10;
const execFileAsync = promisify(execFile);
const GENERIC_DIRECTORY_PATHS = [
  "architecture.mit.edu/classes",
  "languages.mit.edu/language-placement-proficiency",
  "mta.mit.edu/music/class-schedule",
  "mta.mit.edu/theater/class-schedule",
  "economics.mit.edu/under/economics",
  "web.mit.edu/physics/subjects/index.html",
  "philosophy.mit.edu/subjects",
  "edgerton.mit.edu/academics/courses/schedule-and-list",
];
const CURRENT_SITE_OVERRIDES = {
  "EC.731": "https://aiforimpact.github.io/fall26.html",
  "IDS.865": "https://aiforimpact.github.io/fall26.html",
  "MAS.664": "https://aiforimpact.github.io/fall26.html",
  "MAS.665": "https://aiforimpact.github.io/fall26.html",
};

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function currentListingPages(html) {
  const pages = new Set();
  for (const match of html.matchAll(/href=["']([^"']*m[A-Za-z0-9]+\.html(?:#[^"']*)?)["']/gi)) {
    const url = new URL(decodeHtml(match[1]), REGISTRAR_ROOT);
    if (url.origin === new URL(REGISTRAR_ROOT).origin && url.pathname.startsWith("/catalog/m")) {
      url.hash = "";
      pages.add(url.href);
    }
  }
  return pages;
}

function subjectSites(html, sourcePage) {
  const sites = [];
  const blockPattern = /<a\s+name=["']([^"']+)["']><\/a>\s*<p><h3>[\s\S]*?<\/p><!--end-->/gi;

  for (const match of html.matchAll(blockPattern)) {
    const subjectId = decodeHtml(match[1]).trim();
    const urlMatch = match[0].match(/<br>URL:\s*<a\s+href=["']([^"']+)["']/i);
    if (!urlMatch) continue;

    try {
      const registrarUrl = new URL(decodeHtml(urlMatch[1]), sourcePage).href;
      if (!/^https?:/.test(registrarUrl)) continue;
      sites.push({ subjectId, registrarUrl, sourcePage });
    } catch {
      // Ignore malformed URLs in the upstream listing.
    }
  }

  return sites;
}

function isGenericDirectory(url) {
  const normalized = url.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return GENERIC_DIRECTORY_PATHS.some((path) => normalized.startsWith(path));
}

async function fetchText(url) {
  const { stdout } = await execFileAsync("curl", [
    "-fsSL",
    "--max-time", "20",
    "--user-agent", "cedar-course-site-updater/1.0",
    url,
  ], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

async function resolveCurrentUrl(registrarUrl) {
  try {
    const { stdout } = await execFileAsync("curl", [
      "-fsSL",
      "--max-time", "12",
      "--user-agent", "cedar-course-site-updater/1.0",
      "-o", "/dev/null",
      "-w", "%{url_effective}",
      registrarUrl,
    ]);
    if (stdout.trim()) return stdout.trim();
  } catch {
    // The registrar URL remains the authoritative fallback when a site rejects HEAD.
  }
  return registrarUrl;
}

async function inBatches(values, size, worker) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    const batch = values.slice(index, index + size);
    output.push(...await Promise.all(batch.map(worker)));
  }
  return output;
}

async function main() {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  const catalogIds = new Set(catalog.map((course) => course.subject_id));
  const indexHtml = await fetchText(INDEX_URL);
  const term = indexHtml.match(/<title>MIT Subject Listing &(?:amp;)? Schedule\s+([^<]+)<\/title>/i)?.[1]?.trim()
    ?? "Current term";
  const fallYear = term.match(/Fall\s+(\d{4})/i)?.[1];
  const academicYear = fallYear ? `${fallYear}-${Number(fallYear) + 1}` : "current";

  const queued = [...currentListingPages(indexHtml)];
  const visited = new Set();
  const discovered = [];

  while (queued.length) {
    const batch = queued.splice(0, PAGE_BATCH_SIZE).filter((url) => !visited.has(url));
    if (!batch.length) continue;
    batch.forEach((url) => visited.add(url));

    const pages = await Promise.all(batch.map(async (url) => ({ url, html: await fetchText(url) })));
    for (const page of pages) {
      discovered.push(...subjectSites(page.html, page.url));
      for (const linkedPage of currentListingPages(page.html)) {
        if (!visited.has(linkedPage) && !queued.includes(linkedPage)) queued.push(linkedPage);
      }
    }
  }

  const bySubject = new Map();
  for (const site of discovered) {
    if (catalogIds.has(site.subjectId) && !isGenericDirectory(site.registrarUrl) && !bySubject.has(site.subjectId)) {
      bySubject.set(site.subjectId, site);
    }
  }

  let existingSites = {};
  try {
    existingSites = JSON.parse(await readFile(OUTPUT_PATH, "utf8")).sites ?? {};
  } catch {
    // A first run has no existing cache.
  }

  const resolved = await inBatches([...bySubject.entries()], URL_BATCH_SIZE, async ([subjectId, site]) => {
    const cached = existingSites[subjectId];
    const refreshShortLink = new URL(site.registrarUrl).hostname === "bit.ly";
    const url = cached?.registrarUrl === site.registrarUrl && !refreshShortLink
      ? cached.url
      : await resolveCurrentUrl(site.registrarUrl);
    return { subjectId, ...site, url };
  });
  const sites = Object.fromEntries(
    resolved
      .sort((a, b) => a.subjectId.localeCompare(b.subjectId, undefined, { numeric: true }))
      .map(({ subjectId, ...site }) => [subjectId, site]),
  );

  for (const [subjectId, url] of Object.entries(CURRENT_SITE_OVERRIDES)) {
    if (!catalogIds.has(subjectId)) continue;
    sites[subjectId] = {
      registrarUrl: url,
      sourcePage: "https://aiforimpact.github.io/",
      url,
    };
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify({
    academicYear,
    term,
    source: INDEX_URL,
    registrarPages: visited.size,
    generatedAt: new Date().toISOString(),
    sites,
  }, null, 2)}\n`);

  console.log(`Saved ${Object.keys(sites).length} current course websites from ${visited.size} registrar pages (${term}).`);
}

await main();
