import { EventEmitter } from "events";

export interface SessionEvent {
  type:
    | "participant_joined"
    | "participant_left"
    | "line_added"
    | "line_deleted"
    | "area_claimed"
    | "area_released"
    | "session_closed";
  payload?: Record<string, unknown>;
}

class SessionEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(1000);
  }

  notifySession(sessionId: string, event: SessionEvent) {
    this.emit(`session:${sessionId}`, event);
  }
}

export const sessionEmitter = new SessionEventEmitter();
