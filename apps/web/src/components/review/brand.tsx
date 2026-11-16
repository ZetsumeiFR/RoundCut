import { accentForeground } from "@roundcut/api/workspace";
import Image from "next/image";
import type { CSSProperties } from "react";

// Twice the displayed logo size.
const LOGO_HEIGHT = 80;
const LOGO_WIDTH = 320;

// White label of the review links (REV-10): the editor's accent color
// replaces the theme's primary color below the element that carries it.
export const brandStyle = (accentColor: string | null | undefined) =>
  accentColor
    ? ({
        "--primary": accentColor,
        "--primary-foreground": accentForeground(accentColor),
        "--ring": accentColor,
      } as CSSProperties)
    : undefined;

// Signed storage and blob URLs skip the image optimizer.
export function BrandLogo({
  alt,
  className = "h-10 w-auto max-w-40 object-contain",
  src,
}: {
  alt: string;
  className?: string;
  src: string;
}) {
  return (
    <Image
      alt={alt}
      className={className}
      height={LOGO_HEIGHT}
      src={src}
      unoptimized
      width={LOGO_WIDTH}
    />
  );
}
