/**
 * Generate a strictly-one-page, professionally-typeset PDF resume.
 *
 * The "must be one page" guarantee is enforced by THREE complementary
 * mechanisms in order of strength:
 *
 *   1. Carefully-tuned static layout (typography, margins, spacing) so the
 *      default content fits without any reductions.
 *   2. An iterative fit loop that drops content in priority order if the
 *      rendered DOM ever overflows the printable area.
 *   3. A final pdf-lib assertion that opens the generated PDF and throws if
 *      `pages.length !== 1`. This is the hard contract.
 *
 * If ALL drop strategies are exhausted and the content still overflows, the
 * generator throws with a clear diagnostic. The build never silently produces
 * a 2-page resume.
 */
import { mkdir, readFile } from "node:fs/promises";
import { chromium, type Page } from "playwright";
import { PDFDocument } from "pdf-lib";

import { CONTENT } from "./content/content";
import { TOPIC_TO_NAME, type Topic } from "./content/topic";
import { projectToLinkHref, type Project as PortfolioProject } from "./content/project";
import { formatPhoneNumber } from "./library/phone-number";
import { RESUME_FILENAME } from "./constants/resume";

// ---------------------------------------------------------------------------
// Page math
// ---------------------------------------------------------------------------

const DPI = 96;
const PAGE_WIDTH_IN = 8.5;
const PAGE_HEIGHT_IN = 11;
const MARGIN_TOP_IN = 0.5;
const MARGIN_BOTTOM_IN = 0.5;
const MARGIN_SIDE_IN = 0.6;

const CONTENT_WIDTH_PX = Math.round((PAGE_WIDTH_IN - MARGIN_SIDE_IN * 2) * DPI);
const CONTENT_HEIGHT_PX = Math.round((PAGE_HEIGHT_IN - MARGIN_TOP_IN - MARGIN_BOTTOM_IN) * DPI);

const ACCENT = "#0b6bcb"; // matches THEME.colors.primary500 but as a plain hex for portability
const RULE_COLOR = "#d4d8dc";
const TEXT_PRIMARY = "#0f1419";
const TEXT_SECONDARY = "#4a5159";
const TEXT_MUTED = "#6c727a";
const LOCATION = "Phoenix, AZ";

// ---------------------------------------------------------------------------
// Content shape
// ---------------------------------------------------------------------------

type Identity = {
  readonly name: string;
  readonly title: string;
  readonly location: string;
  readonly email: string;
  readonly phone: string;
  readonly website: string;
  readonly githubDisplay: string;
  readonly githubUrl: string;
  readonly linkedinDisplay: string;
  readonly linkedinUrl: string;
};

type Experience = {
  readonly company: string;
  readonly jobTitle: string;
  readonly dateRange: string;
  readonly description: string;
  readonly url: string | null;
};

type Project = {
  readonly title: string;
  readonly description: string | null;
  readonly url: string | null;
  readonly topics: readonly string[];
};

type SkillRow = {
  readonly category: string;
  readonly items: readonly string[];
};

type Education = {
  readonly degree: string;
  readonly institution: string;
  readonly dateRange: string;
};

type ResumeContent = {
  readonly identity: Identity;
  /** Sentences (joined with a space). Drop from the end if too long. */
  summary: string[];
  /** Always shown in full (work history is non-negotiable). */
  experience: Experience[];
  /** Drop from the end (least important last). */
  projects: Project[];
  /** Drop categories from the end if needed. */
  skills: SkillRow[];
  education: Education[];
};

// ---------------------------------------------------------------------------
// Topic → Skill category
// ---------------------------------------------------------------------------

