// Job Fetcher v5.1 — DEBUG MODE
// Same scoring as v5, but with relaxed filters so we can see what's actually being found
// Once we see real data, we'll calibrate the final thresholds

const fs = require('fs');
const https = require('https');

// CORE COMPANIES — verified Greenhouse/Lever slugs only
// Removed unverified slugs from v5 (Modern Treasury, Sardine, Sierra etc need to be checked)
const COMPANIES = [
  // Fintech (verified)
  { name: "SoFi", slug: "sofi", source: "greenhouse", industry: "fintech", stage: "Public" },
  { name: "Robinhood", slug: "robinhood", source: "greenhouse", industry: "fintech", stage: "Public" },
  { name: "Plaid", slug: "plaid", source: "greenhouse", industry: "fintech", stage: "Late" },
  { name: "Coinbase", slug: "coinbase", source: "greenhouse", industry: "fintech", stage: "Public" },
  { name: "Block (Square)", slug: "square", source: "greenhouse", industry: "fintech", stage: "Public" },
  { name: "Stripe", slug: "stripe", source: "greenhouse", industry: "fintech", stage: "Late" },
  { name: "Affirm", slug: "affirm", source: "greenhouse", industry: "fintech", stage: "Public" },
  { name: "Klarna", slug: "klarna", source: "greenhouse", industry: "fintech", stage: "Public" },
  { name: "Wise", slug: "wise", source: "greenhouse", industry: "fintech", stage: "Public" },
  { name: "Chime", slug: "chime", source: "greenhouse", industry: "fintech", stage: "Late" },
  { name: "Brex", slug: "brex", source: "greenhouse", industry: "fintech", stage: "D" },
  { name: "Mercury", slug: "mercury", source: "greenhouse", industry: "fintech", stage: "C" },
  { name: "Adyen", slug: "adyen", source: "greenhouse", industry: "fintech", stage: "Public" },
  { name: "Marqeta", slug: "marqeta", source: "greenhouse", industry: "fintech", stage: "Public" },
  { name: "Bilt Rewards", slug: "biltrewards", source: "greenhouse", industry: "fintech", stage: "C" },

  // AI Infra (verified)
  { name: "Anthropic", slug: "anthropic", source: "greenhouse", industry: "ai-infra", stage: "Late" },
  { name: "Databricks", slug: "databricks", source: "greenhouse", industry: "data-platform", stage: "Late" },
  { name: "Snowflake", slug: "snowflake", source: "greenhouse", industry: "data-platform", stage: "Public" },

  // Lever (verified)
  { name: "Ramp", slug: "ramp", source: "lever", industry: "fintech", stage: "D" },
  { name: "Navan", slug: "navan", source: "lever", industry: "fintech", stage: "Late" },
  { name: "Rippling", slug: "rippling", source: "lever", industry: "saas", stage: "Late" },
  { name: "Mistral", slug: "mistral", source: "lever", industry: "ai-infra", stage: "C" },
  { name: "Cohere", slug: "cohere", source: "lever", industry: "ai-infra", stage: "D" }
];

