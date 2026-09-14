import type { SVGProps } from "react";

export function NetworkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="22"
      height="22"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="M12 7v4M12 11l-5.5 6M12 11l5.5 6" />
    </svg>
  );
}
