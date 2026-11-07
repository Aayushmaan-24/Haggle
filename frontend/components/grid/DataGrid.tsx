"use client";

import dynamic from "next/dynamic";
import type { AgGridReactProps } from "ag-grid-react";
import { cn } from "@/lib/cn";
import { haggleGridTheme } from "./gridTheme";

const AgGrid = dynamic<AgGridReactProps>(
  () => import("ag-grid-react").then((module) => module.AgGridReact),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2 p-3" aria-hidden="true">
        <div className="skeleton h-7 w-full" />
        <div className="skeleton h-8 w-full" />
        <div className="skeleton h-8 w-full" />
        <div className="skeleton h-8 w-5/6" />
      </div>
    ),
  },
);

export type DataGridProps = AgGridReactProps & {
  className?: string;
};

/**
 * Thin client-only wrapper around AG Grid Community. A mounted gate keeps the
 * grid out of server rendering while the static export hydrates.
 */
export function DataGrid({ className, ...props }: DataGridProps) {
  return (
    <div className={cn("h-full min-h-0 w-full", className)}>
      <AgGrid
        theme={haggleGridTheme}
        animateRows
        suppressCellFocus={false}
        rowSelection="single"
        {...props}
      />
    </div>
  );
}
