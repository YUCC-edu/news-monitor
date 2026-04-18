"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export function IconButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cn("nm-icon-btn", className)} {...props} />
  );
}
