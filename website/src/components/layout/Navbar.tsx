"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { GithubIcon } from "@/components/icons/GithubIcon";
import { GITHUB_URL, NAV_LINKS, SITE_NAME } from "@/lib/constants";

export function Navbar() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="sticky top-0 z-50 border-b border-border bg-surface/85 backdrop-blur-xl"
    >
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-900"
        >
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-violet-600 to-indigo-600 text-[10px] font-bold text-white shadow-md shadow-violet-500/25">
            AH
          </span>
          {SITE_NAME}
        </Link>

        <ul className="hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-600 shadow-sm transition-colors hover:border-violet-300 hover:text-zinc-900"
          aria-label="GitHub"
        >
          <GithubIcon className="size-4" />
          <span className="hidden sm:inline">GitHub</span>
        </a>
      </nav>
    </motion.header>
  );
}
