"use client";

import { useEffect } from "react";

import { hydrateAuth } from "@/store/auth";
import { applyTheme, readSavedTheme, useUi } from "@/store/ui";

/** Runs once in the browser: restores the saved session and theme, and keeps
 * the "system" theme in step with the operating system. Renders nothing. */
export function Boot() {
  useEffect(() => {
    void hydrateAuth();
    useUi.setState({ theme: readSavedTheme() });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(useUi.getState().theme);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return null;
}
