"use client";

import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { DataGrid } from "@/components/grid/DataGrid";
import { Badge } from "@/components/ui/Badge";

export type BenchmarkRow = {
  run: number;
  budget: number;
  target: number;
  deal: boolean;
  seller?: string;
  price?: number;
  list_price?: number;
  saving_vs_list?: number;
  saving_vs_cheapest?: number;
  guard_ok?: boolean;
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const SELLER_COLORS: Record<string, string> = {
  "Firm Co": "var(--color-seller-1)",
  "Flex Ltd": "var(--color-seller-2)",
  "Premium Hub": "var(--color-seller-3)",
};

function money(params: { value: unknown }): string {
  return typeof params.value === "number" ? usd.format(params.value) : "—";
}

function percent(params: { value: unknown }): string {
  return typeof params.value === "number" ? `${params.value.toFixed(1)}%` : "—";
}

function SellerCell(params: ICellRendererParams<BenchmarkRow>) {
  const row = params.data;
  if (!row || !row.deal || !row.seller) {
    return <span className="text-[12px] text-faint">No deal</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink">
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: SELLER_COLORS[row.seller] ?? "var(--color-muted)" }}
        aria-hidden="true"
      />
      {row.seller}
    </span>
  );
}

function GuardCell(params: ICellRendererParams<BenchmarkRow>) {
  const row = params.data;
  if (!row || !row.deal) {
    return (
      <Badge tone="neutral" dot={false}>
        No deal
      </Badge>
    );
  }

  const passed = row.guard_ok !== false;
  return <Badge tone={passed ? "success" : "danger"}>{passed ? "Passed" : "Failed"}</Badge>;
}

const columns: ColDef<BenchmarkRow>[] = [
  {
    field: "run",
    headerName: "#",
    width: 62,
    cellClass: "num text-[11px] text-faint",
  },
  {
    field: "budget",
    headerName: "Budget",
    width: 108,
    valueFormatter: money,
    cellClass: "num text-[12px] text-ink",
    headerClass: "ag-right-header",
  },
  {
    field: "target",
    headerName: "Target",
    width: 104,
    valueFormatter: money,
    cellClass: "num text-[12px] text-muted",
    headerClass: "ag-right-header",
  },
  {
    field: "seller",
    headerName: "Winning seller",
    minWidth: 150,
    flex: 1.2,
    cellRenderer: SellerCell,
  },
  {
    field: "price",
    headerName: "Agreed",
    width: 104,
    valueFormatter: money,
    cellClass: "num text-[12px] font-semibold text-ink",
    headerClass: "ag-right-header",
  },
  {
    field: "list_price",
    headerName: "List",
    width: 98,
    valueFormatter: money,
    cellClass: "num text-[12px] text-muted",
    headerClass: "ag-right-header",
  },
  {
    field: "saving_vs_list",
    headerName: "Saved",
    headerTooltip: "Saving against the winning seller's own list price",
    width: 92,
    valueFormatter: percent,
    cellClass: (params) =>
      params.data?.deal ? "num text-[12px] font-medium text-success" : "num text-[12px] text-faint",
    headerClass: "ag-right-header",
  },
  {
    field: "saving_vs_cheapest",
    headerName: "Vs cheapest",
    headerTooltip: "Saving against the lowest list price on the floor",
    width: 112,
    valueFormatter: percent,
    cellClass: (params) =>
      params.data?.deal ? "num text-[12px] text-muted" : "num text-[12px] text-faint",
    headerClass: "ag-right-header",
  },
  {
    colId: "vs_target",
    headerName: "Vs target",
    headerTooltip: "Agreed price compared with the buyer's target price",
    width: 100,
    valueGetter: (params) => {
      const row = params.data;
      if (!row || !row.deal || row.price === undefined) return null;
      return Math.round((row.price - row.target) * 100) / 100;
    },
    valueFormatter: money,
    cellClass: (params) => {
      const row = params.data;
      if (!row?.deal || row.price === undefined) return "num text-[12px] text-faint";
      return row.price <= row.target
        ? "num text-[12px] font-medium text-success"
        : "num text-[12px] text-warning";
    },
    headerClass: "ag-right-header",
  },
  {
    field: "guard_ok",
    headerName: "Checks",
    headerTooltip: "Budget, seller floor and delivery limit",
    width: 104,
    cellRenderer: GuardCell,
  },
];

export function BenchmarkGrid({ rows }: { rows: BenchmarkRow[] }) {
  return (
    <DataGrid
      rowData={rows}
      columnDefs={columns}
      getRowId={(params) => String(params.data.run)}
      defaultColDef={{ sortable: true, resizable: true, suppressHeaderMenuButton: true }}
      domLayout="autoHeight"
      rowHeight={42}
      suppressCellFocus
      overlayNoRowsTemplate='<span style="color:#a2a2b2;font-size:12px">No recorded scenarios.</span>'
    />
  );
}
