import { FeatureShowcase } from "@/components/showcase/FeatureShowcase";
import { CTASection } from "@/components/sections/CTASection";
import { HeroSection } from "@/components/sections/HeroSection";

export default function Home() {
  return (
    <>
      <HeroSection />
      <FeatureShowcase />
      <CTASection />
    </>
  );
}
