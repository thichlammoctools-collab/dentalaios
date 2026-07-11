import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import type { Patient, UserWithDetails } from "@shared/types";

export interface ParsedAppointment {
  patient_hint: string | null;
  clinician_hint: string | null;
  scheduled_at: string | null;
  duration_min: number;
  procedure: string | null;
  notes: string | null;
  summary: string;
}

export interface ParseChatResult {
  appointment: ParsedAppointment;
  ai_model: string;
  generated_at: string;
}

interface AiChatInputProps {
  onApply: (parsed: ParsedAppointment) => void;
}

const QUICK_PROMPTS = [
  "Cho BS Nam khám BN An ngày mai 9h30",
  "BS Lan điều trị tủy răng 36 cho BN Bình thứ 2 tuần sau lúc 14h",
  "Cạo vôi cho BN Chính sáng nay 8h30",
];

export function AiChatInput({ onApply }: AiChatInputProps) {
  const { session } = useAuth();
  const [message, setMessage] = useState("");
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseChatResult | null>(null);
  const [matchedPatient, setMatchedPatient] = useState<Patient | null>(null);
  const [matchedDoctor, setMatchedDoctor] = useState<UserWithDetails | null>(null);

  async function send() {
    if (!message.trim()) {
      toast.error("Vui lòng nhập nội dung");
      return;
    }
    setParsing(true);
    setResult(null);
    try {
      const res = await apiPost<ParseChatResult>("/api/ai/parse-appointment-chat", { message });
      setResult(res);

      // Try to match patient_hint + clinician_hint against existing records
      if (res.appointment.patient_hint) {
        try {
          const patients = await apiPost<{ items: Patient[] }>("/api/patients/search", {
            name: res.appointment.patient_hint,
          });
          if (patients.items.length > 0) {
            setMatchedPatient(patients.items[0]);
          }
        } catch {
          // search endpoint may not exist — ignore
        }
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi phân tích");
    } finally {
      setParsing(false);
    }
  }

  function apply() {
    if (!result) return;
    onApply(result.appointment);
    toast.success("Đã áp dụng lịch hẹn — kiểm tra và xác nhận");
  }

  function reset() {
    setMessage("");
    setResult(null);
    setMatchedPatient(null);
    setMatchedDoctor(null);
  }

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-blue-600 text-white text-sm">
            ✨
          </span>
          AI nhập lịch
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Mô tả lịch hẹn bằng tiếng Việt tự nhiên, AI sẽ tự điền form.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!result ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="ai-message">Yêu cầu</Label>
              <Input
                id="ai-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="VD: Cho BS Nam khám BN An ngày mai 9h30"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !parsing) send();
                }}
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted-foreground">Gợi ý:</span>
              {QUICK_PROMPTS.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setMessage(q)}
                  className="rounded-full bg-white px-3 py-1 text-xs text-purple-700 border border-purple-200 hover:bg-purple-100"
                >
                  {q}
                </button>
              ))}
            </div>

            <Button
              type="button"
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              disabled={parsing || !message.trim()}
              onClick={send}
            >
              {parsing ? "Đang phân tích…" : "✨ Phân tích"}
            </Button>
          </>
        ) : (
          <>
            <div className="rounded-md border border-purple-200 bg-white p-3 space-y-2 text-sm">
              <div className="font-medium text-purple-900">{result.appointment.summary}</div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {result.appointment.scheduled_at && (
                  <div>
                    <span className="text-muted-foreground">Thời gian: </span>
                    <span className="font-mono">
                      {new Date(result.appointment.scheduled_at).toLocaleString("vi-VN")}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Thời lượng: </span>
                  <span>{result.appointment.duration_min} phút</span>
                </div>
                {result.appointment.procedure && (
                  <div>
                    <span className="text-muted-foreground">Thủ thuật: </span>
                    <span className="font-mono">{result.appointment.procedure}</span>
                  </div>
                )}
                {result.appointment.patient_hint && (
                  <div>
                    <span className="text-muted-foreground">Bệnh nhân: </span>
                    <span>{result.appointment.patient_hint}</span>
                  </div>
                )}
                {result.appointment.clinician_hint && (
                  <div>
                    <span className="text-muted-foreground">Bác sĩ: </span>
                    <span>{result.appointment.clinician_hint}</span>
                  </div>
                )}
              </div>

              {result.appointment.notes && (
                <div className="text-xs text-muted-foreground pt-1 border-t">
                  Ghi chú: {result.appointment.notes}
                </div>
              )}

              <div className="text-[10px] text-muted-foreground pt-1">
                AI model: <span className="font-mono">{result.ai_model}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>
                Nhập lại
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600"
                onClick={apply}
              >
                Áp dụng
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}