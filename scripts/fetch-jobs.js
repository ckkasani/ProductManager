// Job Fetcher v6 — FULL SPECTRUM
// Strategies:
//   1. Greenhouse/Lever API (still the cleanest source)
//   2. Workday JSON endpoints (public, used by company UIs)
//   3. DuckDuckGo HTML search (catches everything else)
//   4. Direct career page parsing (FAANG, big banks)
//
// This is how every job aggregator works. Indeed. JobRight. ZipRecruiter.
// We just do it focused on YOUR resume.

const fs = require('fs');
const https = require('https');
const { URL } = require('url');

// ═══════════════════════════════════════════════════════
//  COMPANY ROSTER — Multi-source
// ═══════════════════════════════════════════════════════
const COMPANIES = [
  // === API SOURCES (cleanest data) ===
  { name: "SoFi", source: "greenhouse", slug: "sofi", industry: "fintech", stage: "Public" },
  { name: "Robinhood", source: "greenhouse", slug: "robinhood", industry: "fintech", stage: "Public" },
  { name: "Plaid", source: "greenhouse", slug: "plaid", industry: "fintech", stage: "Late" },
  { name: "Coinbase", source: "greenhouse", slug: "coinbase", industry: "fintech", stage: "Public" },
  { name: "Block", source: "greenhouse", slug: "square", industry: "fintech", stage: "Public" },
  { name: "Stripe", source: "greenhouse", slug: "stripe", industry: "fintech", stage: "Late" },
  { name: "Affirm", source: "greenhouse", slug: "affirm", industry: "fintech", stage: "Public" },
  { name: "Klarna", source: "greenhouse", slug: "klarna", industry: "fintech", stage: "Public" },
  { name: "Wise", source: "greenhouse", slug: "wise", industry: "fintech", stage: "Public" },
  { name: "Chime", source: "greenhouse", slug: "chime", industry: "fintech", stage: "Late" },
  { name: "Brex", source: "greenhouse", slug: "brex", industry: "fintech", stage: "D" },
  { name: "Mercury", source: "greenhouse", slug: "mercury", industry: "fintech", stage: "C" },
  { name: "Adyen", source: "greenhouse", slug: "adyen", industry: "fintech", stage: "Public" },
  { name: "Marqeta", source: "greenhouse", slug: "marqeta", industry: "fintech", stage: "Public" },
  { name: "Anthropic", source: "greenhouse", slug: "anthropic", industry: "ai-infra", stage: "Late" },
  { name: "Databricks", source: "greenhouse", slug: "databricks", industry: "data-platform", stage: "Late" },
  { name: "Snowflake", source: "greenhouse", slug: "snowflake", industry: "data-platform", stage: "Public" },
  { name: "Ramp", source: "lever", slug: "ramp", industry: "fintech", stage: "D" },
  { name: "Navan", source: "lever", slug: "navan", industry: "fintech", stage: "Late" },
  { name: "Rippling", source: "lever", slug: "rippling", industry: "saas", stage: "Late" },
  { name: "Mistral", source: "lever", slug: "mistral", industry: "ai-infra", stage: "C" },
  { name: "Cohere", source: "lever", slug: "cohere", industry: "ai-infra", stage: "D" },

  // === WORKDAY ENDPOINTS (the big banks & corps) ===
  // Format inferred from each company's public career site URL
  { name: "JPMorgan Chase", source: "workday", industry: "fintech", stage: "Public",
    wd: { host: "jpmc.wd5", tenant: "jpmc", site: "jpmc" } },
  { name: "Capital One", source: "workday", industry: "fintech", stage: "Public",
    wd: { host: "capitalone.wd1", tenant: "capitalone", site: "Capital_One" } },
  { name: "Wells Fargo", source: "workday", industry: "fintech", stage: "Public",
    wd: { host: "wd1", tenant: "wellsfargo", site: "wellsfargojobs" } },
  { name: "American Express", source: "workday", industry: "fintech", stage: "Public",
    wd: { host: "aexp.wd1", tenant: "aexp", site: "AmericanExpress" } },

  // === DUCKDUCKGO SEARCH (FAANG + others without APIs) ===
  // These get found via web search
  { name: "Microsoft", source: "duckduckgo", industry: "ai-infra", stage: "Public",
    searchQuery: "site:careers.microsoft.com senior product manager 2026 fintech OR payments OR AI" },
  { name: "Google", source: "duckduckgo", industry: "ai-infra", stage: "Public",
    searchQuery: "site:careers.google.com senior product manager 2026 payments OR cloud OR AI" },
  { name: "Apple", source: "duckduckgo", industry: "ai-infra", stage: "Public",
    searchQuery: "site:jobs.apple.com senior product manager 2026 services OR payments" },
  { name: "Amazon", source: "duckduckgo", industry: "ai-infra", stage: "Public",
    searchQuery: "site:amazon.jobs senior product manager 2026 AWS OR payments OR Bedrock" },
  { name: "Meta", source: "duckduckgo", industry: "ai-infra", stage: "Public",
    searchQuery: "site:metacareers.com senior product manager 2026 AI OR payments" }
];