const TOPIC_CATEGORY: Partial<Record<Topic, "Languages" | "Frontend" | "Backend" | "Data" | "Cloud & Infra">> = {
  // Languages
  typescript: "Languages",
  javascript: "Languages",
  python: "Languages",
  rust: "Languages",
  go: "Languages",
  php: "Languages",
  html: "Languages",
  css: "Languages",
  elm: "Languages",
  roc: "Languages",
  // Frontend
  react: "Frontend",
  nextjs: "Frontend",
  vue: "Frontend",
  nuxt: "Frontend",
  tailwind: "Frontend",
  redux: "Frontend",
  "redux-saga": "Frontend",
  "react-query": "Frontend",
  "material-ui": "Frontend",
  bootstrap: "Frontend",
  greensock: "Frontend",
  rxjs: "Frontend",
  alphinejs: "Frontend",
  htmx: "Frontend",
  datastar: "Frontend",
  gridsome: "Frontend",
  // Backend
  nodejs: "Backend",
  bun: "Backend",
  express: "Backend",
  flask: "Backend",
  graphene: "Backend",
  graphql: "Backend",
  trpc: "Backend",
  websocket: "Backend",
  "socket-io": "Backend",
  zod: "Backend",
  // Data
  postgres: "Data",
  mongodb: "Data",
  mysql: "Data",
  dynamodb: "Data",
  sqlite: "Data",
  firebase: "Data",
  supabase: "Data",
  neo4j: "Data",
  // Cloud & infra
  aws: "Cloud & Infra",
  s3: "Cloud & Infra",
  vercel: "Cloud & Infra",
  heroku: "Cloud & Infra",
  docker: "Cloud & Infra",
  // Skipped on purpose: shopify, sanity, drupal, salesforce, jest, puppeteer, ramda
};

const CATEGORY_ORDER: readonly SkillRow["category"][] = [
  "Languages",
  "Frontend",
  "Backend",
  "Data",
  "Cloud & Infra",
];

