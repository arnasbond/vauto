/**
 * F9 — user store indirection for the profile-update authority boundary.
 * Production routes talk to the repository through this wrapper; tests swap
 * in an in-memory store via `setUserStoreForTests` to exercise the
 * plain-user vs admin paths without a live database.
 */
import {
  getUser as repoGetUser,
  getUserByEmail as repoGetUserByEmail,
  getUserByPhoneDigits as repoGetUserByPhoneDigits,
  upsertUser as repoUpsertUser,
  updateUserAvatar as repoUpdateUserAvatar,
} from "../repository.js";
import { attachReferralFields as repoAttachReferralFields } from "../referral/referral-service.js";
import type { ApiUser } from "../types.js";

type UserStore = {
  getUser: typeof repoGetUser;
  getUserByEmail: typeof repoGetUserByEmail;
  getUserByPhoneDigits: typeof repoGetUserByPhoneDigits;
  upsertUser: typeof repoUpsertUser;
  updateUserAvatar: typeof repoUpdateUserAvatar;
  attachReferralFields: typeof repoAttachReferralFields;
};

const store: UserStore = {
  getUser: repoGetUser,
  getUserByEmail: repoGetUserByEmail,
  getUserByPhoneDigits: repoGetUserByPhoneDigits,
  upsertUser: repoUpsertUser,
  updateUserAvatar: repoUpdateUserAvatar,
  attachReferralFields: repoAttachReferralFields,
};

export function getUser(id: string): ReturnType<typeof repoGetUser> {
  return store.getUser(id);
}

export function getUserByEmail(
  email: string
): ReturnType<typeof repoGetUserByEmail> {
  return store.getUserByEmail(email);
}

export function getUserByPhoneDigits(
  digits: string
): ReturnType<typeof repoGetUserByPhoneDigits> {
  return store.getUserByPhoneDigits(digits);
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

export function attachReferralFields(
  user: ApiUser
): ReturnType<typeof repoAttachReferralFields> {
  return store.attachReferralFields(user);
}

export function setUserStoreForTests(next: Partial<UserStore>): void {
  store.getUser = next.getUser ?? repoGetUser;
  store.getUserByEmail = next.getUserByEmail ?? repoGetUserByEmail;
  store.getUserByPhoneDigits = next.getUserByPhoneDigits ?? repoGetUserByPhoneDigits;
  store.upsertUser = next.upsertUser ?? repoUpsertUser;
  store.updateUserAvatar = next.updateUserAvatar ?? repoUpdateUserAvatar;
  store.attachReferralFields = next.attachReferralFields ?? repoAttachReferralFields;
}