// ═══════════════════════════════════════════════════════
//  PROFILE & SCORING
// ═══════════════════════════════════════════════════════
const PROFILE = {
  industryKeywords: {
    fintech: {
      high: ["payment", "payments", "tsys", "settlement", "authorization", "transaction",
             "issuing", "acquiring", "card", "credit card", "debit", "lending", "loan",
             "loans", "servicing", "credit", "underwriting", "collections", "fdic", "kyc",
             "aml", "cip", "compliance", "regulated", "regulatory", "pci", "identity",
             "fraud", "risk", "bank", "banking", "fintech", "wealth", "advisor", "sweep",
             "aum", "billing", "treasury", "ach", "wire", "ledger"],
      med: ["api", "platform", "infrastructure", "consumer", "member", "stakeholder"]
    },
    "ai-infra": {
      high: ["llm", "ai platform", "ai", "agent", "agents", "human-in-the-loop",
             "escalation", "machine learning", "ml", "rag", "model", "inference",
             "enterprise ai", "ai product"],
      med: ["api", "platform", "enterprise", "saas", "developer", "infrastructure"]
    },
    saas: {
      high: ["soc2", "compliance", "audit", "regulated", "governance", "enterprise saas", "b2b"],
      med: ["platform", "enterprise", "automation"]
    },
    "data-platform": {
      high: ["data platform", "etl", "pipeline", "warehouse", "system of record", "sor",
             "multi-tenant", "integration", "data"],
      med: ["api", "microservices", "sql", "azure", "aws"]
    }
  },
  universalHigh: ["0 to 1", "0-to-1", "scaling", "platform", "infrastructure",
                  "stakeholder", "cross-functional", "regulated", "enterprise", "compliance"],
  targetTitles: ["senior product manager", "staff product manager", "principal product manager",
                 "group product manager", "lead product manager", "director, product",
                 "director of product", "senior pm", "staff pm", "principal pm",
                 "head of product", "vp product", "vp of product"],
  excludeKeywords: ["intern", "associate product manager", "apm", "marketing manager",
                    "program manager", "engineering manager", "product marketing",
                    "designer", "tpm", "technical program"]
};

const DAYS_BACK = 14;
const MIN_SCORE = 60;

// ═══════════════════════════════════════════════════════
//  HTTP HELPERS
// ═══════════════════════════════════════════════════════
function httpRequest(url, options = {}) {
  return new Promise((resolve) => {
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(options.headers || {})
      },
      method: options.method || 'GET',
      timeout: 15000
    };
    const req = https.request(url, opts, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http') ?
          res.headers.location : new URL(res.headers.location, url).toString();
        return httpRequest(redirectUrl, options).then(resolve);
      }
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', () => resolve({ statusCode: 0, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ statusCode: 0, body: '' }); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function fetchJson(url) {
  const res = await httpRequest(url);
  try { return JSON.parse(res.body); } catch { return null; }
}

