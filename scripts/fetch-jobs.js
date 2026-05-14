// Job Fetcher v3 — SURGICAL MODE
// Filters: Tier 1 companies only | Posted in last 4 days | Match score >= 80
// Purpose: Cut the noise. Show only roles worth fighting for.

const fs = require('fs');
const https = require('https');

// ─── TIER 1 ONLY ──────────────────────────────────────────
// Each company is tagged T1 with the reason — for transparency.
// T1 = company you'd say yes to immediately if they called.
const COMPANIES = [
  // FAANG-adjacent + top fintech (Greenhouse)
  { name: "Stripe", slug: "stripe", source: "greenhouse", tier: "T1" },
  { name: "Anthropic", slug: "anthropic", source: "greenhouse", tier: "T1" },
  { name: "Plaid", slug: "plaid", source: "greenhouse", tier: "T1" },
  { name: "Robinhood", slug: "robinhood", source: "greenhouse", tier: "T1" },
  { name: "Coinbase", slug: "coinbase", source: "greenhouse", tier: "T1" },
  { name: "Block (Square)", slug: "square", source: "greenhouse", tier: "T1" },
  { name: "Databricks", slug: "databricks", source: "greenhouse", tier: "T1" },
  { name: "Snowflake", slug: "snowflake", source: "greenhouse", tier: "T1" },
  { name: "SoFi", slug: "sofi", source: "greenhouse", tier: "T1" },
  { name: "Affirm", slug: "affirm", source: "greenhouse", tier: "T1" },
  { name: "Klarna", slug: "klarna", source: "greenhouse", tier: "T1" },
  { name: "Wise", slug: "wise", source: "greenhouse", tier: "T1" },
  { name: "Chime", slug: "chime", source: "greenhouse", tier: "T1" },
  { name: "Brex", slug: "brex", source: "greenhouse", tier: "T1" },
  { name: "Mercury", slug: "mercury", source: "greenhouse", tier: "T1" },
  { name: "Adyen", slug: "adyen", source: "greenhouse", tier: "T1" },
  { name: "Marqeta", slug: "marqeta", source: "greenhouse", tier: "T1" },
  { name: "MongoDB", slug: "mongodb", source: "greenhouse", tier: "T1" },

  // Lever
  { name: "Ramp", slug: "ramp", source: "lever", tier: "T1" },
  { name: "Navan", slug: "navan", source: "lever", tier: "T1" },
  { name: "Rippling", slug: "rippling", source: "lever", tier: "T1" },
  { name: "Mistral", slug: "mistral", source: "lever", tier: "T1" },
  { name: "Cohere", slug: "cohere", source: "lever", tier: "T1" }
];

// ─── PROFILE — your resume keywords ─────────────────────
const PROFILE = {
  highValueKeywords: [
    "payment processing", "tsys", "card origination", "loan servicing",
    "fdic", "kyc", "aml", "cip", "credit card", "lending",
    "fraud", "pci-dss", "pci dss", "regulated", "compliance",
    "bank sweep", "aum", "billing", "collections",
    "fintech", "wealth management", "advisor", "household",
    "checkout", "settlement", "authorization",
    "issuing", "acquiring", "payment infrastructure",
    "financial infrastructure", "card program"
  ],
  mediumValueKeywords: [
    "ai platform", "ml", "machine learning", "llm",
    "platform", "api", "microservices", "azure", "aws",
    "consumer", "member", "0 to 1", "0-to-1",
    "agile", "scrum", "roadmap", "stakeholder",
    "saas", "b2b", "enterprise"
  ],
  targetTitles: [
    "senior product manager", "staff product manager",
    "principal product manager", "group product manager",
    "lead product manager", "director, product",
    "director of product", "senior pm", "staff pm",
    "principal pm", "head of product"
  ],
  excludeKeywords: [
    "intern", "associate product manager", "apm",
    "marketing manager", "program manager",
    "engineering manager", "product marketing",
    "designer", "tpm", "technical program"
  ]
};

// ─── CONFIG ───────────────────────────────────────────────
const DAYS_BACK = 4;        // Only roles posted in last 4 days
const MIN_MATCH = 80;       // Only show very close matches

// ─── FETCH HELPERS ────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0 jobs-fetcher/3.0' },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function fetchGreenhouse(slug) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
  const data = await fetchJson(url);
  return data?.jobs || [];
}

async function fetchLever(slug) {
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
  const data = await fetchJson(url);
  return Array.isArray(data) ? data : [];
}

function normalizeGreenhouse(job, company) {
  return {
    id: `gh-${company.slug}-${job.id}`,
    title: job.title || "",
    company: company.name,
    tier: company.tier,
    location: job.location?.name || "Remote",
    url: job.absolute_url || "",
    description: stripHtml(job.content || ""),
    posted: job.updated_at || job.created_at || new Date().toISOString(),
    source: "Greenhouse",
    department: job.departments?.[0]?.name || ""
  };
}

function normalizeLever(job, company) {
  return {
    id: `lv-${company.slug}-${job.id}`,
    title: job.text || "",
    company: company.name,
    tier: company.tier,
    location: job.categories?.location || "Remote",
    url: job.hostedUrl || job.applyUrl || "",
    description: stripHtml(job.descriptionPlain || job.description || ""),
    posted: job.createdAt ? new Date(job.createdAt).toISOString() : new Date().toISOString(),
    source: "Lever",
    department: job.categories?.team || job.categories?.department || ""
  };
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 1000);
}

