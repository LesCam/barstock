"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "barstock-help-progress";

interface HelpProgress {
  visitedSections: Set<string>;
  percentComplete: number;
  markVisited: (id: string) => void;
}

export function useHelpProgress(totalSections: number): HelpProgress {
  const [visitedSections, setVisitedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        setVisitedSections(new Set(parsed));
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const markVisited = useCallback(
    (id: string) => {
      setVisitedSections((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
        return next;
      });
    },
    [],
  );

  const percentComplete =
    totalSections > 0
      ? Math.round((visitedSections.size / totalSections) * 100)
      : 0;

  return { visitedSections, percentComplete, markVisited };
}
