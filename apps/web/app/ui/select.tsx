"use client";

import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("nm-select", className)} {...props}>
      {children}
    </select>
  );
}
