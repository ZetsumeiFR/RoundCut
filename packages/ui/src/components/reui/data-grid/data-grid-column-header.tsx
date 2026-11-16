"use client";

// Opted out of React Compiler with the rest of the grid (see data-grid.tsx).
"use no memo";

import { Button } from "@roundcut/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@roundcut/ui/components/dropdown-menu";
import type {
  DataGridFeatures,
  DataGridTableInstance,
} from "@roundcut/ui/components/reui/data-grid/data-grid";
import {
  getColumnHeaderLabel,
  getDataGridHeaderSpans,
  useDataGrid,
} from "@roundcut/ui/components/reui/data-grid/data-grid";
import type { Column } from "@tanstack/react-table";
import { Subscribe } from "@tanstack/react-table";

import { cn } from "cn";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowLeftToLineIcon,
  ArrowRightIcon,
  ArrowRightToLineIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  PinOffIcon,
  Settings2Icon,
} from "lucide-react";
import type {
  ComponentProps,
  HTMLAttributes,
  MouseEvent,
  ReactNode,
} from "react";
import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";

interface DataGridColumnHeaderProps<TData extends object, TValue>
  extends HTMLAttributes<HTMLDivElement> {
  column: Column<DataGridFeatures, TData, TValue>;
  filter?: ReactNode;
  icon?: ReactNode;
  /** Reserved; pin controls are gated by tableLayout.columnsPinnable + column.getCanPin(). */
  pinnable?: boolean;
  /** When omitted, uses `column.columnDef.meta.headerTitle`, then a string `columnDef.header`, then `column.id`. */
  title?: string;
  visibility?: boolean;
}

// Unpinning moves a column into another header list (pinned, windowed center),
// which remounts its header, so the focus request outlives the button: the next
// header rendered for that column takes it. `column` is a stable reference.
const pendingUnpinFocus = new WeakSet<object>();

function DataGridColumnVisibilityItem<TData extends object, TValue>({
  column,
}: {
  column: Column<DataGridFeatures, TData, TValue>;
}) {
  const handleCheckedChange = useCallback(
    (value: boolean) => column.toggleVisibility(!!value),
    [column]
  );
  const handleSelect = useCallback<
    NonNullable<ComponentProps<typeof DropdownMenuCheckboxItem>["onSelect"]>
  >((event) => event.preventDefault(), []);
  return (
    <DropdownMenuCheckboxItem
      checked={column.getIsVisible()}
      className={
        getColumnHeaderLabel(column) === column.id ? "capitalize" : undefined
      }
      onCheckedChange={handleCheckedChange}
      onSelect={handleSelect}
    >
      {getColumnHeaderLabel(column)}
    </DropdownMenuCheckboxItem>
  );
}

function renderColumnSortIcon(
  canSort: boolean,
  isSorted: false | "asc" | "desc"
) {
  if (!canSort) {
    return null;
  }
  if (isSorted === "desc") {
    return <ArrowDownIcon aria-hidden="true" className="size-3.25" />;
  }
  if (isSorted === "asc") {
    return <ArrowUpIcon aria-hidden="true" className="size-3.25" />;
  }
  return <ChevronsUpDownIcon aria-hidden="true" className="mt-px size-3.25" />;
}

function appendMenuSeparator(
  items: ReactNode[],
  hasPreviousSection: boolean,
  key: string
) {
  if (hasPreviousSection) {
    items.push(<DropdownMenuSeparator key={key} />);
  }
}

