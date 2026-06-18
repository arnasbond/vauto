"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  INITIAL_CHATS,
  INITIAL_LISTINGS,
  MOCK_USER,
} from "@/data/mockListings";
import {
  detectPurchaseIntent,
  generateDynamicFilters,
  rankListings,
  resolveSortMode,
} from "@/lib/scoring";
import {
  extractCombined,
  extractFromImage,
  extractFromText,
  extractFromVoice,
} from "@/lib/client-api";
import { isDuplicateListing } from "@/lib/dedup";
import { moderateListing } from "@/lib/moderation";
import {
  loadChats,
  loadListings,
  loadSavedIds,
  loadUser,
  saveChats,
  saveListings,
  saveSavedIds,
  saveUser,
} from "@/lib/storage";
import { capturePhoto } from "@/lib/native-media";
import { distanceToCity, getUserCoords } from "@/lib/geolocation";
import {
  apiCreateListing,
  apiDeleteListing,
  apiFetchChats,
  apiFetchListings,
  apiFetchSaved,
  apiFetchUser,
  apiHealthCheck,
  apiUpdateSaved,
  apiUpdateUser,
  apiUpsertChat,
} from "@/lib/api/client";
import { isDataApiEnabled } from "@/lib/api/config";
import { parseVideoUrl } from "@/lib/video-url";
import type {
  AiExtractedListing,
  ChatMessage,
  ChatThread,
  Listing,
  SellerFlowStep,
  SellerInputMode,
  UserProfile,
} from "@/lib/types";

interface VautoContextValue {
  user: UserProfile;
  updateUser: (patch: Partial<UserProfile>) => void;
  listings: Listing[];
  savedIds: Set<string>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeFilterIds: Set<string>;
  toggleFilter: (id: string) => void;
  rankedListings: ReturnType<typeof rankListings>;
  dynamicFilters: ReturnType<typeof generateDynamicFilters>;
  toggleSave: (id: string) => void;
  deleteListing: (id: string) => void;

  sellerStep: SellerFlowStep;
  sellerInputMode: SellerInputMode;
  aiDraft: AiExtractedListing | null;
  sellerPreviewImage: string | null;
  startUploadFlow: () => Promise<void>;
  startVoiceFlow: () => void;
  completeVoiceRecording: (transcript: string | null) => void;
  cancelVoiceRecording: () => void;
  updateAiDraft: (patch: Partial<AiExtractedListing>) => void;
  publishListing: () => void;
  cancelSellerFlow: () => void;
  submitSellerContent: (payload: {
    text?: string;
    imageDataUrl?: string | null;
    videoUrl?: string;
  }) => Promise<void>;

  chats: ChatThread[];
  sendMessage: (chatId: string, text: string) => void;
  startChat: (listingId: string) => string | null;
}

const VautoContext = createContext<VautoContextValue | null>(null);

const PLACEHOLDER_IMAGES: Record<string, string> = {
  electronics:
    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&h=400&fit=crop",
  services:
    "https://images.unsplash.com/photo-1558904541-efa843a96f01?w=600&h=400&fit=crop",
  vehicles:
    "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600&h=400&fit=crop",
  home: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=400&fit=crop",
  other:
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=400&fit=crop",
};

