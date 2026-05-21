import type { ViewWithProps } from "../library/html/index";
import { tag, text } from "../library/html/index";
import { HEAD } from "./head";
import { THEME, unit } from "./theme";

type Props = { src: string; title?: string };

export const viewYouTubeVideo: ViewWithProps<Props> = (props) => (attrs) => {
  const videoId = `youtube-video-${Math.random().toString(36).substr(2, 9)}`;
  return tag(
    "div",
    {
      ...attrs,
      class: "youtube-video-container",
      id: videoId,
      "data-video-src": props.src,
    },
    [
      tag(
        "div",
        {
          class: "youtube-video-placeholder",
          "data-container-id": videoId,
          style: "cursor: pointer;",
        },
        [
          tag("div", { class: "youtube-video-placeholder-content" }, [
            tag("div", { class: "youtube-video-placeholder-icon" }, [
              text("▶"),
            ]),
          ]),
        ]
      ),
      tag("iframe", {
        "data-src": props.src,
        class: "youtube-video",
        allow:
          "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
        allowfullscreen: "true",
        frameborder: "0",
        title: props.title || "YouTube video",
        loading: "lazy",
        style: "display: none;",
      }),
    ]
  );
};

HEAD.push(
  tag("script", {}, [
    text(`
      function loadYouTubeIframe(containerId, videoSrc) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const placeholder = container.querySelector('.youtube-video-placeholder');
        const iframe = container.querySelector('.youtube-video');
        
        if (iframe && iframe.getAttribute('data-src')) {
          iframe.src = iframe.getAttribute('data-src');
          iframe.style.display = 'block';
          if (placeholder) {
            placeholder.style.display = 'none';
          }
        }
      }
      
      // Load YouTube iframe when it's about to enter viewport
      function initYouTubeLazyLoad() {
        // Set up click handlers for placeholders
        document.querySelectorAll('.youtube-video-placeholder').forEach(placeholder => {
          const containerId = placeholder.getAttribute('data-container-id');
          if (containerId) {
            placeholder.addEventListener('click', function() {
              const container = document.getElementById(containerId);
              if (container) {
                const videoSrc = container.getAttribute('data-video-src');
                if (videoSrc) {
                  loadYouTubeIframe(containerId, videoSrc);
                }
              }
            });
          }
        });
        
        // Set up intersection observer for auto-loading
        if ('IntersectionObserver' in window) {
          const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                const container = entry.target;
                const iframe = container.querySelector('.youtube-video');
                const videoSrc = container.getAttribute('data-video-src');
                if (iframe && videoSrc && !iframe.src) {
                  loadYouTubeIframe(container.id, videoSrc);
                }
                observer.unobserve(container);
              }
            });
          }, { rootMargin: '50px' });
          
          document.querySelectorAll('.youtube-video-container').forEach(container => {
            observer.observe(container);
          });
        }
      }
      
      // Initialize when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initYouTubeLazyLoad);
      } else {
        // DOM already loaded, run immediately
        setTimeout(initYouTubeLazyLoad, 0);
      }
    `),
  ])
);

HEAD.push(
  tag("style", {}, [
    text(`
      .youtube-video-container {
        width: 100%;        
        position: relative;
        padding-bottom: 56.25%; /* 16:9 aspect ratio */
        height: 0;
        overflow: hidden;
        border-radius: 8px;
        background: linear-gradient(
          135deg,
          ${THEME.colors.paper} 0%,
          ${THEME.colors.skeleton} 100%
        );
        border: 1px solid ${THEME.colors.paperBorder};
      }
      .youtube-video-placeholder {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2;
        transition: opacity 0.3s ease;
      }
      .youtube-video-placeholder-content {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background-color: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
      .youtube-video-placeholder-icon {
        font-size: 32px;
        color: ${THEME.colors.text};
        opacity: 0.9;
        margin-left: 4px;
      }
      .youtube-video {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: none;
        border-radius: 8px;
        z-index: 1;
        background-color: ${THEME.colors.paper};
      }
    `),
  ])
);
