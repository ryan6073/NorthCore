"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type DemoMediaStackProps = {
  sources: string[];
  activeSrc: string;
  alt: string;
  poster?: string;
  className?: string;
};

const videoClassName = "block h-auto max-w-full w-full align-top";

function MediaFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-zinc-100/80 p-1.5 shadow-sm ring-1 ring-black/[0.04]",
        className,
      )}
    >
      <div className="rounded-xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06]">
        {children}
      </div>
    </div>
  );
}

export function DemoMediaStack({
  sources,
  activeSrc,
  alt,
  poster,
  className,
}: DemoMediaStackProps) {
  const [mounted, setMounted] = useState(false);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    for (const video of videoRefs.current.values()) {
      video.load();
    }
  }, [mounted, sources]);

  useEffect(() => {
    if (!mounted) return;

    for (const [src, video] of videoRefs.current.entries()) {
      if (src === activeSrc) {
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
    }
  }, [activeSrc, mounted]);

  if (!mounted) {
    return (
      <MediaFrame className={className}>
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt={alt} className={videoClassName} />
        ) : (
          <div className="min-h-40 w-full bg-white" />
        )}
      </MediaFrame>
    );
  }

  return (
    <MediaFrame className={className}>
      <div className="w-full leading-none">
        {sources.map((src) => {
          const isActive = src === activeSrc;
          return (
            <video
              key={src}
              ref={(el) => {
                if (el) videoRefs.current.set(src, el);
                else videoRefs.current.delete(src);
              }}
              suppressHydrationWarning
              className={cn(
                videoClassName,
                isActive
                  ? "relative opacity-100 transition-opacity duration-150"
                  : "pointer-events-none fixed -left-[9999px] top-0 h-px w-px opacity-0",
              )}
              src={src}
              poster={isActive ? poster : undefined}
              muted
              loop
              playsInline
              preload="auto"
              aria-hidden={!isActive}
              aria-label={isActive ? alt : undefined}
            />
          );
        })}
      </div>
    </MediaFrame>
  );
}
