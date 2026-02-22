import { EventEmitter } from "events";

class NotificationEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(1000);
  }

  notifyUser(userId: string) {
    this.emit(`user:${userId}`, { type: "new_notification" });
  }
}

export const notificationEmitter = new NotificationEmitter();