function isPMRole(job) {
  const text = (job.title + " " + job.department).toLowerCase();
  const hasTargetTitle = PROFILE.targetTitles.some(t => text.includes(t));
  if (!hasTargetTitle) return false;
  const titleLower = job.title.toLowerCase();
  const hasExcluded = PROFILE.excludeKeywords.some(k => titleLower.includes(k));
  if (hasExcluded) return false;
  return true;
}

function isRecent(job, daysBack) {
  const posted = new Date(job.posted);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  return posted >= cutoff;
}

function scoreMatch(job) {
  const text = (job.title + " " + job.description).toLowerCase();
  let score = 40; // lower baseline so only real matches break 80

  // High-value keyword matches (+6 each, max +40)
  let highHits = 0;
  for (const kw of PROFILE.highValueKeywords) {
    if (text.includes(kw.toLowerCase())) highHits++;
  }
  score += Math.min(highHits * 6, 40);

  // Medium-value matches (+2 each, max +10)
  let medHits = 0;
  for (const kw of PROFILE.mediumValueKeywords) {
    if (text.includes(kw.toLowerCase())) medHits++;
  }
  score += Math.min(medHits * 2, 10);

  // Title-level signals
  const t = job.title.toLowerCase();
  if (t.includes("senior product manager")) score += 4;
  if (t.includes("staff") || t.includes("principal")) score += 6;
  if (t.includes("payment") || t.includes("fintech") || t.includes("lending") ||
      t.includes("servicing") || t.includes("card") || t.includes("financial")) score += 6;

  return Math.min(score, 99);
}

function extractTags(job) {
  const text = (job.title + " " + job.description).toLowerCase();
  const tags = new Set();
  const tagMap = {
    "Payments": ["payment", "tsys", "settlement", "authorization"],
    "Lending": ["lending", "loan", "credit"],
    "Cards": ["card origination", "credit card", "debit", "issuing"],
    "Servicing": ["servicing", "collections"],
    "Fraud": ["fraud", "risk"],
    "AI/ML": ["ai ", "ml ", "machine learning", "llm"],
    "Platform": ["platform", "infrastructure", "api"],
    "Regulated": ["fdic", "kyc", "aml", "compliance", "pci"],
    "Consumer": ["consumer", "member"],
    "B2B": ["b2b", "enterprise"]
  };
  for (const [tag, keywords] of Object.entries(tagMap)) {
    if (keywords.some(k => text.includes(k))) tags.add(tag);
  }
  return Array.from(tags).slice(0, 4);
}

function dedupeByTitle(jobs) {
  const seen = new Map();
  for (const job of jobs) {
    const key = `${job.company}::${job.title.toLowerCase().trim()}`;
    if (!seen.has(key)) {
      seen.set(key, job);
    } else {
      const existing = seen.get(key);
      if (!existing.location.includes(job.location)) {
        existing.location = `${existing.location} / ${job.location}`;
      }
    }
  }
  return Array.from(seen.values());
}

async function main() {
  console.log(`🎯 SURGICAL MODE — ${new Date().toISOString()}`);
  console.log(`   Window: last ${DAYS_BACK} days`);
  console.log(`   Match threshold: ${MIN_MATCH}%+`);
  console.log(`   Companies: ${COMPANIES.length} T1 only`);
  console.log("");

  const allJobs = [];

  for (const company of COMPANIES) {
    try {
      let raw = [];
      if (company.source === "greenhouse") {
        raw = await fetchGreenhouse(company.slug);
      } else if (company.source === "lever") {
        raw = await fetchLever(company.slug);
      }

      const normalized = raw.map(j =>
        company.source === "greenhouse"
          ? normalizeGreenhouse(j, company)
          : normalizeLever(j, company)
      );

      const filtered = normalized
        .filter(isPMRole)
        .filter(j => isRecent(j, DAYS_BACK))
        .map(j => ({
          ...j,
          match: scoreMatch(j),
          tags: extractTags(j),
          status: "new"
        }))
        .filter(j => j.match >= MIN_MATCH);

      if (filtered.length > 0) {
        console.log(`  ✅ ${company.name}: ${filtered.length} high-match role(s)`);
      }
      allJobs.push(...filtered);

    } catch (err) {
      // Silent skip
    }
  }

  const deduped = dedupeByTitle(allJobs);
  deduped.sort((a, b) => b.match - a.match);

  const output = {
    lastUpdated: new Date().toISOString(),
    config: {
      daysBack: DAYS_BACK,
      minMatch: MIN_MATCH,
      tierFilter: "T1 only",
      companyCount: COMPANIES.length
    },
    totalJobs: deduped.length,
    highMatchJobs: deduped.filter(j => j.match >= 90).length,
    jobs: deduped
  };

  fs.writeFileSync('jobs.json', JSON.stringify(output, null, 2));
  console.log(`\n🎯 FINAL: ${deduped.length} T1 roles in last ${DAYS_BACK} days at ${MIN_MATCH}%+ match`);
  console.log(`   ${output.highMatchJobs} are 90%+ — apply to these first`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
