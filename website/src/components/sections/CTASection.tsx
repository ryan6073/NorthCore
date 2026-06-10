"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { GithubIcon } from "@/components/icons/GithubIcon";
import { APP_URL, GITHUB_URL, SITE_NAME } from "@/lib/constants";

export function CTASection() {
  return (
    <section id="cta" data-showcase className="px-6 py-24 sm:py-32">
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-4xl rounded-3xl border border-zinc-200 bg-white px-8 py-14 text-center shadow-[0_24px_64px_rgba(0,0,0,0.06)] sm:px-12"
      >
        <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          Ready to build with {SITE_NAME}?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-zinc-500">
          从 IM 聊天到多 Agent 编排，再到一键部署 —— 开启下一代 AI 协作开发体验。
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/35"
          >
            Get Started
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </a>

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-6 py-3 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900"
          >
            <GithubIcon className="size-4" />
            View on GitHub
          </a>
        </div>
      </motion.div>
    </section>
  );
}