function buildSkillRows(topics: readonly string[]): SkillRow[] {
  const buckets = new Map<string, Set<string>>();
  for (const topic of topics) {
    const cat = TOPIC_CATEGORY[topic as Topic];
    if (!cat) continue;
    const display = TOPIC_TO_NAME[topic as Topic] ?? topic;
    if (!buckets.has(cat)) buckets.set(cat, new Set());
    buckets.get(cat)!.add(display);
  }
  const rows: SkillRow[] = [];
  for (const cat of CATEGORY_ORDER) {
    const set = buckets.get(cat);
    if (!set || set.size === 0) continue;
    rows.push({ category: cat, items: [...set].sort((a, b) => a.localeCompare(b)) });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Content assembly
// ---------------------------------------------------------------------------

const stripHtml = (s: string): string => s.replace(/<[^>]*>/g, "").trim();

const formatDateRange = (start: number, end: number | "Present"): string =>
  end === "Present" ? `${start} – Present` : `${start} – ${end}`;

const trimSentence = (s: string): string => s.trim().replace(/\.$/, "");

function buildResumeContent(): ResumeContent {
  const fullSummary = stripHtml(CONTENT.ABOUT_ME);
  const summarySentences = fullSummary
    .split(/[.!?]+/)
    .map(trimSentence)
    .filter((s) => s.length > 0)
    .slice(0, 3); // Cap at 3 sentences from the start.

  const experience: Experience[] = CONTENT.WORK.map((work) => ({
    company: work.name,
    jobTitle: work.jobTitle,
    dateRange: formatDateRange(work.yearStart, work.yearEnd),
    description: work.jobDescription.replace(/\s+/g, " ").trim(),
    url: work.infoUrl ?? null,
  }));

  // Resume curation is declarative — every project carries an optional
  // `resume?: { include?, priority? }` block in `projects.ts`. We only need
  // two universal rules here:
  //   1. include === false  → never on the resume
  //   2. title matches a WORK[].name → drop (would duplicate the experience blurb)
  //   3. projectToLinkHref(p) === null → drop (no public link to render)
  // Everything else is sorted by priority desc (default 0), declaration order
  // tie-breaks. WORK_PROJECTS get a default boost so side projects without an
  // explicit pin don't displace them.
  const workCompanyNames = new Set(CONTENT.WORK.map((w) => w.name.toLowerCase()));
  const visibleOnResume = (p: PortfolioProject): boolean =>
    p.resume?.include !== false &&
    projectToLinkHref(p) !== null &&
    !workCompanyNames.has(p.title.toLowerCase());

  const resumePriority = (p: PortfolioProject): number =>
    p.resume?.priority ?? (p.setting === "work" ? 1 : 0);

  const orderedProjects = CONTENT.PROJECTS.filter(visibleOnResume)
    .slice() // don't mutate the readonly source array
    .sort((a, b) => resumePriority(b) - resumePriority(a));

  const projects: Project[] = orderedProjects.slice(0, 5).map((project) => ({
    title: project.title,
    description: shortenDescription(stripHtml(project.description)),
    url: projectToLinkHref(project),
    topics: project.topics
      .map((t) => TOPIC_TO_NAME[t as Topic] ?? t)
      .filter(Boolean)
      .slice(0, 6), // Cap topics per project for visual rhythm.
  }));

  // Skills section: union of all topics from selected projects + work-aligned
  // tech (the work entries don't have a `topics` field, so we lean on
  // projects).
  const allTopics = new Set<string>();
  for (const p of orderedProjects) for (const t of p.topics) allTopics.add(t);
  const skills = buildSkillRows([...allTopics]);

  const education: Education[] = CONTENT.SCHOOL.map((school) => ({
    degree: school.degree,
    institution: school.institutionName,
    dateRange: formatDateRange(school.yearStart, school.yearEnd),
  }));

  const tidyHost = (url: string): string =>
    url
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "");

  const identity: Identity = {
    name: CONTENT.PAGE_TITLE,
    title: CONTENT.PAGE_SUBTITLE,
    location: LOCATION,
    email: CONTENT.EMAIL_ADDRESS,
    phone: formatPhoneNumber(CONTENT.PHONE_NUMBER),
    website: tidyHost(CONTENT.SITE_URL),
    githubDisplay: tidyHost(CONTENT.GITHUB_URL),
    githubUrl: CONTENT.GITHUB_URL,
    linkedinDisplay: tidyHost(CONTENT.LINKEDIN_URL),
    linkedinUrl: CONTENT.LINKEDIN_URL,
  };

  return { identity, summary: summarySentences, experience, projects, skills, education };
}

/** Trim project descriptions to one tight line at body width. */
function shortenDescription(s: string): string {
  const max = 105;
  const cleaned = s.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const truncated = cleaned.slice(0, max - 1);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${truncated.slice(0, lastSpace > 60 ? lastSpace : truncated.length)}…`;
}

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const linkOrText = (text: string, url: string | null, className?: string): string => {
  const cls = className ? ` class="${className}"` : "";
  return url
    ? `<a${cls} href="${escapeHtml(url)}">${escapeHtml(text)}</a>`
    : `<span${cls}>${escapeHtml(text)}</span>`;
};

function renderHtml(content: ResumeContent): string {
  const { identity, summary, experience, projects, skills, education } = content;

  const contactItems = [
    `<a href="mailto:${escapeHtml(identity.email)}">${escapeHtml(identity.email)}</a>`,
    `<span>${escapeHtml(identity.phone)}</span>`,
    `<a href="https://${escapeHtml(identity.website)}">${escapeHtml(identity.website)}</a>`,
    `<a href="${escapeHtml(identity.githubUrl)}">${escapeHtml(identity.githubDisplay)}</a>`,
    `<a href="${escapeHtml(identity.linkedinUrl)}">${escapeHtml(identity.linkedinDisplay)}</a>`,
  ];

  const summaryHtml =
    summary.length > 0
      ? `<section class="summary">${escapeHtml(summary.join(". "))}.</section>`
      : "";

  const experienceHtml = `
    <section>
      <h2 class="section-title">Experience</h2>
      ${experience
        .map(
          (e) => `
        <div class="entry">
          <div class="entry-row">
            <div class="entry-headline">
              <span class="entry-title">${escapeHtml(e.jobTitle)}</span>
              <span class="dot">·</span>
              ${linkOrText(e.company, e.url, "entry-company")}
            </div>
            <span class="entry-date">${escapeHtml(e.dateRange)}</span>
          </div>
          <p class="entry-desc">${escapeHtml(e.description)}</p>
        </div>`,
        )
        .join("")}
    </section>`;

  const projectsHtml =
    projects.length > 0
      ? `
    <section>
      <h2 class="section-title">Projects</h2>
      ${projects
        .map(
          (p) => `
        <div class="entry">
          <div class="entry-row">
            <div class="entry-headline">
              ${linkOrText(p.title, p.url, "entry-title")}
              ${p.topics.length > 0 ? `<span class="tech">${p.topics.map(escapeHtml).join(" · ")}</span>` : ""}
            </div>
          </div>
          ${p.description ? `<p class="entry-desc">${escapeHtml(p.description)}</p>` : ""}
        </div>`,
        )
        .join("")}
    </section>`
      : "";

  const skillsHtml =
    skills.length > 0
      ? `
    <section>
      <h2 class="section-title">Skills</h2>
      <div class="skills-grid">
        ${skills
          .map(
            (s) => `
          <div class="skill-row">
            <div class="skill-category">${escapeHtml(s.category)}</div>
            <div class="skill-items">${s.items.map(escapeHtml).join(" · ")}</div>
          </div>`,
          )
          .join("")}
      </div>
    </section>`
      : "";

  const educationHtml = `
    <section>
      <h2 class="section-title">Education</h2>
      ${education
        .map(
          (e) => `
        <div class="entry">
          <div class="entry-row">
            <div class="entry-headline">
              <span class="entry-title">${escapeHtml(e.degree)}</span>
              <span class="dot">·</span>
              <span class="entry-company">${escapeHtml(e.institution)}</span>
            </div>
            <span class="entry-date">${escapeHtml(e.dateRange)}</span>
          </div>
        </div>`,
        )
        .join("")}
    </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(identity.name)} — Resume</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --accent: ${ACCENT};
      --rule: ${RULE_COLOR};
      --text: ${TEXT_PRIMARY};
      --text-secondary: ${TEXT_SECONDARY};
      --text-muted: ${TEXT_MUTED};
    }

    html, body {
      background: #fff;
      color: var(--text);
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 9.6pt;
      line-height: 1.42;
      font-feature-settings: "kern" 1, "liga" 1, "calt" 1, "tnum" 1;
      -webkit-font-smoothing: antialiased;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      width: 100%;
      min-height: 100vh;
    }

    a { color: var(--text); text-decoration: none; }
    a:hover { color: var(--accent); }

    /* ---------- Header ---------- */
    header.identity {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-bottom: 8px;
      border-bottom: 1.5px solid var(--accent);
      margin-bottom: 11px;
    }
    .name {
      font-size: 22pt;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--text);
      line-height: 1.05;
    }
    .role-line {
      margin-top: 3px;
      font-size: 10pt;
      font-weight: 500;
      color: var(--text-secondary);
      letter-spacing: 0.005em;
    }
    .role-line .role-sep {
      margin: 0 6px;
      color: var(--text-muted);
    }
    .contact {
      text-align: right;
      font-size: 8.6pt;
      color: var(--text-secondary);
      line-height: 1.6;
      max-width: 4in;
    }
    .contact .item:not(:last-child)::after {
      content: " · ";
      color: var(--text-muted);
      margin: 0 1px;
    }

    /* ---------- Summary ---------- */
    .summary {
      font-size: 9.6pt;
      line-height: 1.45;
      color: var(--text-secondary);
      margin-bottom: 11px;
    }

    /* ---------- Sections ---------- */
    section {
      margin-bottom: 10px;
    }
    section:last-of-type { margin-bottom: 0; }

    .section-title {
      font-size: 8.2pt;
      font-weight: 700;
      letter-spacing: 0.13em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 6px;
      padding-bottom: 3px;
      border-bottom: 0.6px solid var(--rule);
    }

    /* ---------- Entry rows ---------- */
    .entry {
      margin-bottom: 6px;
    }
    .entry:last-child { margin-bottom: 0; }

    .entry-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
    }
    .entry-headline {
      flex: 1 1 auto;
      min-width: 0;
    }
    .entry-title {
      font-weight: 600;
      color: var(--text);
    }
    .entry-company {
      font-weight: 500;
      color: var(--text);
    }
    .entry-headline .dot {
      margin: 0 5px;
      color: var(--text-muted);
    }
    .entry-date {
      font-variant-numeric: tabular-nums;
      font-size: 8.8pt;
      color: var(--text-muted);
      white-space: nowrap;
      flex: 0 0 auto;
    }
    .entry-desc {
      margin-top: 2px;
      color: var(--text-secondary);
      line-height: 1.42;
    }

    /* ---------- Projects ---------- */
    .tech {
      display: inline-block;
      margin-left: 6px;
      font-size: 8.5pt;
      color: var(--text-muted);
    }

    /* ---------- Skills ---------- */
    .skills-grid {
      display: flex;
      flex-direction: column;
      row-gap: 3px;
    }
    .skill-row {
      display: flex;
      align-items: baseline;
      gap: 14px;
    }
    .skill-category {
      flex: 0 0 1.05in;
      font-weight: 600;
      color: var(--text);
      font-size: 8.8pt;
      letter-spacing: 0.01em;
    }
    .skill-items {
      flex: 1 1 auto;
      color: var(--text-secondary);
      font-size: 9pt;
    }

    @media print {
      body { width: 100%; }
    }
  </style>
