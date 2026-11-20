import type { Database } from "@roundcut/db";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  type NotificationType,
} from "@roundcut/db/notification";
import { notification } from "@roundcut/db/schema/notification";
import { notificationPreference } from "@roundcut/db/schema/notification-preference";
import { and, count, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import { notificationPreferences } from "../notifications";

const NOTIFICATION_LIST_MAX = 50;

const unreadOf = (userId: string) =>
  and(eq(notification.userId, userId), isNull(notification.readAt));

// The types the user turned off in the app (NOTIF-03) stay out of the center.
async function shownOf(context: { db: Database }, userId: string) {
  const preferences = await notificationPreferences(context.db, userId);
  const hidden = NOTIFICATION_TYPES.filter(
    (type: NotificationType) => !preferences[type].in_app
  );
  return and(
    eq(notification.userId, userId),
    hidden.length > 0 ? notInArray(notification.type, hidden) : undefined
  );
}

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
      const shown = await shownOf(context, userId);
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
          .where(shown)
          .orderBy(desc(notification.createdAt))
          .limit(input?.limit ?? NOTIFICATION_LIST_MAX),
        context.db
          .select({ total: count() })
          .from(notification)
          .where(and(shown, isNull(notification.readAt))),
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

  // Which types reach the user on which channel (NOTIF-03): every one until
  // turned off.
  preferences: {
    get: protectedProcedure.handler(
      async ({ context }) =>
        await notificationPreferences(context.db, context.session.user.id)
    ),

    update: protectedProcedure
      .input(
        z.object({
          channel: z.enum(NOTIFICATION_CHANNELS),
          enabled: z.boolean(),
          type: z.enum(NOTIFICATION_TYPES),
        })
      )
      .handler(async ({ context, input }) => {
        const userId = context.session.user.id;
        await context.db
          .insert(notificationPreference)
          .values({ ...input, userId })
          .onConflictDoUpdate({
            set: { enabled: input.enabled },
            target: [
              notificationPreference.userId,
              notificationPreference.type,
              notificationPreference.channel,
            ],
          });
        return await notificationPreferences(context.db, userId);
      }),
  },
};
