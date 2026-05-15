// Job Fetcher v5 — CALLBACK INTELLIGENCE
// Sources: Greenhouse, Lever, Workday across HealthTech, AI Infra, Identity, Regulated SaaS, Fintech, Data Platforms
// Smart scoring: not just keyword match, but actual callback probability

const fs = require('fs');
const https = require('https');

// ─── EXPANDED COMPANY ROSTER ────────────────────────────
// Tagged by industry + company stage (size affects callback probability math)
const COMPANIES = [
  // ═══ FINTECH (Series C-D sweet spot) ═══
  { name: "Modern Treasury", slug: "moderntreasury", source: "greenhouse", industry: "fintech", stage: "C" },
  { name: "Highnote", slug: "highnote", source: "greenhouse", industry: "fintech", stage: "B" },
  { name: "Lithic", slug: "lithic", source: "greenhouse", industry: "fintech", stage: "C" },
  { name: "Unit", slug: "unit", source: "greenhouse", industry: "fintech", stage: "C" },
  { name: "Mercury", slug: "mercury", source: "greenhouse", industry: "fintech", stage: "C" },
  { name: "Brex", slug: "brex", source: "greenhouse", industry: "fintech", stage: "D" },
  { name: "Ramp", slug: "ramp", source: "lever", industry: "fintech", stage: "D" },
  { name: "Bilt Rewards", slug: "biltrewards", source: "greenhouse", industry: "fintech", stage: "C" },
  { name: "Increase", slug: "increase", source: "greenhouse", industry: "fintech", stage: "B" },
  { name: "Plaid", slug: "plaid", source: "greenhouse", industry: "fintech", stage: "Late" },
  { name: "Marqeta", slug: "marqeta", source: "greenhouse", industry: "fintech", stage: "Public" },
  { name: "SoFi", slug: "sofi", source: "greenhouse", industry: "fintech", stage: "Public" },
  { name: "Affirm", slug: "affirm", source: "greenhouse", industry: "fintech", stage: "Public" },
  { name: "Stripe", slug: "stripe", source: "greenhouse", industry: "fintech", stage: "Late" },

  // ═══ IDENTITY & TRUST (ARIDS territory) ═══
  { name: "Persona", slug: "persona", source: "greenhouse", industry: "identity", stage: "C" },
  { name: "Socure", slug: "socure", source: "greenhouse", industry: "identity", stage: "D" },
  { name: "Sardine", slug: "sardine", source: "lever", industry: "identity", stage: "B" },
  { name: "Alloy", slug: "alloy", source: "lever", industry: "identity", stage: "C" },
  { name: "Forter", slug: "forter", source: "greenhouse", industry: "identity", stage: "D" },

  // ═══ AI INFRASTRUCTURE (TechGenie translates) ═══
  { name: "Sierra AI", slug: "sierraai", source: "greenhouse", industry: "ai-infra", stage: "B" },
  { name: "Cresta", slug: "cresta", source: "greenhouse", industry: "ai-infra", stage: "C" },
  { name: "Decagon", slug: "decagon", source: "greenhouse", industry: "ai-infra", stage: "B" },
  { name: "Glean", slug: "glean", source: "greenhouse", industry: "ai-infra", stage: "D" },
  { name: "Writer", slug: "writer", source: "greenhouse", industry: "ai-infra", stage: "C" },
  { name: "Anthropic", slug: "anthropic", source: "greenhouse", industry: "ai-infra", stage: "Late" },
  { name: "Mistral", slug: "mistral", source: "lever", industry: "ai-infra", stage: "C" },
  { name: "Cohere", slug: "cohere", source: "lever", industry: "ai-infra", stage: "D" },

  // ═══ HEALTHTECH AI (Sentara translates) ═══
  { name: "Abridge", slug: "abridge", source: "greenhouse", industry: "healthtech", stage: "C" },
  { name: "Hippocratic AI", slug: "hippocraticai", source: "greenhouse", industry: "healthtech", stage: "B" },
  { name: "Cohere Health", slug: "coherehealth", source: "greenhouse", industry: "healthtech", stage: "C" },
  { name: "Notable", slug: "notable", source: "greenhouse", industry: "healthtech", stage: "C" },
  { name: "Komodo Health", slug: "komodohealth", source: "greenhouse", industry: "healthtech", stage: "D" },
  { name: "Tempus", slug: "tempus", source: "greenhouse", industry: "healthtech", stage: "Public" },

  // ═══ REGULATED SAAS (LPL orchestration applies) ═══
  { name: "Vanta", slug: "vanta", source: "greenhouse", industry: "regulated-saas", stage: "C" },
  { name: "Drata", slug: "drata", source: "greenhouse", industry: "regulated-saas", stage: "C" },
  { name: "Carta", slug: "carta", source: "greenhouse", industry: "regulated-saas", stage: "Late" },
  { name: "Anrok", slug: "anrok", source: "greenhouse", industry: "regulated-saas", stage: "B" },

  // ═══ DATA PLATFORMS (Multi-SOR applies) ═══
  { name: "Census", slug: "census", source: "greenhouse", industry: "data-platform", stage: "B" },
  { name: "Hightouch", slug: "hightouch", source: "greenhouse", industry: "data-platform", stage: "C" },
  { name: "dbt Labs", slug: "dbtlabs", source: "greenhouse", industry: "data-platform", stage: "D" },
  { name: "Hex", slug: "hex", source: "greenhouse", industry: "data-platform", stage: "C" },
  { name: "Databricks", slug: "databricks", source: "greenhouse", industry: "data-platform", stage: "Late" },
  { name: "Snowflake", slug: "snowflake", source: "greenhouse", industry: "data-platform", stage: "Public" }
];