</head>
<body>
  <header class="identity">
    <div>
      <div class="name">${escapeHtml(identity.name)}</div>
      <div class="role-line">
        <span>${escapeHtml(identity.title)}</span>
        <span class="role-sep">·</span>
        <span>${escapeHtml(identity.location)}</span>
      </div>
    </div>
    <div class="contact">
      ${contactItems.map((c) => `<span class="item">${c}</span>`).join("")}
    </div>
  </header>

  ${summaryHtml}
  ${experienceHtml}
  ${projectsHtml}
  ${skillsHtml}
  ${educationHtml}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Iterative fit-to-page
// ---------------------------------------------------------------------------

type DropStrategy = {
  readonly name: string;
  readonly apply: (c: ResumeContent) => ResumeContent;
};

/**
 * Drop strategies are applied in order until the rendered content fits on a
 * single page. Earlier = least painful loss of information.
 */
const DROP_STRATEGIES: readonly DropStrategy[] = [
  {
    name: "drop project descriptions",
    apply: (c) => ({ ...c, projects: c.projects.map((p) => ({ ...p, description: null })) }),
  },
  { name: "drop last project", apply: (c) => ({ ...c, projects: c.projects.slice(0, -1) }) },
  { name: "drop last project", apply: (c) => ({ ...c, projects: c.projects.slice(0, -1) }) },
  { name: "drop last project", apply: (c) => ({ ...c, projects: c.projects.slice(0, -1) }) },
  {
    name: "drop last summary sentence",
    apply: (c) => ({ ...c, summary: c.summary.slice(0, -1) }),
  },
  { name: "drop last project", apply: (c) => ({ ...c, projects: c.projects.slice(0, -1) }) },
  {
    name: "drop last skill row",
    apply: (c) => ({ ...c, skills: c.skills.slice(0, -1) }),
  },
  { name: "drop all projects", apply: (c) => ({ ...c, projects: [] }) },
  { name: "drop summary entirely", apply: (c) => ({ ...c, summary: [] }) },
];

