import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "cn";
import type { ReactNode } from "react";

export type DataGridColumn<T> = {
  key: string;
  header: string;
  className?: string;
  cell: (row: T) => ReactNode;
};

export function DataGrid<T>({
  columns,
  rows,
  empty,
  className,
}: {
  columns: DataGridColumn<T>[];
  rows: T[];
  empty: ReactNode;
  className?: string;
}) {
  if (rows.length === 0) {
    return <div className={className}>{empty}</div>;
  }

  return (
    <div className={cn("hidden overflow-hidden rounded-lg border border-border md:block", className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead key={column.key} className={column.className}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {columns.map((column) => (
                <TableCell key={column.key} className={column.className}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
