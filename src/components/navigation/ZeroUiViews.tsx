"use client";

import Link from "next/link";
import { ArrowLeft, LogIn, MessageCircle, Sparkles } from "lucide-react";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { FilterBubbles } from "@/components/FilterBubbles";
import { ListingGrid } from "@/components/ListingGrid";
import { MarketplaceCategoryGrid } from "@/components/MarketplaceCategoryGrid";
import { ServiceRequestCard } from "@/components/services/ServiceRequestCard";
import { HotKeywordsGrid } from "@/components/home/HotKeywordsGrid";
import { SellerUploadPanel } from "@/components/SellerUploadPanel";
import { AdminGeminiUploadPanel } from "@/components/admin/AdminGeminiUploadPanel";
import { ConnectionStatusCard } from "@/components/status/ConnectionStatusCard";
import { useAuth } from "@/context/AuthContext";
import { useVauto } from "@/context/VautoContext";
import { useNavigation, viewTitle } from "@/context/NavigationContext";
import type { AppView } from "@/lib/app-views";
import { hasUnreadInThread } from "@/lib/chat-helpers";

function ZeroUiChrome({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  const { currentView, goBack, exitZeroUi } = useNavigation();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-[#e5e7eb] pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={goBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#374151]"
            aria-label="Atgal"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#1167b1]">
              <Sparkles className="h-3 w-3" />
              AI navigacija
            </p>
            <h2 className="truncate text-base font-bold text-[#111827]">
              {viewTitle(currentView)}
            </h2>
            {subtitle ? (
              <p className="truncate text-xs text-[#6b7280]">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={exitZeroUi}
          className="shrink-0 rounded-lg border border-[#d1d5db] px-2.5 py-1.5 text-[11px] font-semibold text-[#374151]"
        >
          Klasikinis UI
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">{children}</div>
    </div>
  );
}

function HomeZeroView() {
  return (
    <ZeroUiChrome>
      <Header />
      <div className="mt-3">
        <SearchBar />
      </div>
      <div className="mt-4">
        <MarketplaceCategoryGrid />
        <ServiceRequestCard />
        <HotKeywordsGrid />
        <FilterBubbles />
        <ListingGrid />
      </div>
    </ZeroUiChrome>
  );
}

function DiscoverZeroView() {
  return (
    <ZeroUiChrome subtitle="Išmanioji paieška ir rekomendacijos">
      <Header />
      <div className="mt-3">
        <SearchBar />
      </div>
      <div className="mt-4">
        <MarketplaceCategoryGrid />
        <HotKeywordsGrid />
        <FilterBubbles />
        <ListingGrid />
      </div>
    </ZeroUiChrome>
  );
}

function SearchResultsZeroView() {
  const { searchQuery } = useVauto();
  return (
    <ZeroUiChrome subtitle={searchQuery.trim() || "Visi skelbimai"}>
      <FilterBubbles />
      <ListingGrid />
    </ZeroUiChrome>
  );
}

function AddListingZeroView() {
  const { isAuthenticated, authHydrated, openAuthModal } = useAuth();

  if (!authHydrated) {
    return (
      <ZeroUiChrome>
        <p className="py-12 text-center text-sm text-slate-500">Kraunama…</p>
      </ZeroUiChrome>
    );
  }

  if (!isAuthenticated) {
    return (
      <ZeroUiChrome>
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <p className="text-sm text-slate-600">
            Prisijunkite, kad galėtumėte įkelti skelbimą per AI vedlį.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal("/add/")}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1167b1] px-5 py-2.5 text-sm font-bold text-white"
          >
            <LogIn className="h-4 w-4" />
            Prisijungti
          </button>
        </div>
      </ZeroUiChrome>
    );
  }

  return (
    <ZeroUiChrome subtitle="Nuotrauka, balsas arba tekstas">
      <SellerUploadPanel />
    </ZeroUiChrome>
  );
}

function SellerWizardZeroView() {
  const { sellerStep } = useVauto();
  const { viewParams } = useNavigation();
  const category = viewParams.category;

  return (
    <ZeroUiChrome
      subtitle={
        category
          ? `Kategorija: ${category}`
          : sellerStep !== "idle"
            ? "Vedlys aktyvus"
            : "Pasirinkite ką parduodate"
      }
    >
      {sellerStep === "idle" ? (
        <SellerUploadPanel />
      ) : (
        <p className="rounded-xl border border-[#c8e6c9] bg-[#e8f5e9] px-4 py-3 text-sm text-[#2e7d32]">
          Pardavėjo vedlys vykdomas — tęskite dialogą su AI asistentu arba užpildykite
          formą, kuri atsidarė viršuje.
        </p>
      )}
    </ZeroUiChrome>
  );
}

function ChatsZeroView() {
  const { openAuthModal } = useAuth();
  const { chats, user, isAuthenticated, authHydrated } = useVauto();

  if (!authHydrated) {
    return (
      <ZeroUiChrome>
        <p className="py-12 text-center text-sm text-slate-500">Kraunama…</p>
      </ZeroUiChrome>
    );
  }

  if (!isAuthenticated) {
    return (
      <ZeroUiChrome>
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <MessageCircle className="mb-3 h-10 w-10 text-[#1167b1]" />
          <p className="text-sm text-slate-600">Prisijunkite, kad matytumėte pokalbius.</p>
          <button
            type="button"
            onClick={() => openAuthModal("/chats/")}
            className="mt-4 rounded-xl bg-[#1167b1] px-5 py-2.5 text-sm font-bold text-white"
          >
            Prisijungti
          </button>
        </div>
      </ZeroUiChrome>
    );
  }

  const myChats = chats.filter(
    (c) => c.buyerId === user.id || c.sellerId === user.id
  );

  return (
    <ZeroUiChrome subtitle={`${myChats.length} pokalbiai`}>
      <ul className="space-y-2">
        {myChats.map((chat) => {
          const last = chat.messages[chat.messages.length - 1];
          return (
          <li key={chat.id}>
            <Link
              href={`/chats/${chat.id}/`}
              className="flex items-center justify-between rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 no-underline"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#111827]">
                  {chat.listingTitle}
                </p>
                <p className="truncate text-xs text-[#6b7280]">{last?.text ?? "—"}</p>
              </div>
              {hasUnreadInThread(chat, user.id) ? (
                <span className="ml-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[#ef4444]" />
              ) : null}
            </Link>
          </li>
        );})}
        {myChats.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Pokalbių dar nėra — parašykite pardavėjui iš skelbimo.
          </p>
        ) : null}
      </ul>
    </ZeroUiChrome>
  );
}

