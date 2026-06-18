import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { ActionButtons } from "@/components/ActionButtons";
import { FilterBubbles } from "@/components/FilterBubbles";
import { ListingGrid } from "@/components/ListingGrid";
import { HeroSection, ContentSection } from "@/components/HeroSection";

export default function HomePage() {
  return (
    <AppShell>
      <HeroSection>
        <Header />
        <h2 className="mt-5 text-center text-xl font-bold leading-snug text-white sm:text-2xl">
          Ko ieškai ar parduodi?
        </h2>
        <div className="mt-4">
          <SearchBar />
        </div>
        <ActionButtons />
      </HeroSection>

      <ContentSection>
        <FilterBubbles />
        <ListingGrid />
      </ContentSection>
    </AppShell>
  );
}
