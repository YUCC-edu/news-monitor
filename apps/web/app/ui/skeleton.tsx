"use client";

import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Skeleton({
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("nm-skeleton", className)} style={style} {...props} />
  );
}
