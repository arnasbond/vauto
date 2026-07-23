import type {
  ApiChatMessage,
  ApiChatThread,
  ApiEscrowStatus,
  ApiEscrowTransaction,
  ApiListing,
  ApiReview,
  ApiSupportReport,
  ApiUser,
} from "./types.js";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const LISTING_CATEGORIES = new Set([
  "electronics",
  "vehicles",
  "transport",
  "services",
  "jobs",
  "home",
  "clothing",
  "real_estate",
  "tools",
  "rental",
  "other",
]);

const LISTING_STATUSES = new Set(["active", "sold"]);
const REPORT_CATEGORIES = new Set([
  "fraud",
  "bad_info",
  "chat_abuse",
  "general_feedback",
  "technical_issue",
  "account_billing",
]);
const REPORT_URGENCIES = new Set(["critical", "feedback", "general"]);
const REPORT_STATUSES = new Set(["open", "resolved", "dismissed"]);
const ESCROW_STATUSES = new Set([
  "offered",
  "paying",
  "paid",
  "label_sent",
  "shipped",
  "delivered",
  "completed",
  "disputed",
  "cancelled",
]);
const USER_ROLES = new Set(["private", "pro", "admin"]);
const AUTH_PROVIDERS = new Set(["google", "apple", "phone"]);

function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

function fail<T = never>(error: string): ValidationResult<T> {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  obj: Record<string, unknown>,
  key: string,
  max = 300,
  min = 1
): ValidationResult<string> {
  const value = obj[key];
  if (typeof value !== "string") return fail(`${key} is required`);
  const trimmed = value.trim();
  if (trimmed.length < min) return fail(`${key} is required`);
  if (trimmed.length > max) return fail(`${key} is too long`);
  return ok(trimmed);
}

