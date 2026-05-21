/**
 * Single source of truth for portfolio content AND deployable infra.
 *
 *   Portfolio: PROJECTS[] feeds the website, resume, and screenshots.
 *   Infra:     each project's optional `deploy?: DeploySpec` is the ONLY
 *              place that encodes how it's hosted (Fly app, hostname, port,
 *              build context, secrets policy). Everywhere downstream is a
 *              pure iterator over this registry.
 *
 * Adding a deployable project:
 *   - Append a Project with `deployment.t === "public"` and a `deploy` block.
 *   - Push to main. CI auto-creates the Fly app + IPs, syncs secrets, deploys.
 *
 * Removing a deployable project:
 *   - Delete the entry. CI auto-tears down the orphan Fly app (DNS + secrets +
 *     certs go with it). A safety cap on the deploy pipeline prevents
 *     accidental mass-destroys.
 */
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Portfolio types
// ---------------------------------------------------------------------------

export type Code = { t: "private" } | { t: "public"; url: string };

export type Deployment =
  | { t: "public"; url: string }
  | { t: "not-deployed-anymore" }
  | { t: "not-deployed-yet" }
  | { t: "private" };

// ---------------------------------------------------------------------------
// Infra types — declarative spec for everything CI does to a deployable app.
// ---------------------------------------------------------------------------

/** Context passed to `computed` secret sources. */
export type SecretCtx = {
  readonly id: string;
  readonly hostname: string;
  readonly port: number;
};

/**
 * Where the value of a Fly secret comes from. The deploy pipeline dispatches
 * on `t` to resolve a value at sync time:
 *
 *   - "github":    process.env[name] (a GitHub Actions repo secret of the same name).
 *   - "literal":   inline constant value (e.g. legacy noop placeholders).
 *   - "computed":  derived from the project (deterministic; re-evaluated each sync).
 *   - "generated": random bytes; SET ONCE per app and PRESERVED across deploys
 *                  so things like signed-URL keys aren't invalidated on every push.
 */
export type SecretSource =
  | { readonly t: "github" }
  | { readonly t: "literal"; readonly value: string }
  | { readonly t: "computed"; readonly compute: (ctx: SecretCtx) => string }
  | { readonly t: "generated"; readonly generate: () => string };

export type SecretSpec = {
  readonly name: string;
  readonly source: SecretSource;
};

/**
 * Override how the project's container image is built. Paths are RELATIVE to
 * the cloned repo at `projects/<checkoutDir>/`.
 *
 *   checkoutDir  → defaults to the GitHub repo basename
 *                  (e.g. "crvouga/pickflix-v1" → "pickflix-v1").
 *   context      → defaults to ".".
 *   dockerfile   → defaults to "<context>/Dockerfile".
 */
export type BuildSpec = {
  readonly checkoutDir?: string;
  readonly context?: string;
  readonly dockerfile?: string;
};

/** Everything the deploy pipeline needs to host this project on our infra. */
export type DeploySpec = {
  readonly githubRepo: string;
  readonly hostname: string;
  readonly port: number;
  readonly build?: BuildSpec;
  readonly secrets?: readonly SecretSpec[];
};

/** Resume curation overrides. Default: include if `projectToLinkHref` is non-null. */
export type ResumePolicy = {
  readonly include?: boolean;
  readonly priority?: number;
};

// ---------------------------------------------------------------------------
// Project — portfolio + (optionally) infra in one declarative entry.
// ---------------------------------------------------------------------------

export type Project = {
  readonly id: string;
  readonly title: string;
  readonly setting: "work" | "side";
  readonly deployment: Deployment;
  readonly code: Code;
  readonly description: string;
  readonly imageSrc: string[];
  readonly imageAlt: string;
  readonly galleryImageSrc: string[];
  readonly youTubeVideoId?: string;
  readonly topics: string[];
  /** Present iff the project is hosted on our Fly+Cloudflare infra. */
  readonly deploy?: DeploySpec;
  /** Optional overrides for resume rendering. */
  readonly resume?: ResumePolicy;
};

// ---------------------------------------------------------------------------
// Render helpers (used inside descriptions only).
// ---------------------------------------------------------------------------

const toYouTubeVideoUrl = ({
  youTubeVideoId,
  autoplay = true,
  mute = true,
}: {
  youTubeVideoId: string;
  autoplay?: boolean;
  mute?: boolean;
}): string => {
  const params = new URLSearchParams();
  if (autoplay) params.append("autoplay", "1");
  if (mute) params.append("mute", "1");
  params.append("loop", "1");
  params.append("playlist", youTubeVideoId);
  return `https://www.youtube.com/embed/${youTubeVideoId}?${params.toString()}`;
};

