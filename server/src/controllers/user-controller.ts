import {
  isCloudinaryConfigured,
  uploadImageToCloudinary,
} from "../ai/cloudinary.js";
import { optimizeListingImage } from "../ai/image-processor.js";
import { getUser, updateUserAvatar, updateUserProfile } from "../repository.js";
import type { ApiUser } from "../types.js";

const AVATAR_DATA_URL_MAX = 120_000;

export interface UserProfilePatch {
  firstName?: string;
  lastName?: string;
  nickname?: string;
}

function composeUserName(
  patch: UserProfilePatch,
  existing?: Pick<ApiUser, "firstName" | "lastName" | "nickname" | "name">
): string {
  const firstName = (patch.firstName ?? existing?.firstName ?? "").trim();
  const lastName = (patch.lastName ?? existing?.lastName ?? "").trim();
  const nickname = (patch.nickname ?? existing?.nickname ?? "").trim();
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (full) return full.slice(0, 160);
  if (nickname) return nickname.slice(0, 160);
  return (existing?.name ?? "Vartotojas").slice(0, 160);
}

/** PUT /api/user/profile — persist vardas, pavardė, nikas. */
export async function saveUserProfile(
  userId: string,
  patch: UserProfilePatch
): Promise<ApiUser | null> {
  const existing = await getUser(userId);
  if (!existing) return null;

  const firstName =
    patch.firstName !== undefined
      ? patch.firstName.trim().slice(0, 80)
      : existing.firstName;
  const lastName =
    patch.lastName !== undefined
      ? patch.lastName.trim().slice(0, 80)
      : existing.lastName;
  const nickname =
    patch.nickname !== undefined
      ? patch.nickname.trim().slice(0, 80)
      : existing.nickname;
  const name = composeUserName(
    { firstName, lastName, nickname },
    existing
  );

  return updateUserProfile(userId, {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    nickname: nickname || undefined,
    name,
  });
}

/** Upload avatar image and persist avatar_url in DB. */
export async function saveUserAvatarFromImage(
  userId: string,
  imageDataUrl: string
): Promise<ApiUser | null> {
  const trimmed = imageDataUrl.trim();
  if (!trimmed.startsWith("data:image/")) {
    throw Object.assign(new Error("Invalid image payload"), { status: 400 });
  }

  let avatarUrl = trimmed;

  if (isCloudinaryConfigured()) {
    try {
      let processed = trimmed;
      try {
        processed = await optimizeListingImage(trimmed);
      } catch {
        /* use original */
      }
      const uploaded = await uploadImageToCloudinary(processed, "vauto/avatars");
      avatarUrl = uploaded.url;
    } catch (e) {
      console.warn("[avatar] Cloudinary upload failed, storing inline:", e);
      if (trimmed.length > AVATAR_DATA_URL_MAX) {
        throw Object.assign(new Error("Nuotrauka per didelė"), { status: 413 });
      }
    }
  } else if (trimmed.length > AVATAR_DATA_URL_MAX) {
    throw Object.assign(
      new Error("Nuotraukos saugykla nekonfigūruota — sumažinkite nuotrauką"),
      { status: 503 }
    );
  }

  return updateUserAvatar(userId, avatarUrl);
}
