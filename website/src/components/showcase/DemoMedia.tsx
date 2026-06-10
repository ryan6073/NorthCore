"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type DemoMediaProps = {
  src: string;
  alt: string;
  poster?: string;
  className?: string;
};

const videoClassName = "block h-auto max-w-full w-full align-top";

function MediaPlaceholder({
  alt,
  poster,
  className,
}: Pick<DemoMediaProps, "alt" | "poster" | "className">) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-zinc-100/80 p-1.5 shadow-sm ring-1 ring-black/[0.04]",
        className,
      )}
    >
      <div className="rounded-xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06]">
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt={alt} className={videoClassName} />
        ) : (
          <div className="flex min-h-40 w-full items-center justify-center bg-white text-sm text-zinc-400">
            Demo preview
          </div>
        )}
      </div>
    </div>
  );
}

export function DemoMedia({ src, alt, poster, className }: DemoMediaProps) {
  const [mounted, setMounted] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!mounted) {
    return <MediaPlaceholder alt={alt} poster={poster} className={className} />;
  }

  return (
    <div
      className={cn(
        "rounded-2xl bg-zinc-100/80 p-1.5 shadow-sm ring-1 ring-black/[0.04]",
        className,
      )}
    >
      <div className="rounded-xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06]">
        {failed && poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt={alt} className={videoClassName} />
        ) : failed ? (
          <div className="flex min-h-40 w-full items-center justify-center bg-white text-sm text-zinc-400">
            Demo preview
          </div>
        ) : (
          <div className="w-full leading-none">
            <video
              suppressHydrationWarning
              className={videoClassName}
              src={src}
              poster={poster}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              aria-label={alt}
              onError={() => setFailed(true)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
