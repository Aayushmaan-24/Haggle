import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type ValueFormatterParams,
} from "ag-grid-community";

/**
 * AG Grid Community only. Modules are registered once per client bundle.
 */
ModuleRegistry.registerModules([AllCommunityModule]);

/** Quarz, tuned to the Haggle dark surface palette. */
export const haggleGridTheme = themeQuartz.withParams({
  accentColor: "#7c5cff",
  backgroundColor: "#0e0e15",
  chromeBackgroundColor: "#14141c",
  foregroundColor: "#f5f5f8",
  borderColor: "#262632",
  headerBackgroundColor: "#14141c",
  headerTextColor: "#a2a2b2",
  headerFontSize: "11px",
  headerFontWeight: 600,
  fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  fontSize: "13px",
  rowHeight: 40,
  headerHeight: 38,
  cellHorizontalPadding: 14,
  borderRadius: "8px",
  wrapperBorderRadius: "0px",
  oddRowBackgroundColor: "rgba(255,255,255,0.014)",
  rowHoverColor: "rgba(124,92,255,0.07)",
  selectedRowBackgroundColor: "rgba(124,92,255,0.12)",
  inputBackgroundColor: "#14141c",
  inputBorder: { color: "#262632" },
  wrapperBorder: false,
});

export const numberCell: Partial<ColDef> = {
  cellClass: "ag-numeric-cell",
  headerClass: "ag-numeric-header",
};

export function moneyFormatter(params: ValueFormatterParams): string {
  return typeof params.value === "number" ? `$${params.value.toFixed(2)}` : "—";
}

export function percentFormatter(params: ValueFormatterParams): string {
  return typeof params.value === "number" ? `${params.value.toFixed(1)}%` : "—";
}
