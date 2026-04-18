"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "ghost" | "danger";

export function Button({
  variant = "ghost",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "md" | "sm";
}) {
  return (
    <button
      type="button"
      className={cn(
        "nm-btn",
        variant === "primary" && "nm-btn--primary",
        variant === "danger" && "nm-btn--danger",
        variant === "ghost" && "nm-btn--ghost",
        size === "sm" && "nm-btn--sm",
        className,
      )}
      {...props}
    />
  );
}
