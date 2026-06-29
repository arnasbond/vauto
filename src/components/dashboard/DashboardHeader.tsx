"use client";

import type { UserProfile } from "@/lib/types";
import { ProfileHeader } from "@/components/profile/ProfileHeader";

interface DashboardHeaderProps {
  user: UserProfile;
  onLogout: () => void;
}

/** @deprecated Use ProfileHeader — kept for existing imports */
export function DashboardHeader(props: DashboardHeaderProps) {
  return <ProfileHeader {...props} />;
}
