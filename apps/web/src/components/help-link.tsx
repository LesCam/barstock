import Link from "next/link";

interface HelpLinkProps {
  section: string;
  tooltip: string;
}

export function HelpLink({ section, tooltip }: HelpLinkProps) {
  return (
    <Link
      href={`/help#${section}`}
      title={tooltip}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/20 text-xs text-[#EAF0FF]/40 transition-colors hover:border-[#E9B44C]/50 hover:text-[#E9B44C]"
    >
      ?
    </Link>
  );
}
