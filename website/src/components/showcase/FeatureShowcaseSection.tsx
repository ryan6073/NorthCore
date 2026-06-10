"use client";

import { useMemo, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { DemoMediaStack } from "@/components/showcase/DemoMediaStack";
import type { Feature, FeatureHighlight, FeatureMedia } from "@/lib/features";
import { cn } from "@/lib/utils";

type FeatureShowcaseSectionProps = {
  feature: Feature;
};

const textVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  },
};

function isSelectableHighlight(highlight: FeatureHighlight): boolean {
  return highlight.selectable !== false;
}

function resolveHighlightVideo(
  highlight: FeatureHighlight,
  media: FeatureMedia,
): string {
  return highlight.videoSrc ?? media.src;
}

export function FeatureShowcaseSection({ feature }: FeatureShowcaseSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const isTextLeft = feature.layout === "text-left";

  const selectableHighlights = useMemo(
    () => feature.highlights.filter(isSelectableHighlight),
    [feature.highlights],
  );

  const [activeLabel, setActiveLabel] = useState(
    () => selectableHighlights[0]?.label ?? feature.highlights[0]?.label ?? "",
  );

  const videoSources = useMemo(
    () => [
      ...new Set(
        selectableHighlights.map((item) => resolveHighlightVideo(item, feature.media)),
      ),
    ],
    [feature, selectableHighlights],
  );

  const activeHighlight =
    selectableHighlights.find((item) => item.label === activeLabel) ??
    selectableHighlights[0];

  const activeVideo = activeHighlight
    ? resolveHighlightVideo(activeHighlight, feature.media)
    : feature.media.src;

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const mediaY = useTransform(scrollYProgress, [0, 1], [30, -30]);

  return (
    <section
      ref={sectionRef}
      id={feature.id}
      data-showcase
      className="relative flex min-h-[100dvh] items-center px-6 py-20"
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 w-1/2 opacity-40",
          isTextLeft ? "right-0" : "left-0",
        )}
        style={{
          background: isTextLeft
            ? "radial-gradient(ellipse at 80% 50%, rgba(124, 58, 237, 0.06), transparent 70%)"
            : "radial-gradient(ellipse at 20% 50%, rgba(79, 70, 229, 0.06), transparent 70%)",
        }}
      />

      <div
        className={cn(
          "relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16",
          !isTextLeft && "lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1",
        )}
      >
        <motion.div
          initial={{ opacity: 0, x: isTextLeft ? -40 : 40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col"
        >
          <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
            <span className="font-mono text-violet-500">
              {String(feature.index).padStart(2, "0")}
            </span>
            {feature.subtitle}
          </span>

          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            {feature.title}
          </h2>

          <p className="mt-4 text-base leading-relaxed text-zinc-500 sm:text-lg">
            {feature.description}
          </p>

          <motion.ul
            variants={textVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="mt-8 space-y-4"
          >
            {feature.highlights.map((item) => {
              const selectable = isSelectableHighlight(item);
              const isActive = selectable && item.label === activeLabel;

              return (
                <motion.li key={item.label} variants={itemVariants}>
                  {selectable ? (
                    <button
                      type="button"
                      onClick={() => setActiveLabel(item.label)}
                      className={cn(
                        "flex w-full gap-3 rounded-xl border p-4 text-left shadow-sm backdrop-blur-sm transition-all duration-200",
                        isActive
                          ? "border-violet-300 bg-violet-50/80 shadow-md shadow-violet-500/10 ring-1 ring-violet-200"
                          : "border-zinc-200/80 bg-white/70 hover:border-violet-200 hover:bg-violet-50/40",
                      )}
                    >
                      <HighlightContent item={item} isActive={isActive} />
                    </button>
                  ) : (
                    <div className="flex gap-3 rounded-xl border border-zinc-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-sm">
                      <HighlightContent item={item} isActive={false} />
                    </div>
                  )}
                </motion.li>
              );
            })}
          </motion.ul>
        </motion.div>

        <motion.div
          style={{ y: mediaY }}
          initial={{ opacity: 0, x: isTextLeft ? 40 : -40, scale: 0.96 }}
          whileInView={{ opacity: 1, x: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
          className="will-change-transform"
        >
          <DemoMediaStack
            sources={videoSources}
            activeSrc={activeVideo}
            poster={feature.media.poster}
            alt={`${feature.title} - ${activeLabel || "demo"}`}
          />
        </motion.div>
      </div>
    </section>
  );
}

function HighlightContent({
  item,
  isActive,
}: {
  item: FeatureHighlight;
  isActive: boolean;
}) {
  return (
    <>
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          isActive ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-600",
        )}
      >
        <item.icon className="size-4" />
      </div>
      <div>
        <p className="text-sm font-semibold text-zinc-900">{item.label}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-zinc-500">{item.detail}</p>
      </div>
    </>
  );
}