export function VautoProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<UserProfile>(MOCK_USER);
  const [listings, setListings] = useState<Listing[]>(INITIAL_LISTINGS);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set(["l-bike"]));
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilterIds, setActiveFilterIds] = useState<Set<string>>(
    new Set()
  );
  const [chats, setChats] = useState<ChatThread[]>(INITIAL_CHATS);

  useEffect(() => {
    async function load() {
      if (isDataApiEnabled() && (await apiHealthCheck())) {
        const uid = MOCK_USER.id;
        const [apiListings, apiChats, apiSaved, apiUser] = await Promise.all([
          apiFetchListings(),
          apiFetchChats(uid),
          apiFetchSaved(uid),
          apiFetchUser(uid),
        ]);
        if (apiUser) setUser(apiUser);
        if (apiListings?.length) setListings(apiListings);
        if (apiChats?.length) setChats(apiChats);
        if (apiSaved) setSavedIds(new Set(apiSaved));
        setHydrated(true);
        return;
      }

      const storedUser = loadUser();
      const storedListings = loadListings();
      const storedChats = loadChats();
      const storedSaved = loadSavedIds();
      if (storedUser) setUser(storedUser);
      if (storedListings?.length) setListings(storedListings);
      if (storedChats?.length) setChats(storedChats);
      if (storedSaved) setSavedIds(new Set(storedSaved));
      setHydrated(true);
    }
    void load();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveUser(user);
  }, [user, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveListings(listings);
  }, [listings, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveChats(chats);
  }, [chats, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveSavedIds(savedIds);
  }, [savedIds, hydrated]);

  const [sellerStep, setSellerStep] = useState<SellerFlowStep>("idle");
  const [sellerInputMode, setSellerInputMode] =
    useState<SellerInputMode>(null);
  const [aiDraft, setAiDraft] = useState<AiExtractedListing | null>(null);
  const [sellerPreviewImage, setSellerPreviewImage] = useState<string | null>(
    null
  );
  const [sellerHasVideo, setSellerHasVideo] = useState(false);

  useEffect(() => {
    getUserCoords().then((coords) => {
      if (!coords) return;
      setListings((prev) =>
        prev.map((l) => {
          const d = distanceToCity(coords, l.location);
          return d !== null ? { ...l, distanceKm: Math.round(d * 10) / 10 } : l;
        })
      );
    });
  }, []);

  const updateUser = useCallback((patch: Partial<UserProfile>) => {
    setUser((prev) => {
      const next = { ...prev, ...patch };
      if (isDataApiEnabled()) void apiUpdateUser(next);
      return next;
    });
  }, []);

  const dynamicFilters = useMemo(
    () => generateDynamicFilters(searchQuery),
    [searchQuery]
  );

  const rankedListings = useMemo(() => {
    let results = rankListings(
      listings,
      searchQuery,
      resolveSortMode(activeFilterIds)
    );

    if (activeFilterIds.size > 0) {
      const activeFilters = dynamicFilters.filter((f) =>
        activeFilterIds.has(f.id)
      );
      const sortOnly = new Set(["newest", "cheapest", "closest", "budget", "cheap-service"]);
      const predicateFilters = activeFilters.filter(
        (f) => !sortOnly.has(f.id)
      );
      if (predicateFilters.length > 0) {
        results = results.filter((l) =>
          predicateFilters.every((f) => f.apply(l))
        );
      }
    }

    return results;
  }, [listings, searchQuery, activeFilterIds, dynamicFilters]);

  const toggleFilter = useCallback((id: string) => {
    setActiveFilterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSave = useCallback((id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (isDataApiEnabled()) void apiUpdateSaved(user.id, Array.from(next));
      return next;
    });
  }, [user.id]);

  const deleteListing = useCallback(
    (id: string) => {
      setListings((prev) =>
        prev.filter((l) => !(l.id === id && l.sellerId === user.id))
      );
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (isDataApiEnabled()) void apiDeleteListing(id, user.id);
    },
    [user.id]
  );

  const resetSellerFlow = useCallback(() => {
    setSellerStep("idle");
    setSellerInputMode(null);
    setAiDraft(null);
    setSellerPreviewImage(null);
    setSellerHasVideo(false);
  }, []);

  const runAiProcessing = useCallback(
    async (
      mode: SellerInputMode,
      opts?: {
        transcript?: string;
        previewImage?: string | null;
        videoUrl?: string;
      }
    ) => {
      setSellerStep("processing");
      await new Promise((r) => setTimeout(r, 1500));

      try {
        const coords = await getUserCoords();
        let locationHint = user.city;
        if (coords) {
          const d = distanceToCity(coords, user.city);
          if (d !== null && d < 50) locationHint = user.city;
        }

        const ctx = {
          imageDataUrl: opts?.previewImage,
          transcript: opts?.transcript,
          userCity: locationHint,
          contact: user.phone,
        };

        let extracted: AiExtractedListing;
        if (mode === "combined") {
          extracted = await extractCombined(ctx);
        } else if (mode === "upload") {
          extracted = await extractFromImage(ctx);
        } else if (mode === "text") {
          extracted = await extractFromText(ctx);
        } else {
          extracted = await extractFromVoice(ctx);
        }

        if (!extracted.location && locationHint) {
          extracted = { ...extracted, location: locationHint };
        }

        if (opts?.videoUrl) {
          const vid = parseVideoUrl(opts.videoUrl);
          if (vid.thumbnail && !opts.previewImage) {
            setSellerPreviewImage(vid.thumbnail);
          }
          setSellerHasVideo(vid.hasVideo);
        }

        setAiDraft(extracted);
        setSellerStep("confirmation");
      } catch {
        resetSellerFlow();
      }
    },
    [resetSellerFlow, user.city, user.phone]
  );

  const submitSellerContent = useCallback(
    async (payload: {
      text?: string;
      imageDataUrl?: string | null;
      videoUrl?: string;
    }) => {
      if (payload.imageDataUrl) setSellerPreviewImage(payload.imageDataUrl);
      if (payload.videoUrl) {
        const vid = parseVideoUrl(payload.videoUrl);
        setSellerHasVideo(vid.hasVideo);
        if (vid.thumbnail && !payload.imageDataUrl) {
          setSellerPreviewImage(vid.thumbnail);
        }
      }

      const mode: SellerInputMode =
        payload.imageDataUrl && payload.text
          ? "combined"
          : payload.imageDataUrl
            ? "upload"
            : "text";

      setSellerInputMode(mode);
      await runAiProcessing(mode, {
        transcript: payload.text,
        previewImage: payload.imageDataUrl ?? parseVideoUrl(payload.videoUrl ?? "").thumbnail,
        videoUrl: payload.videoUrl,
      });
    },
    [runAiProcessing]
  );

  const startUploadFlow = useCallback(async () => {
    const photo = await capturePhoto();
    if (!photo) return;

    setSellerPreviewImage(photo);
    setSellerInputMode("upload");
    await runAiProcessing("upload", { previewImage: photo });
  }, [runAiProcessing]);

  const startVoiceFlow = useCallback(() => {
    setSellerInputMode("voice");
    setSellerStep("recording");
  }, []);

  const completeVoiceRecording = useCallback(
    (transcript: string | null) => {
      if (!transcript) {
        resetSellerFlow();
        return;
      }
      runAiProcessing("voice", { transcript });
    },
    [runAiProcessing, resetSellerFlow]
  );

  const cancelVoiceRecording = useCallback(() => {
    resetSellerFlow();
  }, [resetSellerFlow]);

  const updateAiDraft = useCallback((patch: Partial<AiExtractedListing>) => {
    setAiDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const publishListing = useCallback(async () => {
    if (!aiDraft) return;

    if (aiDraft.price <= 0) {
      alert("Įveskite kainą prieš publikuojant.");
      return;
    }

    const mod = moderateListing(aiDraft);
    if (!mod.allowed) {
      alert(mod.reason);
      return;
    }

    if (isDuplicateListing(aiDraft.title, user.id, listings)) {
      alert(
        "Panašus skelbimas jau egzistuoja. Atnaujinkite esamą arba pakeiskite pavadinimą."
      );
      return;
    }

    let distKm = 0.5;
    const coords = await getUserCoords();
    if (coords) {
      const d = distanceToCity(coords, aiDraft.location);
      if (d !== null) distKm = Math.round(d * 10) / 10;
    }

    const newListing: Listing = {
      id: `l-${Date.now()}`,
      title: aiDraft.title,
      price: aiDraft.price,
      location: aiDraft.location,
      distanceKm: distKm,
      image:
        sellerPreviewImage ??
        PLACEHOLDER_IMAGES[aiDraft.category] ??
        PLACEHOLDER_IMAGES.other,
      category: aiDraft.category,
      tags: [],
      sellerId: user.id,
      createdAt: new Date().toISOString(),
      contact: aiDraft.contact,
      hasVideo: sellerHasVideo,
    };

    setListings((prev) => [newListing, ...prev]);
    if (isDataApiEnabled()) void apiCreateListing(newListing, user.id);
    setSellerStep("published");

    setTimeout(resetSellerFlow, 2000);
  }, [
    aiDraft,
    sellerPreviewImage,
    sellerHasVideo,
    resetSellerFlow,
    user.id,
    listings,
  ]);

  const cancelSellerFlow = useCallback(() => {
    resetSellerFlow();
  }, [resetSellerFlow]);

  const sendMessage = useCallback(
    (chatId: string, text: string) => {
      const msg: ChatMessage = {
        id: `m-${Date.now()}`,
        senderId: user.id,
        text,
        timestamp: new Date().toISOString(),
      };

      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== chatId) return chat;

          const updated: ChatThread = {
            ...chat,
            messages: [...chat.messages, msg],
          };

          if (!chat.escrowOffered && detectPurchaseIntent(text)) {
            updated.escrowOffered = true;
          }

          if (isDataApiEnabled()) void apiUpsertChat(updated, user.id);
          return updated;
        })
      );
    },
    [user.id]
  );

  const startChat = useCallback(
    (listingId: string): string | null => {
      const listing = listings.find((l) => l.id === listingId);
      if (!listing || listing.sellerId === user.id) return null;

      const existing = chats.find(
        (c) => c.listingId === listingId && c.buyerId === user.id
      );
      if (existing) return existing.id;

      const chatId = `chat-${Date.now()}`;
      const newChat: ChatThread = {
        id: chatId,
        listingId,
        listingTitle: listing.title,
        buyerId: user.id,
        sellerId: listing.sellerId,
        messages: [
          {
            id: `m-${Date.now()}`,
            senderId: user.id,
            text: `Labas! Dominu „${listing.title}".`,
            timestamp: new Date().toISOString(),
          },
        ],
        escrowOffered: false,
      };

      setChats((prev) => [newChat, ...prev]);
      if (isDataApiEnabled()) void apiUpsertChat(newChat, user.id);
      return chatId;
    },
    [listings, chats, user.id]
  );

  const value: VautoContextValue = {
    user,
    updateUser,
    listings,
    savedIds,
    searchQuery,
    setSearchQuery,
    activeFilterIds,
    toggleFilter,
    rankedListings,
    dynamicFilters,
    toggleSave,
    deleteListing,
    sellerStep,
    sellerInputMode,
    aiDraft,
    sellerPreviewImage,
    startUploadFlow,
    startVoiceFlow,
    completeVoiceRecording,
    cancelVoiceRecording,
    updateAiDraft,
    publishListing,
    cancelSellerFlow,
    submitSellerContent,
    chats,
    sendMessage,
    startChat,
  };

  return (
    <VautoContext.Provider value={value}>{children}</VautoContext.Provider>
  );
}

export function useVauto() {
  const ctx = useContext(VautoContext);
  if (!ctx) throw new Error("useVauto must be used within VautoProvider");
  return ctx;
}
