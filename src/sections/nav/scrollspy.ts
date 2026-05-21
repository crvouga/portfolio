import { tag, text } from "../../library/html/index";
import type { Html } from "../../library/html/index";

export const viewNavScrollspyScript = (): Html => {
  return tag("script", {}, [
    text(`
(function () {
  function init() {
    var bar = document.querySelector('.nav-bar');
    var links = document.querySelectorAll('.nav-link[data-nav-target]');
    if (!bar || links.length === 0) return;

    function onScroll() {
      if (window.scrollY > 8) {
        bar.setAttribute('data-elevated', 'true');
      } else {
        bar.removeAttribute('data-elevated');
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    var linkById = {};
    links.forEach(function (l) {
      linkById[l.getAttribute('data-nav-target')] = l;
    });

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var id = entry.target.getAttribute('id');
          if (!id) return;
          var link = linkById[id];
          if (!link) return;
          if (entry.isIntersecting) {
            Object.keys(linkById).forEach(function (k) {
              linkById[k].removeAttribute('data-active');
            });
            link.setAttribute('data-active', 'true');
          }
        });
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 }
    );

    Object.keys(linkById).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) observer.observe(section);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
    `),
  ]);
};
