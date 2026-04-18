"use client";

import type { TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn("nm-input", "nm-textarea", className)} {...props} />
  );
}