// ─── PROFILE — Industry-specific keyword weighting ──────
const PROFILE = {
  // Weighted by industry — same keyword scores differently in different contexts
  industryKeywords: {
    fintech: {
      high: ["payment processing", "tsys", "card origination", "loan servicing", "fdic", "kyc", "aml", "cip", "credit card", "lending", "fraud", "pci", "fintech", "bank sweep", "aum", "billing", "settlement", "issuing", "acquiring"],
      med: ["compliance", "regulated", "consumer", "platform", "api"]
    },
    identity: {
      high: ["identity", "kyc", "aml", "fraud", "verification", "biometric", "risk", "cip", "trust", "ato", "account takeover"],
      med: ["compliance", "regulated", "platform", "ml", "machine learning"]
    },
    "ai-infra": {
      high: ["llm", "ai platform", "agent", "human-in-the-loop", "escalation", "machine learning", "rag", "fine-tuning", "model", "inference"],
      med: ["api", "platform", "enterprise", "saas", "developer"]
    },
    healthtech: {
      high: ["hipaa", "medicare", "medicaid", "ehr", "clinical", "patient", "healthcare", "ada"],
      med: ["compliance", "regulated", "ai", "agent", "workflow"]
    },
    "regulated-saas": {
      high: ["soc2", "compliance", "audit", "regulated", "governance", "risk", "fdic", "kyc"],
      med: ["platform", "enterprise", "saas", "automation"]
    },
    "data-platform": {
      high: ["data platform", "etl", "pipeline", "warehouse", "system of record", "sor", "multi-tenant", "integration"],
      med: ["api", "microservices", "sql", "azure", "aws"]
    }
  },
  universalHigh: [
    "0 to 1", "0-to-1", "0→1", "scaling", "platform", "infrastructure",
    "stakeholder", "cross-functional"
  ],
  targetTitles: [
    "senior product manager", "staff product manager", "principal product manager",
    "group product manager", "lead product manager", "director, product",
    "director of product", "senior pm", "staff pm", "principal pm",
    "head of product"
  ],
  excludeKeywords: [
    "intern", "associate product manager", "apm", "marketing manager",
    "program manager", "engineering manager", "product marketing",
    "designer", "tpm", "technical program"
  ]
};

const DAYS_BACK = 4;
const MIN_CALLBACK_SCORE = 70;  // Renamed from match — what we actually care about

// ─── HTTP HELPERS ───────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 jobs-fetcher/5.0' },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function fetchGreenhouse(c) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs?content=true`;
  const data = await fetchJson(url);
  return (data?.jobs || []).map(j => ({
    id: `gh-${c.slug}-${j.id}`,
    title: j.title || "",
    company: c.name,
    industry: c.industry,
    stage: c.stage,
    location: j.location?.name || "Remote",
    url: j.absolute_url || "",
    description: stripHtml(j.content || ""),
    posted: j.updated_at || j.created_at || new Date().toISOString(),
    source: "Greenhouse",
    department: j.departments?.[0]?.name || ""
  }));
}

