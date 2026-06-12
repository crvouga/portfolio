/**
 * Single source of truth for portfolio content.
 *
 *   PROJECTS[] feeds the website, resume, and screenshots.
 *   Runtime hosting for side projects lives in chrisvouga.dev/services.yaml.
 *
 * Adding a hosted side project:
 *   - Add the service in chrisvouga.dev/services.yaml and its project repo.
 *   - Append a Project here with display fields and `deployment.url`.
 */
import { Topic } from "./src/content/topic";

// ---------------------------------------------------------------------------
// Portfolio types
// ---------------------------------------------------------------------------

export type Code = { t: "private" } | { t: "public"; url: string };

export type Deployment =
  | { t: "public"; url: string }
  | { t: "not-deployed-anymore" }
  | { t: "not-deployed-yet" }
  | { t: "private" };

/** Resume curation overrides. Default: include if `projectToLinkHref` is non-null. */
export type ResumePolicy = {
  readonly include?: boolean;
  readonly priority?: number;
};

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
  readonly topics: Topic[];
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
    id: "geviti-app",
    title: "Geviti",
    setting: "work",
    deployment: { t: "public", url: "https://app.gogeviti.com/" },
    code: { t: "private" },
    description:
      "Building features for a comprehensive health and longevity platform that combines bloodwork analysis, personalized supplement protocols, prescription therapies, and care team coordination. Developing tools that help users track their health metrics and optimize their well-being through proactive, data-driven care.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/geviti-app-screenshot.optimized.webp"],
    galleryImageSrc: ["/geviti-app-screenshot.png"],
    topics: ["typescript", "react", "postgres", "bun", "aws", "react-native"],
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
    id: "normalizer-app",
    title: "normalizer.app",
    setting: "side",
    deployment: { t: "public", url: "https://normalizer.chrisvouga.dev" },
    code: { t: "public", url: "https://github.com/crvouga/normalizer.app.git" },
    description:
      "A web application that automates data normalization workflows, transforming tabular data (Excel, CSV) between schemas without manual Excel manipulation or custom Python scripts. Streamlines data processing for teams handling diverse data formats.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["/normalizer-app-screenshot.optimized.webp"],
    galleryImageSrc: [
      "/normalizer-app-screenshot.png",
      toYouTubeVideoUrl({ youTubeVideoId: "xUtdHEUeUzs", autoplay: true, mute: true }),
    ],
    topics: ["typescript", "react", "tailwind", "bun", "postgres", "s3", "trpc", "zod"],
    resume: { priority: 100 },
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
  },
  {
    id: "headless-combobox-svelte-example",
    title: "headless-combobox",
    setting: "side",
    deployment: { t: "public", url: "https://svelte-headlesscombobox.chrisvouga.dev" },
    code: { t: "public", url: "https://github.com/crvouga/headless-combobox" },
    description:
      "A production-ready, headless TypeScript combobox library that's framework-agnostic, zero-dependency, and fully accessible. Enables developers to build custom combobox components in any UI framework while maintaining WCAG compliance and flexibility.",
    imageAlt: IMAGE_ALT,
    imageSrc: ["./headless-combobox-screenshot.optimized.webp"],
    galleryImageSrc: ["./headless-combobox-screenshot.png"],
    topics: ["typescript"],
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