// ═══════════════════════════════════════════════════════
//  HTML UTILS
// ═══════════════════════════════════════════════════════
function stripHtml(html) {
  if (!html) return "";
  let text = String(html)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'").replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/')
    .replace(/&hellip;/g, '...').replace(/&mdash;/g, '—').replace(/&ndash;/g, '-')
    .replace(/&rsquo;/g, "'").replace(/&lsquo;/g, "'").replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"').replace(/&#\d+;/g, '').replace(/&[a-z]+;/gi, '');
  return text.replace(/\s+/g, ' ').trim().substring(0, 1200);
}

// ═══════════════════════════════════════════════════════
//  SOURCE 1: GREENHOUSE API
// ═══════════════════════════════════════════════════════
async function fetchGreenhouse(c) {
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs?content=true`);
  if (!data) return [];
  return (data?.jobs || []).map(j => ({
    id: `gh-${c.slug}-${j.id}`,
    title: j.title || "",
    company: c.name,
    industry: c.industry, stage: c.stage,
    location: j.location?.name || "Remote",
    url: j.absolute_url || "",
    description: stripHtml(j.content || ""),
    posted: j.updated_at || j.created_at || new Date().toISOString(),
    source: "Greenhouse",
    department: j.departments?.[0]?.name || ""
  }));
}

// ═══════════════════════════════════════════════════════
//  SOURCE 2: LEVER API
// ═══════════════════════════════════════════════════════
async function fetchLever(c) {
  const data = await fetchJson(`https://api.lever.co/v0/postings/${c.slug}?mode=json`);
  if (!Array.isArray(data)) return [];
  return data.map(j => ({
    id: `lv-${c.slug}-${j.id}`,
    title: j.text || "",
    company: c.name,
    industry: c.industry, stage: c.stage,
    location: j.categories?.location || "Remote",
    url: j.hostedUrl || j.applyUrl || "",
    description: stripHtml(j.descriptionPlain || j.description || ""),
    posted: j.createdAt ? new Date(j.createdAt).toISOString() : new Date().toISOString(),
    source: "Lever",
    department: j.categories?.team || j.categories?.department || ""
  }));
}

// ═══════════════════════════════════════════════════════
//  SOURCE 3: WORKDAY JSON ENDPOINTS
// ═══════════════════════════════════════════════════════
async function fetchWorkday(c) {
  const { host, tenant, site } = c.wd;
  const url = `https://${host}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  const res = await httpRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ appliedFacets: {}, limit: 50, offset: 0, searchText: "product manager" })
  });
  let data;
  try { data = JSON.parse(res.body); } catch { return []; }

  const baseUrl = `https://${host}.myworkdayjobs.com/en-US/${site}`;
  return (data?.jobPostings || []).map(j => ({
    id: `wd-${tenant}-${(j.bulletFields && j.bulletFields[0]) || Math.random()}`,
    title: j.title || "",
    company: c.name,
    industry: c.industry, stage: c.stage,
    location: j.locationsText || "Various",
    url: baseUrl + j.externalPath,
    description: stripHtml(j.title + " at " + c.name + ". " + (j.locationsText || "")),
    posted: parseWorkdayDate(j.postedOn),
    source: "Workday",
    department: ""
  }));
}

function parseWorkdayDate(text) {
  if (!text) return new Date().toISOString();
  const t = String(text).toLowerCase();
  const now = new Date();
  if (t.includes("today") || t.includes("just")) return now.toISOString();
  if (t.includes("yesterday")) { now.setDate(now.getDate() - 1); return now.toISOString(); }
  const m = t.match(/(\d+)\+?\s*day/);
  if (m) { now.setDate(now.getDate() - parseInt(m[1])); return now.toISOString(); }
  return now.toISOString();
}

