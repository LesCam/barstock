import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@barstock/helpProgress";

interface HelpProgress {
  visitedSections: Set<string>;
  percentComplete: number;
  markVisited: (id: string) => void;
}

export function useHelpProgress(totalSections: number): HelpProgress {
  const [visitedSections, setVisitedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as string[];
          setVisitedSections(new Set(parsed));
        } catch {
          // ignore
        }
      }
    });
  }, []);

  const markVisited = useCallback(
    (id: string) => {
      setVisitedSections((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
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