// ─── PROFILE ─────────────────────────────────────────────
const PROFILE = {
  industryKeywords: {
    fintech: {
      high: ["payment processing", "tsys", "card origination", "loan servicing", "fdic", "kyc", "aml", "cip", "credit card", "lending", "fraud", "pci", "fintech", "bank sweep", "aum", "billing", "settlement", "issuing", "acquiring"],
      med: ["compliance", "regulated", "consumer", "platform", "api"]
    },
    identity: {
      high: ["identity", "kyc", "aml", "fraud", "verification", "biometric", "risk", "cip", "trust", "ato"],
      med: ["compliance", "regulated", "platform", "ml"]
    },
    "ai-infra": {
      high: ["llm", "ai platform", "agent", "human-in-the-loop", "escalation", "machine learning", "rag", "model"],
      med: ["api", "platform", "enterprise", "saas", "developer"]
    },
    healthtech: {
      high: ["hipaa", "medicare", "medicaid", "ehr", "clinical", "patient", "healthcare"],
      med: ["compliance", "regulated", "ai", "agent", "workflow"]
    },
    saas: {
      high: ["soc2", "compliance", "audit", "regulated", "governance"],
      med: ["platform", "enterprise", "saas", "automation"]
    },
    "data-platform": {
      high: ["data platform", "etl", "pipeline", "warehouse", "system of record", "sor"],
      med: ["api", "microservices", "sql", "azure", "aws"]
    }
  },
  universalHigh: ["0 to 1", "0-to-1", "scaling", "platform", "stakeholder", "cross-functional"],
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

// ─── DEBUG MODE: LOOSE FILTERS ──────────────────────────
const DAYS_BACK = 14;          // 14 days instead of 4 (debug)
const MIN_CALLBACK_SCORE = 50; // 50 instead of 70 (debug)

function fetchJson(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 jobs-fetcher/5.1' },
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
  if (!data) return { error: "API failed or 404", jobs: [] };
  return { error: null, jobs: (data?.jobs || []).map(j => ({
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
  })) };
}

async function fetchLever(c) {
  const url = `https://api.lever.co/v0/postings/${c.slug}?mode=json`;
  const data = await fetchJson(url);
  if (!Array.isArray(data)) return { error: "API failed or 404", jobs: [] };
  return { error: null, jobs: data.map(j => ({
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
  })) };
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

function scoreCallbackProbability(job) {
  let score = 0;
  const reasons = [];

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

  const stageScore = { "B": 18, "C": 20, "D": 15, "Late": 8, "Public": 5 }[job.stage] || 10;
  score += stageScore;
  if (stageScore >= 15) reasons.push(`${job.stage}-stage = high callback odds`);

  const t = job.title.toLowerCase();
  let seniorityScore = 0;
  if (t.includes("director")) seniorityScore = 15;
  else if (t.includes("head of")) seniorityScore = 15;
  else if (t.includes("principal")) seniorityScore = 13;
  else if (t.includes("staff")) seniorityScore = 12;
  else if (t.includes("group")) seniorityScore = 11;
  else if (t.includes("senior")) seniorityScore = 8;
  else if (t.includes("lead")) seniorityScore = 9;
  score += seniorityScore;
  if (seniorityScore >= 13) reasons.push("Director/Head level — unicorn zone");

  const hoursOld = (Date.now() - new Date(job.posted).getTime()) / 3600000;
  let freshnessScore = hoursOld <= 24 ? 15 : hoursOld <= 48 ? 12 : hoursOld <= 72 ? 8 : 4;
  score += freshnessScore;
  if (freshnessScore >= 12) reasons.push("Fresh — apply now");

  let domainBonus = 0;
  if (job.industry === "fintech" && (text.includes("payment") || text.includes("card") || text.includes("lending"))) domainBonus = 10;
  if (job.industry === "identity" && (text.includes("kyc") || text.includes("fraud"))) domainBonus = 10;
  if (job.industry === "ai-infra" && (text.includes("agent") || text.includes("escalation"))) domainBonus = 10;
  if (job.industry === "healthtech" && (text.includes("hipaa") || text.includes("medicare"))) domainBonus = 10;
  score += domainBonus;
  if (domainBonus >= 8) reasons.push("Domain perfect-fit signals");

  return { score: Math.min(Math.round(score), 99), reasons: reasons.slice(0, 4) };
}

function extractTags(job) {
  const text = (job.title + " " + job.description).toLowerCase();
  const tags = new Set();
  const industryNames = {
    fintech: "Fintech", identity: "Identity", "ai-infra": "AI Infra",
    healthtech: "HealthTech", saas: "SaaS", "data-platform": "Data"
  };
  if (industryNames[job.industry]) tags.add(industryNames[job.industry]);

  const tagMap = {
    "Payments": ["payment", "tsys"], "Lending": ["lending", "loan"],
    "Cards": ["card", "issuing"], "Fraud": ["fraud", "risk"],
    "AI/ML": ["ai", "ml ", "llm"], "Compliance": ["compliance", "kyc"],
    "Platform": ["platform"]
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
  console.log(`🔍 DEBUG MODE — ${new Date().toISOString()}`);
  console.log(`   Window: ${DAYS_BACK} days | Min Score: ${MIN_CALLBACK_SCORE}`);
  console.log(`   Companies: ${COMPANIES.length}\n`);

  const allJobs = [];
  const debugLog = {};

  for (const c of COMPANIES) {
    try {
      let result;
      if (c.source === "greenhouse") result = await fetchGreenhouse(c);
      else if (c.source === "lever") result = await fetchLever(c);

      if (result.error) {
        debugLog[c.name] = { error: result.error, count: 0 };
        console.log(`  ❌ ${c.name}: ${result.error}`);
        continue;
      }

      const raw = result.jobs;
      const pmRoles = raw.filter(isPMRole);
      const recentPM = pmRoles.filter(j => isRecent(j, DAYS_BACK));
      const scored = recentPM.map(j => {
        const s = scoreCallbackProbability(j);
        return { ...j, match: s.score, reasons: s.reasons, tags: extractTags(j), status: "new" };
      });
      const passing = scored.filter(j => j.match >= MIN_CALLBACK_SCORE);

      debugLog[c.name] = {
        totalJobs: raw.length,
        pmRoles: pmRoles.length,
        recentPMRoles: recentPM.length,
        passingScore: passing.length
      };

      if (passing.length > 0) {
        console.log(`  ✅ ${c.name}: ${raw.length} total → ${pmRoles.length} PM → ${recentPM.length} recent → ${passing.length} passing`);
      } else if (recentPM.length > 0) {
        console.log(`  ⚠️  ${c.name}: ${recentPM.length} recent PM roles found but none scored ${MIN_CALLBACK_SCORE}+`);
      } else if (pmRoles.length > 0) {
        console.log(`  💤 ${c.name}: ${pmRoles.length} PM roles exist but none in last ${DAYS_BACK} days`);
      } else {
        console.log(`  ⚪ ${c.name}: ${raw.length} total jobs, 0 match PM filter`);
      }
      allJobs.push(...passing);
    } catch (e) {
      console.log(`  💥 ${c.name}: exception - ${e.message}`);
    }
  }

  const deduped = dedupeByTitle(allJobs);
  deduped.sort((a, b) => b.match - a.match);

  const output = {
    lastUpdated: new Date().toISOString(),
    config: { daysBack: DAYS_BACK, minCallbackScore: MIN_CALLBACK_SCORE, debugMode: true },
    debugLog,
    totalJobs: deduped.length,
    highMatchJobs: deduped.filter(j => j.match >= 80).length,
    jobs: deduped
  };

  fs.writeFileSync('jobs.json', JSON.stringify(output, null, 2));
  console.log(`\n📊 FINAL: ${deduped.length} jobs found`);
  console.log(`   ${output.highMatchJobs} at 80%+ callback score`);
  console.log(`\n💡 Check the GitHub Actions log to see per-company breakdown.`);
  console.log(`   This tells us exactly where to tune.`);
}

main().catch(e => { console.error(e); process.exit(1); });