const htmlLink = (href: string, text: string): string =>
  `<a style="color: white;" target="_blank" rel="noreferrer noopener" href="${href}">${text}</a>`;

const externalLink = (href: string, text: string): string =>
  htmlLink(
    href,
    `${text}<span style="font-size: 0.8em; padding-left: 0.3em; text-decoration: none; display: inline-block;">↗</span>`,
  );

export const projectToLinkHref = (project: Project): string | null => {
  if (project.deployment.t === "public") return project.deployment.url;
  if (project.code.t === "public") return project.code.url;
  return null;
};

// ---------------------------------------------------------------------------
// Secret-source helpers — short factories so projects below stay readable.
// ---------------------------------------------------------------------------

const fromGithub = (name: string): SecretSpec => ({
  name,
  source: { t: "github" },
});

const literal = (name: string, value: string): SecretSpec => ({
  name,
  source: { t: "literal", value },
});

const computed = (name: string, compute: (ctx: SecretCtx) => string): SecretSpec => ({
  name,
  source: { t: "computed", compute },
});

const generated = (name: string, generate: () => string): SecretSpec => ({
  name,
  source: { t: "generated", generate },
});

/** 64-char hex (equivalent to `openssl rand -hex 32`). */
const randomHex32 = () => randomBytes(32).toString("hex");

/** Standard moviefinder secrets (TMDB + Twilio). */
const moviefinderSecrets: readonly SecretSpec[] = [
  fromGithub("TMDB_API_READ_ACCESS_TOKEN"),
  fromGithub("TWILIO_ACCOUNT_SID"),
  fromGithub("TWILIO_AUTH_TOKEN"),
  fromGithub("TWILIO_SERVICE_SID"),
];

// ---------------------------------------------------------------------------
// Constants reused inside descriptions.
// ---------------------------------------------------------------------------