function getColumnMoveState<TData extends object, TValue>(
  table: DataGridTableInstance<TData>,
  column: Column<DataGridFeatures, TData, TValue>,
  isPinned: ReturnType<typeof column.getIsPinned>
) {
  // The order a move rewrites: the consumer's columnOrder (TanStack defaults it
  // to []), then every leaf it leaves out, in definition order - the same
  // completion TanStack applies when rendering, so a rendered neighbour is
  // always present to re-seat beside, even after columns are added later.
  const columnOrderState = table.state.columnOrder;
  const definitionOrder = table
    .getAllColumns()
    .flatMap((topColumn) => topColumn.getLeafColumns())
    .map((leafColumn) => leafColumn.id);
  const columnOrder = [
    ...columnOrderState,
    ...definitionOrder.filter((id) => !columnOrderState.includes(id)),
  ];
  // Move neighbours come from what is RENDERED: the column's own pin bucket,
  // visible columns only. Stepping through the raw columnOrder would trade
  // places with a hidden or pinned column - an enabled click that moves nothing.
  // With grouping in TanStack's default "reorder" mode, grouped columns render
  // first whatever columnOrder says: they neither move nor serve as a target.
  const { groupedColumnMode } = table.options as {
    groupedColumnMode?: false | "reorder" | "remove";
  };
  const isHoistedByGrouping = (target: object) =>
    groupedColumnMode !== false &&
    typeof (target as { getIsGrouped?: unknown }).getIsGrouped === "function" &&
    (target as { getIsGrouped: () => boolean }).getIsGrouped();
  let visibleLeaves = table.getCenterVisibleLeafColumns();
  if (isPinned === "start") {
    visibleLeaves = table.getStartVisibleLeafColumns();
  } else if (isPinned === "end") {
    visibleLeaves = table.getEndVisibleLeafColumns();
  }
  const renderedLeaves = visibleLeaves
    .filter((leafColumn) => !isHoistedByGrouping(leafColumn))
    .map((leafColumn) => leafColumn.id);
  const renderedOrder = new Map(renderedLeaves.map((id, index) => [id, index]));
  const byRenderedOrder = (a: string, b: string) =>
    Number(renderedOrder.get(a)) - Number(renderedOrder.get(b));
  // A peer is a sibling at this column's header level with its rendered
  // leaves, so a group or a meta.headerColSpan span moves as one.
  const headerSpans = getDataGridHeaderSpans(table);
  const coveredIds = new Set(
    [...headerSpans.values()].flat().map((leafColumn) => leafColumn.id)
  );
  // Siblings only: a leaf stepping out of its group would split its header.
  const renderedPeers = (column.parent?.columns ?? table.getAllColumns())
    .filter((sibling) => !coveredIds.has(sibling.id))
    .map((sibling) =>
      [...sibling.getLeafColumns(), ...(headerSpans.get(sibling.id) ?? [])]
        .map((leafColumn) => leafColumn.id)
        .filter((id) => renderedOrder.has(id))
        .sort(byRenderedOrder)
    )
    .filter((leaves) => leaves.length > 0)
    .sort(([a], [b]) => byRenderedOrder(String(a), String(b)));
  const renderedIndex = column.columns.length
    ? -1
    : renderedPeers.findIndex((leaves) => leaves[0] === column.id);
  const leftNeighbour =
    renderedIndex > 0 ? renderedPeers[renderedIndex - 1] : undefined;
  const rightNeighbour =
    renderedIndex !== -1 && renderedIndex < renderedPeers.length - 1
      ? renderedPeers[renderedIndex + 1]
      : undefined;
  const canMoveLeft = leftNeighbour !== undefined;
  const canMoveRight = rightNeighbour !== undefined;

  return {
    canMoveLeft,
    canMoveRight,
    columnOrder,
    leftNeighbour,
    renderedIndex,
    renderedPeers,
    rightNeighbour,
  };
}

