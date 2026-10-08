"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, type ReactNode,
} from "react";

import { api, errorMessage } from "@/lib/api";
import { connectSocket, type SocketHandle } from "@/lib/socket";
import type { User } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useConversations } from "@/store/conversations";
import { handleServerEvent } from "@/store/events";
import { useMessages } from "@/store/messages";
import { usePresence } from "@/store/presence";
import { useUi } from "@/store/ui";

type Send = (type: string, data: object) => void;

const SocketContext = createContext<Send>(() => undefined);

/** Send a frame to the server (used for typing notifications). */
export function useSocketSend(): Send {
  return useContext(SocketContext);
}

/** Catch up on everything a closed socket may have missed. */
async function refresh(): Promise<void> {
  await useConversations.getState().load();
  const activeId = useConversations.getState().activeId;
  if (activeId !== null) await useMessages.getState().loadLatest(activeId);
}

/** Owns the WebSocket for the signed-in user and loads the initial data. */
export function SocketProvider({ token, children }: { token: string; children: ReactNode }) {
  const handle = useRef<SocketHandle | null>(null);

  useEffect(() => {
    const ui = useUi.getState();

    // The saved copy of "me" may be stale; fetch the current one.
    api
      .get<User>("/api/users/me")
      .then((me) => {
        useAuth.getState().setUser(me);
        usePresence.getState().upsertUsers([me]);
      })
      .catch(() => undefined);
    refresh().catch((error) => ui.toast(errorMessage(error), "error"));

    const socket = connectSocket(token, {
      onEvent: handleServerEvent,
      onState: (state, reconnected) => {
        useUi.getState().setSocketState(state);
        if (reconnected) refresh().catch(() => undefined);
      },
      onUnauthenticated: () => useAuth.getState().clear(),
    });
    handle.current = socket;
    return () => {
      socket.close();
      handle.current = null;
    };
  }, [token]);

  const send = useCallback<Send>((type, data) => handle.current?.send(type, data), []);
  return <SocketContext.Provider value={send}>{children}</SocketContext.Provider>;
}
