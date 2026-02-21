import React, { createContext, useContext } from "react";
import { trpc } from "./trpc";
import { useAuth } from "./auth-context";

interface NotificationContextValue {
  unreadCount: number;
  refetch: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  unreadCount: 0,
  refetch: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();

  const { data, refetch } = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: !!token,
    refetchInterval: 30_000,
  });

  return (
    <NotificationContext.Provider value={{ unreadCount: data ?? 0, refetch }}>
      {children}
    </NotificationContext.Provider>
  );
}