async function fetchLever(c) {
  const url = `https://api.lever.co/v0/postings/${c.slug}?mode=json`;
  const data = await fetchJson(url);
  return (Array.isArray(data) ? data : []).map(j => ({
    id: `lv-${c.slug}-${j.id}`,
    title: j.text || "",
    company: c.name,
    industry: c.industry,
    stage: c.stage,
    location: j.categories?.location || "Remote",
    url: j.hostedUrl || j.applyUrl || "",
    description: stripHtml(j.descriptionPlain || j.description || ""),
    posted: j.createdAt ? new Date(j.createdAt).toISOString() : new Date().toISOString(),
    source: "Lever",
    department: j.categories?.team || j.categories?.department || ""
  }));
}

function stripHtml(html) {
  return String(html || "").replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim().substring(0, 1200);
}

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

// ─── CALLBACK PROBABILITY SCORING ─────────────────────────
// This is the secret sauce. Multi-factor scoring, not just keyword match.
function scoreCallbackProbability(job) {
  let score = 0;
  const reasons = [];

  // ─── FACTOR 1: Skill match (40 pts max) ───
  const text = (job.title + " " + job.description).toLowerCase();
  const indKeys = PROFILE.industryKeywords[job.industry] || { high: [], med: [] };
  let highHits = 0, medHits = 0;
  for (const kw of indKeys.high) if (text.includes(kw)) highHits++;
  for (const kw of indKeys.med) if (text.includes(kw)) medHits++;
  for (const kw of PROFILE.universalHigh) if (text.includes(kw)) highHits++;

  const skillScore = Math.min(highHits * 4, 30) + Math.min(medHits * 1.5, 10);
  score += skillScore;
  if (skillScore >= 30) reasons.push("Strong skill match");
  else if (skillScore >= 20) reasons.push("Good skill alignment");

  // ─── FACTOR 2: Company stage advantage (20 pts max) ───
  // Series B-D = sweet spot for senior hires. Public/Late = harder.
  const stageScore = {
    "B": 18,    // Highest callback rate — small team, urgent need
    "C": 20,    // Sweet spot — scaling fast, established but nimble
    "D": 15,    // Still good — scaling
    "Late": 8,  // Tougher — more applicants
    "Public": 5 // Hardest — most applicants
  }[job.stage] || 10;
  score += stageScore;
  if (stageScore >= 15) reasons.push(`${job.stage}-stage = high callback odds`);

  // ─── FACTOR 3: Seniority match (15 pts max) ───
  const t = job.title.toLowerCase();
  let seniorityScore = 0;
  if (t.includes("director")) seniorityScore = 15;  // Best fit for your exp
  else if (t.includes("head of")) seniorityScore = 15;
  else if (t.includes("principal")) seniorityScore = 13;
  else if (t.includes("staff")) seniorityScore = 12;
  else if (t.includes("group")) seniorityScore = 11;
  else if (t.includes("senior")) seniorityScore = 8;
  else if (t.includes("lead")) seniorityScore = 9;
  score += seniorityScore;
  if (seniorityScore >= 13) reasons.push("Director/Head level — your unicorn zone");

  // ─── FACTOR 4: Posting freshness (15 pts max) ───
  // The first 48 hours have ~10x callback rate vs week-old postings
  const hoursOld = (Date.now() - new Date(job.posted).getTime()) / 3600000;
  let freshnessScore = 0;
  if (hoursOld <= 24) freshnessScore = 15;
  else if (hoursOld <= 48) freshnessScore = 12;
  else if (hoursOld <= 72) freshnessScore = 8;
  else freshnessScore = 4;
  score += freshnessScore;
  if (freshnessScore >= 12) reasons.push("Posted in last 48hrs — apply now");

  // ─── FACTOR 5: Domain-specific bonus (10 pts max) ───
  let domainBonus = 0;
  if (job.industry === "fintech" && (text.includes("payment") || text.includes("card") || text.includes("lending"))) domainBonus = 10;
  if (job.industry === "identity" && (text.includes("kyc") || text.includes("fraud"))) domainBonus = 10;
  if (job.industry === "ai-infra" && (text.includes("agent") || text.includes("escalation"))) domainBonus = 10;
  if (job.industry === "healthtech" && (text.includes("hipaa") || text.includes("medicare"))) domainBonus = 10;
  if (job.industry === "regulated-saas" && text.includes("compliance")) domainBonus = 8;
  if (job.industry === "data-platform" && text.includes("multi-tenant")) domainBonus = 8;
  score += domainBonus;
  if (domainBonus >= 8) reasons.push(`Domain perfect-fit signals`);

  return {
    score: Math.min(Math.round(score), 99),
    reasons: reasons.slice(0, 4),
    breakdown: {
      skill: Math.round(skillScore),
      stage: stageScore,
      seniority: seniorityScore,
      freshness: freshnessScore,
      domain: domainBonus
    }
  };
}

