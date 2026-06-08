"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { DemoMedia } from "@/components/showcase/DemoMedia";
import type { Feature } from "@/lib/features";
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

export function FeatureShowcaseSection({ feature }: FeatureShowcaseSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const isTextLeft = feature.layout === "text-left";

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
            {feature.highlights.map((item) => (
              <motion.li
                key={item.label}
                variants={itemVariants}
                className="flex gap-3 rounded-xl border border-zinc-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-sm"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                  <item.icon className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{item.label}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-zinc-500">
                    {item.detail}
                  </p>
                </div>
              </motion.li>
            ))}
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
          <DemoMedia
            src={feature.media.src}
            poster={feature.media.poster}
            alt={`${feature.title} demo`}
          />
        </motion.div>
      </div>
    </section>
  );
}
