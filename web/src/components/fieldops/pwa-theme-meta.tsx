"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

const LIGHT = "#1c2233";
const DARK = "#141821";
const BG_LIGHT = "#f4f6f9";
const BG_DARK = "#0f1218";

/**
 * Keeps theme-color / status bar aligned with Light, Dark, or System preference
 * while running in browser or standalone PWA.
 */
export function PwaThemeMeta() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const dark = resolvedTheme === "dark";
    const color = dark ? DARK : LIGHT;
    const bg = dark ? BG_DARK : BG_LIGHT;

    const metas = document.querySelectorAll('meta[name="theme-color"]');
    if (metas.length === 0) {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = color;
      document.head.appendChild(meta);
    } else {
      metas.forEach((meta) => {
        meta.setAttribute("content", color);
      });
    }

    let statusBar = document.querySelector(
      'meta[name="apple-mobile-web-app-status-bar-style"]',
    );
    if (!statusBar) {
      statusBar = document.createElement("meta");
      statusBar.setAttribute("name", "apple-mobile-web-app-status-bar-style");
      document.head.appendChild(statusBar);
    }
    statusBar.setAttribute("content", dark ? "black-translucent" : "default");

    document.documentElement.style.setProperty(
      "--fieldops-pwa-background",
      bg,
    );
  }, [resolvedTheme]);

  return null;
}
