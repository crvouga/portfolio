import {
  ABOUT_ME,
  ABOUT_ME_ATTR_SAFE,
  ABOUT_YOUTUBE_EMBED_URL,
  ABOUT_YOUTUBE_VIDEO_ID,
  ABOUT_YOUTUBE_VIDEO_TITLE,
  ABOUT_CURSOR_GIFT_TEXT,
  ABOUT_GITHUB_HEATMAP_TEXT,
} from "./about";
import { CONTACT_COPY } from "./contact";
import { FOOTER_COPY } from "./footer";
import { HERO, MONOGRAM_INITIALS } from "./hero";
import { PROJECTS, SIDE_PROJECTS, WORK_PROJECTS } from "./project";
import { SCHOOL } from "./school";
import { SECTIONS, getSection } from "./sections";
import { WORK } from "./work";

const PAGE_TITLE = "Chris Vouga";

const PAGE_SUBTITLE = "Software Engineer";

export const CONTENT = {
  SITE_URL: "https://www.chrisvouga.dev",
  SITE_SOURCE_CODE_URL: "https://github.com/crvouga/chrisvouga.dev",
  SCREENSHOT_SERVICE_PROJECT_ID: "3e158ff9-0b37-41d1-84d0-cae1397adf4b",
  PAGE_TITLE,
  PAGE_SUBTITLE,
  META_TITLE: `${PAGE_TITLE} • ${PAGE_SUBTITLE}`,
  META_DESCRIPTION: ABOUT_ME_ATTR_SAFE,
  EMAIL_ADDRESS: "crvouga@gmail.com",
  GITHUB_URL: "https://github.com/crvouga",
  LINKEDIN_URL: "https://www.linkedin.com/in/chris-vouga",
  PHONE_NUMBER: "4802098698",
  //
  SECTIONS,
  GET_SECTION: getSection,
  //
  HERO,
  MONOGRAM_INITIALS,
  CONTACT_COPY,
  FOOTER_COPY,
  //
  PROJECT_SECTION_TITLE: getSection("projects").title,
  PROJECTS,
  SIDE_PROJECTS,
  WORK_PROJECTS,
  //
  WORK_SECTION_TITLE: getSection("work").title,
  WORK,
  //
  ABOUT_ME_SECTION_TITLE: getSection("about").title,
  ABOUT_ME,
  ABOUT_YOUTUBE_VIDEO_ID,
  ABOUT_YOUTUBE_EMBED_URL,
  ABOUT_YOUTUBE_VIDEO_TITLE,
  ABOUT_CURSOR_GIFT_TEXT,
  ABOUT_GITHUB_HEATMAP_TEXT,
  //
  SCHOOL_SECTION_TITLE: getSection("education").title,
  SCHOOL,
  //
  CONTACT_SECTION_TITLE: getSection("contact").title,
};
