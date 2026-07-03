import type { ReactNode } from "react";

interface PlaceholderPageProps {
  title: string;
  breadcrumb?: string;
  description?: string;
  children?: ReactNode;
}

/**
 * Placeholder page used by all routes during Phase 1 skeleton.
 * Real content (tables, forms, flows) is implemented in Phase 2+.
 */
export function PlaceholderPage({
  title,
  breadcrumb,
  description,
  children,
}: PlaceholderPageProps) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      {breadcrumb && (
        <p className="mb-2 text-sm text-muted-foreground">{breadcrumb}</p>
      )}
      <h1 className="mb-3 text-3xl font-semibold tracking-tight">{title}</h1>
      {description && (
        <p className="mb-6 max-w-2xl text-muted-foreground">{description}</p>
      )}
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-sm text-muted-foreground">
        {children ?? "Nội dung sẽ được triển khai ở các phase sau."}
      </div>
    </main>
  );
}