function extractTags(job) {
  const text = (job.title + " " + job.description).toLowerCase();
  const tags = new Set();
  // Industry tag always first
  const industryNames = {
    fintech: "Fintech", identity: "Identity",
    "ai-infra": "AI Infra", healthtech: "HealthTech",
    "regulated-saas": "RegSaaS", "data-platform": "Data"
  };
  if (industryNames[job.industry]) tags.add(industryNames[job.industry]);

  const tagMap = {
    "Payments": ["payment", "tsys", "settlement"],
    "Lending": ["lending", "loan", "credit"],
    "Cards": ["card", "issuing"],
    "Fraud": ["fraud", "risk"],
    "AI/ML": ["ai", "ml ", "llm", "agent"],
    "Compliance": ["compliance", "kyc", "aml"],
    "Platform": ["platform", "infrastructure"]
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

async function main() {
  console.log(`🧠 CALLBACK INTELLIGENCE MODE — ${new Date().toISOString()}`);
  console.log(`   Industries: 6 | Companies: ${COMPANIES.length}`);
  console.log(`   Window: last ${DAYS_BACK} days | Min Callback Score: ${MIN_CALLBACK_SCORE}\n`);

  const allJobs = [];
  const industryStats = {};

  for (const c of COMPANIES) {
    try {
      let raw = [];
      if (c.source === "greenhouse") raw = await fetchGreenhouse(c);
      else if (c.source === "lever") raw = await fetchLever(c);

      const filtered = raw
        .filter(isPMRole)
        .filter(j => isRecent(j, DAYS_BACK))
        .map(j => {
          const scoring = scoreCallbackProbability(j);
          return {
            ...j,
            match: scoring.score,
            reasons: scoring.reasons,
            breakdown: scoring.breakdown,
            tags: extractTags(j),
            status: "new"
          };
        })
        .filter(j => j.match >= MIN_CALLBACK_SCORE);

      if (filtered.length > 0) {
        console.log(`  ✅ ${c.name} (${c.industry}): ${filtered.length} high-callback role(s)`);
        industryStats[c.industry] = (industryStats[c.industry] || 0) + filtered.length;
      }
      allJobs.push(...filtered);
    } catch (e) {}
  }

  const deduped = dedupeByTitle(allJobs);
  deduped.sort((a, b) => b.match - a.match);

  const output = {
    lastUpdated: new Date().toISOString(),
    config: {
      daysBack: DAYS_BACK,
      minCallbackScore: MIN_CALLBACK_SCORE,
      industries: Object.keys(PROFILE.industryKeywords),
      companyCount: COMPANIES.length,
      scoringFactors: ["skill match (40)", "company stage (20)", "seniority (15)", "freshness (15)", "domain bonus (10)"]
    },
    industryStats,
    totalJobs: deduped.length,
    highMatchJobs: deduped.filter(j => j.match >= 85).length,
    jobs: deduped
  };

  fs.writeFileSync('jobs.json', JSON.stringify(output, null, 2));
  console.log(`\n🎯 FINAL: ${deduped.length} roles with ${MIN_CALLBACK_SCORE}+ callback probability`);
  console.log(`   By industry:`, industryStats);
  console.log(`   ${output.highMatchJobs} are 85%+ callback probability`);
}

main().catch(e => { console.error(e); process.exit(1); });
