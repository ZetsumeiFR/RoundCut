export interface DataGridI18nLabels {
  allRowsLoaded: string;
  collapseRow: string;
  columnsMenu: string;
  dragToReorder: string;
  dragToReorderRow: string;
  empty: string;
  expandRow: string;
  filterClear: string;
  filterNoResults: string;
  /* The faceted column filter. */
  filterSelectedCount: (count: number) => string;
  goToPage: (page: number) => string;
  /* Grid states. */
  loading: string;
  moveColumnEnd: string;
  moveColumnStart: string;
  nextPage: string;
  paginationEllipsis: string;
  paginationInfo: (info: { from: number; to: number; count: number }) => string;
  pinColumnEnd: string;
  pinColumnStart: string;
  pinRow: string;
  previousPage: string;
  reorderingUnavailable: string;
  /* Row and cell affordances. */
  rowCreate: string;
  /* Pagination. */
  rowsPerPage: string;
  selectAll: string;
  selectRow: string;
  /* The column header menu. */
  sortAscending: string;
  sortDescending: string;
  toggleColumns: string;
  unpinColumn: (title: string) => string;
  unpinRow: string;
}

export interface DataGridI18nConfig {
  labels: DataGridI18nLabels;
}

export interface DataGridI18nOverrides {
  labels?: Partial<DataGridI18nLabels>;
}

const DEFAULT_DATA_GRID_LABELS: DataGridI18nLabels = {
  allRowsLoaded: "All records loaded",
  collapseRow: "Collapse row",
  columnsMenu: "Columns",
  dragToReorder: "Drag to reorder",
  dragToReorderRow: "Drag to reorder row",
  empty: "No data available",
  expandRow: "Expand row",
  filterClear: "Clear filters",
  filterNoResults: "No results found.",
  filterSelectedCount: (count) => `${count} selected`,
  goToPage: (page) => `Go to page ${page}`,
  loading: "Loading...",
  moveColumnEnd: "Move to right",
  moveColumnStart: "Move to left",
  nextPage: "Go to next page",
  paginationEllipsis: "...",
  paginationInfo: ({ from, to, count }) => `${from} - ${to} of ${count}`,
  pinColumnEnd: "Pin to right",
  pinColumnStart: "Pin to left",
  pinRow: "Pin row",
  previousPage: "Go to previous page",
  reorderingUnavailable: "Reordering unavailable",
  rowCreate: "Add row",
  rowsPerPage: "Rows per page",
  selectAll: "Select all",
  selectRow: "Select row",
  sortAscending: "Asc",
  sortDescending: "Desc",
  toggleColumns: "Toggle Columns",
  unpinColumn: (title) => `Unpin ${title} column`,
  unpinRow: "Unpin row",
};

const DEFAULT_DATA_GRID_I18N: DataGridI18nConfig = Object.freeze({
  labels: Object.freeze(DEFAULT_DATA_GRID_LABELS),
});

/**
 * A shallow merge per section, deliberately: a deep merge would leak a
 * default back into a function-valued label the consumer replaced. With no
 * overrides the frozen default is returned as-is, so the merge is free to
 * run on every render without producing a new identity.
 */
export function mergeDataGridI18n(
  overrides?: DataGridI18nOverrides
): DataGridI18nConfig {
  if (!overrides?.labels) {
    return DEFAULT_DATA_GRID_I18N;
  }
  return {
    labels: { ...DEFAULT_DATA_GRID_LABELS, ...overrides.labels },
  };
}
