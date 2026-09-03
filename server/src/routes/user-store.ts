/**
 * F9 — user store indirection for the profile-update authority boundary.
 * Production routes talk to the repository through this wrapper; tests swap
 * in an in-memory store via `setUserStoreForTests` to exercise the
 * plain-user vs admin paths without a live database.
 */
import {
  getUser as repoGetUser,
  upsertUser as repoUpsertUser,
  updateUserAvatar as repoUpdateUserAvatar,
} from "../repository.js";
import type { ApiUser } from "../types.js";

type UserStore = {
  getUser: typeof repoGetUser;
  upsertUser: typeof repoUpsertUser;
  updateUserAvatar: typeof repoUpdateUserAvatar;
};

const store: UserStore = {
  getUser: repoGetUser,
  upsertUser: repoUpsertUser,
  updateUserAvatar: repoUpdateUserAvatar,
};

export function getUser(id: string): ReturnType<typeof repoGetUser> {
  return store.getUser(id);
}

export function upsertUser(user: ApiUser): ReturnType<typeof repoUpsertUser> {
  return store.upsertUser(user);
}

export function updateUserAvatar(
  id: string,
  avatar: string
): ReturnType<typeof repoUpdateUserAvatar> {
  return store.updateUserAvatar(id, avatar);
}

export function setUserStoreForTests(next: Partial<UserStore>): void {
  store.getUser = next.getUser ?? repoGetUser;
  store.upsertUser = next.upsertUser ?? repoUpsertUser;
  store.updateUserAvatar = next.updateUserAvatar ?? repoUpdateUserAvatar;
}
