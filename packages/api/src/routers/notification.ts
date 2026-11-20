import { notification } from "@roundcut/db/schema/notification";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";

const NOTIFICATION_LIST_MAX = 50;

const unreadOf = (userId: string) =>
  and(eq(notification.userId, userId), isNull(notification.readAt));

// The signed-in user's notifications (NOTIF-01), latest first; the in-app
// center (NOTIF-02) reads them.
export const notificationRouter = {
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(NOTIFICATION_LIST_MAX).optional(),
        })
        .optional()
    )
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;
      const [items, [unread]] = await Promise.all([
        context.db
          .select({
            createdAt: notification.createdAt,
            id: notification.id,
            payload: notification.payload,
            readAt: notification.readAt,
            type: notification.type,
          })
          .from(notification)
          .where(eq(notification.userId, userId))
          .orderBy(desc(notification.createdAt))
          .limit(input?.limit ?? NOTIFICATION_LIST_MAX),
        context.db
          .select({ total: count() })
          .from(notification)
          .where(unreadOf(userId)),
      ]);
      return { items, unreadCount: unread?.total ?? 0 };
    }),

  // Marks the given notifications read, or all of them without ids. Other
  // users' ids match nothing.
  markRead: protectedProcedure
    .input(z.object({ ids: z.array(z.string().min(1)).max(100).optional() }))
    .handler(async ({ context, input }) => {
      const marked = await context.db
        .update(notification)
        .set({ readAt: new Date() })
        .where(
          and(
            unreadOf(context.session.user.id),
            input.ids ? inArray(notification.id, input.ids) : undefined
          )
        )
        .returning({ id: notification.id });
      return { marked: marked.length };
    }),
};
