import type { CalendarBadge } from "@/lib/calendar-badges";

export function CalendarTags({ badges, compact = false }: { badges: CalendarBadge[]; compact?: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 ${compact ? "whitespace-nowrap" : "flex-wrap"}`}>
    {badges.map((badge) => <span key={badge.kind} data-calendar-tag={badge.kind} className={`inline-flex shrink-0 items-center rounded-md font-bold ${compact ? "px-1.5 py-1 text-[10px] leading-3" : "px-3 py-2 text-xs"}`} style={{ background: badge.background, color: badge.color }}>{badge.text}</span>)}
  </span>;
}