function optionalString(
  obj: Record<string, unknown>,
  key: string,
  max = 300
): ValidationResult<string | undefined> {
  const value = obj[key];
  if (value === undefined || value === null || value === "") return ok(undefined);
  if (typeof value !== "string") return fail(`${key} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) return fail(`${key} is too long`);
  return ok(trimmed || undefined);
}

function requiredNumber(
  obj: Record<string, unknown>,
  key: string,
  min: number,
  max: number
): ValidationResult<number> {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(`${key} must be a number`);
  }
  if (value < min || value > max) return fail(`${key} is out of range`);
  return ok(value);
}

function optionalNumber(
  obj: Record<string, unknown>,
  key: string,
  min: number,
  max: number
): ValidationResult<number | undefined> {
  const value = obj[key];
  if (value === undefined || value === null) return ok(undefined);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(`${key} must be a number`);
  }
  if (value < min || value > max) return fail(`${key} is out of range`);
  return ok(value);
}

function optionalBoolean(
  obj: Record<string, unknown>,
  key: string
): ValidationResult<boolean | undefined> {
  const value = obj[key];
  if (value === undefined || value === null) return ok(undefined);
  if (typeof value !== "boolean") return fail(`${key} must be a boolean`);
  return ok(value);
}

function stringArray(
  obj: Record<string, unknown>,
  key: string,
  maxItems = 30,
  maxLength = 80
): ValidationResult<string[]> {
  const value = obj[key];
  if (!Array.isArray(value)) return fail(`${key} must be an array`);
  if (value.length > maxItems) return fail(`${key} has too many items`);
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return fail(`${key} must contain strings`);
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > maxLength) return fail(`${key} item is too long`);
    result.push(trimmed);
  }
  return ok(result);
}

function optionalStringArray(
  obj: Record<string, unknown>,
  key: string,
  maxItems = 100,
  maxLength = 120
): ValidationResult<string[] | undefined> {
  const value = obj[key];
  if (value === undefined || value === null) return ok(undefined);
  return stringArray(obj, key, maxItems, maxLength);
}

function enumString(
  obj: Record<string, unknown>,
  key: string,
  allowed: Set<string>
): ValidationResult<string> {
  const value = requiredString(obj, key, 80);
  if (!value.ok) return value;
  if (!allowed.has(value.value)) return fail(`${key} is invalid`);
  return value;
}

function optionalEnumString(
  obj: Record<string, unknown>,
  key: string,
  allowed: Set<string>
): ValidationResult<string | undefined> {
  const value = optionalString(obj, key, 80);
  if (!value.ok || value.value === undefined) return value;
  if (!allowed.has(value.value)) return fail(`${key} is invalid`);
  return value;
}

function isoDateString(
  obj: Record<string, unknown>,
  key: string,
  required = true
): ValidationResult<string | undefined> {
  const value = required
    ? requiredString(obj, key, 80)
    : optionalString(obj, key, 80);
  if (!value.ok || value.value === undefined) return value;
  if (Number.isNaN(Date.parse(value.value))) return fail(`${key} must be an ISO date`);
  return value;
}

function validateAttributes(value: unknown): ValidationResult<Record<string, string | string[] | undefined>> {
  if (value === undefined || value === null) return ok({});
  if (!isRecord(value)) return fail("attributes must be an object");
  const result: Record<string, string | string[] | undefined> = {};
  for (const [key, attr] of Object.entries(value)) {
    if (!key || key.length > 80) return fail("attribute key is invalid");
    if (attr === undefined || attr === null || attr === "") {
      result[key] = undefined;
    } else if (typeof attr === "string") {
      if (attr.length > 500) return fail("attribute value is too long");
      result[key] = attr.trim();
    } else if (Array.isArray(attr)) {
      const values: string[] = [];
      for (const item of attr) {
        if (typeof item !== "string") return fail("attribute arrays must contain strings");
        // Cloudinary / CDN gallery URLs are often 120–300 chars.
        if (item.length > 400) return fail("attribute array value is too long");
        const trimmed = item.trim();
        if (trimmed) values.push(trimmed);
      }
      if (values.length > 50) return fail("attribute array has too many values");
      result[key] = values;
    } else {
      return fail("attribute value is invalid");
    }
  }
  return ok(result);
}

function validateMessage(value: unknown): ValidationResult<ApiChatMessage> {
  if (!isRecord(value)) return fail("message must be an object");
  const id = requiredString(value, "id", 120);
  if (!id.ok) return id;
  const senderId = requiredString(value, "senderId", 120);
  if (!senderId.ok) return senderId;
  const text = requiredString(value, "text", 4000);
  if (!text.ok) return text;
  const timestamp = isoDateString(value, "timestamp");
  if (!timestamp.ok) return timestamp;
  if (timestamp.value === undefined) return fail("timestamp is required");
  const readAt = isoDateString(value, "readAt", false);
  if (!readAt.ok) return readAt;
  return ok({
    id: id.value,
    senderId: senderId.value,
    text: text.value,
    timestamp: timestamp.value,
    readAt: readAt.value,
  });
}

export function validateListing(body: unknown): ValidationResult<ApiListing> {
  if (!isRecord(body)) return fail("Body must be an object");
  const id = requiredString(body, "id", 120);
  if (!id.ok) return id;
  const title = requiredString(body, "title", 160, 2);
  if (!title.ok) return title;
  const price = requiredNumber(body, "price", 0, 100_000_000);
  if (!price.ok) return price;
  const priceLabel = optionalString(body, "priceLabel", 40);
  if (!priceLabel.ok) return priceLabel;
  const location = requiredString(body, "location", 160);
  if (!location.ok) return location;
  const distanceKm = requiredNumber(body, "distanceKm", 0, 50_000);
  if (!distanceKm.ok) return distanceKm;
  const latitude = optionalNumber(body, "latitude", -90, 90);
  if (!latitude.ok) return latitude;
  const longitude = optionalNumber(body, "longitude", -180, 180);
  if (!longitude.ok) return longitude;
  const slug = optionalString(body, "slug", 180);
  if (!slug.ok) return slug;
  const image = requiredString(body, "image", 15_000_000);
  if (!image.ok) return image;
  const category = enumString(body, "category", LISTING_CATEGORIES);
  if (!category.ok) return category;
  const tags = stringArray(body, "tags");
  if (!tags.ok) return tags;
  const sellerId = requiredString(body, "sellerId", 120);
  if (!sellerId.ok) return sellerId;
  const createdAt = isoDateString(body, "createdAt");
  if (!createdAt.ok) return createdAt;
  if (createdAt.value === undefined) return fail("createdAt is required");
  const contact = optionalString(body, "contact", 120);
  if (!contact.ok) return contact;
  const hasVideo = optionalBoolean(body, "hasVideo");
  if (!hasVideo.ok) return hasVideo;
  const expiresAt = isoDateString(body, "expiresAt", false);
  if (!expiresAt.ok) return expiresAt;
  const description = optionalString(body, "description", 5000);
  if (!description.ok) return description;
  const attributes = validateAttributes(body.attributes);
  if (!attributes.ok) return attributes;
  const status = optionalEnumString(body, "status", LISTING_STATUSES);
  if (!status.ok) return status;
  const banned = optionalBoolean(body, "banned");
  if (!banned.ok) return banned;
  const vinVerified = optionalBoolean(body, "vinVerified");
  if (!vinVerified.ok) return vinVerified;
  const providerVerified = optionalBoolean(body, "providerVerified");
  if (!providerVerified.ok) return providerVerified;
  const promoted = optionalBoolean(body, "promoted");
  if (!promoted.ok) return promoted;
  const minNegotiationPrice = optionalNumber(body, "minNegotiationPrice", 0, 100_000_000);
  if (!minNegotiationPrice.ok) return minNegotiationPrice;
  const appraisalScore = optionalNumber(body, "appraisalScore", 0, 100);
  if (!appraisalScore.ok) return appraisalScore;
  const isVerified = optionalBoolean(body, "isVerified");
  if (!isVerified.ok) return isVerified;
  const requiresReview = optionalBoolean(body, "requiresReview");
  if (!requiresReview.ok) return requiresReview;
  const imageAlt = optionalString(body, "imageAlt", 200);
  if (!imageAlt.ok) return imageAlt;
  const imageTitle = optionalString(body, "imageTitle", 120);
  if (!imageTitle.ok) return imageTitle;
  const allowPastomatas = optionalBoolean(body, "allowPastomatas");
  if (!allowPastomatas.ok) return allowPastomatas;

  return ok({
    id: id.value,
    title: title.value,
    price: price.value,
    priceLabel: priceLabel.value,
    location: location.value,
    distanceKm: distanceKm.value,
    latitude: latitude.value,
    longitude: longitude.value,
    slug: slug.value,
    image: image.value,
    category: category.value,
    tags: tags.value,
    sellerId: sellerId.value,
    createdAt: createdAt.value,
    contact: contact.value,
    hasVideo: hasVideo.value,
    expiresAt: expiresAt.value,
    description: description.value,
    attributes: attributes.value,
    status: status.value,
    banned: banned.value,
    vinVerified: vinVerified.value,
    providerVerified: providerVerified.value,
    promoted: promoted.value,
    minNegotiationPrice: minNegotiationPrice.value,
    appraisalScore: appraisalScore.value,
    isVerified: isVerified.value,
    requiresReview: requiresReview.value,
    imageAlt: imageAlt.value,
    imageTitle: imageTitle.value,
    allowPastomatas: allowPastomatas.value ?? true,
  });
}

export function validateListingPatch(body: unknown): ValidationResult<Partial<ApiListing>> {
  if (!isRecord(body)) return fail("Body must be an object");
  const allowed = new Set([
    "title",
    "price",
    "priceLabel",
    "location",
    "contact",
    "description",
    "category",
    "tags",
    "attributes",
    "image",
    "status",
    "banned",
    "minNegotiationPrice",
    "appraisalScore",
    "isVerified",
    "requiresReview",
    "imageAlt",
    "imageTitle",
    "allowPastomatas",
  ]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) return fail(`${key} cannot be updated`);
  }

  const patch: Partial<ApiListing> = {};
  if (body.title !== undefined) {
    const title = requiredString(body, "title", 160, 2);
    if (!title.ok) return title;
    patch.title = title.value;
  }
  if (body.price !== undefined) {
    const price = requiredNumber(body, "price", 0, 100_000_000);
    if (!price.ok) return price;
    patch.price = price.value;
  }
  if (body.priceLabel !== undefined) {
    const priceLabel = optionalString(body, "priceLabel", 40);
    if (!priceLabel.ok) return priceLabel;
    patch.priceLabel = priceLabel.value;
  }
  if (body.location !== undefined) {
    const location = requiredString(body, "location", 160);
    if (!location.ok) return location;
    patch.location = location.value;
  }
  if (body.contact !== undefined) {
    const contact = optionalString(body, "contact", 120);
    if (!contact.ok) return contact;
    patch.contact = contact.value;
  }
  if (body.description !== undefined) {
    const description = optionalString(body, "description", 5000);
    if (!description.ok) return description;
    patch.description = description.value;
  }
  if (body.category !== undefined) {
    const category = enumString(body, "category", LISTING_CATEGORIES);
    if (!category.ok) return category;
    patch.category = category.value;
  }
  if (body.tags !== undefined) {
    const tags = stringArray(body, "tags");
    if (!tags.ok) return tags;
    patch.tags = tags.value;
  }
  if (body.attributes !== undefined) {
    const attributes = validateAttributes(body.attributes);
    if (!attributes.ok) return attributes;
    patch.attributes = attributes.value;
  }
  if (body.image !== undefined) {
    const image = requiredString(body, "image", 15_000_000);
    if (!image.ok) return image;
    patch.image = image.value;
  }
  if (body.status !== undefined) {
    const status = enumString(body, "status", LISTING_STATUSES);
    if (!status.ok) return status;
    patch.status = status.value;
  }
  if (body.banned !== undefined) {
    const banned = optionalBoolean(body, "banned");
    if (!banned.ok) return banned;
    patch.banned = banned.value;
  }
  if (body.minNegotiationPrice !== undefined) {
    const minNegotiationPrice = optionalNumber(body, "minNegotiationPrice", 0, 100_000_000);
    if (!minNegotiationPrice.ok) return minNegotiationPrice;
    patch.minNegotiationPrice = minNegotiationPrice.value;
  }
  if (body.appraisalScore !== undefined) {
    const appraisalScore = optionalNumber(body, "appraisalScore", 0, 100);
    if (!appraisalScore.ok) return appraisalScore;
    patch.appraisalScore = appraisalScore.value;
  }
  if (body.isVerified !== undefined) {
    const isVerified = optionalBoolean(body, "isVerified");
    if (!isVerified.ok) return isVerified;
    patch.isVerified = isVerified.value;
  }
  if (body.requiresReview !== undefined) {
    const requiresReview = optionalBoolean(body, "requiresReview");
    if (!requiresReview.ok) return requiresReview;
    patch.requiresReview = requiresReview.value;
  }
  if (body.imageAlt !== undefined) {
    const imageAlt = optionalString(body, "imageAlt", 200);
    if (!imageAlt.ok) return imageAlt;
    patch.imageAlt = imageAlt.value;
  }
  if (body.imageTitle !== undefined) {
    const imageTitle = optionalString(body, "imageTitle", 120);
    if (!imageTitle.ok) return imageTitle;
    patch.imageTitle = imageTitle.value;
  }
  if (body.allowPastomatas !== undefined) {
    const allowPastomatas = optionalBoolean(body, "allowPastomatas");
    if (!allowPastomatas.ok) return allowPastomatas;
    patch.allowPastomatas = allowPastomatas.value;
  }
  return ok(patch);
}

export function validateReport(body: unknown): ValidationResult<ApiSupportReport> {
  if (!isRecord(body)) return fail("Body must be an object");
  const id = requiredString(body, "id", 120);
  if (!id.ok) return id;
  const reporterId = requiredString(body, "reporterId", 120);
  if (!reporterId.ok) return reporterId;
  const reporterName = requiredString(body, "reporterName", 160);
  if (!reporterName.ok) return reporterName;
  const category = enumString(body, "category", REPORT_CATEGORIES);
  if (!category.ok) return category;
  const urgency = enumString(body, "urgency", REPORT_URGENCIES);
  if (!urgency.ok) return urgency;
  const status = enumString(body, "status", REPORT_STATUSES);
  if (!status.ok) return status;
  const comment = requiredString(body, "comment", 4000, 3);
  if (!comment.ok) return comment;
  const listingId = optionalString(body, "listingId", 120);
  if (!listingId.ok) return listingId;
  const listingTitle = optionalString(body, "listingTitle", 200);
  if (!listingTitle.ok) return listingTitle;
  const chatId = optionalString(body, "chatId", 120);
  if (!chatId.ok) return chatId;
  const reportedUserId = optionalString(body, "reportedUserId", 120);
  if (!reportedUserId.ok) return reportedUserId;
  const chatPreview = optionalString(body, "chatPreview", 500);
  if (!chatPreview.ok) return chatPreview;
  const createdAt = isoDateString(body, "createdAt");
  if (!createdAt.ok) return createdAt;
  if (createdAt.value === undefined) return fail("createdAt is required");
  const reporterEmail = optionalString(body, "reporterEmail", 200);
  if (!reporterEmail.ok) return reporterEmail;
  const reporterPhone = optionalString(body, "reporterPhone", 40);
  if (!reporterPhone.ok) return reporterPhone;
  const reportedUserName = optionalString(body, "reportedUserName", 160);
  if (!reportedUserName.ok) return reportedUserName;
  const updatedAt = isoDateString(body, "updatedAt");
  if (!updatedAt.ok) return updatedAt;
  const aiSummary = optionalString(body, "aiSummary", 2000);
  if (!aiSummary.ok) return aiSummary;
  const aiSuggestedReply = optionalString(body, "aiSuggestedReply", 4000);
  if (!aiSuggestedReply.ok) return aiSuggestedReply;
  const aiPowered = optionalBoolean(body, "aiPowered");
  if (!aiPowered.ok) return aiPowered;
  const unreadByAdmin = optionalBoolean(body, "unreadByAdmin");
  if (!unreadByAdmin.ok) return unreadByAdmin;
  const unreadByReporter = optionalBoolean(body, "unreadByReporter");
  if (!unreadByReporter.ok) return unreadByReporter;
  const messages = Array.isArray(body.messages) ? body.messages : undefined;
  return ok({
    id: id.value,
    reporterId: reporterId.value,
    reporterName: reporterName.value,
    category: category.value,
    urgency: urgency.value,
    status: status.value,
    comment: comment.value,
    listingId: listingId.value,
    listingTitle: listingTitle.value,
    chatId: chatId.value,
    reportedUserId: reportedUserId.value,
    chatPreview: chatPreview.value,
    createdAt: createdAt.value,
    reporterEmail: reporterEmail.value,
    reporterPhone: reporterPhone.value,
    reportedUserName: reportedUserName.value,
    updatedAt: updatedAt.value,
    aiSummary: aiSummary.value,
    aiSuggestedReply: aiSuggestedReply.value,
    aiPowered: aiPowered.value,
    unreadByAdmin: unreadByAdmin.value,
    unreadByReporter: unreadByReporter.value,
    messages,
  });
}

export function validateReportStatus(body: unknown): ValidationResult<string> {
  if (!isRecord(body)) return fail("Body must be an object");
  return enumString(body, "status", REPORT_STATUSES);
}

export function validateIdArray(body: unknown, key = "ids"): ValidationResult<string[]> {
  if (!isRecord(body)) return fail("Body must be an object");
  return stringArray(body, key, 1000, 120);
}

export function validateUser(body: unknown): ValidationResult<ApiUser> {
  if (!isRecord(body)) return fail("Body must be an object");
  const id = requiredString(body, "id", 120);
  if (!id.ok) return id;
  const name = requiredString(body, "name", 160);
  if (!name.ok) return name;
  const phone = requiredString(body, "phone", 80);
  if (!phone.ok) return phone;
  const city = requiredString(body, "city", 120);
  if (!city.ok) return city;
  const avatar = requiredString(body, "avatar", 1000);
  if (!avatar.ok) return avatar;
  const email = optionalString(body, "email", 254);
  if (!email.ok) return email;
  const warned = optionalBoolean(body, "warned");
  if (!warned.ok) return warned;
  const walletBalance = optionalNumber(body, "walletBalance", 0, 1_000_000);
  if (!walletBalance.ok) return walletBalance;
  const role = optionalEnumString(body, "role", USER_ROLES);
  if (!role.ok) return role;
  const businessType = optionalString(body, "businessType", 80);
  if (!businessType.ok) return businessType;
  const soldCount = optionalNumber(body, "soldCount", 0, 1_000_000);
  if (!soldCount.ok) return soldCount;
  const authProvider = optionalEnumString(body, "authProvider", AUTH_PROVIDERS);
  if (!authProvider.ok) return authProvider;
  const companyName = optionalString(body, "companyName", 200);
  if (!companyName.ok) return companyName;
  const companyCode = optionalString(body, "companyCode", 40);
  if (!companyCode.ok) return companyCode;
  const vatCode = optionalString(body, "vatCode", 40);
  if (!vatCode.ok) return vatCode;
  const billingPlan = optionalEnumString(body, "billingPlan", new Set(["free", "starter", "pro"]));
  if (!billingPlan.ok) return billingPlan;
  const billingModel = optionalEnumString(body, "billingModel", new Set(["ppc", "subscription"]));
  if (!billingModel.ok) return billingModel;
  const serviceBaseCity = optionalString(body, "serviceBaseCity", 120);
  if (!serviceBaseCity.ok) return serviceBaseCity;
  const serviceRadiusKm = optionalNumber(body, "serviceRadiusKm", 0, 999);
  if (!serviceRadiusKm.ok) return serviceRadiusKm;
  const serviceNationwide = optionalBoolean(body, "serviceNationwide");
  if (!serviceNationwide.ok) return serviceNationwide;
  const serviceSpecialties = optionalStringArray(body, "serviceSpecialties", 40, 120);
  if (!serviceSpecialties.ok) return serviceSpecialties;
  const averageResponseMinutes = optionalNumber(body, "averageResponseMinutes", 0, 10_000);
  if (!averageResponseMinutes.ok) return averageResponseMinutes;
  const ageGroup = optionalEnumString(body, "ageGroup", new Set(["Youth", "Adult", "Senior"]));
  if (!ageGroup.ok) return ageGroup;
  const gender = optionalEnumString(body, "gender", new Set(["Male", "Female", "PreferNot"]));
  if (!gender.ok) return gender;
  const hobbies = optionalStringArray(body, "hobbies", 40, 80);
  if (!hobbies.ok) return hobbies;
  return ok({
    id: id.value,
    name: name.value,
    phone: phone.value,
    city: city.value,
    avatar: avatar.value,
    email: email.value,
    warned: warned.value,
    walletBalance: walletBalance.value,
    role: role.value,
    businessType: businessType.value,
    soldCount: soldCount.value,
    authProvider: authProvider.value,
    companyName: companyName.value,
    companyCode: companyCode.value,
    vatCode: vatCode.value,
    billingPlan: billingPlan.value,
    billingModel: billingModel.value,
    serviceBaseCity: serviceBaseCity.value,
    serviceRadiusKm: serviceRadiusKm.value,
    serviceNationwide: serviceNationwide.value,
    serviceSpecialties: serviceSpecialties.value,
    averageResponseMinutes: averageResponseMinutes.value,
    ageGroup: ageGroup.value as ApiUser["ageGroup"],
    gender: gender.value as ApiUser["gender"],
    hobbies: hobbies.value,
  });
}

export interface UserProfilePatchInput {
  firstName?: string;
  lastName?: string;
  nickname?: string;
}

export function validateUserProfilePatch(
  body: unknown
): ValidationResult<UserProfilePatchInput> {
  if (!isRecord(body)) return fail("Body must be an object");
  const firstName = optionalString(body, "firstName", 80);
  if (!firstName.ok) return firstName;
  const lastName = optionalString(body, "lastName", 80);
  if (!lastName.ok) return lastName;
  const nickname = optionalString(body, "nickname", 80);
  if (!nickname.ok) return nickname;
  if (
    firstName.value === undefined &&
    lastName.value === undefined &&
    nickname.value === undefined
  ) {
    return fail("At least one profile field is required");
  }
  return ok({
    firstName: firstName.value,
    lastName: lastName.value,
    nickname: nickname.value,
  });
}

export function validateChatThread(body: unknown): ValidationResult<ApiChatThread> {
  if (!isRecord(body)) return fail("Body must be an object");
  const id = requiredString(body, "id", 120);
  if (!id.ok) return id;
  const listingId = requiredString(body, "listingId", 120);
  if (!listingId.ok) return listingId;
  const listingTitle = requiredString(body, "listingTitle", 200);
  if (!listingTitle.ok) return listingTitle;
  const buyerId = requiredString(body, "buyerId", 120);
  if (!buyerId.ok) return buyerId;
  const sellerId = requiredString(body, "sellerId", 120);
  if (!sellerId.ok) return sellerId;
  if (!Array.isArray(body.messages)) return fail("messages must be an array");
  if (body.messages.length > 500) return fail("messages has too many items");
  const messages: ApiChatMessage[] = [];
  for (const message of body.messages) {
    const parsed = validateMessage(message);
    if (!parsed.ok) return parsed;
    messages.push(parsed.value);
  }
  const escrowOffered =
    typeof body.escrowOffered === "boolean" ? body.escrowOffered : false;
  const escrow =
    body.escrow === undefined || body.escrow === null
      ? undefined
      : validateEscrow(body.escrow);
  if (escrow && !escrow.ok) return escrow;
  const lastReadAt = isoDateString(body, "lastReadAt", false);
  if (!lastReadAt.ok) return lastReadAt;
  const smsFallbackSentFor = optionalString(body, "smsFallbackSentFor", 120);
  if (!smsFallbackSentFor.ok) return smsFallbackSentFor;
  return ok({
    id: id.value,
    listingId: listingId.value,
    listingTitle: listingTitle.value,
    buyerId: buyerId.value,
    sellerId: sellerId.value,
    messages,
    escrowOffered,
    escrow: escrow?.value,
    lastReadAt: lastReadAt.value,
    smsFallbackSentFor: smsFallbackSentFor.value,
  });
}

export function validateEscrow(body: unknown): ValidationResult<ApiEscrowTransaction> {
  if (!isRecord(body)) return fail("Body must be an object");
  const id = requiredString(body, "id", 120);
  if (!id.ok) return id;
  const threadId = requiredString(body, "threadId", 120);
  if (!threadId.ok) return threadId;
  const listingId = requiredString(body, "listingId", 120);
  if (!listingId.ok) return listingId;
  const buyerId = requiredString(body, "buyerId", 120);
  if (!buyerId.ok) return buyerId;
  const sellerId = requiredString(body, "sellerId", 120);
  if (!sellerId.ok) return sellerId;
  const amount = requiredNumber(body, "amount", 0.01, 100_000_000);
  if (!amount.ok) return amount;
  const status = enumString(body, "status", ESCROW_STATUSES);
  if (!status.ok) return status;
  const trackingCode = optionalString(body, "trackingCode", 120);
  if (!trackingCode.ok) return trackingCode;
  const createdAt = isoDateString(body, "createdAt");
  if (!createdAt.ok) return createdAt;
  if (createdAt.value === undefined) return fail("createdAt is required");
  const updatedAt = isoDateString(body, "updatedAt");
  if (!updatedAt.ok) return updatedAt;
  if (updatedAt.value === undefined) return fail("updatedAt is required");
  const expressEscrow24h = optionalBoolean(body, "expressEscrow24h");
  if (!expressEscrow24h.ok) return expressEscrow24h;
  const deliveredToLockerAt = isoDateString(body, "deliveredToLockerAt");
  if (!deliveredToLockerAt.ok) return deliveredToLockerAt;
  const claimDeadlineAt = isoDateString(body, "claimDeadlineAt");
  if (!claimDeadlineAt.ok) return claimDeadlineAt;
  const courierStatus = optionalString(body, "courierStatus", 120);
  if (!courierStatus.ok) return courierStatus;
  const courierProvider = optionalString(body, "courierProvider", 40);
  if (!courierProvider.ok) return courierProvider;
  const buyerProtectionFee = optionalNumber(body, "buyerProtectionFee", 0, 100_000);
  if (!buyerProtectionFee.ok) return buyerProtectionFee;
  const buyerTotal = optionalNumber(body, "buyerTotal", 0, 100_000_000);
  if (!buyerTotal.ok) return buyerTotal;
  const stripePaymentIntentId = optionalString(body, "stripePaymentIntentId", 120);
  if (!stripePaymentIntentId.ok) return stripePaymentIntentId;
  const shippingLabelId = optionalString(body, "shippingLabelId", 120);
  if (!shippingLabelId.ok) return shippingLabelId;
  const deliveryStatus = optionalString(body, "deliveryStatus", 80);
  if (!deliveryStatus.ok) return deliveryStatus;
  const buyerConfirmed = optionalBoolean(body, "buyerConfirmed");
  if (!buyerConfirmed.ok) return buyerConfirmed;
  const shippingProvider = optionalString(body, "shippingProvider", 40);
  if (!shippingProvider.ok) return shippingProvider;
  const shippingLockerId = optionalString(body, "shippingLockerId", 120);
  if (!shippingLockerId.ok) return shippingLockerId;
  const shippingLockerName = optionalString(body, "shippingLockerName", 200);
  if (!shippingLockerName.ok) return shippingLockerName;
  return ok({
    id: id.value,
    threadId: threadId.value,
    listingId: listingId.value,
    buyerId: buyerId.value,
    sellerId: sellerId.value,
    amount: amount.value,
    status: status.value as ApiEscrowStatus,
    trackingCode: trackingCode.value,
    expressEscrow24h: expressEscrow24h.value,
    deliveredToLockerAt: deliveredToLockerAt.value,
    claimDeadlineAt: claimDeadlineAt.value,
    courierStatus: courierStatus.value,
    courierProvider: courierProvider.value,
    buyerProtectionFee: buyerProtectionFee.value,
    buyerTotal: buyerTotal.value,
    stripePaymentIntentId: stripePaymentIntentId.value,
    shippingLabelId: shippingLabelId.value,
    deliveryStatus: deliveryStatus.value,
    buyerConfirmed: buyerConfirmed.value,
    shippingProvider: shippingProvider.value,
    shippingLockerId: shippingLockerId.value,
    shippingLockerName: shippingLockerName.value,
    createdAt: createdAt.value,
    updatedAt: updatedAt.value,
  });
}

export function validateReview(body: unknown): ValidationResult<ApiReview> {
  if (!isRecord(body)) return fail("Body must be an object");
  const id = requiredString(body, "id", 120);
  if (!id.ok) return id;
  const sellerId = requiredString(body, "sellerId", 120);
  if (!sellerId.ok) return sellerId;
  const listingId = requiredString(body, "listingId", 120);
  if (!listingId.ok) return listingId;
  const listingTitle = requiredString(body, "listingTitle", 200);
  if (!listingTitle.ok) return listingTitle;
  const reviewerId = requiredString(body, "reviewerId", 120);
  if (!reviewerId.ok) return reviewerId;
  const reviewerName = requiredString(body, "reviewerName", 160);
  if (!reviewerName.ok) return reviewerName;
  const rating = requiredNumber(body, "rating", 1, 5);
  if (!rating.ok) return rating;
  if (!Number.isInteger(rating.value)) return fail("rating must be an integer");
  const comment = optionalString(body, "comment", 2000);
  if (!comment.ok) return comment;
  const createdAt = isoDateString(body, "createdAt");
  if (!createdAt.ok) return createdAt;
  if (createdAt.value === undefined) return fail("createdAt is required");
  return ok({
    id: id.value,
    sellerId: sellerId.value,
    listingId: listingId.value,
    listingTitle: listingTitle.value,
    reviewerId: reviewerId.value,
    reviewerName: reviewerName.value,
    rating: rating.value,
    comment: comment.value,
    createdAt: createdAt.value,
  });
}

export function validateAmount(
  body: unknown,
  key: string,
  min: number,
  max: number
): ValidationResult<number> {
  if (!isRecord(body)) return fail("Body must be an object");
  return requiredNumber(body, key, min, max);
}

const SERVICE_URGENCIES = new Set(["today", "this_week", "flexible"]);

export function validateServiceLeadCreate(
  body: unknown
): ValidationResult<{
  title: string;
  city: string;
  category: string;
  summary: string;
  urgency: "today" | "this_week" | "flexible";
  budgetHint: string;
  leadPrice: number;
  hiddenContact: string;
  contactPhone: string;
  requiredSpecialties: string[];
  query?: string;
}> {
  if (!isRecord(body)) return fail("Body must be an object");
  const title = requiredString(body, "title", 200);
  if (!title.ok) return title;
  const city = requiredString(body, "city", 80);
  if (!city.ok) return city;
  const category = requiredString(body, "category", 80);
  if (!category.ok) return category;
  const summary = requiredString(body, "summary", 2000);
  if (!summary.ok) return summary;
  const hiddenContact = requiredString(body, "hiddenContact", 40);
  if (!hiddenContact.ok) return hiddenContact;
  const contactPhone = requiredString(body, "contactPhone", 30);
  if (!contactPhone.ok) return contactPhone;

  const urgencyRaw = body.urgency;
  const urgency =
    typeof urgencyRaw === "string" && SERVICE_URGENCIES.has(urgencyRaw)
      ? (urgencyRaw as "today" | "this_week" | "flexible")
      : "flexible";

  const budgetHint =
    typeof body.budgetHint === "string" && body.budgetHint.trim()
      ? body.budgetHint.trim().slice(0, 80)
      : "Sutarti";

  const leadPriceRaw = body.leadPrice;
  const leadPrice =
    typeof leadPriceRaw === "number" && leadPriceRaw >= 0.5 && leadPriceRaw <= 50
      ? leadPriceRaw
      : 1.2;

  const specialtiesRaw = body.requiredSpecialties;
  const requiredSpecialties = Array.isArray(specialtiesRaw)
    ? specialtiesRaw
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim().slice(0, 80))
        .slice(0, 10)
    : [];

  const query =
    typeof body.query === "string" && body.query.trim()
      ? body.query.trim().slice(0, 2000)
      : undefined;

  return ok({
    title: title.value,
    city: city.value,
    category: category.value,
    summary: summary.value,
    urgency,
    budgetHint,
    leadPrice,
    hiddenContact: hiddenContact.value,
    contactPhone: contactPhone.value,
    requiredSpecialties,
    query,
  });
}
