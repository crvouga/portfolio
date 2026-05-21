import { CONTENT } from "../content/content";
import type { View } from "../library/html/index";
import { viewSchoolCard } from "../shared/school-card/index";
import { viewSection } from "../shared/section";
import { viewGridCollapsible } from "../ui/grid-collapsible";

export const viewSchoolSection: View = () => {
  const section = CONTENT.GET_SECTION("education");
  return viewSection({
    title: section.title,
    number: section.number,
  })({ id: section.id }, [
    viewGridCollapsible({
      children: CONTENT.SCHOOL.map((education) =>
        viewSchoolCard({ school: education })()
      ),
      jsVarSafeNamespace: "schoolSection",
    })(),
  ]);
};
