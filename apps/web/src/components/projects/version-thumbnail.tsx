"use client";

import Image from "next/image";
import { type ReactNode, useCallback, useState } from "react";

// 16:9 at twice the largest displayed size.
const WIDTH = 160;
const HEIGHT = 90;

// A version's thumbnail (VER-06), or the fallback when the version has none
// or the image can't be loaded. Signed and blob URLs skip the optimizer.
export function VersionThumbnail({
  alt,
  className,
  fallback,
  src,
}: {
  alt: string;
  className?: string;
  fallback: ReactNode;
  src: string | null | undefined;
}) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const handleError = useCallback(() => setFailedSrc(src ?? undefined), [src]);
  if (!src || failedSrc === src) {
    return fallback;
  }
  return (
    <Image
      alt={alt}
      className={className}
      height={HEIGHT}
      onError={handleError}
      src={src}
      unoptimized
      width={WIDTH}
    />
  );
}
