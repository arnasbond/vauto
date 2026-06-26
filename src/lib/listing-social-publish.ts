import type { CategoryAttributes } from "@/lib/types";

export interface ListingSocialPublishOptions {
  facebookGroups: boolean;
  anonserLt: boolean;
  aiSocialAdaptation: boolean;
}

export const DEFAULT_LISTING_SOCIAL_PUBLISH_OPTIONS: ListingSocialPublishOptions = {
  facebookGroups: false,
  anonserLt: false,
  aiSocialAdaptation: true,
};

const ATTR_FACEBOOK = "socialPublishFacebookGroups";
const ATTR_ANONSER = "socialPublishAnonserLt";
const ATTR_AI = "socialPublishAiAdaptation";

export function mergeSocialPublishAttributes(
  attrs: CategoryAttributes | undefined,
  opts: ListingSocialPublishOptions
): CategoryAttributes {
  return {
    ...(attrs ?? {}),
    [ATTR_FACEBOOK]: opts.facebookGroups ? "1" : "0",
    [ATTR_ANONSER]: opts.anonserLt ? "1" : "0",
    [ATTR_AI]: opts.aiSocialAdaptation ? "1" : "0",
  };
}

export function readSocialPublishFromAttributes(
  attrs?: CategoryAttributes | null
): ListingSocialPublishOptions {
  if (!attrs) return { ...DEFAULT_LISTING_SOCIAL_PUBLISH_OPTIONS };
  return {
    facebookGroups: attrs[ATTR_FACEBOOK] === "1" || attrs[ATTR_FACEBOOK] === "true",
    anonserLt: attrs[ATTR_ANONSER] === "1" || attrs[ATTR_ANONSER] === "true",
    aiSocialAdaptation:
      attrs[ATTR_AI] === undefined ||
      attrs[ATTR_AI] === "1" ||
      attrs[ATTR_AI] === "true",
  };
}

export function anySocialPublishEnabled(opts: ListingSocialPublishOptions): boolean {
  return opts.facebookGroups || opts.anonserLt || opts.aiSocialAdaptation;
}
