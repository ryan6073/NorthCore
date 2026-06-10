"use client";

import { motion } from "framer-motion";
import { ArrowRight, BookOpen } from "lucide-react";
import { DemoMedia } from "@/components/showcase/DemoMedia";
import { APP_URL, DOCS_URL } from "@/lib/constants";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
};

export function HeroSection() {
  return (
    <section
      id="hero"
      data-showcase
      className="relative flex min-h-[100dvh] flex-col justify-center overflow-hidden px-6 py-20 sm:py-24"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,rgba(124,58,237,0.08),transparent)]" />

      <div className="relative mx-auto w-full max-w-5xl text-center">
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <p className="mb-4 inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium tracking-wide text-violet-700">
            AI Multi-Agent Platform
          </p>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
            <span className="bg-gradient-to-br from-zinc-900 via-zinc-800 to-violet-700 bg-clip-text text-transparent">
              Next-Gen Multi-Agent
            </span>
            <br />
            <span className="bg-gradient-to-br from-violet-700 via-indigo-600 to-indigo-500 bg-clip-text text-transparent">
              Collaboration Platform
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-500 sm:text-lg">
            Orchestrate specialized agents, manage conversations in real time, and
            ship production-ready artifacts — all from one unified workspace built
            for modern AI developers.
          </p>
        </motion.div>

        <motion.div
          {...fadeUp}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <a
            href={APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-violet-500/35 hover:brightness-105"
          >
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-violet-400/0 via-white/20 to-violet-400/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            Get Started
            <ArrowRight className="relative size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </a>

          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-6 py-3 text-sm font-medium text-zinc-600 shadow-sm transition-colors duration-300 hover:border-zinc-300 hover:text-zinc-900"
          >
            <BookOpen className="size-4 text-zinc-400" />
            View Documentation
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 48 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.25 }}
          className="relative mx-auto mt-16 w-full max-w-4xl sm:mt-20"
        >
          <div
            aria-hidden
            className="hero-video-glow pointer-events-none absolute -inset-4 rounded-3xl bg-violet-400/20 blur-3xl sm:-inset-6"
          />
          <div
            aria-hidden
            className="hero-video-glow pointer-events-none absolute -inset-2 rounded-2xl bg-indigo-400/15 blur-[80px] sm:-inset-4"
            style={{ animationDelay: "1.5s" }}
          />

          <DemoMedia
            src="/assets/project-demo.mp4"
            poster="/assets/chat-ui.png"
            alt="Agent Hub platform demo"
            className="w-full"
          />
        </motion.div>
      </div>
    </section>
  );
}
