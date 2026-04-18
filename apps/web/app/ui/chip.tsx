"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export function Chip({
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn("nm-chip", active && "nm-chip--active", className)}
      {...props}
    />
  );
}
