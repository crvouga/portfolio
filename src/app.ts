import { CONTENT } from "./content/content";
import { tag, text, type Attrs, type Html, type View } from "./library/html/index";
import { replaceAll } from "./library/replace-all";
import { viewAboutMeSection } from "./sections/about-me/index";
import { viewContactSection } from "./sections/contact/index";
import { viewFooterSection } from "./sections/footer/index";
import { viewHeadingSection } from "./sections/heading/index";
import { viewNavSection } from "./sections/nav/index";
import { viewProjectsSection } from "./sections/projects";
import { viewSchoolSection } from "./sections/school";
import { viewWorkSection } from "./sections/work";
import { viewBackdrop } from "./ui/backdrop";
import "./ui/fonts";
import "./ui/globals";
import { HEAD } from "./ui/head";
import { viewImage } from "./ui/image";
import { THEME } from "./ui/theme";

const SITE_PREVIEW_IMAGE = {
  path: "/main-site-screenshot.optimized.webp",
  width: 600,
  height: 338,
} as const;

const sitePreviewImageUrl = `${CONTENT.SITE_URL}${SITE_PREVIEW_IMAGE.path}`;

const sitePreviewImageAlt = `${CONTENT.PAGE_TITLE} - ${CONTENT.PAGE_SUBTITLE} portfolio website screenshot`;

const metaDescription = (): string =>
  replaceAll(replaceAll(CONTENT.META_DESCRIPTION, "\n", ""), "\t", "");

const viewSiteStructuredData = (): Html =>
  tag("script", { type: "application/ld+json" }, [
    text(
      JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            "@id": `${CONTENT.SITE_URL}/#website`,
            url: CONTENT.SITE_URL,
            name: CONTENT.PAGE_TITLE,
            description: metaDescription(),
          },
          {
            "@type": "Person",
            "@id": `${CONTENT.SITE_URL}/#person`,
            name: CONTENT.PAGE_TITLE,
            url: CONTENT.SITE_URL,
            jobTitle: CONTENT.PAGE_SUBTITLE,
            image: sitePreviewImageUrl,
          },
          {
            "@type": "WebPage",
            "@id": `${CONTENT.SITE_URL}/#webpage`,
            url: CONTENT.SITE_URL,
            name: CONTENT.META_TITLE,
            description: metaDescription(),
            isPartOf: { "@id": `${CONTENT.SITE_URL}/#website` },
            about: { "@id": `${CONTENT.SITE_URL}/#person` },
            primaryImageOfPage: {
              "@type": "ImageObject",
              url: sitePreviewImageUrl,
              contentUrl: sitePreviewImageUrl,
              width: SITE_PREVIEW_IMAGE.width,
              height: SITE_PREVIEW_IMAGE.height,
            },
          },
        ],
      }),
    ),
  ]);

export const viewApp = (): Html => {
  return viewDoc({}, [
    viewNavSection(),
    tag("main", { class: "main", id: "top" }, [
      viewHeadingSection(),
      viewWorkSection(),
      viewProjectsSection(),
      viewAboutMeSection(),
      viewSchoolSection(),
      viewContactSection(),
    ]),
    viewFooterSection(),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      :root {
        --page-max: 1100px;
        --page-pad: 24px;
      }

      .main {
        max-width: calc(var(--page-max) + var(--page-pad) * 2);
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 128px;
        padding: 128px var(--page-pad) 96px;
        overflow-x: clip;
      }

      @media (max-width: 900px) {
        :root {
          --page-pad: 20px;
        }
        .main {
          gap: 96px;
          padding: 112px var(--page-pad) 72px;
        }
      }

      @media (max-width: 600px) {
        :root {
          --page-pad: 16px;
        }
        .main {
          gap: 80px;
          padding: 96px var(--page-pad) 64px;
        }
      }
    `),
  ])
);

export const viewDoc: View = (_a?: Attrs, c?: Html[]) => {
  return tag("html", { lang: "en" }, [
    tag("head", {}, [
      tag("meta", { charset: "UTF-8" }, []),
      tag(
        "meta",
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1.0",
        },
        []
      ),
      tag("title", {}, [text(CONTENT.META_TITLE)]),
      tag("meta", { name: "description", content: metaDescription() }, []),
      tag("link", { rel: "canonical", href: CONTENT.SITE_URL }, []),
      tag(
        "meta",
        { property: "og:title", content: CONTENT.META_TITLE },
        []
      ),
      tag("meta", { property: "og:description", content: metaDescription() }, []),
      tag("meta", { property: "og:image", content: sitePreviewImageUrl }, []),
      tag(
        "meta",
        { property: "og:image:secure_url", content: sitePreviewImageUrl },
        []
      ),
      tag(
        "meta",
        {
          property: "og:image:width",
          content: String(SITE_PREVIEW_IMAGE.width),
        },
        []
      ),
      tag(
        "meta",
        {
          property: "og:image:height",
          content: String(SITE_PREVIEW_IMAGE.height),
        },
        []
      ),
      tag("meta", { property: "og:image:alt", content: sitePreviewImageAlt }, []),
      tag("meta", { property: "og:image:type", content: "image/webp" }, []),
      tag(
        "meta",
        { property: "og:url", content: CONTENT.SITE_URL },
        []
      ),
      tag(
        "meta",
        { property: "og:type", content: "website" },
        []
      ),
      tag(
        "meta",
        { property: "og:site_name", content: CONTENT.PAGE_TITLE },
        []
      ),
      tag(
        "meta",
        { name: "twitter:card", content: "summary_large_image" },
        []
      ),
      tag(
        "meta",
        { name: "twitter:title", content: CONTENT.META_TITLE },
        []
      ),
      tag("meta", { name: "twitter:description", content: metaDescription() }, []),
      tag("meta", { name: "twitter:image", content: sitePreviewImageUrl }, []),
      tag("meta", { name: "twitter:image:alt", content: sitePreviewImageAlt }, []),
      viewSiteStructuredData(),
      tag("link", { rel: "shortcut icon", href: "/favicon.ico" }, []),
      tag("link", { rel: "icon", href: "/favicon.ico" }, []),
      tag(
        "script",
        { src: "./web-components/toaster-element.js", async: "true" },
        []
      ),
      tag(
        "script",
        { src: "./web-components/loading-spinner-element.js", async: "true" },
        []
      ),
      tag(
        "script",
        { src: "./web-components/image-gallery-modal-element.js", async: "true" },
        []
      ),
      ...HEAD,
    ]),
    tag("body", {}, [
      viewBackdrop(),
      tag(
        "toaster-element",
        {
          id: "toaster",
          "data-bg-color": THEME.colors.paper,
          "data-border-color": THEME.colors.paperBorder,
          "data-text-color": THEME.colors.text,
        },
        []
      ),
      tag("div", { class: "visually-hidden" }, [
        viewImage({
          src: SITE_PREVIEW_IMAGE.path,
          alt: sitePreviewImageAlt,
          fetchPriority: "high",
        })({}, []),
      ]),
      ...(c ?? []),
    ]),
  ]);
};
