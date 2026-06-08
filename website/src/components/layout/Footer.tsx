import { SITE_NAME } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs text-zinc-500 sm:flex-row">
        <p>
          &copy; {new Date().getFullYear()} {SITE_NAME}
        </p>
        <p>AI Multi-Agent Collaboration Platform</p>
      </div>
    </footer>
  );
}
