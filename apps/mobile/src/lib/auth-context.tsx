import React, { createContext, useContext, useEffect, useReducer } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpcVanilla, setAuthToken } from "./trpc";

const KEYS = {
  token: "authToken",
  refreshToken: "refreshToken",
  user: "authUser",
  locationId: "selectedLocationId",
} as const;

interface UserPayload {
  userId: string;
  email: string;
  roles: Record<string, string>;
  locationIds: string[];
  orgId?: string;
}

interface AuthState {
  token: string | null;
  user: UserPayload | null;
  selectedLocationId: string | null;
  isLoading: boolean;
}

type AuthAction =
  | { type: "RESTORE_TOKEN"; token: string; user: UserPayload; locationId: string | null }
  | { type: "SIGN_IN"; token: string; user: UserPayload; locationId: string | null }
  | { type: "SIGN_OUT" }
  | { type: "SELECT_LOCATION"; locationId: string | null };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "RESTORE_TOKEN":
      return {
        token: action.token,
        user: action.user,
        selectedLocationId: action.locationId,
        isLoading: false,
      };
    case "SIGN_IN":
      return {
        token: action.token,
        user: action.user,
        selectedLocationId: action.locationId,
        isLoading: false,
      };
    case "SIGN_OUT":
      return { token: null, user: null, selectedLocationId: null, isLoading: false };
    case "SELECT_LOCATION":
      return { ...state, selectedLocationId: action.locationId };
  }
}

interface AuthContextValue extends AuthState {
  signIn: (accessToken: string, refreshToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  selectLocation: (locationId: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    token: null,
    user: null,
    selectedLocationId: null,
    isLoading: true,
  });

  // Bootstrap: restore token from storage on mount
  useEffect(() => {
    (async () => {
      try {
        const [token, refreshToken, cachedUser, savedLocationId] = await Promise.all([
          AsyncStorage.getItem(KEYS.token),
          AsyncStorage.getItem(KEYS.refreshToken),
          AsyncStorage.getItem(KEYS.user),
          AsyncStorage.getItem(KEYS.locationId),
        ]);

        if (!token) {
          dispatch({ type: "SIGN_OUT" });
          return;
        }

        setAuthToken(token);

        // Try to validate with auth.me
        let user: UserPayload;
        try {
          user = await trpcVanilla.auth.me.query();
        } catch {
          // Token expired — try refresh
          if (!refreshToken) {
            await clearStorage();
            dispatch({ type: "SIGN_OUT" });
            return;
          }
          try {
            const refreshResult = await trpcVanilla.auth.refresh.mutate({ refreshToken });
            setAuthToken(refreshResult.accessToken);
            await AsyncStorage.setItem(KEYS.token, refreshResult.accessToken);
            user = await trpcVanilla.auth.me.query();
          } catch {
            await clearStorage();
            dispatch({ type: "SIGN_OUT" });
            return;
          }
        }

        await AsyncStorage.setItem(KEYS.user, JSON.stringify(user));

        const locationId =
          savedLocationId && user.locationIds.includes(savedLocationId)
            ? savedLocationId
            : user.locationIds.length === 1
              ? user.locationIds[0]
              : null;

        dispatch({ type: "RESTORE_TOKEN", token: token, user, locationId });
      } catch {
        dispatch({ type: "SIGN_OUT" });
      }
    })();
  }, []);

  const signIn = async (accessToken: string, refreshToken: string) => {
    setAuthToken(accessToken);
    const user: UserPayload = await trpcVanilla.auth.me.query();

    const locationId = user.locationIds.length === 1 ? user.locationIds[0] : null;

    await Promise.all([
      AsyncStorage.setItem(KEYS.token, accessToken),
      AsyncStorage.setItem(KEYS.refreshToken, refreshToken),
      AsyncStorage.setItem(KEYS.user, JSON.stringify(user)),
      locationId
        ? AsyncStorage.setItem(KEYS.locationId, locationId)
        : AsyncStorage.removeItem(KEYS.locationId),
    ]);

    dispatch({ type: "SIGN_IN", token: accessToken, user, locationId });
  };

  const signOut = async () => {
    setAuthToken(null);
    await clearStorage();
    dispatch({ type: "SIGN_OUT" });
  };

  const selectLocation = async (locationId: string | null) => {
    if (locationId) {
      await AsyncStorage.setItem(KEYS.locationId, locationId);
    } else {
      await AsyncStorage.removeItem(KEYS.locationId);
    }
    dispatch({ type: "SELECT_LOCATION", locationId });
  };

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, selectLocation }}>
      {children}
    </AuthContext.Provider>
  );
}

async function clearStorage() {
  await AsyncStorage.multiRemove([KEYS.token, KEYS.refreshToken, KEYS.user, KEYS.locationId]);
  setAuthToken(null);
}
