import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ClinicalFinding } from "@shared/types";

interface FindingsListProps {
  findings: ClinicalFinding[];
}

export function FindingsList({ findings }: FindingsListProps) {
  if (findings.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có finding nào.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Răng</TableHead>
          <TableHead>Tình trạng</TableHead>
          <TableHead>Ghi chú</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {findings.map((f) => (
          <TableRow key={f.id}>
            <TableCell className="font-mono font-medium">#{f.tooth_number}</TableCell>
            <TableCell>
              <Badge variant="outline">{f.condition}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">{f.notes ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}