function ProfileZeroView() {
  const { user, isAdmin, isAuthenticated } = useVauto();

  return (
    <ZeroUiChrome subtitle={user.name || user.email || "Profilis"}>
      <ConnectionStatusCard />
      {isAuthenticated ? (
        <div className="mt-4 rounded-xl border border-[#e5e7eb] bg-white p-4">
          <p className="text-sm font-semibold text-[#111827]">{user.name}</p>
          <p className="text-xs text-[#6b7280]">{user.email || user.phone}</p>
          {isAdmin ? (
            <Link
              href="/admin/ai/"
              className="mt-3 inline-block text-sm font-medium text-indigo-600"
            >
              Atidaryti Admin AI →
            </Link>
          ) : null}
          <Link
            href="/profile/"
            className="mt-3 block text-sm font-medium text-[#1167b1]"
          >
            Pilnas profilis →
          </Link>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-600">Prisijunkite pilnam profiliui.</p>
      )}
    </ZeroUiChrome>
  );
}

function AdminAiZeroView() {
  const { isAdmin } = useVauto();

  if (!isAdmin) {
    return (
      <ZeroUiChrome>
        <p className="py-8 text-center text-sm text-red-600">
          Tik administratoriams.
        </p>
      </ZeroUiChrome>
    );
  }

  return (
    <ZeroUiChrome subtitle="Gemini projekto kontekstas">
      <AdminGeminiUploadPanel />
    </ZeroUiChrome>
  );
}

export function ZeroUiViewContent({ view }: { view: AppView }) {
  switch (view) {
    case "home":
      return <HomeZeroView />;
    case "discover":
      return <DiscoverZeroView />;
    case "search_results":
      return <SearchResultsZeroView />;
    case "add_listing":
      return <AddListingZeroView />;
    case "seller_wizard":
      return <SellerWizardZeroView />;
    case "chats":
      return <ChatsZeroView />;
    case "profile":
      return <ProfileZeroView />;
    case "admin_ai":
      return <AdminAiZeroView />;
    default:
      return <HomeZeroView />;
  }
}
