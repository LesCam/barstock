import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { VoiceButton } from "@/components/VoiceButton";
import { useCountingPreferences } from "@/lib/counting-preferences";
import { useNetwork } from "@/lib/network-context";
import { subscribe, enqueue, getQueue, removeEntry, removeEntriesForSession, type QueueEntry } from "@/lib/offline-queue";
import { useSessionSSE, type SSEEvent, type SSEMode } from "@/lib/use-session-sse";
import { VarianceReasonModal } from "@/components/VarianceReasonModal";
import { SessionActivityFeed, type ActivityEvent } from "@/components/SessionActivityFeed";
import { ConflictModal, type ConflictData } from "@/components/ConflictModal";
import { PacingBar } from "@/components/PacingBar";
import { useFatigueDetection } from "@/lib/use-fatigue-detection";
import type { VarianceReason } from "@barstock/types";

const AVATAR_COLORS = [
  "#2BA8A0", "#E9B44C", "#7C5CFC", "#EF4444",
  "#3B82F6", "#22C55E", "#F97316", "#EC4899",
];

interface BarArea {
  id: string;
  name: string;
  subAreas: { id: string; name: string; sortOrder: number }[];
}

interface UncountedItem {
  inventoryItemId: string;
  name: string;
  countingMethod: string | null;
  categoryName: string | null;
  baseUom: string;
  subAreaName: string;
  acknowledged: boolean;
}

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedLocationId, user: authUser } = useAuth();
  const { hapticEnabled, quickEmptyEnabled } = useCountingPreferences();
  const { isOnline } = useNetwork();
  const utils = trpc.useUtils();

  // Track offline queue for pending sync indicators
  const [offlineQueue, setOfflineQueue] = useState<QueueEntry[]>([]);
  useEffect(() => {
    return subscribe(setOfflineQueue);
  }, []);

  // When the sessions.create entry is synced (removed from queue), clear _pendingSync and refetch
  useEffect(() => {
    const hasCreateEntry = offlineQueue.some(
      (e) => e.mutation === "sessions.create" && (e.input as any).id === id
    );
    const cached = utils.sessions.getById.getData({ id: id! });
    if (!hasCreateEntry && (cached as any)?._pendingSync) {
      utils.sessions.getById.setData({ id: id! }, (old: any) => {
        if (!old) return old;
        const { _pendingSync, ...rest } = old;
        return rest;
      });
      utils.sessions.getById.invalidate({ id: id! });
    }
  }, [offlineQueue, id]);
  const pendingTempIds = useMemo(
    () => new Set(offlineQueue.filter((e) => e.status !== "failed" && e.tempId).map((e) => e.tempId!)),
    [offlineQueue],
  );

  // Track lines with pending update/delete mutations for syncing indicators
  const pendingUpdateLineIds = useMemo(
    () =>
      new Set(
        offlineQueue
          .filter(
            (e) =>
              (e.status === "pending" || e.status === "syncing") &&
              (e.mutation === "sessions.updateLine" || e.mutation === "sessions.deleteLine"),
          )
          .map((e) => (e.input as any).id as string),
      ),
    [offlineQueue],
  );

  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [selectedSubAreaId, setSelectedSubAreaId] = useState<string | null>(null);
  const [fullLocationMode, setFullLocationMode] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [uncountedItems, setUncountedItems] = useState<UncountedItem[]>([]);
  const [varianceItem, setVarianceItem] = useState<{
    itemId: string;
    name: string;
    variance: number;
  } | null>(null);
  const [varianceReasons, setVarianceReasons] = useState<
    Array<{ itemId: string; reason: VarianceReason }>
  >([]);
  const [showReview, setShowReview] = useState(false);
  const [submitMode, setSubmitMode] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [sortMode, setSortMode] = useState<"alphabetical" | "smart">("alphabetical");
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [recentOtherCounts, setRecentOtherCounts] = useState<Map<string, string>>(new Map());
  const [lastBreakAt, setLastBreakAt] = useState<{ items: number; timeMs: number } | null>(null);
  const [conflictData, setConflictData] = useState<ConflictData | null>(null);
  const [pendingClose, setPendingClose] = useState(false);

  // Check for pending close flag on mount
  useEffect(() => {
    if (!id) return;
    AsyncStorage.getItem(`@barstock/pendingClose/${id}`).then((val) => {
      if (val === "1") setPendingClose(true);
    });
  }, [id]);

  // Load persisted sort mode on mount
  useEffect(() => {
    AsyncStorage.getItem("@barstock/countSortMode").then((val) => {
      if (val === "smart" || val === "alphabetical") setSortMode(val);
    });
  }, []);

  const toggleSortMode = useCallback(() => {
    const next = sortMode === "alphabetical" ? "smart" : "alphabetical";
    setSortMode(next);
    AsyncStorage.setItem("@barstock/countSortMode", next);
  }, [sortMode]);

  // Voice capabilities query (session routes are outside tabs tree)
  const { data: capabilities } = trpc.settings.capabilities.useQuery(
    { businessId: authUser?.businessId ?? "" },
    { enabled: !!authUser?.businessId, staleTime: 5 * 60 * 1000 },
  );

  // Count optimization settings + personal pacing target
  const { data: countOptSettings } = trpc.settings.countOptimization.useQuery(
    { businessId: authUser?.businessId ?? "" },
    { enabled: !!authUser?.businessId, staleTime: 300_000 },
  );
  const { data: pacingTarget } = trpc.sessions.personalPacingTarget.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId, staleTime: Infinity },
  );

  // SSE mode tracked for polling fallback — updated by useSessionSSE below
  const [sseMode, setSseMode] = useState<SSEMode>("streaming");

  // Check if this session was created offline and hasn't synced yet
  const isPendingSync = (utils.sessions.getById.getData({ id: id! }) as any)?._pendingSync === true;

  const { data: session, isLoading } = trpc.sessions.getById.useQuery(
    { id: id! },
    {
      staleTime: isPendingSync ? Infinity : 10_000,
      refetchInterval: isPendingSync ? false : (sseMode === "degraded" ? 15_000 : 60_000),
      // Don't hit the server while the session hasn't been created there yet
      networkMode: isPendingSync ? "offlineFirst" : "online",
      retry: isPendingSync ? false : 3,
    }
  );

  // --- Cache warming: prefetch data needed for offline counting ---
  useEffect(() => {
    if (!selectedLocationId || !session || session.endedTs) return;
    utils.inventory.list.prefetch({ locationId: selectedLocationId });
    utils.areas.listBarAreas.prefetch({ locationId: selectedLocationId });
    utils.scale.listTemplates.prefetch({ locationId: selectedLocationId });
  }, [selectedLocationId, session?.id, session?.endedTs]);

  // --- Session timer ---
  useEffect(() => {
    if (!session || session.endedTs) return;
    const start = new Date(session.startedTs).getTime();
    setElapsedMs(Date.now() - start);
    const timer = setInterval(() => setElapsedMs(Date.now() - start), 60_000);
    return () => clearInterval(timer);
  }, [session?.startedTs, session?.endedTs]);

  // --- Multi-user participant support ---
  const joinMutation = trpc.sessions.join.useMutation({
    onError: () => {
      // Session may have been closed externally — refetch to update UI
      utils.sessions.getById.invalidate({ id: id! });
    },
  });
  const heartbeatMutation = trpc.sessions.heartbeat.useMutation();
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Query assignment for current user in this session
  const myAssignment = useMemo(() => {
    if (!session || !authUser) return null;
    return (session as any).assignments?.find((a: any) => a.user?.id === authUser.userId) ?? null;
  }, [session, authUser]);

  // Auto-join when session loads and is open (enqueue if offline for crash-safe deferral)
  const hasJoinedRef = useRef(false);
  useEffect(() => {
    if (!session || session.endedTs || hasJoinedRef.current) return;
    if (isOnline) {
      joinMutation.mutate({ sessionId: session.id });
      hasJoinedRef.current = true;
    } else {
      // Persist join intent — dedup against existing queue entries
      getQueue().then((q) => {
        const alreadyQueued = q.some(
          (e) => e.mutation === "sessions.join" && (e.input as any).sessionId === session.id,
        );
        if (!alreadyQueued) {
          enqueue("sessions.join", { sessionId: session.id });
        }
      });
      hasJoinedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.endedTs, isOnline]);

  // Heartbeat: fires every 30s and immediately on sub-area change (skip when offline)
  const sendHeartbeat = useCallback(() => {
    if (!session || session.endedTs || !isOnline) return;
    heartbeatMutation.mutate({
      sessionId: session.id,
      currentSubAreaId: selectedSubAreaId ?? undefined,
    });
  }, [session?.id, session?.endedTs, selectedSubAreaId, isOnline]);

  useEffect(() => {
    if (!session || session.endedTs) return;
    // Fire immediately on sub-area change
    sendHeartbeat();
    // Set up 30s interval
    heartbeatRef.current = setInterval(sendHeartbeat, 30_000);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [sendHeartbeat]);

  // Poll participants (SSE primary, polling fallback — faster in degraded mode)
  const { data: participants } = trpc.sessions.listParticipants.useQuery(
    { sessionId: id! },
    {
      enabled: !!session && !session.endedTs,
      refetchInterval: sseMode === "degraded" ? 15_000 : 60_000,
    }
  );

  // --- SSE for real-time updates ---
  const handleSSEEvent = useCallback((event: SSEEvent) => {
    if (event.type === "line_added" || event.type === "line_deleted") {
      utils.sessions.getById.invalidate({ id: id! });
      utils.sessions.previewClose.invalidate({ sessionId: id! });
    }
    if (event.type === "participant_joined" || event.type === "participant_left" ||
        event.type === "area_claimed" || event.type === "area_released") {
      utils.sessions.listParticipants.invalidate({ sessionId: id! });
    }
    if (event.type === "session_closed") {
      utils.sessions.getById.invalidate({ id: id! });
      utils.sessions.list.invalidate();
      // Clean up orphaned queue entries for this session
      removeEntriesForSession(id!).then((removedCount) => {
        AsyncStorage.removeItem(`@barstock/pendingClose/${id}`);
        const msg = removedCount > 0
          ? `This session was closed by another user. ${removedCount} queued item${removedCount !== 1 ? "s were" : " was"} removed.`
          : "This session was closed by another user.";
        Alert.alert("Session Closed", msg, [
          { text: "OK", onPress: () => router.back() },
        ]);
      });
      return;
    }

    // Activity feed — filter out own events
    const payload = event.payload as Record<string, unknown> | undefined;
    if (payload && payload.countedBy !== authUser?.userId && payload.userId !== authUser?.userId) {
      const displayName = (payload.displayName as string) || "Someone";
      let text = "";
      if (event.type === "line_added") {
        text = `${displayName} counted ${payload.itemName ?? "an item"}`;
      } else if (event.type === "line_deleted") {
        text = `${displayName} removed an item`;
      } else if (event.type === "participant_joined") {
        text = `${displayName} joined the session`;
      } else if (event.type === "area_claimed") {
        text = `${displayName} claimed ${payload.subAreaName ?? "an area"}`;
      }
      if (text) {
        setActivityEvents((prev) => {
          const next = [
            { id: `${Date.now()}_${Math.random()}`, text, displayName, timestamp: Date.now() },
            ...prev,
          ];
          return next.slice(0, 10);
        });
      }
    }

    // "Just counted" indicator for other users
    if (event.type === "line_added" && payload && payload.countedBy !== authUser?.userId) {
      const itemId = payload.itemId as string | undefined;
      const displayName = (payload.displayName as string) || "Someone";
      if (itemId) {
        setRecentOtherCounts((prev) => {
          const next = new Map(prev);
          next.set(itemId, displayName);
          return next;
        });
        // Auto-clear after 10 seconds
        setTimeout(() => {
          setRecentOtherCounts((prev) => {
            const next = new Map(prev);
            next.delete(itemId);
            return next;
          });
        }, 10_000);
      }
    }
  }, [id, authUser?.userId, utils]);

  const { mode: currentSseMode } = useSessionSSE(id, !!session && !session?.endedTs, handleSSEEvent, isOnline);

  // Sync SSE mode to component state so polling intervals react to degradation
  useEffect(() => {
    setSseMode(currentSseMode);
  }, [currentSseMode]);

  // Count participants per sub-area (excluding current user)
  const subAreaParticipantCounts = useMemo(() => {
    if (!participants || !authUser) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const p of participants) {
      if (p.userId === authUser.userId) continue; // skip self
      if (p.subArea?.id) {
        counts.set(p.subArea.id, (counts.get(p.subArea.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [participants, authUser]);

  // Per sub-area participant details for colored avatars
  const subAreaParticipants = useMemo(() => {
    if (!participants || !authUser) return new Map<string, Array<{ name: string; idx: number }>>();
    const map = new Map<string, Array<{ name: string; idx: number }>>();
    participants.forEach((p, idx) => {
      if (p.userId === authUser.userId) return;
      if (p.subArea?.id) {
        const list = map.get(p.subArea.id) ?? [];
        const name = p.user.firstName || p.user.email.split("@")[0];
        list.push({ name, idx });
        map.set(p.subArea.id, list);
      }
    });
    return map;
  }, [participants, authUser]);

  const { data: areas } = trpc.areas.listBarAreas.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId, staleTime: 5 * 60 * 1000 }
  );

  // Auto-claim assigned sub-area after join
  useEffect(() => {
    if (!myAssignment?.subAreaId || !session || session.endedTs) return;
    if (selectedSubAreaId === myAssignment.subAreaId) return;
    const subArea = myAssignment.subArea;
    if (subArea?.barArea) {
      const barAreaId = areas?.find((a: any) =>
        a.subAreas.some((sa: any) => sa.id === myAssignment.subAreaId)
      )?.id;
      if (barAreaId && barAreaId !== selectedAreaId) {
        setSelectedAreaId(barAreaId);
      }
      setSelectedSubAreaId(myAssignment.subAreaId);
    }
  }, [myAssignment?.subAreaId, session?.id, areas]);

  // Live expected items for currently selected area
  const { data: expectedItemsForArea } = trpc.sessions.expectedItemsForArea.useQuery(
    {
      locationId: selectedLocationId!,
      barAreaId: selectedAreaId!,
      subAreaId: selectedSubAreaId ?? undefined,
      sortMode,
    },
    { enabled: !!selectedLocationId && !!selectedAreaId && !fullLocationMode, staleTime: 15_000 }
  );

  // Full location expected items (always fetched — used for progress indicators)
  const { data: expectedItemsForLocation } = trpc.sessions.expectedItemsForLocation.useQuery(
    { locationId: selectedLocationId!, sortMode },
    { enabled: !!selectedLocationId, staleTime: 15_000 }
  );

  // Prefetch count hints for offline availability
  useEffect(() => {
    if (!selectedLocationId || !session || session.endedTs) return;
    if (!expectedItemsForLocation) return;
    const allItemIds = (expectedItemsForLocation as any[]).map((i: any) => i.inventoryItemId);
    if (allItemIds.length > 0) {
      utils.sessions.itemCountHints.prefetch({
        locationId: selectedLocationId,
        inventoryItemIds: allItemIds,
      });
    }
  }, [selectedLocationId, expectedItemsForLocation, session?.endedTs]);

  const expectedItems = fullLocationMode ? expectedItemsForLocation : expectedItemsForArea;

  // Preview close data for submit mode
  const { data: previewData, isLoading: previewLoading } = trpc.sessions.previewClose.useQuery(
    { sessionId: id! },
    { enabled: !!id && submitMode && showReview }
  );

  // Compute which expected items have been counted in this session
  const expectedChecklist = useMemo(() => {
    if (!expectedItems || !session?.lines) return [];
    if (fullLocationMode) {
      // In full location mode, match by both itemId + subAreaId
      // so Bud Light in Walk-In and Bud Light in Main Bar are tracked separately
      const countedPairs = new Set(
        session.lines.map((l: any) => `${l.inventoryItemId}|${l.subArea?.id ?? ""}`)
      );
      return expectedItems.map((item: any) => ({
        ...item,
        counted: countedPairs.has(`${item.inventoryItemId}|${item.subAreaId ?? ""}`),
      }));
    }
    // Area mode: just check by itemId
    const countedItemIds = new Set(
      session.lines.map((l: any) => l.inventoryItemId)
    );
    return expectedItems.map((item: any) => ({
      ...item,
      counted: countedItemIds.has(item.inventoryItemId),
    }));
  }, [expectedItems, session?.lines, fullLocationMode]);

  // Fetch count hints for expected items
  const expectedItemIds = useMemo(
    () => (expectedItems ?? []).map((i: any) => i.inventoryItemId),
    [expectedItems]
  );
  const { data: countHints } = trpc.sessions.itemCountHints.useQuery(
    { locationId: selectedLocationId!, inventoryItemIds: expectedItemIds },
    { enabled: !!selectedLocationId && expectedItemIds.length > 0 }
  );
  const hintsMap = useMemo(() => {
    if (!countHints) return new Map<string, (typeof countHints & object)[number]>();
    return new Map(countHints.map((h) => [h.inventoryItemId, h]));
  }, [countHints]);

  // Fatigue detection
  const fatigueResult = useFatigueDetection(
    (session?.lines ?? []) as any[],
    hintsMap as any,
    countOptSettings ?? null,
  );

  // Restore lastBreakAt from AsyncStorage on mount
  useEffect(() => {
    if (!id) return;
    AsyncStorage.getItem(`@barstock/lastBreakAt/${id}`).then((val) => {
      if (val) {
        try { setLastBreakAt(JSON.parse(val)); } catch { /* ignore */ }
      }
    });
  }, [id]);

  const handleDismissBreak = useCallback(() => {
    const breakPoint = { items: session?.lines.length ?? 0, timeMs: elapsedMs };
    setLastBreakAt(breakPoint);
    if (id) AsyncStorage.setItem(`@barstock/lastBreakAt/${id}`, JSON.stringify(breakPoint));
  }, [id, session?.lines.length, elapsedMs]);

  const expectedTotal = expectedChecklist.length;
  const expectedCounted = expectedChecklist.filter((i: any) => i.counted).length;

  // Compute priority score quartiles for colored dot indicators
  const priorityQuartiles = useMemo(() => {
    const uncounted = expectedChecklist.filter((i: any) => !i.counted);
    const scores = uncounted.map((i: any) => (i.priorityScore as number) ?? 0).sort((a, b) => a - b);
    if (scores.length === 0) return { q25: 0, q50: 0, q75: 0 };
    return {
      q25: scores[Math.floor(scores.length * 0.25)] ?? 0,
      q50: scores[Math.floor(scores.length * 0.5)] ?? 0,
      q75: scores[Math.floor(scores.length * 0.75)] ?? 0,
    };
  }, [expectedChecklist]);

  function formatHint(hint: { lastCountValue: number | null; lastCountDate: Date | string; avgDailyUsage: number | null; isWeight?: boolean }) {
    const parts: string[] = [];
    if (hint.lastCountValue != null) {
      const daysAgo = Math.round((Date.now() - new Date(hint.lastCountDate).getTime()) / 86400000);
      const unit = hint.isWeight ? "g" : " units";
      parts.push(`Last: ${Math.round(hint.lastCountValue * 10) / 10}${unit}`);
      if (daysAgo > 0) parts[0] += ` (${daysAgo}d ago)`;
    }
    if (hint.avgDailyUsage != null && hint.avgDailyUsage > 0) {
      parts.push(`~${(Math.round(hint.avgDailyUsage * 10) / 10)}/day`);
    }
    if (hint.lastCountValue != null && hint.avgDailyUsage != null && hint.avgDailyUsage > 0) {
      const daysAgo = (Date.now() - new Date(hint.lastCountDate).getTime()) / 86400000;
      const predicted = Math.max(0, hint.lastCountValue - hint.avgDailyUsage * daysAgo);
      const unit = hint.isWeight ? "g" : "";
      parts.push(`Est: ~${Math.round(predicted * 10) / 10}${unit}`);
    }
    return parts.join(" · ");
  }

  function handleExpectedItemTap(item: { inventoryItemId: string; name: string; countingMethod: string; subAreaId?: string; subAreaName?: string }) {
    if (!areaSelected) return;
    // In full location mode, use the item's own subAreaId and auto-select it
    let subAreaForItem = selectedSubAreaId ?? "";
    let labelForItem = areaLabel;
    if (fullLocationMode && item.subAreaId) {
      subAreaForItem = item.subAreaId;
      labelForItem = item.subAreaName ?? "Full Location";
      // Auto-select this item's area/subarea in the picker
      for (const area of (areas as BarArea[]) ?? []) {
        const sa = area.subAreas.find((s: { id: string }) => s.id === item.subAreaId);
        if (sa) {
          setSelectedAreaId(area.id);
          setSelectedSubAreaId(sa.id);
          break;
        }
      }
    }
    // Navigate to scan-weigh with itemId pre-selected — skips barcode scan
    router.push(
      `/session/${id}/scan-weigh?subAreaId=${subAreaForItem}&areaName=${encodeURIComponent(labelForItem)}&itemId=${item.inventoryItemId}` as any
    );
  }

  // Quick empty: add line with 0 for an expected item
  const quickEmptyMutation = trpc.sessions.addLine.useMutation({
    onSuccess(result) {
      utils.sessions.getById.invalidate({ id: id! });
      if ((result as any).warning) {
        Alert.alert("Already Counted", (result as any).warning);
      }
    },
  });

  function handleQuickEmpty(item: { inventoryItemId: string; name: string; countingMethod: string; subAreaId?: string }) {
    if (!quickEmptyEnabled) return;
    Alert.alert("Mark Empty?", `${item.name} — record as 0?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark Empty",
        style: "destructive",
        onPress: () => {
          if (hapticEnabled) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
          const saId = item.subAreaId || selectedSubAreaId || undefined;
          if (item.countingMethod === "weighable") {
            quickEmptyMutation.mutate({
              sessionId: id!,
              inventoryItemId: item.inventoryItemId,
              grossWeightGrams: 0,
              isManual: true,
              subAreaId: saId,
            });
          } else {
            quickEmptyMutation.mutate({
              sessionId: id!,
              inventoryItemId: item.inventoryItemId,
              countUnits: 0,
              isManual: true,
              subAreaId: saId,
            });
          }
        },
      },
    ]);
  }

  const [pendingVarianceItemIds, setPendingVarianceItemIds] = useState<string[]>([]);

  function promptVarianceForItem(itemId: string) {
    const line = session?.lines.find((l: any) => l.inventoryItemId === itemId);
    const name = (line as any)?.inventoryItem?.name ?? itemId;
    const counted = line
      ? Number((line as any).countUnits ?? (line as any).grossWeightGrams ?? 0)
      : 0;
    // Use preview data for real variance if available
    const preview = previewData?.lines.find((v) => v.inventoryItemId === itemId);
    const variance = preview ? preview.variance : -counted;
    setVarianceItem({ itemId, name, variance });
  }

  const closeMutation = trpc.sessions.close.useMutation({
    onSuccess() {
      setShowVerification(false);
      setPendingVarianceItemIds([]);
      Alert.alert("Session Closed", "Adjustments have been created.");
      utils.sessions.getById.invalidate({ id: id! });
      utils.sessions.list.invalidate();
    },
    onError(error: { message: string }) {
      // Parse variance reasons required error
      const match = error.message.match(/Variance reasons required for items:\s*(.+)/);
      if (match) {
        const ids = match[1].split(",").map((s) => s.trim());
        setPendingVarianceItemIds(ids);
        // Start prompting for the first item
        promptVarianceForItem(ids[0]);
      } else {
        Alert.alert("Error", error.message);
      }
    },
  });

  const updateLine = trpc.sessions.updateLine.useMutation({
    onSuccess() {
      utils.sessions.getById.invalidate({ id: id! });
    },
    onError(error: { message: string }) {
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.type === "CONFLICT") {
          setConflictData({
            lineId: editingLineId ?? "",
            myValues: {
              countUnits: editingQty ? parseInt(editingQty, 10) : undefined,
            },
            theirValues: parsed.theirValues,
            theirName: parsed.theirName,
            currentUpdatedAt: parsed.currentUpdatedAt,
          });
          return;
        }
      } catch {
        // Not a conflict error
      }
      Alert.alert("Error", error.message);
    },
  });

  const deleteLine = trpc.sessions.deleteLine.useMutation({
    onSuccess() {
      utils.sessions.getById.invalidate({ id: id! });
    },
  });

  // Resolve selected area/subarea objects
  const selectedArea = areas?.find((a: BarArea) => a.id === selectedAreaId) ?? null;
  const selectedSubArea = selectedArea?.subAreas.find(
    (sa: { id: string }) => sa.id === selectedSubAreaId
  ) ?? null;

  // Auto-select first area if none selected
  if (areas?.length && !selectedAreaId) {
    const first = areas[0] as BarArea;
    setSelectedAreaId(first.id);
    if (first.subAreas.length > 0) {
      setSelectedSubAreaId(first.subAreas[0].id);
    }
  }

  // --- Claim/Release mutations ---
  const claimSubAreaMut = trpc.sessions.claimSubArea.useMutation({
    onSuccess: (result, variables) => {
      setSelectedSubAreaId(variables.subAreaId);
      utils.sessions.listParticipants.invalidate({ sessionId: id! });
      if (result.takenOver) {
        Alert.alert("Area Claimed", `Took over from ${result.takenOver.displayName} (idle)`);
      }
    },
    onError: (err) => {
      Alert.alert("Area Claimed", err.message);
    },
  });

  const releaseSubAreaMut = trpc.sessions.releaseSubArea.useMutation({
    onSuccess: () => {
      setSelectedSubAreaId(null);
      utils.sessions.listParticipants.invalidate({ sessionId: id! });
    },
  });

  // Claim a sub-area (replaces warnIfOccupied)
  function claimArea(subAreaId: string) {
    if (!isOnline) {
      // Still allow local selection, just skip the server claim
      setSelectedSubAreaId(subAreaId);
      return;
    }
    claimSubAreaMut.mutate({ sessionId: id!, subAreaId });
  }

  // When area changes, auto-select first sub-area via claim
  function handleAreaSelect(area: BarArea) {
    setSelectedAreaId(area.id);
    if (area.subAreas.length > 0) {
      claimArea(area.subAreas[0].id);
    } else {
      setSelectedSubAreaId(null);
    }
  }

  // Group session lines by bar area for review modal
  const groupedLines = useMemo(() => {
    if (!session?.lines) return [];
    const groups = new Map<string, { areaName: string; lines: typeof session.lines }>();
    for (const line of session.lines) {
      const areaName = line.subArea?.barArea?.name ?? "No Area";
      const key = line.subArea?.barArea?.id ?? "none";
      if (!groups.has(key)) {
        groups.set(key, { areaName, lines: [] });
      }
      groups.get(key)!.lines.push(line);
    }
    return Array.from(groups.entries()).map(([_key, group]) => ({
      title: group.areaName,
      data: group.lines,
    }));
  }, [session?.lines]);

  // Get distinct bar area IDs worked this session
  const workedAreaIds = useMemo(() => {
    if (!session?.lines) return [];
    const ids = new Set<string>();
    for (const line of session.lines) {
      if (line.subArea?.barArea?.id) {
        ids.add(line.subArea.barArea.id);
      }
    }
    return Array.from(ids);
  }, [session?.lines]);

  // --- Progress maps for area/sub-area pills ---
  const areaProgressMap = useMemo(() => {
    const map = new Map<string, { counted: number; total: number }>();
    if (!expectedItemsForLocation || !areas || !session?.lines) return map;

    // Build subAreaId → barAreaId lookup
    const subAreaToArea = new Map<string, string>();
    for (const area of areas as BarArea[]) {
      for (const sa of area.subAreas) {
        subAreaToArea.set(sa.id, area.id);
      }
    }

    // Count total expected per area
    for (const item of expectedItemsForLocation as any[]) {
      const areaId = item.subAreaId ? subAreaToArea.get(item.subAreaId) : undefined;
      if (!areaId) continue;
      const entry = map.get(areaId) ?? { counted: 0, total: 0 };
      entry.total++;
      map.set(areaId, entry);
    }

    // Count unique items counted per area
    const countedPairs = new Set<string>();
    for (const line of session.lines) {
      const areaId = (line as any).subArea?.barArea?.id;
      if (!areaId) continue;
      const key = `${areaId}|${(line as any).inventoryItemId}`;
      if (!countedPairs.has(key)) {
        countedPairs.add(key);
        const entry = map.get(areaId);
        if (entry) entry.counted++;
      }
    }

    return map;
  }, [expectedItemsForLocation, areas, session?.lines]);

  const subAreaProgressMap = useMemo(() => {
    const map = new Map<string, { counted: number; total: number }>();
    if (!expectedItemsForLocation || !session?.lines) return map;

    // Count total expected per sub-area
    for (const item of expectedItemsForLocation as any[]) {
      if (!item.subAreaId) continue;
      const entry = map.get(item.subAreaId) ?? { counted: 0, total: 0 };
      entry.total++;
      map.set(item.subAreaId, entry);
    }

    // Count unique items counted per sub-area
    const countedPairs = new Set<string>();
    for (const line of session.lines) {
      const saId = (line as any).subArea?.id;
      if (!saId) continue;
      const key = `${saId}|${(line as any).inventoryItemId}`;
      if (!countedPairs.has(key)) {
        countedPairs.add(key);
        const entry = map.get(saId);
        if (entry) entry.counted++;
      }
    }

    return map;
  }, [expectedItemsForLocation, session?.lines]);

  // Cancel pending offline close
  function handleCancelPendingClose() {
    getQueue().then((q) => {
      const closeEntry = q.find(
        (e) => e.mutation === "sessions.close" && (e.input as any).sessionId === id,
      );
      if (closeEntry) removeEntry(closeEntry.id);
    });
    AsyncStorage.removeItem(`@barstock/pendingClose/${id}`);
    setPendingClose(false);
  }

  // Handle close session — triggers verification flow
  async function handleCloseSession() {
    if (!isOnline) {
      // Offline close: enqueue and mark as pending
      Alert.alert(
        "Close Offline?",
        "You're offline. The session close will be queued and submitted when you reconnect.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Queue Close",
            onPress: async () => {
              await enqueue("sessions.close", { sessionId: id!, varianceReasons });
              await AsyncStorage.setItem(`@barstock/pendingClose/${id}`, "1");
              setPendingClose(true);
              // Optimistically mark session as closing in cache
              utils.sessions.getById.setData({ id: id! }, (old: any) => {
                if (!old) return old;
                return { ...old, _pendingClose: true };
              });
              Alert.alert("Queued", "Session close has been queued. It will be submitted when you're back online.");
              router.back();
            },
          },
        ],
      );
      return;
    }
    // If there are pending queue items for this session, queue the close
    // so it processes after pending lines (priority ordering handles this)
    const sessionLineIds = new Set(session?.lines.map((l: any) => l.id) ?? []);
    const pendingForSession = offlineQueue.filter((e) => {
      if (e.status !== "pending" && e.status !== "syncing") return false;
      if ((e.input as any).sessionId === id) return true;
      if (
        (e.mutation === "sessions.deleteLine" || e.mutation === "sessions.updateLine") &&
        sessionLineIds.has((e.input as any).id)
      )
        return true;
      return false;
    });
    if (pendingForSession.length > 0) {
      // Queue close instead of blocking — priority 6 ensures it runs after pending lines
      await enqueue("sessions.close", { sessionId: id!, varianceReasons });
      await AsyncStorage.setItem(`@barstock/pendingClose/${id}`, "1");
      setPendingClose(true);
      utils.sessions.getById.setData({ id: id! }, (old: any) => {
        if (!old) return old;
        return { ...old, _pendingClose: true };
      });
      Alert.alert("Queued", `Session close queued behind ${pendingForSession.length} pending item(s). It will complete when sync finishes.`);
      router.back();
      return;
    }
    if (workedAreaIds.length === 0) {
      closeMutation.mutate({ sessionId: id! });
      return;
    }

    try {
      const allExpected: UncountedItem[] = [];
      for (const areaId of workedAreaIds) {
        // Race against a 5s timeout to handle flaky/offline connectivity
        const expected = await Promise.race([
          utils.sessions.expectedItemsForArea.fetch({
            locationId: selectedLocationId!,
            barAreaId: areaId,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 5000)
          ),
        ]);
        const countedItemIds = new Set(
          session!.lines
            .filter((l: any) => l.subArea?.barArea?.id === areaId)
            .map((l: any) => l.inventoryItemId)
        );
        for (const item of expected) {
          if (!countedItemIds.has(item.inventoryItemId)) {
            allExpected.push({
              inventoryItemId: item.inventoryItemId,
              name: item.name,
              countingMethod: item.countingMethod,
              categoryName: item.categoryName,
              baseUom: item.baseUom,
              subAreaName: item.subAreaName,
              acknowledged: false,
            });
          }
        }
      }

      if (allExpected.length === 0) {
        closeMutation.mutate({ sessionId: id!, varianceReasons });
      } else {
        setUncountedItems(allExpected);
        setShowVerification(true);
      }
    } catch {
      // Network failed or timed out — fall back to queued offline close
      await enqueue("sessions.close", { sessionId: id!, varianceReasons });
      await AsyncStorage.setItem(`@barstock/pendingClose/${id}`, "1");
      setPendingClose(true);
      utils.sessions.getById.setData({ id: id! }, (old: any) => {
        if (!old) return old;
        return { ...old, _pendingClose: true };
      });
      Alert.alert("Queued", "Could not verify items — session close has been queued for when you're back online.");
      router.back();
    }
  }

  function toggleAcknowledge(itemId: string) {
    setUncountedItems((prev) =>
      prev.map((item) =>
        item.inventoryItemId === itemId
          ? { ...item, acknowledged: !item.acknowledged }
          : item
      )
    );
  }

  function handleConfirmClose() {
    const unacknowledgedCount = uncountedItems.filter((item) => !item.acknowledged).length;
    if (unacknowledgedCount > 0) {
      Alert.alert(
        "Uncounted Items",
        `${unacknowledgedCount} item${unacknowledgedCount !== 1 ? "s" : ""} still not counted or skipped. Close anyway?`,
        [
          { text: "Go Back", style: "cancel" },
          {
            text: "Close Anyway",
            style: "destructive",
            onPress: () => {
              setShowVerification(false);
              closeMutation.mutate({ sessionId: id!, varianceReasons });
            },
          },
        ]
      );
      return;
    }
    // Close verification modal first to avoid iOS modal conflict
    setShowVerification(false);
    closeMutation.mutate({ sessionId: id!, varianceReasons });
  }

  function handleSaveEdit(lineId: string) {
    const val = parseInt(editingQty, 10);
    if (isNaN(val) || val < 0) return;
    // Pass expectedUpdatedAt for conflict detection
    const line = session?.lines.find((l: any) => l.id === lineId);
    const expectedUpdatedAt = line?.updatedAt
      ? new Date(line.updatedAt).toISOString()
      : undefined;

    if (!isOnline) {
      enqueue("sessions.updateLine", { id: lineId, countUnits: val, expectedUpdatedAt });
      // Optimistic cache update with pending sync marker
      utils.sessions.getById.setData({ id: id! }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          lines: old.lines.map((l: any) =>
            l.id === lineId ? { ...l, countUnits: val, _pendingSync: true } : l,
          ),
        };
      });
    } else {
      updateLine.mutate({ id: lineId, countUnits: val, expectedUpdatedAt });
    }
    setEditingLineId(null);
    setEditingQty("");
  }

  function handleDeleteLine(lineId: string, itemName: string) {
    Alert.alert("Remove Item", `Remove ${itemName}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          if (!isOnline) {
            enqueue("sessions.deleteLine", { id: lineId });
            // Optimistic: mark as pending delete with strikethrough instead of removing
            utils.sessions.getById.setData({ id: id! }, (old: any) => {
              if (!old) return old;
              return {
                ...old,
                lines: old.lines.map((l: any) =>
                  l.id === lineId ? { ...l, _pendingDelete: true, _pendingSync: true } : l,
                ),
              };
            });
          } else {
            deleteLine.mutate({ id: lineId });
          }
        },
      },
    ]);
  }

  function formatLineValue(line: any) {
    if (line.countUnits != null) {
      const isWeighableItem = line.inventoryItem.category?.countingMethod === "weighable";
      const unit = isWeighableItem ? "units" : line.inventoryItem.baseUom;
      return `${Number(line.countUnits)} ${unit}`;
    }
    if (line.grossWeightGrams != null)
      return `${Number(line.grossWeightGrams)}g`;
    if (line.percentRemaining != null)
      return `${Number(line.percentRemaining)}%`;
    return "—";
  }

  if (isLoading || !session) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading session...</Text>
      </View>
    );
  }

  const isOpen = !session.endedTs;
  const areaSelected = fullLocationMode || !!selectedSubAreaId || (!!selectedAreaId && selectedArea?.subAreas.length === 0);
  const areaLabel = fullLocationMode
    ? "Full Location"
    : selectedArea
      ? selectedSubArea
        ? `${selectedArea.name} — ${selectedSubArea.name}`
        : selectedArea.name
      : "Select Area";
  const lineCount = session.lines.length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Inventory Count</Text>
        <Text style={isOpen ? styles.badgeOpen : styles.badgeClosed}>
          {isOpen ? "Open" : "Closed"}
        </Text>
      </View>
      <Text style={styles.meta}>
        Started: {new Date(session.startedTs).toLocaleString()}
        {lineCount > 0 ? ` — ${lineCount} item${lineCount !== 1 ? "s" : ""}` : ""}
      </Text>

      {/* Pending Close Banner */}
      {pendingClose && (
        <View style={{
          backgroundColor: "rgba(233, 180, 76, 0.15)",
          borderWidth: 1,
          borderColor: "rgba(233, 180, 76, 0.3)",
          borderRadius: 8,
          padding: 12,
          marginHorizontal: 16,
          marginTop: 8,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#E9B44C", fontSize: 13, fontWeight: "600" }}>
              Pending Close
            </Text>
            <Text style={{ color: "#E9B44C", fontSize: 11, opacity: 0.7, marginTop: 2 }}>
              Will submit when back online
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleCancelPendingClose}
            style={{
              borderWidth: 1,
              borderColor: "rgba(233, 180, 76, 0.4)",
              borderRadius: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: "#E9B44C", fontSize: 12, fontWeight: "600" }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {isOpen && elapsedMs > 0 && (
        <PacingBar
          elapsedMs={elapsedMs}
          lineCount={lineCount}
          targetItemsPerHour={pacingTarget?.targetItemsPerHour ?? null}
          breakAfterItems={countOptSettings?.breakAfterItems ?? 40}
          breakAfterMinutes={countOptSettings?.breakAfterMinutes ?? 45}
          fatigueDetected={fatigueResult.detected}
          lastBreakAt={lastBreakAt}
          onDismissBreak={handleDismissBreak}
        />
      )}

      {/* Participant Chips */}
      {isOpen && participants && participants.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.participantRow}
        >
          {participants.map((p, idx) => {
            const isYou = p.userId === authUser?.userId;
            const idleMs = Date.now() - new Date(p.lastActiveAt).getTime();
            const isIdle = idleMs > 2 * 60 * 1000; // 2 minutes
            const displayName = p.user.firstName
              ? p.user.firstName
              : p.user.email.split("@")[0];
            const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
            return (
              <View
                key={p.userId}
                style={[styles.participantChip, isIdle && styles.participantChipIdle]}
              >
                <View style={[styles.participantAvatar, { backgroundColor: avatarColor }]}>
                  <Text style={styles.participantAvatarText}>
                    {displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={styles.participantName}>
                    {displayName}{isYou ? " (you)" : ""}
                  </Text>
                  <Text style={styles.participantArea}>
                    {isIdle ? "idle" : p.subArea?.name ?? "—"}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Activity Feed */}
      {isOpen && activityEvents.length > 0 && (
        <SessionActivityFeed events={activityEvents} />
      )}

      {/* Session Progress Bar */}
      {isOpen && expectedTotal > 0 && (
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.min(100, (expectedCounted / expectedTotal) * 100)}%` },
            ]}
          />
        </View>
      )}

      <ScrollView style={styles.mainScroll} showsVerticalScrollIndicator={false}>
        {/* Area Picker */}
        {isOpen && areas && areas.length > 0 && (
          <View style={styles.areaPicker}>
            <View style={styles.areaPickerHeader}>
              <Text style={styles.areaPickerLabel}>Count Area</Text>
              <TouchableOpacity
                onPress={() => setFullLocationMode(!fullLocationMode)}
              >
                <Text style={[styles.fullLocationLink, fullLocationMode && styles.fullLocationLinkActive]}>
                  {fullLocationMode ? "Area View" : "Full Location"}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.areaPills}
            >
              {(areas as BarArea[]).map((area) => {
                const progress = areaProgressMap.get(area.id);
                const pct = progress && progress.total > 0 ? (progress.counted / progress.total) * 100 : 0;
                const isComplete = progress && progress.total > 0 && progress.counted >= progress.total;
                return (
                  <TouchableOpacity
                    key={area.id}
                    style={[
                      styles.areaPill,
                      selectedAreaId === area.id && styles.areaPillActive,
                      { overflow: "hidden" as const },
                    ]}
                    onPress={() => handleAreaSelect(area)}
                  >
                    {progress && progress.total > 0 && (
                      <View
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: `${pct}%`,
                          backgroundColor: isComplete
                            ? "rgba(34,197,94,0.25)"
                            : "rgba(43,168,160,0.25)",
                        }}
                      />
                    )}
                    <Text
                      style={[
                        styles.areaPillText,
                        selectedAreaId === area.id && styles.areaPillTextActive,
                        isComplete && styles.areaPillTextComplete,
                      ]}
                    >
                      {area.name}
                    </Text>
                    {progress && progress.total > 0 && (
                      <Text
                        style={[
                          styles.areaPillFraction,
                          selectedAreaId === area.id && styles.areaPillFractionActive,
                          isComplete && styles.areaPillFractionComplete,
                        ]}
                      >
                        {progress.counted}/{progress.total}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {selectedArea && selectedArea.subAreas.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.subAreaPills}
              >
                {selectedArea.subAreas.map((sa: { id: string; name: string }) => {
                  const othersHere = subAreaParticipantCounts.get(sa.id) ?? 0;
                  const saProgress = subAreaProgressMap.get(sa.id);
                  const saPct = saProgress && saProgress.total > 0 ? (saProgress.counted / saProgress.total) * 100 : 0;
                  const saComplete = saProgress && saProgress.total > 0 && saProgress.counted >= saProgress.total;
                  return (
                    <TouchableOpacity
                      key={sa.id}
                      style={[
                        styles.subAreaPill,
                        selectedSubAreaId === sa.id && styles.subAreaPillActive,
                        { overflow: "hidden" as const },
                      ]}
                      onPress={() => claimArea(sa.id)}
                    >
                      {saProgress && saProgress.total > 0 && (
                        <View
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${saPct}%`,
                            backgroundColor: saComplete
                              ? "rgba(34,197,94,0.25)"
                              : "rgba(43,168,160,0.25)",
                          }}
                        />
                      )}
                      <Text
                        style={[
                          styles.subAreaPillText,
                          selectedSubAreaId === sa.id && styles.subAreaPillTextActive,
                          saComplete && styles.subAreaPillTextComplete,
                        ]}
                      >
                        {sa.name}
                      </Text>
                      {saProgress && saProgress.total > 0 && (
                        <Text
                          style={[
                            styles.subAreaPillFraction,
                            selectedSubAreaId === sa.id && styles.subAreaPillFractionActive,
                            saComplete && styles.subAreaPillFractionComplete,
                          ]}
                        >
                          {saProgress.counted}/{saProgress.total}
                        </Text>
                      )}
                      {othersHere > 0 && (
                        <View style={{ flexDirection: "row", marginLeft: 4, gap: -4 }}>
                          {(subAreaParticipants.get(sa.id) ?? []).slice(0, 3).map((p) => (
                            <View
                              key={p.idx}
                              style={{
                                width: 16,
                                height: 16,
                                borderRadius: 8,
                                backgroundColor: AVATAR_COLORS[p.idx % AVATAR_COLORS.length],
                                alignItems: "center",
                                justifyContent: "center",
                                borderWidth: 1,
                                borderColor: "#0F1D2E",
                              }}
                            >
                              <Text style={{ color: "#fff", fontSize: 8, fontWeight: "700" }}>
                                {p.name.charAt(0).toUpperCase()}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {areaSelected && (
              <View style={styles.areaBanner}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.areaBannerText}>
                    {fullLocationMode ? "Full Audit" : areaLabel}
                  </Text>
                  {!fullLocationMode && selectedSubAreaId && (
                    <TouchableOpacity
                      onPress={() => releaseSubAreaMut.mutate({ sessionId: id! })}
                      style={styles.releaseBtn}
                    >
                      <Text style={styles.releaseBtnText}>Release</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {fullLocationMode && selectedSubArea && selectedArea && (
                  <Text style={styles.areaBannerSub}>
                    Counting in: {selectedArea.name} — {selectedSubArea.name}
                  </Text>
                )}
                {fullLocationMode && expectedItemsForLocation && (
                  <Text style={styles.areaBannerProgress}>
                    {(() => {
                      let totalCounted = 0;
                      for (const [, v] of areaProgressMap) totalCounted += v.counted;
                      let totalExpected = 0;
                      for (const [, v] of areaProgressMap) totalExpected += v.total;
                      return `${totalCounted}/${totalExpected} items counted`;
                    })()}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Count actions */}
        {isOpen && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.scanWeighBtn, !areaSelected && styles.actionBtnDisabled]}
              disabled={!areaSelected}
              onPress={() =>
                router.push(
                  `/session/${id}/scan-weigh?subAreaId=${selectedSubAreaId ?? ""}&areaName=${encodeURIComponent(areaLabel)}` as any
                )
              }
            >
              <Text style={styles.scanWeighBtnText}>Scan Weigh Count</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, !areaSelected && styles.actionBtnDisabled]}
              disabled={!areaSelected}
              onPress={() =>
                router.push(
                  `/session/${id}/draft?subAreaId=${selectedSubAreaId ?? ""}&areaName=${encodeURIComponent(areaLabel)}` as any
                )
              }
            >
              <Text style={styles.actionText}>Draft Verify</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Assignment Banner */}
        {isOpen && myAssignment && (
          <View style={{
            backgroundColor: "#1a1a3e",
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: "rgba(124,92,252,0.3)",
          }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#7C5CFC" }}>
              Assignment
            </Text>
            {myAssignment.subArea && (
              <Text style={{ fontSize: 12, color: "#EAF0FF", marginTop: 4 }}>
                Area: {myAssignment.subArea.barArea?.name} / {myAssignment.subArea.name}
              </Text>
            )}
            {myAssignment.focusItems?.length > 0 && (
              <Text style={{ fontSize: 12, color: "#8899B2", marginTop: 2 }}>
                Focus: {myAssignment.focusItems.length} item(s)
              </Text>
            )}
          </View>
        )}

        {/* Verification Queue (items flagged by others, blind count) */}
        {isOpen && (() => {
          const flaggedLines = (session?.lines ?? []).filter(
            (l: any) => l.verificationStatus === "flagged" && l.countedBy !== authUser?.userId
          );
          if (flaggedLines.length === 0) return null;
          return (
            <View style={{
              backgroundColor: "#1a2838",
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: "rgba(233,180,76,0.3)",
            }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#E9B44C", marginBottom: 8 }}>
                Verification Queue ({flaggedLines.length})
              </Text>
              <Text style={{ fontSize: 11, color: "#8899B2", marginBottom: 8 }}>
                Count these items independently — original counts are hidden.
              </Text>
              {flaggedLines.map((line: any) => (
                <VerificationLineItem
                  key={line.id}
                  line={line}
                  sessionId={id!}
                />
              ))}
            </View>
          );
        })()}

        {/* Expected Items Checklist */}
        {isOpen && expectedTotal > 0 && (
          <View style={styles.expectedSection}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.expectedTitle}>
                Expected{fullLocationMode ? " at Location" : ` in ${areaLabel}`} — {expectedCounted}/{expectedTotal}
              </Text>
              <TouchableOpacity
                onPress={toggleSortMode}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 12,
                  backgroundColor: sortMode === "smart" ? "rgba(233,180,76,0.15)" : "rgba(255,255,255,0.06)",
                  borderWidth: 1,
                  borderColor: sortMode === "smart" ? "rgba(233,180,76,0.3)" : "rgba(255,255,255,0.1)",
                }}
              >
                <Text style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: sortMode === "smart" ? "#E9B44C" : "rgba(234,240,255,0.6)",
                }}>
                  {sortMode === "smart" ? "Priority" : "A-Z"}
                </Text>
              </TouchableOpacity>
            </View>
            {fullLocationMode ? (
              // Group by area name for full location view
              (() => {
                const groups = new Map<string, typeof expectedChecklist>();
                for (const item of expectedChecklist) {
                  const area = (item as any).subAreaName ?? "Unassigned";
                  if (!groups.has(area)) groups.set(area, []);
                  groups.get(area)!.push(item);
                }
                return Array.from(groups.entries()).map(([area, items]) => (
                  <View key={area}>
                    <Text style={styles.expectedGroupHeader}>{area}</Text>
                    {items.map((item: any) => {
                      const key = `${item.inventoryItemId}|${item.subAreaId ?? ""}`;
                      const hint = hintsMap.get(item.inventoryItemId);
                      return item.counted ? (
                        <TouchableOpacity
                          key={key}
                          style={[styles.expectedRow, styles.expectedRowCounted]}
                          onPress={() => Alert.alert("Recount?", `${item.name} was already counted. Recount it?`, [
                            { text: "Cancel", style: "cancel" },
                            { text: "Recount", onPress: () => handleExpectedItemTap(item) },
                          ])}
                        >
                          <View style={[styles.expectedCheck, styles.expectedCheckDone]}>
                            <Text style={styles.expectedCheckmark}>✓</Text>
                          </View>
                          <Text style={[styles.expectedName, styles.expectedNameCounted]}>
                            {item.name}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          key={key}
                          style={styles.expectedRow}
                          onPress={() => handleExpectedItemTap(item)}
                          onLongPress={quickEmptyEnabled ? () => handleQuickEmpty(item) : undefined}
                        >
                          <View style={styles.expectedCheck} />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Text style={styles.expectedName}>{item.name}</Text>
                              {sortMode === "smart" && (() => {
                                const ps = (item as any).priorityScore ?? 0;
                                const color = ps >= priorityQuartiles.q75 ? "#EF4444" : ps >= priorityQuartiles.q50 ? "#F97316" : ps >= priorityQuartiles.q25 ? "#E9B44C" : null;
                                return color ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} /> : null;
                              })()}
                            </View>
                            {!(item as any).lastCountedAt && sortMode === "smart" && (
                              <Text style={{ fontSize: 10, color: "#F97316", marginTop: 1 }}>Never counted</Text>
                            )}
                            {hint && (
                              <Text style={styles.hintText}>{formatHint(hint)}</Text>
                            )}
                            {recentOtherCounts.has(item.inventoryItemId) && (
                              <Text style={styles.justCountedText}>
                                {recentOtherCounts.get(item.inventoryItemId)} just counted this
                              </Text>
                            )}
                          </View>
                          <Text style={styles.expectedType}>
                            {item.categoryName ?? "Uncategorized"}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ));
              })()
            ) : (
              expectedChecklist.map((item: any) => {
                const hint = hintsMap.get(item.inventoryItemId);
                return item.counted ? (
                  <TouchableOpacity
                    key={item.inventoryItemId}
                    style={[styles.expectedRow, styles.expectedRowCounted]}
                    onPress={() => Alert.alert("Recount?", `${item.name} was already counted. Recount it?`, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Recount", onPress: () => handleExpectedItemTap(item) },
                    ])}
                  >
                    <View style={[styles.expectedCheck, styles.expectedCheckDone]}>
                      <Text style={styles.expectedCheckmark}>✓</Text>
                    </View>
                    <Text style={[styles.expectedName, styles.expectedNameCounted]}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    key={item.inventoryItemId}
                    style={styles.expectedRow}
                    onPress={() => handleExpectedItemTap(item)}
                    onLongPress={quickEmptyEnabled ? () => handleQuickEmpty(item) : undefined}
                  >
                    <View style={styles.expectedCheck} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={styles.expectedName}>{item.name}</Text>
                        {sortMode === "smart" && (() => {
                          const ps = (item as any).priorityScore ?? 0;
                          const color = ps >= priorityQuartiles.q75 ? "#EF4444" : ps >= priorityQuartiles.q50 ? "#F97316" : ps >= priorityQuartiles.q25 ? "#E9B44C" : null;
                          return color ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} /> : null;
                        })()}
                      </View>
                      {!(item as any).lastCountedAt && sortMode === "smart" && (
                        <Text style={{ fontSize: 10, color: "#F97316", marginTop: 1 }}>Never counted</Text>
                      )}
                      {hint && (
                        <Text style={styles.hintText}>{formatHint(hint)}</Text>
                      )}
                    </View>
                    <Text style={styles.expectedType}>
                      {item.categoryName ?? "Uncategorized"}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* Closed session — show summary inline */}
        {!isOpen && lineCount > 0 && (
          <View style={styles.closedSummary}>
            <Text style={styles.closedSummaryTitle}>
              {lineCount} item{lineCount !== 1 ? "s" : ""} counted
            </Text>
            {session.lines.slice(0, 5).map((line: any) => (
              <View key={line.id} style={styles.closedLineRow}>
                <Text style={styles.closedLineName}>{line.inventoryItem.name}</Text>
                <Text style={styles.closedLineValue}>{formatLineValue(line)}</Text>
              </View>
            ))}
            {lineCount > 5 && (
              <TouchableOpacity onPress={() => setShowReview(true)}>
                <Text style={styles.closedShowAll}>Show all {lineCount} items...</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      {isOpen && (
        <View style={styles.footer}>
          <View style={styles.bottomRow}>
            <TouchableOpacity
              style={[styles.reviewBtn, lineCount === 0 && styles.btnDisabled]}
              onPress={() => { setSubmitMode(false); setShowReview(true); }}
              disabled={lineCount === 0}
            >
              <Text style={styles.reviewBtnText}>Review ({lineCount})</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitCountBtn, lineCount === 0 && styles.btnDisabled]}
              onPress={() => { setSubmitMode(true); setShowReview(true); }}
              disabled={lineCount === 0}
            >
              <Text style={styles.submitCountBtnText}>Submit Count</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Review Modal */}
      <Modal visible={showReview} animationType="slide">
        <View style={styles.reviewModalContainer}>
          <View style={styles.reviewModalHeader}>
            <Text style={styles.reviewModalTitle}>
              {submitMode ? "Submit Count" : `Review — ${lineCount} Item${lineCount !== 1 ? "s" : ""}`}
            </Text>
            <TouchableOpacity onPress={() => { setShowReview(false); setSubmitMode(false); }}>
              <Text style={styles.reviewModalClose}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.reviewList}>
            {submitMode && previewLoading && (
              <Text style={styles.reviewEmpty}>Calculating variance...</Text>
            )}
            {groupedLines.map((section) => (
              <View key={section.title}>
                <View style={styles.reviewSectionHeader}>
                  <Text style={styles.reviewSectionTitle}>{section.title}</Text>
                </View>
                {section.data.map((line: any) => {
                  const isEditing = editingLineId === line.id;
                  const variance = submitMode && previewData
                    ? previewData.lines.find((v) => v.inventoryItemId === line.inventoryItemId)
                    : null;
                  const isPendingDelete = !!(line as any)._pendingDelete;
                  const isPendingSync = !!(line as any)._pendingSync || pendingUpdateLineIds.has(line.id);
                  return (
                    <View key={line.id} style={[styles.reviewRow, isPendingDelete && { opacity: 0.4 }]}>
                      <View style={styles.reviewInfo}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={[
                            styles.reviewItemName,
                            isPendingDelete && { textDecorationLine: "line-through" as const },
                          ]}>
                            {line.inventoryItem?.name ?? "Unknown"}
                          </Text>
                          {isPendingDelete ? (
                            <Text style={styles.pendingSyncIcon}> deleting</Text>
                          ) : isPendingSync || pendingTempIds.has(line.id) ? (
                            <Text style={styles.pendingSyncIcon}> syncing</Text>
                          ) : null}
                        </View>
                        <TouchableOpacity
                          onPress={() => {
                            if (!isOpen || submitMode) return;
                            const allSubAreas: { id: string; label: string }[] = [];
                            for (const area of (areas as BarArea[]) ?? []) {
                              for (const sa of area.subAreas) {
                                allSubAreas.push({ id: sa.id, label: `${area.name} — ${sa.name}` });
                              }
                            }
                            Alert.alert(
                              "Change Area",
                              line.inventoryItem?.name,
                              [
                                ...allSubAreas.map((sa) => ({
                                  text: sa.label + (sa.id === line.subArea?.id ? " ✓" : ""),
                                  onPress: () => {
                                    if (sa.id !== line.subArea?.id) {
                                      if (!isOnline) {
                                        enqueue("sessions.updateLine", { id: line.id, subAreaId: sa.id });
                                        // Optimistic cache update for sub-area change
                                        utils.sessions.getById.setData({ id: id! }, (old: any) => {
                                          if (!old) return old;
                                          return {
                                            ...old,
                                            lines: old.lines.map((l: any) =>
                                              l.id === line.id
                                                ? { ...l, subArea: { ...l.subArea, id: sa.id, name: sa.label.split(" — ").pop() } }
                                                : l,
                                            ),
                                          };
                                        });
                                      } else {
                                        updateLine.mutate({ id: line.id, subAreaId: sa.id });
                                      }
                                    }
                                  },
                                })),
                                { text: "Cancel", style: "cancel" as const },
                              ]
                            );
                          }}
                        >
                          <Text style={styles.reviewItemMeta}>
                            {line.inventoryItem?.category?.name ?? ""}
                            {line.subArea ? ` | ${line.subArea.name}` : " | No area"}
                            {isOpen && !submitMode ? "  ✎" : ""}
                          </Text>
                        </TouchableOpacity>
                        {submitMode && variance && (
                          <Text style={[
                            styles.varianceText,
                            variance.theoretical === 0
                              ? styles.varianceGreen
                              : Math.abs(variance.variancePercent) < 5 ? styles.varianceGreen
                              : Math.abs(variance.variancePercent) < 15 ? styles.varianceOrange
                              : styles.varianceRed,
                          ]}>
                            {variance.theoretical === 0
                              ? `Counted: ${Math.round(variance.countedValue * 10) / 10} (first count)`
                              : `Expected: ${Math.round(variance.theoretical * 10) / 10} → Counted: ${Math.round(variance.countedValue * 10) / 10} (${variance.variance > 0 ? "+" : ""}${Math.round(variance.variance * 10) / 10})`}
                          </Text>
                        )}
                      </View>

                      {isEditing ? (
                        <View style={styles.reviewEditGroup}>
                          <TextInput
                            style={styles.reviewQtyInput}
                            value={editingQty}
                            onChangeText={setEditingQty}
                            keyboardType="number-pad"
                            autoFocus
                            selectTextOnFocus
                          />
                          <TouchableOpacity
                            style={styles.reviewSaveBtn}
                            onPress={() => handleSaveEdit(line.id)}
                          >
                            <Text style={styles.reviewSaveBtnText}>Save</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.reviewActions}>
                          <TouchableOpacity
                            onPress={() => {
                              // Disable edit on pending-add lines (server ID doesn't exist yet)
                              if (pendingTempIds.has(line.id)) return;
                              setEditingLineId(line.id);
                              setEditingQty(String(line.countUnits ?? line.grossWeightGrams ?? 0));
                            }}
                            disabled={pendingTempIds.has(line.id)}
                          >
                            <Text style={[styles.reviewQty, pendingTempIds.has(line.id) && { opacity: 0.5 }]}>
                              {formatLineValue(line)}
                            </Text>
                          </TouchableOpacity>
                          {isOpen && !submitMode && !pendingTempIds.has(line.id) && (
                            <TouchableOpacity
                              onPress={() =>
                                handleDeleteLine(line.id, line.inventoryItem?.name ?? "item")
                              }
                            >
                              <Text style={styles.deleteIcon}>✕</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
            {lineCount === 0 && (
              <Text style={styles.reviewEmpty}>No items counted yet.</Text>
            )}
          </ScrollView>

          {/* Submit mode footer */}
          {submitMode && (
            <View style={styles.submitFooter}>
              {previewData ? (
                <Text style={styles.submitSummary}>
                  {previewData.totalItems} item{previewData.totalItems !== 1 ? "s" : ""} counted · {previewData.itemsWithVariance} with variance
                </Text>
              ) : (
                <Text style={styles.submitSummary}>Loading variance summary...</Text>
              )}
              <TouchableOpacity
                style={[styles.submitCloseBtn, (closeMutation.isPending || previewLoading) && styles.submitCloseBtnDisabled]}
                onPress={() => {
                  setShowReview(false);
                  setSubmitMode(false);
                  handleCloseSession();
                }}
                disabled={closeMutation.isPending || previewLoading}
              >
                <Text style={styles.submitCloseBtnText}>
                  {closeMutation.isPending ? "Closing..." : "Submit & Close Session"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Verification Modal */}
      <Modal visible={showVerification} animationType="slide">
        <View style={styles.verificationContainer}>
          <Text style={styles.verificationTitle}>Uncounted Items</Text>
          <Text style={styles.verificationSubtitle}>
            The following items were expected in the areas you worked but were not counted.
            Acknowledge each item to proceed.
          </Text>

          <ScrollView style={styles.verificationList}>
            {uncountedItems.map((item) => (
              <View
                key={item.inventoryItemId}
                style={[
                  styles.verificationItem,
                  item.acknowledged && styles.verificationItemAcknowledged,
                ]}
              >
                <TouchableOpacity
                  style={styles.verificationItemInfo}
                  onPress={() => {
                    // Close verification modal and navigate to count screen
                    setShowVerification(false);
                    handleExpectedItemTap({
                      inventoryItemId: item.inventoryItemId,
                      name: item.name,
                      countingMethod: item.countingMethod ?? "unit_count",
                    });
                  }}
                >
                  <Text style={styles.verificationItemName}>{item.name}</Text>
                  <Text style={styles.verificationItemArea}>
                    {item.subAreaName}
                  </Text>
                  <Text style={styles.verificationCountLink}>Tap to count</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => toggleAcknowledge(item.inventoryItemId)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={styles.checkboxTouchArea}
                >
                  <View
                    style={[
                      styles.checkbox,
                      item.acknowledged && styles.checkboxChecked,
                    ]}
                  >
                    {item.acknowledged && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>
                    {item.acknowledged ? "Skipped" : "Skip"}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <View style={styles.verificationActions}>
            <TouchableOpacity
              style={styles.verificationCancel}
              onPress={() => setShowVerification(false)}
            >
              <Text style={styles.verificationCancelText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.verificationConfirm,
                closeMutation.isPending && styles.verificationConfirmDisabled,
              ]}
              onPress={handleConfirmClose}
              disabled={closeMutation.isPending}
            >
              <Text style={styles.verificationConfirmText}>
                {closeMutation.isPending ? "Closing..." : "Confirm & Close"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Voice Button — session-aware */}
      {isOpen && capabilities?.voiceCommandsEnabled && (
        <VoiceButton
          sessionId={id}
          subAreaId={selectedSubAreaId ?? undefined}
          areaName={areaLabel}
        />
      )}

      {/* Conflict Resolution Overlay */}
      {conflictData && (
        <ConflictModal
          conflict={conflictData}
          onKeepMine={() => {
            // Retry with fresh expectedUpdatedAt from conflict response
            updateLine.mutate({
              id: conflictData.lineId,
              ...conflictData.myValues,
              expectedUpdatedAt: conflictData.currentUpdatedAt,
            });
            setConflictData(null);
          }}
          onKeepTheirs={() => {
            // Dismiss and refresh data
            setConflictData(null);
            utils.sessions.getById.invalidate({ id: id! });
          }}
          onCancel={() => setConflictData(null)}
        />
      )}

      {/* Variance Reason Modal */}
      {varianceItem && (
        <VarianceReasonModal
          visible={true}
          itemName={varianceItem.name}
          variance={varianceItem.variance}
          onSelect={(reason) => {
            const updatedReasons = [
              ...varianceReasons,
              { itemId: varianceItem.itemId, reason },
            ];
            setVarianceReasons(updatedReasons);
            setVarianceItem(null);

            // Check if more items need reasons
            const remaining = pendingVarianceItemIds.filter(
              (pid) => !updatedReasons.some((r) => r.itemId === pid)
            );
            if (remaining.length > 0) {
              // Prompt for next item
              promptVarianceForItem(remaining[0]);
            } else if (pendingVarianceItemIds.length > 0) {
              // All reasons collected — retry close
              closeMutation.mutate({
                sessionId: id!,
                varianceReasons: updatedReasons,
              });
              setPendingVarianceItemIds([]);
            }
          }}
          onCancel={() => {
            setVarianceItem(null);
            setPendingVarianceItemIds([]);
          }}
        />
      )}
    </View>
  );
}

function VerificationLineItem({ line, sessionId }: { line: any; sessionId: string }) {
  const [qty, setQty] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ isMatch: boolean; differencePercent: number } | null>(null);
  const utils = trpc.useUtils();
  const submitMut = trpc.sessions.submitVerification.useMutation({
    onSuccess: (data: any) => {
      setSubmitted(true);
      setResult({ isMatch: data.isMatch, differencePercent: data.differencePercent });
      utils.sessions.getById.invalidate({ id: sessionId });
    },
    onError: (err: any) => Alert.alert("Error", err.message),
  });

  const isWeight = line.inventoryItem?.category?.countingMethod === "weighable";

  if (submitted && result) {
    return (
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.05)",
      }}>
        <Text style={{ flex: 1, fontSize: 14, color: "#EAF0FF" }}>
          {line.inventoryItem?.name}
        </Text>
        <Text style={{ fontSize: 12, color: result.isMatch ? "#4CAF50" : "#E9B44C" }}>
          {result.isMatch ? "Match" : "Mismatch — awaiting manager"}
        </Text>
      </View>
    );
  }

  return (
    <View style={{
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,255,255,0.05)",
      gap: 8,
    }}>
      <Text style={{ flex: 1, fontSize: 14, color: "#EAF0FF" }}>
        {line.inventoryItem?.name}
      </Text>
      <TextInput
        style={{
          width: 70,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.2)",
          borderRadius: 8,
          paddingHorizontal: 8,
          paddingVertical: 4,
          color: "#EAF0FF",
          backgroundColor: "#0B1623",
          fontSize: 14,
          textAlign: "right",
        }}
        keyboardType="decimal-pad"
        placeholder={isWeight ? "g" : "qty"}
        placeholderTextColor="#5A6A7A"
        value={qty}
        onChangeText={setQty}
      />
      <TouchableOpacity
        onPress={() => {
          const value = Number(qty);
          if (isNaN(value)) return;
          submitMut.mutate({
            lineId: line.id,
            ...(isWeight ? { grossWeightGrams: value } : { countUnits: value }),
          });
        }}
        disabled={!qty || submitMut.isPending}
        style={{
          backgroundColor: "#E9B44C",
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
          opacity: !qty || submitMut.isPending ? 0.5 : 1,
        }}
      >
        <Text style={{ color: "#0B1623", fontWeight: "600", fontSize: 13 }}>
          {submitMut.isPending ? "..." : "Verify"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623", padding: 16 },
  loading: { textAlign: "center", color: "#5A6A7A", marginTop: 40 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#EAF0FF",
  },
  meta: { fontSize: 12, color: "#8899AA", marginBottom: 2 },
  pacingText: { fontSize: 12, color: "#2BA8A0", marginBottom: 12 },
  badgeOpen: {
    backgroundColor: "#1E3550",
    color: "#E9B44C",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    overflow: "hidden",
  },
  badgeClosed: {
    backgroundColor: "#1E3550",
    color: "#5A6A7A",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    overflow: "hidden",
  },

  mainScroll: { flex: 1 },

  // Participants
  participantRow: {
    flexDirection: "row",
    marginBottom: 10,
    maxHeight: 48,
  },
  participantChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16283F",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  participantChipIdle: {
    opacity: 0.5,
  },
  participantAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#2BA8A0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  participantAvatarText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  participantName: {
    color: "#EAF0FF",
    fontSize: 12,
    fontWeight: "600",
  },
  participantArea: {
    color: "#5A6A7A",
    fontSize: 10,
  },

  // Area picker
  areaPicker: { marginBottom: 16 },
  areaPickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  areaPickerLabel: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fullLocationLink: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "600",
  },
  fullLocationLinkActive: {
    color: "#E9B44C",
  },
  areaPills: { flexDirection: "row", marginBottom: 8 },
  areaPill: {
    backgroundColor: "#16283F",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
    flexDirection: "row",
    alignItems: "center",
  },
  areaPillActive: {
    backgroundColor: "#1E3550",
    borderColor: "#E9B44C",
  },
  areaPillText: { color: "#8899AA", fontSize: 14, fontWeight: "500" },
  areaPillTextActive: { color: "#E9B44C" },
  areaPillTextComplete: { color: "#22c55e" },
  areaPillFraction: {
    color: "#5A6A7A",
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 6,
  },
  areaPillFractionActive: { color: "#E9B44C" },
  areaPillFractionComplete: { color: "#22c55e" },
  subAreaPills: { flexDirection: "row", marginBottom: 8 },
  subAreaPill: {
    backgroundColor: "#0F1D2E",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
    flexDirection: "row",
    alignItems: "center",
  },
  subAreaPillActive: { borderColor: "#2BA8A0", backgroundColor: "#12293E" },
  subAreaPillText: { color: "#5A6A7A", fontSize: 13, fontWeight: "500" },
  subAreaPillTextActive: { color: "#2BA8A0" },
  subAreaPillTextComplete: { color: "#22c55e" },
  subAreaPillFraction: {
    color: "#5A6A7A",
    fontSize: 10,
    fontWeight: "600",
    marginLeft: 5,
  },
  subAreaPillFractionActive: { color: "#2BA8A0" },
  subAreaPillFractionComplete: { color: "#22c55e" },
  subAreaBadge: {
    backgroundColor: "#2BA8A0",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
    paddingHorizontal: 4,
  },
  subAreaBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  areaBanner: {
    backgroundColor: "#1E3550",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  areaBannerText: { color: "#EAF0FF", fontSize: 14, fontWeight: "600" },
  areaBannerSub: { color: "#8899AA", fontSize: 12, marginTop: 2 },
  areaBannerProgress: { color: "#2BA8A0", fontSize: 12, fontWeight: "600", marginTop: 4 },
  releaseBtn: {
    backgroundColor: "#1E3550",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  releaseBtnText: { color: "#8899AA", fontSize: 11, fontWeight: "600" },

  // Count actions
  actions: { flexDirection: "row", gap: 10, marginBottom: 12 },
  actionBtn: {
    flex: 1,
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#1E3550",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionText: { fontSize: 13, fontWeight: "500", color: "#EAF0FF" },
  scanWeighBtn: {
    flex: 1,
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#2BA8A0",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  scanWeighBtnText: { fontSize: 15, fontWeight: "600", color: "#2BA8A0" },

  // Expected items checklist
  expectedSection: {
    backgroundColor: "#12293E",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  expectedTitle: {
    color: "#E9B44C",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
  },
  expectedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  expectedRowCounted: { opacity: 0.5 },
  expectedCheck: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#5A6A7A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  expectedCheckDone: {
    borderColor: "#2BA8A0",
    backgroundColor: "#2BA8A0",
  },
  expectedCheckmark: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  expectedGroupHeader: {
    color: "#E9B44C",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 10,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  expectedName: { color: "#EAF0FF", fontSize: 14 },
  hintText: { color: "#5A6A7A", fontSize: 11, marginTop: 1 },
  expectedType: {
    color: "#5A6A7A",
    fontSize: 11,
    textTransform: "capitalize",
    marginLeft: 8,
  },
  expectedNameCounted: {
    textDecorationLine: "line-through",
    color: "#5A6A7A",
  },

  // Closed session summary
  closedSummary: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  closedSummaryTitle: {
    color: "#8899AA",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  closedLineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  closedLineName: { color: "#EAF0FF", fontSize: 14, flex: 1 },
  closedLineValue: { color: "#8899AA", fontSize: 14 },
  closedShowAll: {
    color: "#E9B44C",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 10,
  },

  // Footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
    paddingTop: 12,
    paddingBottom: 8,
  },
  bottomRow: {
    flexDirection: "row",
    gap: 10,
  },
  reviewBtn: {
    flex: 1,
    backgroundColor: "#16283F",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E9B44C",
  },
  reviewBtnText: { color: "#E9B44C", fontSize: 16, fontWeight: "600" },
  submitCountBtn: {
    flex: 1,
    backgroundColor: "#E9B44C",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  submitCountBtnText: { color: "#0B1623", fontSize: 16, fontWeight: "700" },
  btnDisabled: { opacity: 0.4 },

  // Review modal
  reviewModalContainer: { flex: 1, backgroundColor: "#0B1623", paddingTop: 60 },
  reviewModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  reviewModalTitle: { fontSize: 22, fontWeight: "bold", color: "#EAF0FF" },
  reviewModalClose: { color: "#E9B44C", fontSize: 16, fontWeight: "600" },
  reviewList: { flex: 1, paddingHorizontal: 16 },
  reviewEmpty: { color: "#5A6A7A", textAlign: "center", marginTop: 40, fontSize: 15 },
  reviewSectionHeader: {
    backgroundColor: "#0F1D2E",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginTop: 8,
    marginBottom: 4,
  },
  reviewSectionTitle: { color: "#E9B44C", fontSize: 13, fontWeight: "600" },
  reviewRow: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  reviewInfo: { flex: 1, marginRight: 12 },
  reviewItemName: { color: "#EAF0FF", fontSize: 15, fontWeight: "600" },
  reviewItemMeta: {
    color: "#5A6A7A",
    fontSize: 12,
    textTransform: "capitalize",
    marginTop: 2,
  },
  reviewActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  reviewQty: {
    color: "#E9B44C",
    fontSize: 16,
    fontWeight: "700",
    minWidth: 50,
    textAlign: "right",
  },
  deleteIcon: {
    color: "#dc2626",
    fontSize: 18,
    fontWeight: "700",
    paddingHorizontal: 4,
  },
  reviewEditGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reviewQtyInput: {
    backgroundColor: "#0F1D2E",
    borderRadius: 8,
    padding: 8,
    color: "#EAF0FF",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    width: 60,
    borderWidth: 1,
    borderColor: "#E9B44C",
  },
  reviewSaveBtn: {
    backgroundColor: "#E9B44C",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reviewSaveBtnText: { color: "#0B1623", fontSize: 14, fontWeight: "700" },

  // Verification modal
  verificationContainer: {
    flex: 1,
    backgroundColor: "#0B1623",
    padding: 16,
    paddingTop: 60,
  },
  verificationTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#EAF0FF",
    marginBottom: 8,
  },
  verificationSubtitle: {
    fontSize: 14,
    color: "#8899AA",
    marginBottom: 20,
    lineHeight: 20,
  },
  verificationList: { flex: 1 },
  verificationItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#16283F",
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E9B44C",
  },
  verificationItemAcknowledged: {
    borderColor: "#1E3550",
    opacity: 0.7,
  },
  verificationItemInfo: { flex: 1 },
  verificationItemName: { fontSize: 15, fontWeight: "500", color: "#EAF0FF" },
  verificationItemArea: { fontSize: 12, color: "#5A6A7A", marginTop: 2 },
  verificationCountLink: { fontSize: 12, color: "#E9B44C", fontWeight: "600", marginTop: 4 },
  checkboxTouchArea: {
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 12,
    paddingVertical: 4,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#5A6A7A",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxLabel: {
    color: "#5A6A7A",
    fontSize: 10,
    marginTop: 2,
  },
  checkboxChecked: {
    borderColor: "#2BA8A0",
    backgroundColor: "#2BA8A0",
  },
  checkmark: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  verificationActions: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 16,
  },
  verificationCancel: {
    flex: 1,
    backgroundColor: "#16283F",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  verificationCancelText: { color: "#8899AA", fontSize: 16, fontWeight: "600" },
  verificationConfirm: {
    flex: 2,
    backgroundColor: "#dc2626",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  verificationConfirmDisabled: { opacity: 0.5 },
  verificationConfirmText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  // Variance text in submit review
  varianceText: { fontSize: 11, marginTop: 3 },
  varianceGreen: { color: "#2BA8A0" },
  varianceOrange: { color: "#E9B44C" },
  varianceRed: { color: "#dc2626" },
  pendingSyncIcon: {
    color: "#E9B44C",
    fontSize: 11,
    fontStyle: "italic",
    marginLeft: 4,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: "#1E3550",
    borderRadius: 2,
    marginBottom: 8,
    overflow: "hidden" as const,
  },
  progressBarFill: {
    height: 4,
    backgroundColor: "#2BA8A0",
    borderRadius: 2,
  },
  justCountedText: {
    color: "#2BA8A0",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 1,
  },

  // Submit footer
  submitFooter: {
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
    padding: 16,
    paddingBottom: 32,
  },
  submitSummary: {
    color: "#8899AA",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
  },
  submitCloseBtn: {
    backgroundColor: "#E9B44C",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  submitCloseBtnDisabled: { opacity: 0.5 },
  submitCloseBtnText: { color: "#0B1623", fontSize: 17, fontWeight: "700" },
});
