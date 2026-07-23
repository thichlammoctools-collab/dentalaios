import { useEffect, useState } from "react";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/ui/pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatDateTime } from "@/lib/utils";
import type { AuditLog } from "@shared/types";
import { PageContainer } from "@/components/PageContainer";

interface AuditResponse {
  items: AuditLog[];
  total: number;
}

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  async function load(currentPage = page) {
    setLoading(true);
    try {
      const offset = (currentPage - 1) * DEFAULT_PAGE_SIZE;
      const res = await apiGet<AuditResponse>(`/api/audit-logs?limit=${DEFAULT_PAGE_SIZE}&offset=${offset}`);
      setLogs(res.items);
      setTotal(res.total);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải audit");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  useEffect(() => {
    if (page > 1) void load(page);
  }, [page]);

  return (
    <PageContainer size="data" className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit logs</h1>
        <p className="text-sm text-muted-foreground">
          Theo dõi mọi clinical action. Cần quyền quản lý user.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lịch sử ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có log nào.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">
                      {formatDateTime(log.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.action}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{log.entity_type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.entity_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.user_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.ip_address || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={total} disabled={loading} onPageChange={setPage} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
