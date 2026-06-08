"use client";

import { FeatureShowcaseSection } from "@/components/showcase/FeatureShowcaseSection";
import { FEATURES } from "@/lib/features";

export function FeatureShowcase() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-300/60 to-transparent" />

      {FEATURES.map((feature) => (
        <FeatureShowcaseSection key={feature.id} feature={feature} />
      ))}
    </div>
  );
}
