import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
}

function PageHeader({ title, eyebrow, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-emerald-400/80">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {description ? <div className="mt-1 text-sm text-gray-400">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export default PageHeader;
