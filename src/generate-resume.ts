import { CONTENT } from "./content/content";
import { formatPhoneNumber } from "./library/phone-number";
import { projectToLinkHref } from "./content/project";
import { TOPIC_TO_NAME } from "./content/topic";
import { THEME } from "./ui/theme";
import { chromium } from "playwright";
import { mkdir } from "fs/promises";
import { RESUME_FILENAME } from "./constants/resume";

const formatDateRange = (yearStart: number, yearEnd: number | "Present"): string => {
  if (yearEnd === "Present") {
    return `${yearStart} - Present`;
  }
  return `${yearStart} - ${yearEnd}`;
};

const stripHtmlTags = (text: string): string => {
  return text.replace(/<[^>]*>/g, "").trim();
};

type ResumeData = {
  name: string;
  title: string;
  email: string;
  phone: string;
  website: string;
  summary: string;
  workExperience: Array<{
    company: string;
    jobTitle: string;
    dateRange: string;
    description: string;
    url: string | null;
  }>;
  education: Array<{
    degree: string;
    institution: string;
    dateRange: string;
  }>;
  projects: Array<{
    title: string;
    description: string;
    url: string | null;
    topics: string[];
  }>;
};

const generateResumeHTML = (data: ResumeData): string => {
  const {
    name,
    title,
    email,
    phone,
    website,
    summary,
    workExperience,
    education,
    projects,
  } = data;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} - Resume</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.3;
      color: #333;
      background: #fff;
      padding: 0.45in;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
      border-bottom: 3px solid ${THEME.colors.primary500};
      padding-bottom: 8px;
    }
    
    .header-left {
      flex: 1;
    }
    
    .header-right {
      flex: 1;
      text-align: right;
    }
    
    .header h1 {
      font-size: 20pt;
      font-weight: 700;
      margin-bottom: 2px;
      color: ${THEME.colors.primary500};
    }
    
    .header .title {
      font-size: 11pt;
      font-weight: 400;
      color: #666;
    }
    
    .contact-info {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      font-size: 8pt;
    }
    
    .contact-info a {
      color: #333;
      text-decoration: none;
    }
    
    .contact-info a:hover {
      text-decoration: underline;
    }
    
    .section {
      margin-bottom: 12px;
    }
    
    .section-title {
      font-size: 12pt;
      font-weight: 700;
      margin-bottom: 6px;
      color: ${THEME.colors.primary500};
      border-bottom: 1px solid #ccc;
      padding-bottom: 2px;
    }
    
    .summary {
      text-align: justify;
      margin-bottom: 10px;
      font-size: 9.5pt;
      line-height: 1.35;
    }
    
    .work-item, .education-item, .project-item {
      margin-bottom: 8px;
    }
    
    .work-item:last-child, .education-item:last-child, .project-item:last-child {
      margin-bottom: 0;
    }
    
    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 2px;
    }
    
    .item-title {
      font-weight: 700;
      font-size: 10pt;
      color: #000;
    }
    
    .item-company {
      font-weight: 600;
      font-size: 10pt;
      color: #000;
    }
    
    .item-company a, .item-title a {
      color: inherit;
      text-decoration: none;
    }
    
    .item-company a:hover, .item-title a:hover {
      color: ${THEME.colors.primary500};
      text-decoration: underline;
    }
    
    .item-date {
      font-size: 8.5pt;
      color: #666;
      font-style: italic;
    }
    
    .item-description {
      font-size: 9pt;
      color: #444;
      margin-top: 2px;
      text-align: justify;
      line-height: 1.3;
    }
    
    .project-topics {
      margin-top: 3px;
      font-size: 8pt;
      color: #666;
      font-style: italic;
      line-height: 1.25;
    }
    
    .project-topics span {
      margin-right: 8px;
    }
    
    .project-topics span:not(:last-child)::after {
      content: ",";
    }
    
    @media print {
      body {
        padding: 0.4in;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>${name}</h1>
      <div class="title">${title}</div>
    </div>
    <div class="header-right">
      <div class="contact-info">
        <span>${email}</span>
        <span>${phone}</span>
        <a href="${website}">${website}</a>
      </div>
    </div>
  </div>
  
  ${
    summary
      ? `<div class="section">
    <div class="section-title">Summary</div>
    <div class="summary">${summary}</div>
  </div>`
      : ""
  }
  
  <div class="section">
    <div class="section-title">Work Experience</div>
    ${workExperience
      .map(
        (work) => `
    <div class="work-item">
      <div class="item-header">
        <div>
          <span class="item-title">${work.jobTitle}</span>
          <span> • </span>
          <span class="item-company">${
            work.url
              ? `<a href="${work.url}">${work.company}</a>`
              : work.company
          }</span>
        </div>
        <span class="item-date">${work.dateRange}</span>
      </div>
      <div class="item-description">${work.description}</div>
    </div>`
      )
      .join("")}
  </div>
  
  <div class="section">
    <div class="section-title">Education</div>
    ${education
      .map(
        (edu) => `
    <div class="education-item">
      <div class="item-header">
        <div>
          <span class="item-title">${edu.degree}</span>
          <span> • </span>
          <span class="item-company">${edu.institution}</span>
        </div>
        <span class="item-date">${edu.dateRange}</span>
      </div>
    </div>`
      )
      .join("")}
  </div>
  
  ${
    projects.length > 0
      ? `<div class="section">
    <div class="section-title">Projects</div>
    ${projects
      .map(
        (project) => `
    <div class="project-item">
      <div class="item-header">
        <span class="item-title">${
          project.url
            ? `<a href="${project.url}">${project.title}</a>`
            : project.title
        }</span>
      </div>
      <div class="item-description">${project.description}</div>
      ${
        project.topics && project.topics.length > 0
          ? `<div class="project-topics">${project.topics
              .map((topic) => `<span>${topic}</span>`)
              .join("")}</div>`
          : ""
      }
    </div>`
      )
      .join("")}
  </div>`
      : ""
  }
</body>
</html>`;
};

const generateResume = async () => {
  try {
    const fullSummary = stripHtmlTags(CONTENT.ABOUT_ME).trim();
    const summarySentences = fullSummary
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 0);
    const summary =
      summarySentences.slice(0, 3).join(". ").trim() +
      (summarySentences.length > 3 ? "." : "");

    const workExperience = CONTENT.WORK.map((work) => ({
      company: work.name,
      jobTitle: work.jobTitle,
      dateRange: formatDateRange(work.yearStart, work.yearEnd),
      description: work.jobDescription,
      url: work.infoUrl || null,
    }));

    const education = CONTENT.SCHOOL.map((school) => ({
      degree: school.degree,
      institution: school.institutionName,
      dateRange: formatDateRange(school.yearStart, school.yearEnd),
    }));

    const excludedProjects = [
      "Airr Product Demo",
      "Courier Company Website",
      "Orchard",
      "ASU Earned Admissions",
    ];

    const filteredWorkProjects = CONTENT.WORK_PROJECTS.filter(
      (project) => !excludedProjects.includes(project.title)
    );

    const normalizerApp = CONTENT.SIDE_PROJECTS.find(
      (project) => project.title === "normalizer.app"
    );

    const allProjects = normalizerApp
      ? [normalizerApp, ...filteredWorkProjects]
      : filteredWorkProjects;

    const projects = allProjects.slice(0, 6).map((project) => ({
      title: project.title,
      description: stripHtmlTags(project.description),
      url: projectToLinkHref(project),
      topics: project.topics
        .map((topic) => TOPIC_TO_NAME[topic] || topic)
        .filter(Boolean),
    }));

    const resumeData: ResumeData = {
      name: CONTENT.PAGE_TITLE,
      title: CONTENT.PAGE_SUBTITLE,
      email: CONTENT.EMAIL_ADDRESS,
      phone: formatPhoneNumber(CONTENT.PHONE_NUMBER),
      website: CONTENT.SITE_URL,
      summary,
      workExperience,
      education,
      projects,
    };

    const html = generateResumeHTML(resumeData);

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });

    const publicPath = `${import.meta.dir}/../public`;
    await mkdir(publicPath, { recursive: true });

    const pdfPath = `${publicPath}/${RESUME_FILENAME}`;
    await page.pdf({
      path: pdfPath,
      format: "Letter",
      margin: {
        top: "0.4in",
        right: "0.4in",
        bottom: "0.4in",
        left: "0.4in",
      },
      printBackground: true,
    });

    await browser.close();

    console.log(`Resume generated successfully at: ${pdfPath}`);
  } catch (error) {
    console.error("Error generating resume:", error);
    process.exit(1);
  }
};

if (import.meta.main) {
  generateResume();
}
