export type SectionId =
  | "work"
  | "projects"
  | "about"
  | "education"
  | "contact";

export type Section = {
  readonly id: SectionId;
  readonly number: string;
  readonly title: string;
  readonly navLabel: string;
};

export const SECTIONS: readonly Section[] = [
  { id: "work", number: "01", title: "Work", navLabel: "Work" },
  { id: "projects", number: "02", title: "Projects", navLabel: "Projects" },
  { id: "about", number: "03", title: "About", navLabel: "About" },
  {
    id: "education",
    number: "04",
    title: "Education",
    navLabel: "Education",
  },
  { id: "contact", number: "05", title: "Contact", navLabel: "Contact" },
];

export const getSection = (id: SectionId): Section => {
  const found = SECTIONS.find((s) => s.id === id);
  if (!found) {
    throw new Error(`Unknown section id: ${id}`);
  }
  return found;
};
