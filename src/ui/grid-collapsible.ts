import type { Html, ViewWithProps } from "../library/html/index";
import { tag, text } from "../library/html/index";
import { viewButton } from "./button";
import { viewGrid, viewGridItem } from "./grid";
import { HEAD } from "./head";
import { THEME, unit } from "./theme";

const EXTRA_ITEM_CLASS = "grid-collapsible-item-extra";
const PEEK_ITEM_CLASSES = [
  "grid-collapsible-item-peek-1",
  "grid-collapsible-item-peek-2",
  "grid-collapsible-item-peek-3",
] as const;

export const viewGridCollapsible: ViewWithProps<{
  jsVarSafeNamespace: string;
  children: Html[];
  maxVisibleCardCount?: number;
}> = (props) => () => {
  const maxVisibleCardCount = props.maxVisibleCardCount ?? 3;
  const hiddenCardCount = Math.max(
    props.children.length - maxVisibleCardCount,
    0
  );

  // No overflow: render a plain grid; nothing to collapse or fade.
  if (hiddenCardCount === 0) {
    return viewGrid(
      {},
      props.children.map((child) => viewGridItem({}, [child]))
    );
  }

  const namespace = `${props.jsVarSafeNamespace}--toggle-see-more--`;
  const rootId = `${namespace}root`;
  const toggleButtonId = `${namespace}toggle-button`;
  const onClickToggleName = `${props.jsVarSafeNamespace}OnClickToggle`;

  const seeMoreLabel = `See ${hiddenCardCount.toLocaleString()} more`;
  const seeLessLabel = "See less";

  // Items past the visible threshold split into two pools:
  //   - The next 3 (one full row at the widest breakpoint) get peek classes
  //     so they render as a half-visible, masked-out row.
  //   - The rest are flagged as fully hidden when collapsed.
  const classFor = (index: number): string | null => {
    if (index < maxVisibleCardCount) return null;
    const peekIndex = index - maxVisibleCardCount;
    if (peekIndex < PEEK_ITEM_CLASSES.length) {
      return PEEK_ITEM_CLASSES[peekIndex] ?? null;
    }
    return EXTRA_ITEM_CLASS;
  };

  return tag(
    "div",
    {
      id: rootId,
      class: "grid-collapsible",
      "data-expanded": "false",
    },
    [
      tag("script", {}, [
        text(`
          function ${onClickToggleName}(event) {
            const root = document.getElementById(${JSON.stringify(rootId)});
            if (!root) return;
            const button = document.getElementById(${JSON.stringify(toggleButtonId)});
            const isExpanded = root.getAttribute('data-expanded') === 'true';
            const willExpand = !isExpanded;
            if (willExpand) {
              root.setAttribute('data-scroll-position', String(window.scrollY));
              root.setAttribute('data-expanded', 'true');
              if (button) {
                button.textContent = ${JSON.stringify(seeLessLabel)};
                button.setAttribute('aria-expanded', 'true');
              }
            } else {
              root.setAttribute('data-expanded', 'false');
              if (button) {
                button.textContent = ${JSON.stringify(seeMoreLabel)};
                button.setAttribute('aria-expanded', 'false');
              }
              const savedScrollPosition = parseInt(root.getAttribute('data-scroll-position') || '0', 10);
              window.scrollTo({ top: savedScrollPosition, behavior: 'instant' });
            }
          }
        `),
      ]),

      tag("div", { class: "grid-collapsible-content" }, [
        viewGrid(
          {},
          props.children.map((child, index) => {
            const cls = classFor(index);
            return viewGridItem(cls ? { class: cls } : {}, [child]);
          })
        ),
        tag("div", { class: "grid-collapsible-actions" }, [
          viewButton({
            disabled: false,
            size: "xl",
            startDecorator: null,
            tag: "button",
            text: seeMoreLabel,
            variant: "contained",
          })({
            id: toggleButtonId,
            class: "grid-collapsible-toggle",
            type: "button",
            onclick: `${onClickToggleName}(event)`,
            "aria-expanded": "false",
            "aria-controls": rootId,
          }),
        ]),
      ]),
    ]
  );
};

const PEEK_MAX_HEIGHT = "240px";
const PEEK_MASK =
  "linear-gradient(to bottom, rgba(0, 0, 0, 0.66) 0%, rgba(0, 0, 0, 0) 100%)";

HEAD.push(
  tag("style", {}, [
    text(`
      .grid-collapsible {
        position: relative;
        display: flex;
        flex-direction: column;
      }

      .grid-collapsible-content {
        position: relative;
      }

      /* Collapsed: hide everything past the visible threshold by default. */
      .grid-collapsible[data-expanded="false"] .grid-collapsible-item-extra,
      .grid-collapsible[data-expanded="false"] .grid-collapsible-item-peek-1,
      .grid-collapsible[data-expanded="false"] .grid-collapsible-item-peek-2,
      .grid-collapsible[data-expanded="false"] .grid-collapsible-item-peek-3 {
        display: none;
      }

      /* Re-show peek items as a clipped + masked half-row. The number of
         peek items that show matches the current column count so we never
         render a partial peek row. */
      .grid-collapsible[data-expanded="false"] .grid-collapsible-item-peek-1 {
        display: flex;
        max-height: ${PEEK_MAX_HEIGHT};
        overflow: hidden;
        mask-image: ${PEEK_MASK};
        -webkit-mask-image: ${PEEK_MASK};
        pointer-events: none;
      }

      @media (min-width: ${THEME.breakpoints.sm}) {
        .grid-collapsible[data-expanded="false"] .grid-collapsible-item-peek-2 {
          display: flex;
          max-height: ${PEEK_MAX_HEIGHT};
          overflow: hidden;
          mask-image: ${PEEK_MASK};
          -webkit-mask-image: ${PEEK_MASK};
          pointer-events: none;
        }
      }

      @media (min-width: ${THEME.breakpoints.md}) {
        .grid-collapsible[data-expanded="false"] .grid-collapsible-item-peek-3 {
          display: flex;
          max-height: ${PEEK_MAX_HEIGHT};
          overflow: hidden;
          mask-image: ${PEEK_MASK};
          -webkit-mask-image: ${PEEK_MASK};
          pointer-events: none;
        }
      }

      .grid-collapsible-actions {
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2;
        pointer-events: none;
      }

      /* Collapsed: center toggle over the peek strip (same height as peek clip). */
      .grid-collapsible[data-expanded="false"] .grid-collapsible-actions {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: ${PEEK_MAX_HEIGHT};
        align-items: center;
        justify-content: center;
      }

      /* Expanded: button sticks to the viewport bottom while scrolling. */
      .grid-collapsible[data-expanded="true"] .grid-collapsible-actions {
        position: sticky;
        bottom: 16px;
        padding-top: ${unit(4)};
      }

      .grid-collapsible-toggle {
        pointer-events: auto;
        width: fit-content;
        box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.7);
      }
    `),
  ])
);
