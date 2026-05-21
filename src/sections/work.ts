import { CONTENT } from "../content/content";
import type { View } from "../library/html/index";
import { viewSection } from "../shared/section";
import { viewWorkCard } from "../shared/work-card";
import { viewGridCollapsible } from "../ui/grid-collapsible";

export const viewWorkSection: View = () => {
  const section = CONTENT.GET_SECTION("work");
  return viewSection({
    title: section.title,
    number: section.number,
  })({ id: section.id }, [
    viewGridCollapsible({
      children: CONTENT.WORK.map((work, index) =>
        viewWorkCard({
          work,
          fetchPriority: index === 0 ? "high" : "auto",
        })()
      ),
      jsVarSafeNamespace: "workSection",
    })(),
  ]);
};
