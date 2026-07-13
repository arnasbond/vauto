"use client";

import { LogIn, MessageCircle } from "lucide-react";
import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { ChatsListPanel } from "@/components/chats/ChatsListPanel";
import { ChatThreadView } from "@/components/ChatThreadView";
import { useAuth } from "@/context/AuthContext";
import { useVauto } from "@/context/VautoContext";
import { useLayoutMode } from "@/context/LayoutModeContext";

export default function ChatsPage() {
  return (
    <Suspense
      fallback={
        <VautoAdaptiveLayout variant="plain">
          <p className="py-16 text-center text-sm text-slate-500">Kraunama…</p>
        </VautoAdaptiveLayout>
      }
    >
      <ChatsPageContent />
    </Suspense>
  );
}

function ChatsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openAuthModal } = useAuth();
  const { chats, user, isAuthenticated, authHydrated } = useVauto();
  const { isDesktop } = useLayoutMode();

  const myChats = useMemo(
    () => chats.filter((c) => c.buyerId === user.id || c.sellerId === user.id),
    [chats, user.id]
  );

  const selectedChatId = searchParams.get("id");
  const activeChatId =
    selectedChatId && myChats.some((c) => c.id === selectedChatId)
      ? selectedChatId
      : isDesktop
        ? (myChats[0]?.id ?? null)
        : null;

  useEffect(() => {
    if (!isDesktop || !isAuthenticated || myChats.length === 0) return;
    if (selectedChatId && myChats.some((c) => c.id === selectedChatId)) return;
    if (myChats[0]) {
      router.replace(`/chats/?id=${encodeURIComponent(myChats[0].id)}`, {
        scroll: false,
      });
    }
  }, [isDesktop, isAuthenticated, myChats, selectedChatId, router]);

  const handleSelectChat = (chatId: string) => {
    router.push(`/chats/?id=${encodeURIComponent(chatId)}`, { scroll: false });
  };

  if (!authHydrated) {
    return (
      <VautoAdaptiveLayout variant="plain">
        <p className="py-16 text-center text-sm text-slate-500">Kraunama…</p>
      </VautoAdaptiveLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <VautoAdaptiveLayout variant="plain">
        <div className="flex min-h-[50dvh] flex-col items-center justify-center px-6 text-center">
          <MessageCircle className="mb-4 h-12 w-12 text-[var(--vauto-teal)]" />
          <h1 className="text-xl font-bold text-slate-900">Pokalbiai</h1>
          <p className="mt-2 text-sm text-slate-600">
            Prisijunkite, kad galėtumėte rašyti pardavėjams ir sekti pokalbius.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal("/chats")}
            className="mt-6 flex items-center gap-2 rounded-2xl bg-[var(--vauto-teal)] px-6 py-3 text-sm font-semibold text-white"
          >
            <LogIn className="h-4 w-4" />
            Prisijungti
          </button>
        </div>
      </VautoAdaptiveLayout>
    );
  }

  if (isDesktop) {
    return (
      <VautoAdaptiveLayout variant="plain">
        <div className="mx-auto w-full max-w-7xl px-4 md:px-0">
          <h1 className="mb-4 font-display text-xl font-bold text-slate-900">
            Pokalbiai
          </h1>
          <div className="grid min-h-[calc(100dvh-12rem)] gap-4 md:grid-cols-3">
            <aside className="md:col-span-1 md:max-h-[calc(100dvh-12rem)] md:overflow-y-auto md:rounded-2xl md:border md:border-slate-200/80 md:bg-white md:p-3 md:shadow-sm">
              <ChatsListPanel
                chats={myChats}
                userId={user.id}
                selectedChatId={activeChatId}
                onSelectChat={handleSelectChat}
              />
            </aside>
            <section className="md:col-span-2 md:rounded-2xl md:border md:border-slate-200/80 md:bg-slate-50/80 md:p-2 md:shadow-sm">
              {activeChatId ? (
                <ChatThreadView chatId={activeChatId} embedded />
              ) : (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl bg-white p-8 text-center">
                  <MessageCircle className="mb-3 h-10 w-10 text-slate-300" />
                  <p className="text-sm text-slate-500">
                    Pasirinkite pokalbį iš sąrašo arba atidarykite skelbimą ir
                    spauskite „Rašyti“.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </VautoAdaptiveLayout>
    );
  }

  return (
    <VautoAdaptiveLayout variant="plain">
      <div className="mx-auto w-full max-w-lg md:max-w-7xl">
        <h1 className="mb-4 font-display text-xl font-bold text-slate-900">
          Pokalbiai
        </h1>
        <ChatsListPanel
          chats={myChats}
          userId={user.id}
          linkPrefix="/pokalbiai/?id="
        />
        <p className="mt-6 text-center text-xs text-slate-400">
          Parašykite „perku“ arba „tinka“ — AI pasiūlys saugų mokėjimą.
        </p>
      </div>
    </VautoAdaptiveLayout>
  );
}
