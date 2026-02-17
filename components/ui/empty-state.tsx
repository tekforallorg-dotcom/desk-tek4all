import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-border bg-background shadow-retro-sm">
        <Icon className="h-8 w-8 text-t4-grey-300" strokeWidth={1.5} />
      </div>
      <h2 className="mt-6 text-xl font-bold text-foreground">{title}</h2>
      <p className="mt-2 max-w-sm font-mono text-sm text-t4-grey-300">
        {description}
      </p>
      <div className="mt-6">
        <span className="inline-block rounded-full border-2 border-border bg-background px-4 py-1.5 font-mono text-xs uppercase tracking-widest text-t4-grey-200 shadow-retro-sm">
          Coming Soon
        </span>
      </div>
    </div>
  );
}