const IMAGE_ALT = "A screenshot of the project";
const GAMEZILLA_HREF = "https://www.gamezilla.app/";
const LAMDERA_HREF = "https://lamdera.com/";

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const PROJECTS: readonly Project[] = [
  {
    id: "gamezilla",
    title: "gamezilla.app",
    setting: "side",
    deployment: { t: "public", url: GAMEZILLA_HREF },
    code: { t: "private" },
    description: `${externalLink(GAMEZILLA_HREF, "gamezilla.app")} is a real-time multiplayer gaming platform built with a full-stack TypeScript implementation of the Elm architecture. Successfully migrated from the ${externalLink(LAMDERA_HREF, "Lamdera")} platform, demonstrating expertise in complex system migrations and real-time application architecture.`,
    imageAlt: IMAGE_ALT,
    imageSrc: ["/gamezilla-app-screenshot.optimized.webp", "/gamezilla.optimized.webp"],
    galleryImageSrc: [
      "/gamezilla-app-screenshot.png",
      toYouTubeVideoUrl({ youTubeVideoId: "VSLpdPvHbD4", autoplay: true }),
      "/gamezilla.png",
    ],
    topics: ["typescript", "react", "postgres", "tailwind", "websocket", "bun", "sqlite"],
  },
  {
    id: "geviti",
    title: "Geviti",
    setting: "work",
    deployment: { t: "public", url: "https://www.gogeviti.com/" },
    code: { t: "private" },
    description:
      "Building features for a comprehensive health and longevity platform that combines bloodwork analysis, personalized supplement protocols, prescription therapies, and care team coordination. Developing tools that help users track their health metrics and optimize their well-being through proactive, data-driven care.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/geviti-screenshot.optimized.webp"],
    galleryImageSrc: ["/geviti-screenshot.png"],
    topics: ["typescript", "react", "postgres", "bun", "aws"],
  },
  {
    id: "triangulator",
    title: "Triangulator",
    setting: "work",
    deployment: { t: "private" },
    code: { t: "private" },
    description:
      "Enterprise platform that automates course transfer evaluation between universities, streamlining the complex process of determining credit equivalencies. Led development as the technical lead, architecting scalable solutions for handling large-scale academic data processing.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/triangulator.optimized.webp"],
    galleryImageSrc: [
      toYouTubeVideoUrl({ youTubeVideoId: "yQCrMBHQrDM", autoplay: true }),
      "/triangulator/assigned-reject-reason.png",
      "/triangulator/course-search-details-2.png",
      "/triangulator/course-search-loading.png",
      "/triangulator/course-search.png",
      "/triangulator/find-course.png",
      "/triangulator/inst-admin-all-users.png",
      "/triangulator/inst-admin-assign.png",
      "/triangulator/inst-admin-boost-suggestions.png",
      "/triangulator/inst-admin-dashboard.png",
      "/triangulator/inst-admin-download.png",
      "/triangulator/inst-admin-new-suggestions.png",
      "/triangulator/inst-admin-public-profile.png",
      "/triangulator/inst-admin-summary.png",
      "/triangulator/inst-admin-upload-choice.png",
      "/triangulator/inst-admin-upload-course.png",
      "/triangulator/inst-public-profile.png",
      "/triangulator/new-suggestions-assign.png",
      "/triangulator/public-search-filter.png",
      "/triangulator/search-results.png",
      "/triangulator/suggestion-details-reject-reason.png",
      "/triangulator/suggestion-details.png",
      "/triangulator/tri-admin-dashboard.png",
      "/triangulator/tri-admin-new-suggestions.png",
      "/triangulator/tri-admin-suggestion-details.png",
      "/triangulator/tri-admin-summary.png",
    ],
    topics: [
      "typescript", "vue", "tailwind", "nuxt", "postgres", "python",
      "graphql", "aws", "graphene", "flask", "neo4j", "s3",
    ],
  },
  {
    id: "study-hall",
    title: "Study Hall",
    setting: "work",
    deployment: { t: "public", url: "https://gostudyhall.com/" },
    code: { t: "private" },
    description:
      "Educational platform developed in partnership with the Study Hall YouTube channel and ASU. Refactored the payment processing system to enhance reliability, maintainability, and user experience, reducing payment failures and improving system stability.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/study-hall-screenshot.optimized.webp", "/studyhall.optimized.webp"],
    galleryImageSrc: [
      "/study-hall-screenshot.png",
      toYouTubeVideoUrl({ youTubeVideoId: "BC4K0u7Zm4k", autoplay: true, mute: true }),
      "/studyhall/1.png", "/studyhall/2.png", "/studyhall/3.png", "/studyhall/4.png",
      "/studyhall/5.png", "/studyhall/6.png", "/studyhall/7.png", "/studyhall/8.png",
      "/studyhall/9.png", "/studyhall/10.png", "/studyhall/11.png", "/studyhall/12.png",
      "/studyhall/13.png",
    ],
    topics: ["javascript", "vue", "nuxt", "bootstrap", "aws", "dynamodb", "salesforce", "express", "nodejs"],
  },
  {
    id: "asu-earned-admissions",
    title: "ASU Earned Admissions",
    setting: "work",
    deployment: { t: "public", url: "https://ea.asu.edu/" },
    code: { t: "private" },
    description:
      "Educational platform enabling learners to earn college credits and qualify for admission to over 100 ASU degree programs. Refactored the main backend codebase for improved maintainability and scalability. Built Salesforce automation to sync data between Salesforce and ASU's Canvas LMS. Developed a new opt-in flow for the earned admissions program.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/asu-earned-admission-screenshot.optimized.webp"],
    galleryImageSrc: ["/asu-earned-admission-screenshot.png"],
    topics: ["salesforce", "nodejs", "typescript", "express", "dynamodb", "aws"],
    resume: { include: false },
  },
  {
    id: "pickflix",
    title: "Pickflix",
    setting: "side",
    deployment: { t: "public", url: "https://pickflix.chrisvouga.dev/" },
    code: { t: "public", url: "https://github.com/crvouga/pickflix-v1" },
    description:
      "Social movie discovery platform enabling users to watch trailers, write reviews, and collaborate on movie lists with friends. Features real-time updates and a comprehensive movie database integration.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/pickflix-screenshot.optimized.webp"],
    galleryImageSrc: [
      "/pickflix-screenshot.png",
      toYouTubeVideoUrl({ youTubeVideoId: "-atthbuMFIM", autoplay: true, mute: true }),
    ],
    topics: [
      "express", "heroku", "jest", "material-ui", "nodejs", "postgres",
      "ramda", "react", "redux", "redux-saga", "typescript", "css", "react-query",
    ],
    deploy: {
      githubRepo: "crvouga/pickflix-v1",
      hostname: "pickflix.chrisvouga.dev",
      port: 9000,
      build: { checkoutDir: "pickflix-v1" },
      secrets: [
        // Legacy noop placeholders — the app needs these env vars set to
        // boot but we no longer hand out real credentials. Kept inline so
        // this is a single-edit change if the app ever wires real
        // SendGrid / DB / session secrets again.
        literal("DATABASE_URL", "noop"),
        literal("PORT", "9000"),
        literal("SECRET", "noop"),
        literal("SEND_GRID_API_KEY", "noop"),
        literal("SEND_GRID_REGISTERED_EMAIL_ADDRESS", "noop"),
        literal("SESSION_COOKIE_SECRET", "noop"),
        literal("YOUTUBE_API_KEY", "noop"),
        fromGithub("TMDB_API_READ_ACCESS_TOKEN"),
      ],
    },
  },
  {
    id: "sun-devils",
    title: "Sun devils",
    setting: "work",
    deployment: { t: "public", url: "https://sundevils.com/" },
    code: { t: "private" },
    description:
      "Official website for the ASU Sun Devils athletics program. Developed interactive React components including real-time game schedules and dynamic news feeds, enhancing fan engagement and information accessibility.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/sun-devils-screenshot.optimized.webp"],
    galleryImageSrc: [
      "/sun-devils-screenshot.png",
      "/sun-devils/2.png", "/sun-devils/3.png", "/sun-devils/4.png", "/sun-devils/5.png",
    ],
    topics: ["bootstrap", "drupal", "javascript", "react", "css", "php"],
  },
  {
    id: "headless-combobox-svelte-example",
    title: "headless-combobox",
    setting: "side",
    deployment: { t: "public", url: "https://svelte.headlesscombobox.chrisvouga.dev" },
    code: { t: "public", url: "https://github.com/crvouga/headless-combobox" },
    description:
      "A production-ready, headless TypeScript combobox library that's framework-agnostic, zero-dependency, and fully accessible. Enables developers to build custom combobox components in any UI framework while maintaining WCAG compliance and flexibility.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["./headless-combobox-screenshot.optimized.webp"],
    galleryImageSrc: ["./headless-combobox-screenshot.png"],
    topics: ["typescript"],
    deploy: {
      githubRepo: "crvouga/headless-combobox",
      hostname: "svelte.headlesscombobox.chrisvouga.dev",
      port: 80,
      // Dockerfile lives inside a sub-directory of the repo.
      build: { context: "example/svelte", dockerfile: "example/svelte/Dockerfile" },
    },
  },
  {
    id: "headless-combobox-docs",
    title: "headless-combobox docs",
    setting: "side",
    deployment: { t: "public", url: "https://headlesscombobox.chrisvouga.dev" },
    code: { t: "public", url: "https://github.com/crvouga/headless-combobox" },
    description:
      "Documentation site for the headless-combobox library.",
    imageAlt: IMAGE_ALT,
    imageSrc: [],
    galleryImageSrc: [],
    topics: ["typescript"],
    deploy: {
      githubRepo: "crvouga/headless-combobox",
      hostname: "headlesscombobox.chrisvouga.dev",
      port: 80,
    },
  },
  {
    id: "todo-app",
    title: "Fullstack Todo App",
    setting: "side",
    deployment: { t: "public", url: "https://todo.chrisvouga.dev" },
    code: { t: "public", url: "https://github.com/crvouga/todo-v1" },
    description:
      "Full-stack task management application with user authentication and real-time synchronization. Demonstrates end-to-end development capabilities from database design to responsive UI implementation.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/fullstack-todo-app-screenshot.optimized.webp", "/todo.optimized.webp"],
    galleryImageSrc: ["/fullstack-todo-app-screenshot.png", "/todo.png"],
    topics: ["typescript", "vue", "css", "express", "javascript", "tailwind", "nodejs", "mongodb"],
    deploy: {
      githubRepo: "crvouga/todo-v1",
      hostname: "todo.chrisvouga.dev",
      port: 80,
      // Repo basename is "todo-v1"; explicit so it survives a repo rename.
      build: { checkoutDir: "todo-v1" },
    },
  },
  {
    id: "image-service",
    title: "Image service",
    setting: "side",
    deployment: { t: "public", url: "https://imageservice.chrisvouga.dev" },
    code: { t: "public", url: "https://github.com/crvouga/imageresizerservice.com" },
    description:
      "Image optimization service built with Go, designed for zero-configuration self-hosting and long-term maintainability. Enables web applications to efficiently serve optimized images without external dependencies.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/image-service-screenshot.optimized.webp"],
    galleryImageSrc: ["/image-service-screenshot.png"],
    topics: ["go"],
    deploy: {
      githubRepo: "crvouga/image-service",
      hostname: "imageservice.chrisvouga.dev",
      port: 80,
    },
  },
  {
    id: "connect-four",
    title: "Connect Four: AI & Multiplayer",
    setting: "side",
    deployment: { t: "public", url: "https://connectfour.chrisvouga.dev/" },
    code: { t: "public", url: "https://github.com/crvouga/connect-four" },
    description:
      "Real-time multiplayer Connect Four game with WebSocket-based synchronization. Features smooth animations, responsive design, and seamless online gameplay for multiple concurrent users.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/connect-four-ai-multiplayer-screenshot.optimized.webp", "/connect-four.optimized.webp"],
    galleryImageSrc: [
      "/connect-four-ai-multiplayer-screenshot.png",
      toYouTubeVideoUrl({ youTubeVideoId: "9_TbyftkaQw", autoplay: true, mute: true }),
      "/connect-four.png",
    ],
    topics: [
      "css", "greensock", "heroku", "material-ui", "nodejs",
      "ramda", "redux", "redux-saga", "javascript", "socket-io",
    ],
    deploy: {
      githubRepo: "crvouga/connect-four",
      hostname: "connectfour.chrisvouga.dev",
      port: 80,
    },
  },
  {
    id: "normalizer-app",
    title: "normalizer.app",
    setting: "side",
    deployment: { t: "public", url: "https://normalizer.chrisvouga.dev/" },
    code: { t: "public", url: "https://github.com/crvouga/normalizer.app.git" },
    description:
      "A web application that automates data normalization workflows, transforming tabular data (Excel, CSV) between schemas without manual Excel manipulation or custom Python scripts. Streamlines data processing for teams handling diverse data formats.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/normalizer-app-screenshot.optimized.webp"],
    galleryImageSrc: ["/normalizer-app-screenshot.png"],
    topics: ["typescript", "react", "tailwind", "bun", "postgres", "s3", "trpc", "zod"],
    deploy: {
      githubRepo: "crvouga/normalizer.app",
      hostname: "normalizer.chrisvouga.dev",
      port: 8080,
      secrets: [
        fromGithub("OPENAI_API_KEY"),
        // Server emits absolute URLs in OpenAPI/redirect responses; derive from
        // the project's hostname so we never have to think about it again.
        computed("SERVER_BASE_URL", (ctx) => `https://${ctx.hostname}`),
        // Random key used to sign S3 presigned URLs. Set ONCE so existing
        // signed URLs stay valid across deploys.
        generated("OBJECT_STORE_PRESIGNED_URL_SECRET", randomHex32),
      ],
    },
    resume: { priority: 100 },
  },
  {
    id: "airr",
    title: "Airr Product Demo",
    setting: "work",
    deployment: { t: "not-deployed-anymore" },
    code: { t: "private" },
    description:
      "Interactive product demonstration for Airr, an enterprise solution that automates transcript consumption and analysis. Showcases advanced data processing capabilities and intuitive user interface design for complex workflow management.",
    imageAlt: IMAGE_ALT,
    imageSrc: [
      "/airr-product-demo-screenshot.optimized.webp",
      "/airr/1.optimized.webp", "/airr/2.optimized.webp", "/airr/3.optimized.webp",
      "/airr/4.optimized.webp", "/airr/5.optimized.webp", "/airr/6.optimized.webp",
    ],
    galleryImageSrc: [
      "/airr-product-demo-screenshot.png",
      "/airr/1.png", "/airr/2.png", "/airr/3.png",
      "/airr/4.png", "/airr/5.png", "/airr/6.png", "/airr/7.png",
    ],
    topics: ["typescript", "nodejs", "postgres", "react", "tailwind", "trpc", "vercel"],
    resume: { include: false },
  },
  {
    id: "screenshot-service",
    title: "Screenshots as a Service",
    setting: "side",
    deployment: { t: "not-deployed-anymore" },
    code: { t: "public", url: "https://github.com/crvouga/screenshot-service" },
    description:
      "Software-as-a-Service platform enabling developers to programmatically generate high-quality screenshots of web pages. Provides reliable, scalable screenshot generation with customizable options. Powers the screenshot generation for this portfolio.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/screenshots-as-a-service-screenshot.optimized.webp", "/screenshot-service.optimized.webp"],
    galleryImageSrc: [
      "/screenshots-as-a-service-screenshot.png",
      toYouTubeVideoUrl({ youTubeVideoId: "lCEzYGJ0rN8", autoplay: true, mute: true }),
      "/screenshot-service.png",
    ],
    topics: [
      "css", "heroku", "material-ui", "nodejs", "postgres",
      "puppeteer", "react", "react-query", "typescript", "supabase",
    ],
  },
  {
    id: "orchard",
    title: "Orchard",
    setting: "work",
    deployment: { t: "public", url: "https://asuorchard.asu.edu/" },
    code: { t: "private" },
    description:
      "Educational platform developed by ASU that empowers instructors to create highly customizable assignments. Architected and implemented the LTI 1.3 integration with ASU's Learning Management System, enabling seamless single sign-on and grade passback functionality.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/orchard.optimized.webp"],
    galleryImageSrc: ["/orchard.png"],
    topics: ["php", "mysql", "drupal", "bootstrap", "javascript"],
    resume: { include: false },
  },
  {
    id: "quiz-maker",
    title: "LTI compatible quiz maker",
    setting: "side",
    deployment: { t: "not-deployed-anymore" },
    code: { t: "public", url: "https://github.com/crvouga/quiz-maker" },
    description:
      "LTI-compatible quiz creation platform that integrates seamlessly with Learning Management Systems. Enables instructors to build custom quizzes and assessments while providing students with a native LMS experience.",
    imageAlt: IMAGE_ALT,
    imageSrc: [],
    galleryImageSrc: [],
    topics: ["css", "express", "nodejs", "tailwind", "typescript", "vue"],
  },
  {
    id: "courier-website",
    title: "Courier Company Website",
    setting: "work",
    deployment: { t: "public", url: "https://gps-couriers-website.vercel.app/" },
    code: { t: "private" },
    description:
      "Professional marketing website for a healthcare courier company, featuring responsive design, optimized performance, and clear communication of services to potential clients.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/courier-company-website-screenshot.optimized.webp", "/courier.optimized.webp"],
    galleryImageSrc: [
      "/courier-company-website-screenshot.png",
      toYouTubeVideoUrl({ youTubeVideoId: "kFwPTJcM6I0", autoplay: true, mute: true }),
      "/courier.png",
    ],
    topics: ["css", "material-ui", "nextjs", "react", "typescript"],
    resume: { include: false },
  },
  {
    id: "anime-blog",
    title: "Anime Blog",
    setting: "side",
    deployment: { t: "public", url: "https://anime.chrisvouga.dev/" },
    code: { t: "public", url: "https://github.com/crvouga/anime" },
    description:
      "Modern JAMstack blog built with Vue and Gridsome, featuring a headless CMS integration for content management. Demonstrates static site generation and performance optimization techniques.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/anime-blog-screenshot.optimized.webp", "/anime.optimized.webp"],
    galleryImageSrc: ["/anime-blog-screenshot.png", "/anime.png"],
    topics: ["css", "javascript", "sanity", "vue", "bootstrap", "graphql", "gridsome"],
    deploy: {
      githubRepo: "crvouga/anime",
      hostname: "anime.chrisvouga.dev",
      port: 80,
      // Repo basename is "anime"; explicit for clarity.
      build: { checkoutDir: "anime" },
    },
  },
  {
    id: "snake-game",
    title: "Smooth Snake Game",
    setting: "side",
    deployment: { t: "public", url: "https://snake.chrisvouga.dev/" },
    code: { t: "public", url: "https://github.com/crvouga/snake" },
    description:
      "Classic Snake game implemented using functional programming principles, featuring smooth animations and responsive controls. Showcases clean code architecture and modern React patterns.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/smooth-snake-game-screenshot.optimized.webp", "/snake.optimized.webp"],
    galleryImageSrc: [
      "/smooth-snake-game-screenshot.png",
      toYouTubeVideoUrl({ youTubeVideoId: "7El3RdkzlHs", autoplay: true, mute: true }),
      "/snake.png",
    ],
    topics: ["css", "javascript", "ramda", "react"],
    deploy: {
      githubRepo: "crvouga/snake",
      hostname: "snake.chrisvouga.dev",
      port: 80,
    },
  },
  {
    id: "match-three",
    title: "Match Three",
    setting: "side",
    deployment: { t: "public", url: "https://matchthree.chrisvouga.dev/" },
    code: { t: "public", url: "https://github.com/crvouga/match-three" },
    description:
      "Match-three puzzle game inspired by Candy Crush, featuring engaging gameplay mechanics, smooth animations, and responsive design. Demonstrates game development skills and state management expertise.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/match-three-screenshot.optimized.webp"],
    galleryImageSrc: [
      "/match-three-screenshot.png",
      toYouTubeVideoUrl({ youTubeVideoId: "VBrlDgmXSoA", autoplay: true, mute: true }),
    ],
    topics: ["css", "javascript", "ramda", "react", "redux", "redux-saga"],
    deploy: {
      githubRepo: "crvouga/match-three",
      hostname: "matchthree.chrisvouga.dev",
      port: 80,
    },
  },
  {
    id: "moviefinder-app-rust",
    title: "moviefinder.app (Rust)",
    setting: "side",
    deployment: { t: "public", url: "https://moviefinder-app-rust.chrisvouga.dev" },
    code: { t: "public", url: "https://github.com/crvouga/moviefinder.app-rust" },
    description:
      "Rust implementation of the moviefinder.app movie discovery platform.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/moviefinder-app-rust-screenshot.optimized.webp"],
    galleryImageSrc: ["/moviefinder-app-rust-screenshot.png"],
    topics: ["rust"],
    deploy: {
      githubRepo: "crvouga/moviefinder.app-rust",
      hostname: "moviefinder-app-rust.chrisvouga.dev",
      port: 3000,
      secrets: moviefinderSecrets,
    },
  },
  {
    id: "moviefinder-app-go",
    title: "moviefinder.app (Go)",
    setting: "side",
    deployment: { t: "public", url: "https://moviefinder-app-go.chrisvouga.dev" },
    code: { t: "public", url: "https://github.com/crvouga/moviefinder.app-go" },
    description:
      "Go implementation of the moviefinder.app movie discovery platform.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/moviefinder-app-go-screenshot.optimized.webp"],
    galleryImageSrc: ["/moviefinder-app-go-screenshot.png"],
    topics: ["go"],
    deploy: {
      githubRepo: "crvouga/moviefinder.app-go",
      hostname: "moviefinder-app-go.chrisvouga.dev",
      port: 8080,
      secrets: moviefinderSecrets,
    },
  },
  {
    id: "moviefinder-app-react",
    title: "moviefinder.app (React)",
    setting: "side",
    deployment: { t: "public", url: "https://moviefinder-app-react.chrisvouga.dev" },
    code: { t: "public", url: "https://github.com/crvouga/moviefinder.app-react" },
    description:
      "React implementation of the moviefinder.app movie discovery platform.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/moviefinder-app-react-screenshot.optimized.webp"],
    galleryImageSrc: ["/moviefinder-app-react-screenshot.png"],
    topics: ["react", "typescript"],
    deploy: {
      githubRepo: "crvouga/moviefinder.app-react",
      hostname: "moviefinder-app-react.chrisvouga.dev",
      port: 3000,
      secrets: moviefinderSecrets,
    },
  },
  {
    id: "moviefinder-app-clojurescript",
    title: "moviefinder.app (ClojureScript)",
    setting: "side",
    deployment: { t: "public", url: "https://moviefinder-app-clojurescript.chrisvouga.dev" },
    code: { t: "public", url: "https://github.com/crvouga/moviefinder.app-clojurescript" },
    description:
      "ClojureScript implementation of the moviefinder.app movie discovery platform.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/moviefinder-app-clojurescript-screenshot.optimized.webp"],
    galleryImageSrc: ["/moviefinder-app-clojurescript-screenshot.png"],
    topics: ["clojurescript"],
    deploy: {
      githubRepo: "crvouga/moviefinder.app-clojurescript",
      hostname: "moviefinder-app-clojurescript.chrisvouga.dev",
      port: 9630,
      secrets: moviefinderSecrets,
    },
  },
  {
    id: "simon-says",
    title: "Simon Says",
    setting: "side",
    deployment: { t: "public", url: "https://simonsays.chrisvouga.dev/" },
    code: { t: "public", url: "https://github.com/crvouga/simon-says" },
    description:
      "Interactive implementation of the classic Simon Says memory game, featuring visual and audio feedback, progressive difficulty, and polished user interface design.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/simon-says-screenshot.optimized.webp"],
    galleryImageSrc: [
      "/simon-says-screenshot.png",
      toYouTubeVideoUrl({ youTubeVideoId: "WrUFzlKL0E0", autoplay: true, mute: true }),
    ],
    topics: ["css", "javascript", "ramda", "react", "redux", "redux-saga"],
    deploy: {
      githubRepo: "crvouga/simon-says",
      hostname: "simonsays.chrisvouga.dev",
      port: 80,
    },
  },
  {
    id: "cheese",
    title: "Cheese",
    setting: "side",
    deployment: { t: "not-deployed-anymore" },
    code: { t: "public", url: "https://github.com/crvouga/cheese" },
    description:
      "Web application for generating customizable event identification cards with client-side image manipulation. Explores advanced browser APIs for image processing and demonstrates creative problem-solving in web development.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/cheese.optimized.webp"],
    galleryImageSrc: [
      toYouTubeVideoUrl({ youTubeVideoId: "hv3tRBHF7w4", autoplay: true, mute: true }),
      "/cheese.png",
    ],
    topics: ["css", "typescript", "material-ui", "react", "firebase"],
  },
];

