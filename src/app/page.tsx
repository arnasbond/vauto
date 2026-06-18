import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { FilterBubbles } from "@/components/FilterBubbles";
import { ListingGrid } from "@/components/ListingGrid";
import { HeroSection, ContentSection } from "@/components/HeroSection";

export default function HomePage() {
  return (
    <AppShell>
      <HeroSection>
        <Header />
        <h1 className="mt-5 text-center text-xl font-bold leading-snug text-white sm:text-2xl">
          Ieškok skelbimų — registracija nereikalinga
        </h1>
        <p className="mt-2 text-center text-sm text-white/75">
          Norint įdėti skelbimą reikės prisijungti
        </p>
        <div className="mt-4">
          <SearchBar />
        </div>
      </HeroSection>

      <ContentSection>
        <FilterBubbles />
        <ListingGrid />
      </ContentSection>
    </AppShell>
  );
}