async function measureOverflow(page: Page, html: string): Promise<{ scrollHeight: number; fits: boolean }> {
  await page.setContent(html, { waitUntil: "networkidle" });
  // Wait briefly for fonts to load so measurement is accurate.
  try {
    await page.evaluate(() => (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready);
  } catch {
    // older Chromium without document.fonts — fall through
  }
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  return { scrollHeight, fits: scrollHeight <= CONTENT_HEIGHT_PX };
}

async function fitToOnePage(
  page: Page,
  initial: ResumeContent,
): Promise<{ content: ResumeContent; html: string; reductionsApplied: string[]; finalHeightPx: number }> {
  const reductionsApplied: string[] = [];
  let content = initial;
  let html = renderHtml(content);
  let measurement = await measureOverflow(page, html);
  if (measurement.fits) {
    return { content, html, reductionsApplied, finalHeightPx: measurement.scrollHeight };
  }

  for (const strategy of DROP_STRATEGIES) {
    const reduced = strategy.apply(content);
    if (JSON.stringify(reduced) === JSON.stringify(content)) continue; // no-op (e.g. nothing left to drop)
    content = reduced;
    reductionsApplied.push(strategy.name);
    html = renderHtml(content);
    measurement = await measureOverflow(page, html);
    if (measurement.fits) {
      return { content, html, reductionsApplied, finalHeightPx: measurement.scrollHeight };
    }
  }

  throw new Error(
    `Resume content does not fit on a single page even after applying every drop strategy ` +
      `(content ${measurement.scrollHeight}px > available ${CONTENT_HEIGHT_PX}px). ` +
      `Reduce content in src/content/* or tighten generate-resume.ts typography.`,
  );
}

// ---------------------------------------------------------------------------
// PDF generation + verification
// ---------------------------------------------------------------------------

async function assertOnePagePdf(pdfPath: string): Promise<void> {
  const bytes = await readFile(pdfPath);
  const doc = await PDFDocument.load(bytes);
  const pageCount = doc.getPageCount();
  if (pageCount !== 1) {
    throw new Error(
      `Generated resume has ${pageCount} pages, expected exactly 1. ` +
        `Hint: tighten the typography in generate-resume.ts or trim content.`,
    );
  }
}

const generateResume = async (): Promise<string> => {
  const content = buildResumeContent();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: CONTENT_WIDTH_PX, height: CONTENT_HEIGHT_PX },
      deviceScaleFactor: 1,
    });

    const fitted = await fitToOnePage(page, content);
    if (fitted.reductionsApplied.length > 0) {
      console.warn(
        `[resume] applied ${fitted.reductionsApplied.length} reduction(s) to fit on 1 page: ` +
          fitted.reductionsApplied.join(" → "),
      );
    }

    const publicPath = `${import.meta.dir}/../public`;
    await mkdir(publicPath, { recursive: true });
    const pdfPath = `${publicPath}/${RESUME_FILENAME}`;

    // Render the FINAL HTML as the PDF source. We use printBackground so the
    // accent rule under the name is preserved, and explicit format/margins so
    // the printable area exactly matches what the fit-loop measured against.
    await page.setContent(fitted.html, { waitUntil: "networkidle" });
    try {
      await page.evaluate(() =>
        (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready,
      );
    } catch {
      /* old Chromium */
    }

    await page.pdf({
      path: pdfPath,
      format: "Letter",
      margin: {
        top: `${MARGIN_TOP_IN}in`,
        bottom: `${MARGIN_BOTTOM_IN}in`,
        left: `${MARGIN_SIDE_IN}in`,
        right: `${MARGIN_SIDE_IN}in`,
      },
      printBackground: true,
      preferCSSPageSize: false,
    });

    // Defense-in-depth: even if DOM measurement said it fits, verify the
    // actual PDF page count. This is the hard contract.
    await assertOnePagePdf(pdfPath);

    return pdfPath;
  } finally {
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
  }
};

export { generateResume };

if (import.meta.main) {
  generateResume()
    .then((pdfPath) => console.log(`Resume generated successfully at: ${pdfPath}`))
    .catch((err) => {
      console.error("Error generating resume:", err);
      process.exit(1);
    });
}
