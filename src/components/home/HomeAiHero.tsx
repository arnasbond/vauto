"use client";



import { useCallback, useState } from "react";

import { Header } from "@/components/Header";

import { AiCommandBar } from "@/components/search/AiCommandBar";

import { AgentChatStrip } from "@/components/home/AgentChatStrip";

import { useShellChrome } from "@/hooks/useShellChrome";

import { useVautoAgent } from "@/context/VautoAgentContext";

import { isEmbeddedAgentChatVisible } from "@/lib/agent-chat-layout";



interface HomeAiHeroProps {

  seedQuery?: string | null;

  onSeedConsumed?: () => void;

  compact?: boolean;

}



export function HomeAiHero({

  seedQuery,

  onSeedConsumed,

  compact = false,

}: HomeAiHeroProps) {

  const shell = useShellChrome();

  const { messages, busy, open } = useVautoAgent();

  const chatActive = open || isEmbeddedAgentChatVisible(messages, busy);

  const [pillSeed, setPillSeed] = useState<string | null>(null);

  const activeSeed = pillSeed ?? seedQuery ?? null;



  const handleSeedConsumed = useCallback(() => {

    setPillSeed(null);

    onSeedConsumed?.();

  }, [onSeedConsumed]);



  if (compact) {

    return (

      <div className="mb-2">

        <div className="md:hidden">

          <Header />

        </div>

        {!chatActive && (

          <div className="mt-3 w-full md:mt-0 md:max-w-4xl">

            <AiCommandBar

              placement="top"

              seedQuery={activeSeed}

              onSeedConsumed={handleSeedConsumed}

            />

          </div>

        )}

        {chatActive && (

          <div className="w-full min-w-0">

            <AgentChatStrip

              seedQuery={activeSeed}

              onSeedConsumed={handleSeedConsumed}

            />

          </div>

        )}

      </div>

    );

  }



  if (!compact && !shell.showHomeHero && !chatActive) {

    return null;

  }



  return (

    <div className="mb-2">

      <div className="md:hidden">

        <Header />

      </div>



      {!chatActive && (

        <>

          <h1 className="vauto-layout-heading text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl md:text-[2.75rem] md:leading-tight">

            Nauja karta skelbimų. Valdoma DI.

          </h1>



          <div className="mt-6 w-full md:max-w-none">

            <AiCommandBar

              placement="hero"

              seedQuery={activeSeed}

              onSeedConsumed={handleSeedConsumed}

              className="md:max-w-4xl"

            />

          </div>

        </>

      )}



      {chatActive && (

        <div className="w-full min-w-0">

          <AgentChatStrip

            seedQuery={activeSeed}

            onSeedConsumed={handleSeedConsumed}

          />

        </div>

      )}

    </div>

  );

}


