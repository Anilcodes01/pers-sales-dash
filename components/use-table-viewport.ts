"use client";
import { useLayoutEffect, type RefObject } from "react";
// Keep a definite, bounded scroll height: spacer rows must never size the viewport.
export function useTableViewport(ref: RefObject<HTMLElement | null>, enabled = true) {
  useLayoutEffect(() => {
    const viewport = ref.current?.closest<HTMLElement>(".allocation-sheet-scroll, [data-virtual-scroll]");
    if (!enabled || !viewport) return;
    const card = viewport.closest<HTMLElement>('[data-slot="card"]');
    const boundary = card || viewport.parentElement;
    viewport.setAttribute("data-fill-viewport", "true");
    let frame = 0;
    const fit = () => {
      const bottom = window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight;
      let reserved = 0;
      // Leave the pagination/actions following the table visible at the bottom.
      for (let node: Element | null = viewport; node && node !== boundary; node = node.parentElement) {
        for (let sibling = node.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
          const style = getComputedStyle(sibling);
          if (style.display === "none" || style.position === "absolute" || style.position === "fixed") continue;
          reserved += sibling.getBoundingClientRect().height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
          reserved += parseFloat(getComputedStyle(node.parentElement!).rowGap) || 0;
        }
      }
      const height = `${Math.max(1, Math.floor(bottom - viewport.getBoundingClientRect().top - reserved))}px`;
      if (viewport.style.height !== height) viewport.style.height = height;
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
    const observer = new ResizeObserver(schedule);
    if (card) {
      observer.observe(card);
      for (const child of card.children) if (child !== viewport && !child.contains(viewport)) observer.observe(child);
    }
    const header = viewport.closest(".app-main")?.querySelector(".dashboard-header");
    if (header) observer.observe(header);
    const scroller = viewport.closest(".app-main");
    scroller?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    fit();
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      scroller?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      viewport.removeAttribute("data-fill-viewport"); viewport.style.removeProperty("height");
    };
  }, [ref, enabled]);
}
