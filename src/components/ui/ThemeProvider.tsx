"use client";

// Light and dark theme.
// - By default the app follows the phone's setting (globals.css handles that with a media query).
// - Tapping the toggle saves an explicit choice: class "light" or "dark" on <html>.
// - ThemeScript runs before the page paints, so a saved choice never flashes the wrong theme.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "gullyscore.theme";
export type Theme = "light" | "dark";

const SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="dark"||t==="light"){document.documentElement.classList.add(t)}}catch(e){}})();`;

/** Put inside <head>. Applies the saved theme before first paint. */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}

function currentTheme(): Theme {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return "dark";
  if (root.classList.contains("light")) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The theme on screen now, and a function to switch to the other one (and remember it). */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(currentTheme());
    // Follow the phone's setting live, unless the viewer picked one.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(currentTheme());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage blocked: the choice lasts for this visit
    }
    setTheme(next);
  }, []);

  return { theme, toggle };
}
