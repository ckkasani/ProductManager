// Job Fetcher — Pulls from Greenhouse + Lever public APIs
// Filters: Senior/Staff/Principal PM roles in fintech posted in last 7 days
// Match-scores against Chaitanya's resume keywords
// Writes to jobs.json

const fs = require('fs');
const https = require('https');

// ─── TARGET COMPANIES ────────────────────────────────────
// Format: { name, slug, source }
// Greenhouse slugs: boards-api.greenhouse.io/v1/boards/{slug}/jobs
// Lever slugs: api.lever.co/v0/postings/{slug}?mode=json

const COMPANIES = [
  // Greenhouse
  { name: "SoFi", slug: "sofi", source: "greenhouse" },
  { name: "Robinhood", slug: "robinhood", source: "greenhouse" },
  { name: "Plaid", slug: "plaid", source: "greenhouse" },
  { name: "Brex", slug: "brex", source: "greenhouse" },
  { name: "Mercury", slug: "mercury", source: "greenhouse" },
  { name: "Coinbase", slug: "coinbase", source: "greenhouse" },
  { name: "Stripe", slug: "stripe", source: "greenhouse" },
  { name: "Anthropic", slug: "anthropic", source: "greenhouse" },
  { name: "Adyen", slug: "adyen", source: "greenhouse" },
  { name: "Marqeta", slug: "marqeta", source: "greenhouse" },
  { name: "Block (Square)", slug: "square", source: "greenhouse" },
  { name: "Affirm", slug: "affirm", source: "greenhouse" },
  { name: "Klarna", slug: "klarna", source: "greenhouse" },
  { name: "Wise", slug: "wise", source: "greenhouse" },
  { name: "Databricks", slug: "databricks", source: "greenhouse" },
  { name: "Snowflake", slug: "snowflake", source: "greenhouse" },

  // Lever
  { name: "Ramp", slug: "ramp", source: "lever" },
  { name: "Navan", slug: "navan", source: "lever" },
  { name: "Rippling", slug: "rippling", source: "lever" },
  { name: "Mistral", slug: "mistral", source: "lever" },
  { name: "Cohere", slug: "cohere", source: "lever" }
];

// ─── YOUR PROFILE ─────────────────────────────────────────
// Keywords that should boost match scores
const PROFILE = {
  highValueKeywords: [
    "payment processing", "TSYS", "card origination", "loan servicing",
    "FDIC", "KYC", "AML", "CIP", "credit card", "lending",
    "fraud", "PCI-DSS", "regulated", "compliance",
    "bank sweep", "AUM", "billing", "collections",
    "fintech", "wealth management", "advisor", "household"
  ],
  mediumValueKeywords: [
    "AI platform", "ML", "machine learning", "LLM",
    "platform", "API", "microservices", "Azure", "AWS",
    "consumer", "member", "0 to 1", "0-to-1",
    "agile", "scrum", "roadmap", "stakeholder"
  ],
  targetTitles: [
    "senior product manager", "staff product manager",
    "principal product manager", "group product manager",
    "lead product manager", "director, product",
    "senior pm", "staff pm", "principal pm"
  ],
  excludeKeywords: [
    "intern", "associate product manager", "apm",
    "marketing manager", "program manager",
    "engineering manager", "product marketing"
  ]
};

// ─── FETCH HELPERS ────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'job-fetcher/1.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
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

// ─── NORMALIZE JOB FORMAT ─────────────────────────────────
function normalizeGreenhouse(job, company) {
  return {
    id: `gh-${company.slug}-${job.id}`,
    title: job.title || "",
    company: company.name,
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
    .substring(0, 800);
}

// ─── FILTERING ────────────────────────────────────────────
function isPMRole(job) {
  const text = (job.title + " " + job.department).toLowerCase();

  // Must include a target title
  const hasTargetTitle = PROFILE.targetTitles.some(t => text.includes(t));
  if (!hasTargetTitle) return false;

  // Must NOT include excluded keywords (in title only)
  const titleLower = job.title.toLowerCase();
  const hasExcluded = PROFILE.excludeKeywords.some(k => titleLower.includes(k));
  if (hasExcluded) return false;

  return true;
}

function isRecent(job, daysBack = 7) {
  const posted = new Date(job.posted);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  return posted >= cutoff;
}

// ─── MATCH SCORING ────────────────────────────────────────
function scoreMatch(job) {
  const text = (job.title + " " + job.description).toLowerCase();
  let score = 50; // baseline

  // High-value keyword matches (+5 each, max +35)
  let highHits = 0;
  for (const kw of PROFILE.highValueKeywords) {
    if (text.includes(kw.toLowerCase())) highHits++;
  }
  score += Math.min(highHits * 5, 35);

  // Medium-value keyword matches (+2 each, max +10)
  let medHits = 0;
  for (const kw of PROFILE.mediumValueKeywords) {
    if (text.includes(kw.toLowerCase())) medHits++;
  }
  score += Math.min(medHits * 2, 10);

  // Title-level boosts
  const t = job.title.toLowerCase();
  if (t.includes("senior product manager")) score += 5;
  if (t.includes("principal") || t.includes("staff")) score += 3;
  if (t.includes("fintech") || t.includes("payment") || t.includes("lending") ||
      t.includes("servicing") || t.includes("card")) score += 5;

  return Math.min(score, 99);
}

function extractTags(job) {
  const text = (job.title + " " + job.description).toLowerCase();
  const tags = new Set();

  const tagMap = {
    "Payments": ["payment", "tsys"],
    "Lending": ["lending", "loan", "credit"],
    "Cards": ["card origination", "credit card", "debit"],
    "Servicing": ["servicing", "collections"],
    "Fraud": ["fraud", "risk"],
    "AI/ML": ["ai", "ml", "machine learning", "llm"],
    "Platform": ["platform", "infrastructure"],
    "Regulated": ["fdic", "kyc", "aml", "compliance", "pci"],
    "Consumer": ["consumer", "member"],
    "B2B": ["b2b", "enterprise"]
  };

  for (const [tag, keywords] of Object.entries(tagMap)) {
    if (keywords.some(k => text.includes(k))) tags.add(tag);
  }

  return Array.from(tags).slice(0, 4);
}

// ─── MAIN ─────────────────────────────────────────────────
async function main() {
  console.log(`🚀 Fetching jobs at ${new Date().toISOString()}`);
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
        .filter(j => isRecent(j, 7))
        .map(j => ({
          ...j,
          match: scoreMatch(j),
          tags: extractTags(j),
          status: "new"
        }))
        .filter(j => j.match >= 60); // minimum threshold

      console.log(`  ${company.name}: ${filtered.length} matching roles`);
      allJobs.push(...filtered);

    } catch (err) {
      console.log(`  ${company.name}: error — ${err.message}`);
    }
  }

  // Sort by match score descending
  allJobs.sort((a, b) => b.match - a.match);

  const output = {
    lastUpdated: new Date().toISOString(),
    totalJobs: allJobs.length,
    highMatchJobs: allJobs.filter(j => j.match >= 85).length,
    jobs: allJobs
  };

  fs.writeFileSync('jobs.json', JSON.stringify(output, null, 2));
  console.log(`\n✅ Wrote ${allJobs.length} jobs to jobs.json`);
  console.log(`   ${output.highMatchJobs} high-match (85+) roles found`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
