import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { ChatThreadView } from "@/components/ChatThreadView";
import { INITIAL_CHATS } from "@/data/mockListings";

export function generateStaticParams() {
  return INITIAL_CHATS.map((chat) => ({ id: chat.id }));
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ChatDetailPage({ params }: Props) {
  const { id } = await params;

  return (
    <AppShell variant="plain" hideNav>
      <Suspense
        fallback={
          <p className="py-12 text-center text-[var(--vauto-text-muted)]">
            Kraunama...
          </p>
        }
      >
        <ChatThreadView chatId={id} />
      </Suspense>
    </AppShell>
  );
}