// ═══════════════════════════════════════════════════════
//  SOURCE 4: DUCKDUCKGO SEARCH (the magic one)
// ═══════════════════════════════════════════════════════
async function fetchDuckDuckGo(c) {
  // DuckDuckGo has an HTML search endpoint that returns real results
  // We search for: "site:[careers domain] senior product manager 2026"
  // Then parse the results to find job URLs and titles
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(c.searchQuery)}`;
  const res = await httpRequest(searchUrl);
  if (!res.body || res.statusCode !== 200) return [];

  const html = res.body;
  const jobs = [];
  const seen = new Set();

  // DuckDuckGo result format: <a class="result__a" href="...">title</a>
  // Followed by <a class="result__snippet">snippet</a>
  const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  let counter = 0;
  while ((match = resultRegex.exec(html)) !== null && counter < 30) {
    counter++;
    const rawUrl = match[1];
    const title = stripHtml(match[2]).trim();
    const snippet = stripHtml(match[3]).trim();

    // DDG wraps URLs in their redirect — extract the real one
    let realUrl = rawUrl;
    const ddgMatch = rawUrl.match(/uddg=([^&]+)/);
    if (ddgMatch) realUrl = decodeURIComponent(ddgMatch[1]);

    // Filter: must be a job page, must have "product manager" in title
    if (!title.toLowerCase().includes("product manager") && !title.toLowerCase().includes("product mgr")) continue;
    if (seen.has(realUrl)) continue;
    seen.add(realUrl);

    jobs.push({
      id: `ddg-${c.name.toLowerCase().replace(/\s/g, '-')}-${counter}`,
      title: title,
      company: c.name,
      industry: c.industry, stage: c.stage,
      location: "See listing",
      url: realUrl,
      description: snippet,
      posted: new Date().toISOString(), // DDG doesn't always provide date
      source: "DuckDuckGo",
      department: ""
    });
  }
  return jobs;
}

// ═══════════════════════════════════════════════════════
//  FILTERING & SCORING
// ═══════════════════════════════════════════════════════
function isPMRole(job) {
  const text = (job.title + " " + job.department).toLowerCase();
  if (!PROFILE.targetTitles.some(t => text.includes(t))) return false;
  if (PROFILE.excludeKeywords.some(k => job.title.toLowerCase().includes(k))) return false;
  return true;
}

function isRecent(job, days) {
  const posted = new Date(job.posted);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return posted >= cutoff;
}

function scoreCallbackProbability(job) {
  let score = 0;
  const reasons = [];
  const text = (job.title + " " + job.description).toLowerCase();
  const indKeys = PROFILE.industryKeywords[job.industry] || { high: [], med: [] };

  let highHits = 0, medHits = 0;
  for (const kw of indKeys.high) if (text.includes(kw)) highHits++;
  for (const kw of indKeys.med) if (text.includes(kw)) medHits++;
  for (const kw of PROFILE.universalHigh) if (text.includes(kw)) highHits++;

  const skillScore = Math.min(highHits * 3, 35) + Math.min(medHits * 1.5, 10);
  score += skillScore;
  if (skillScore >= 30) reasons.push("Strong skill alignment");
  else if (skillScore >= 20) reasons.push("Good skill match");

  const stageScore = { "B": 13, "C": 15, "D": 14, "Late": 12, "Public": 10 }[job.stage] || 12;
  score += stageScore;

  const t = job.title.toLowerCase();
  let seniorityScore = 0;
  if (t.includes("director") || t.includes("head of") || t.includes("vp")) seniorityScore = 18;
  else if (t.includes("principal")) seniorityScore = 16;
  else if (t.includes("staff")) seniorityScore = 15;
  else if (t.includes("group")) seniorityScore = 14;
  else if (t.includes("lead")) seniorityScore = 12;
  else if (t.includes("senior")) seniorityScore = 13;
  score += seniorityScore;
  if (seniorityScore >= 15) reasons.push("Senior-level title");

  const hoursOld = (Date.now() - new Date(job.posted).getTime()) / 3600000;
  let freshnessScore = hoursOld <= 24 ? 12 : hoursOld <= 72 ? 10 : hoursOld <= 168 ? 6 : 3;
  score += freshnessScore;
  if (freshnessScore >= 10) reasons.push("Fresh posting");

  let domainBonus = 0;
  if (job.industry === "fintech" && (text.includes("payment") || text.includes("card") ||
      text.includes("lending") || text.includes("banking") || text.includes("treasury"))) domainBonus = 10;
  if (job.industry === "ai-infra" && (text.includes("agent") || text.includes("enterprise"))) domainBonus = 10;
  score += domainBonus;
  if (domainBonus >= 8) reasons.push("Perfect domain fit");

  return { score: Math.min(Math.round(score), 99), reasons: reasons.slice(0, 4) };
}

function extractTags(job) {
  const text = (job.title + " " + job.description).toLowerCase();
  const tags = new Set();
  const industryNames = {
    fintech: "Fintech", "ai-infra": "AI Infra", saas: "SaaS", "data-platform": "Data"
  };
  if (industryNames[job.industry]) tags.add(industryNames[job.industry]);

  const tagMap = {
    "Payments": ["payment", "tsys", "settlement"],
    "Lending": ["lending", "loan", "credit"],
    "Cards": ["card", "issuing"],
    "Fraud": ["fraud", "risk"],
    "AI/ML": ["ai", "ml ", "llm", "agent"],
    "Compliance": ["compliance", "kyc"],
    "Platform": ["platform", "infrastructure"],
    "Banking": ["banking", "bank ", "treasury"]
  };
  for (const [tag, kws] of Object.entries(tagMap)) {
    if (kws.some(k => text.includes(k))) tags.add(tag);
  }
  return Array.from(tags).slice(0, 5);
}

function dedupeByTitle(jobs) {
  const seen = new Map();
  for (const j of jobs) {
    const key = `${j.company}::${j.title.toLowerCase().trim()}`;
    if (!seen.has(key)) seen.set(key, j);
    else {
      const e = seen.get(key);
      if (!e.location.includes(j.location)) e.location = `${e.location} / ${j.location}`;
    }
  }
  return Array.from(seen.values());
}

// ═══════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════
async function main() {
  console.log(`🌐 FULL SPECTRUM v6 — ${new Date().toISOString()}`);
  console.log(`   4 sources: Greenhouse, Lever, Workday, DuckDuckGo`);
  console.log(`   ${COMPANIES.length} companies tracked\n`);

  const allJobs = [];
  const sourceStats = { greenhouse: 0, lever: 0, workday: 0, duckduckgo: 0 };

  for (const c of COMPANIES) {
    try {
      let raw = [];
      if (c.source === "greenhouse") raw = await fetchGreenhouse(c);
      else if (c.source === "lever") raw = await fetchLever(c);
      else if (c.source === "workday") raw = await fetchWorkday(c);
      else if (c.source === "duckduckgo") raw = await fetchDuckDuckGo(c);

      const filtered = raw
        .filter(isPMRole)
        .filter(j => isRecent(j, DAYS_BACK))
        .map(j => {
          const s = scoreCallbackProbability(j);
          return { ...j, match: s.score, reasons: s.reasons, tags: extractTags(j), status: "new" };
        })
        .filter(j => j.match >= MIN_SCORE);

      if (filtered.length > 0) {
        console.log(`  ✅ ${c.name} (${c.source}): ${filtered.length} match(es) — top: ${Math.max(...filtered.map(j => j.match))}%`);
        sourceStats[c.source] = (sourceStats[c.source] || 0) + filtered.length;
      }
      allJobs.push(...filtered);
    } catch (e) {
      // silent skip per company
    }
  }

  const deduped = dedupeByTitle(allJobs);
  deduped.sort((a, b) => b.match - a.match);

  const output = {
    lastUpdated: new Date().toISOString(),
    config: { daysBack: DAYS_BACK, minScore: MIN_SCORE, sources: ["Greenhouse","Lever","Workday","DuckDuckGo"] },
    sourceStats,
    totalJobs: deduped.length,
    highMatchJobs: deduped.filter(j => j.match >= 85).length,
    jobs: deduped
  };

  fs.writeFileSync('jobs.json', JSON.stringify(output, null, 2));
  console.log(`\n📊 FINAL: ${deduped.length} total roles`);
  console.log(`   By source:`, sourceStats);
  console.log(`   ${output.highMatchJobs} at 85%+`);
  if (deduped.length > 0) {
    console.log(`\n   Top 5 callbacks:`);
    deduped.slice(0, 5).forEach(j => {
      console.log(`     ${j.match}% — ${j.title} @ ${j.company} (${j.source})`);
    });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
