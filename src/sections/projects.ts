import { CONTENT } from "../content/content";
import type { View } from "../library/html/index";
import { viewProjectCard } from "../shared/project-card/index";
import { viewSection } from "../shared/section";
import { viewGridCollapsible } from "../ui/grid-collapsible";

export const viewProjectsSection: View = (a) => {
  const N = 3;
  const section = CONTENT.GET_SECTION("projects");
  return viewSection({
    title: section.title,
    number: section.number,
  })({ ...a, id: section.id }, [
    viewGridCollapsible({
      maxVisibleCardCount: 6,
      children: [
        ...CONTENT.PROJECTS.map((project, index) =>
          viewProjectCard({
            project,
            fetchPriority: index < N ? "high" : "auto",
          })()
        ),
      ],
      jsVarSafeNamespace: "projectsSection",
    })(),
  ]);
};
