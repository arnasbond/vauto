import {
  apiFetchUserNotifications,
  type UserNotification,
} from "@/lib/api/client";

export type { UserNotification };

export async function fetchUserNotifications(
  userId: string,
  limit = 40
) {
  return apiFetchUserNotifications(userId, limit);
}