export const WORK_PROJECTS: readonly Project[] = PROJECTS.filter(
  (p) => p.setting === "work",
);

export const SIDE_PROJECTS: readonly Project[] = PROJECTS.filter(
  (p) => p.setting === "side",
);

// ---------------------------------------------------------------------------
// Infra helpers — pure derivations from the registry above.
// ---------------------------------------------------------------------------

export type DeployableProject = Project & {
  readonly deploy: DeploySpec;
  readonly deployment: Extract<Deployment, { t: "public" }>;
};

/**
 * A project is deployable iff it has a `deploy` block AND its public-facing
 * deployment URL is the one we manage. Anything `private` /
 * `not-deployed-anymore` / `not-deployed-yet` is intentionally excluded —
 * presence of `deploy` alone is not enough, because we may want to keep
 * legacy infra fields as documentation without re-deploying.
 */
export function getDeployableProjects(): readonly DeployableProject[] {
  return PROJECTS.filter(
    (p): p is DeployableProject => p.deploy != null && p.deployment.t === "public",
  );
}

/**
 * Slim record consumed by every infra script. Carries the `deploy` block
 * verbatim so downstream code never has to know about portfolio fields.
 */
export type InfraTarget = {
  readonly id: string;
  readonly title: string;
  readonly deploy: DeploySpec;
};

