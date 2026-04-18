"use client";

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  "aria-label"?: string;
};

export function Switch({ checked, onChange, ...rest }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-on={checked ? "true" : "false"}
      className="nm-switch"
      onClick={() => onChange(!checked)}
      {...rest}
    />
  );
}