function DataGridColumnHeaderInner<TData extends object, TValue>({
  column,
  title,
  icon,
  className,
  filter,
  visibility = false,
}: DataGridColumnHeaderProps<TData, TValue>) {
  const { i18n, isLoading, table, props } = useDataGrid<TData>();
  const resolvedTitle = title ?? getColumnHeaderLabel(column);

  const isSorted = column.getIsSorted();
  const isPinned = column.getIsPinned();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (pendingUnpinFocus.delete(column)) {
      menuTriggerRef.current?.focus();
    }
  });
  const canSort = column.getCanSort();
  const canPin = column.getCanPin();
  const canResize = column.getCanResize();

  const {
    columnOrder,
    renderedPeers,
    renderedIndex,
    leftNeighbour,
    rightNeighbour,
    canMoveLeft,
    canMoveRight,
  } = useMemo(
    () => getColumnMoveState(table, column, isPinned),
    [table, column, isPinned]
  );

  /** Re-seats this column, with the leaves its header spans, beside a rendered
   * neighbour; every other column, hidden or pinned, keeps its place. */
  const moveBeside = useCallback(
    (neighbour: string[], side: "before" | "after") => {
      const moving = renderedPeers[renderedIndex] ?? [column.id];
      const newOrder = columnOrder.filter((id) => !moving.includes(id));
      const anchor = side === "before" ? neighbour[0] : neighbour.at(-1);
      const at = anchor === undefined ? -1 : newOrder.indexOf(anchor);
      if (at === -1) {
        return;
      }
      newOrder.splice(side === "before" ? at : at + 1, 0, ...moving);
      table.setColumnOrder(newOrder);
    },
    [renderedPeers, renderedIndex, column.id, columnOrder, table]
  );

  // column.toggleSorting has no getCanSort() guard of its own, and the
  // direct button also renders for columns that are only resizable.
  const handleSort = useCallback(() => {
    if (!canSort) {
      return;
    }
    if (isSorted === "asc") {
      column.toggleSorting(true);
    } else if (isSorted === "desc") {
      column.clearSorting();
    } else {
      column.toggleSorting(false);
    }
  }, [canSort, isSorted, column]);

  const headerLabelClassName = cn(
    "inline-flex h-full items-center gap-1.5 font-normal text-[0.8125rem] text-secondary-foreground/80 leading-[calc(1.125/0.8125)] [&_svg]:size-3.5 [&_svg]:opacity-60",
    className
  );

  const headerButtonClassName = cn(
    "h-6 rounded-none px-2 font-normal text-secondary-foreground/80 hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground",
    className
  );

  const sortIcon = renderColumnSortIcon(canSort, isSorted);

  // A start-pinned column's resize handle covers the last 20px of its cell
  // (the column that renders last already reserves it with pe-8, and a
  // start-pinned one renders last only when nothing follows its group), so
  // the unpin button steps in until it clears the handle in both densities.
  // The step is padding on a wrapper that shrinks first: a column too narrow
  // for label, button and clearance gives the clearance back, never the label.
  const unpinClearsResizeHandle =
    props.tableLayout?.columnsResizable &&
    canResize &&
    isPinned === "start" &&
    !(
      column.getIsLastColumn("start") &&
      table.getCenterVisibleLeafColumns().length === 0 &&
      table.getEndVisibleLeafColumns().length === 0
    );

  const hasControls =
    props.tableLayout?.columnsMovable ||
    (props.tableLayout?.columnsVisibility && visibility) ||
    (props.tableLayout?.columnsPinnable && canPin) ||
    filter;

  const handleSortAscending = useCallback(() => {
    if (isSorted === "asc") {
      column.clearSorting();
    } else {
      column.toggleSorting(false);
    }
  }, [column, isSorted]);
  const handleSortDescending = useCallback(() => {
    if (isSorted === "desc") {
      column.clearSorting();
    } else {
      column.toggleSorting(true);
    }
  }, [column, isSorted]);
  const handlePinStart = useCallback(
    () => column.pin(isPinned === "start" ? false : "start"),
    [column, isPinned]
  );
  const handlePinEnd = useCallback(
    () => column.pin(isPinned === "end" ? false : "end"),
    [column, isPinned]
  );
  const handleMoveLeft = useCallback(() => {
    if (leftNeighbour) {
      moveBeside(leftNeighbour, "before");
    }
  }, [leftNeighbour, moveBeside]);
  const handleMoveRight = useCallback(() => {
    if (rightNeighbour) {
      moveBeside(rightNeighbour, "after");
    }
  }, [rightNeighbour, moveBeside]);
  const handleUnpin = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const scrollArea = event.currentTarget.closest<HTMLElement>(
        '[data-slot="scroll-area-viewport"]'
      );
      pendingUnpinFocus.add(column);
      column.pin(false);
      // A column the virtual window leaves unmounted claims nothing,
      // so the grid's scroll area takes focus instead of the page.
      requestAnimationFrame(() => {
        if (pendingUnpinFocus.delete(column)) {
          scrollArea?.focus();
        }
      });
    },
    [column]
  );
  const menuItems = useMemo(() => {
    const items: ReactNode[] = [];
    let hasPreviousSection = false;

    // Filter section
    if (filter) {
      items.push(
        <DropdownMenuGroup key="group-filter">
          <DropdownMenuLabel key="filter">{filter}</DropdownMenuLabel>
        </DropdownMenuGroup>
      );
      hasPreviousSection = true;
    }

    // Sort section
    if (canSort) {
      appendMenuSeparator(items, hasPreviousSection, "sep-sort");
      items.push(
        <DropdownMenuItem
          disabled={!canSort}
          key="sort-asc"
          onClick={handleSortAscending}
        >
          <ArrowUpIcon className="size-3.5!" />
          <span className="grow">{i18n.labels.sortAscending}</span>
          {isSorted === "asc" && (
            <CheckIcon className="size-4 text-primary opacity-100!" />
          )}
        </DropdownMenuItem>,
        <DropdownMenuItem
          disabled={!canSort}
          key="sort-desc"
          onClick={handleSortDescending}
        >
          <ArrowDownIcon className="size-3.5!" />
          <span className="grow">{i18n.labels.sortDescending}</span>
          {isSorted === "desc" && (
            <CheckIcon className="size-4 text-primary opacity-100!" />
          )}
        </DropdownMenuItem>
      );
      hasPreviousSection = true;
    }

    // Pin section
    if (props.tableLayout?.columnsPinnable && canPin) {
      appendMenuSeparator(items, hasPreviousSection, "sep-pin");
      items.push(
        <DropdownMenuItem key="pin-left" onClick={handlePinStart}>
          <ArrowLeftToLineIcon aria-hidden="true" className="size-3.5!" />
          <span className="grow">{i18n.labels.pinColumnStart}</span>
          {isPinned === "start" && (
            <CheckIcon className="size-4 text-primary opacity-100!" />
          )}
        </DropdownMenuItem>,
        <DropdownMenuItem key="pin-right" onClick={handlePinEnd}>
          <ArrowRightToLineIcon aria-hidden="true" className="size-3.5!" />
          <span className="grow">{i18n.labels.pinColumnEnd}</span>
          {isPinned === "end" && (
            <CheckIcon className="size-4 text-primary opacity-100!" />
          )}
        </DropdownMenuItem>
      );
      hasPreviousSection = true;
    }

    // Move section
    if (props.tableLayout?.columnsMovable) {
      appendMenuSeparator(items, hasPreviousSection, "sep-move");
      items.push(
        <DropdownMenuItem
          disabled={!canMoveLeft || isPinned !== false}
          key="move-left"
          onClick={handleMoveLeft}
        >
          <ArrowLeftIcon aria-hidden="true" className="size-3.5!" />
          <span>{i18n.labels.moveColumnStart}</span>
        </DropdownMenuItem>,
        <DropdownMenuItem
          disabled={!canMoveRight || isPinned !== false}
          key="move-right"
          onClick={handleMoveRight}
        >
          <ArrowRightIcon aria-hidden="true" className="size-3.5!" />
          <span>{i18n.labels.moveColumnEnd}</span>
        </DropdownMenuItem>
      );
      hasPreviousSection = true;
    }

    // Visibility section
    if (props.tableLayout?.columnsVisibility && visibility) {
      appendMenuSeparator(items, hasPreviousSection, "sep-visibility");
      items.push(
        <DropdownMenuSub key="visibility">
          <DropdownMenuSubTrigger>
            <Settings2Icon className="size-3.5!" />
            <span>{i18n.labels.columnsMenu}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent side="right">
            {table
              .getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DataGridColumnVisibilityItem column={col} key={col.id} />
              ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      );
    }

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filter,
    canSort,
    isSorted,
    handleSortAscending,
    handleSortDescending,
    handlePinStart,
    handlePinEnd,
    handleMoveLeft,
    handleMoveRight,
    props.tableLayout?.columnsPinnable,
    props.tableLayout?.columnsMovable,
    props.tableLayout?.columnsVisibility,
    canPin,
    isPinned,
    canMoveLeft,
    canMoveRight,
    visibility,
    table,
    i18n.labels.sortAscending,
    i18n.labels.moveColumnEnd,
    i18n.labels.pinColumnStart,
    i18n.labels.sortDescending,
    i18n.labels.moveColumnStart,
    i18n.labels.pinColumnEnd,
    i18n.labels.columnsMenu,
  ]);

  if (hasControls) {
    return (
      <div className="-ms-2 flex h-full items-center justify-between gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            ref={menuTriggerRef}
            render={
              <Button
                className={headerButtonClassName}
                disabled={isLoading}
                variant="ghost"
              >
                {icon}
                {resolvedTitle}
                {sortIcon}
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-40">
            {menuItems}
          </DropdownMenuContent>
        </DropdownMenu>
        {props.tableLayout?.columnsPinnable && canPin && isPinned ? (
          <span
            className={cn(
              "-me-1 flex min-w-7 shrink-[999]",
              unpinClearsResizeHandle && "pe-4"
            )}
          >
            <Button
              aria-label={i18n.labels.unpinColumn(resolvedTitle)}
              className="size-7 rounded-none"
              onClick={handleUnpin}
              size="icon-sm"
              title={i18n.labels.unpinColumn(resolvedTitle)}
              variant="ghost"
            >
              <PinOffIcon
                aria-hidden="true"
                className="size-3.5! opacity-50!"
              />
            </Button>
          </span>
        ) : null}
      </div>
    );
  }

  if (canSort || (props.tableLayout?.columnsResizable && canResize)) {
    return (
      <div className="-ms-2 flex h-full items-center">
        <Button
          className={headerButtonClassName}
          disabled={isLoading}
          onClick={handleSort}
          variant="ghost"
        >
          {icon}
          {resolvedTitle}
          {sortIcon}
        </Button>
      </div>
    );
  }

  return (
    <div className={headerLabelClassName}>
      {icon}
      {resolvedTitle}
    </div>
  );
}

const DataGridColumnHeaderMemo = memo(DataGridColumnHeaderInner) as <
  TData extends object,
  TValue,
>(
  props: DataGridColumnHeaderProps<TData, TValue> & {
    /** Internal: the state slices the header re-renders on. Not part of the public API. */
    subscribedState?: unknown;
  }
) => ReactNode;

/**
 * Sort and pin state reaches this header through builder calls on `column`
 * (`getIsSorted()`, `getIsPinned()`), and `column` keeps its identity across
 * renders, so anything memoized against it (the `memo` below, or a consumer's
 * compiled header template) never re-runs those reads: frozen sort arrows and
 * pin controls. The `Subscribe` below turns the slices this header actually
 * reads into a real reactive dependency, and threading the selection through
 * as a prop is what lets it past the `memo`.
 */
function DataGridColumnHeader<TData extends object, TValue>(
  props: DataGridColumnHeaderProps<TData, TValue>
) {
  const { table } = useDataGrid();
  const selectHeaderState = useCallback(
    (state: typeof table.state) => ({
      columnOrder: state.columnOrder,
      columnPinning: state.columnPinning,
      columnVisibility: state.columnVisibility,
      sorting: state.sorting,
    }),
    []
  );

  return (
    <Subscribe selector={selectHeaderState} source={table.store}>
      {(subscribed) => (
        <DataGridColumnHeaderMemo {...props} subscribedState={subscribed} />
      )}
    </Subscribe>
  );
}

export { DataGridColumnHeader, type DataGridColumnHeaderProps };