/**
 * The portfolio site itself. NOT a Project entry to avoid self-referencing
 * the listing UI.
 */
export const PORTFOLIO_INFRA_TARGET: InfraTarget = {
  id: "portfolio",
  title: "chrisvouga.dev",
  deploy: {
    githubRepo: "crvouga/chrisvouga.dev",
    hostname: "www.chrisvouga.dev",
    port: 80,
  },
};

/** Fly app name for an infra target (Fly app names are globally namespaced). */
export function flyAppName(id: string): string {
  return `chrisvouga-${id}`;
}

/**
 * Cloudflare zone (apex domain) that should host the DNS record for `hostname`.
 * Single zone today (`chrisvouga.dev`) but the function lets us add more later.
 */
export function cloudflareZoneForHostname(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length < 2) return hostname;
  return parts.slice(-2).join(".");
}

/** Portfolio + every deployable project, as InfraTargets. */
export function getInfraTargets(): readonly InfraTarget[] {
  return [
    PORTFOLIO_INFRA_TARGET,
    ...getDeployableProjects().map(
      (p): InfraTarget => ({
        id: p.id,
        title: p.title,
        deploy: p.deploy,
      }),
    ),
  ];
}

/** Sibling repos to clone into `projects/<dir>` for the build matrix. */
export function getUniqueCloneRepos(): readonly { repo: string; dir: string }[] {
  const seen = new Set<string>();
  const out: { repo: string; dir: string }[] = [];
  for (const t of getInfraTargets()) {
    if (t.id === "portfolio") continue;
    const repo = t.deploy.githubRepo;
    if (seen.has(repo)) continue;
    seen.add(repo);
    const dir = t.deploy.build?.checkoutDir ?? repo.split("/").pop()!;
    out.push({ repo, dir });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Secrets aggregation — derived view used by the workflow validator.
// ---------------------------------------------------------------------------

/**
 * Every secret name across all projects whose source is `github`. This is
 * the set of GitHub Actions repo secrets the deploy pipeline must have
 * available; the `check-github-secrets.ts` validator uses this list to fail
 * the workflow early if any are missing.
 */
export function allGithubSecretNames(): readonly string[] {
  const names = new Set<string>();
  for (const t of getInfraTargets()) {
    for (const s of t.deploy.secrets ?? []) {
      if (s.source.t === "github") names.add(s.name);
    }
  }
  return [...names].sort();
}
