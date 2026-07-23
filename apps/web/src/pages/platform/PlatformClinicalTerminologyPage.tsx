import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ClinicalConcept, Icd10Code, TerminologyVersion } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PlatformApiError, platformPatch, platformPost, platformGet } from "@/lib/platform-api";
import { usePlatformAuth } from "@/lib/platform-auth-context";

type Items<T> = { items: T[] };
type Icd10ImportCode = { code: string; display_vi: string; parent_code?: string; is_billable: boolean; sort_order: number };

function normalizeIcd10Code(value: string): string {
  const compact = value.trim().toUpperCase().replaceAll(".", "");
  if (!/^[A-Z][0-9]{2}[0-9A-Z]{0,4}$/.test(compact)) throw new Error(`Mã ICD-10 không hợp lệ: ${value}`);
  return compact.length === 3 ? compact : `${compact.slice(0, 3)}.${compact.slice(3)}`;
}

function parseIcd10Import(value: string): Icd10ImportCode[] {
  const trimmed = value.trim();
  const rawCodes = trimmed.startsWith("[")
    ? (JSON.parse(trimmed) as Array<Partial<Icd10ImportCode>>).map((item, index) => ({
      code: normalizeIcd10Code(item.code ?? ""),
      display_vi: item.display_vi?.trim() ?? "",
      parent_code: item.parent_code ? normalizeIcd10Code(item.parent_code) : undefined,
      is_billable: item.is_billable ?? true,
      sort_order: item.sort_order ?? index,
    }))
    : trimmed.split(/\r?\n/).flatMap((line, index) => {
      const match = line.trim().match(/^([A-Za-z][0-9]{2}(?:\.?[0-9A-Za-z]{0,4}))\s+(.*)$/);
      if (!match || /^ICD-?10$/i.test(match[1])) return [];
      return [{ code: normalizeIcd10Code(match[1]), display_vi: match[2].trim(), is_billable: true, sort_order: index }];
    });
  if (!rawCodes.length || rawCodes.some((item) => !item.display_vi)) throw new Error("Mỗi dòng cần có mã ICD-10 và mô tả tiếng Việt");

  const codeSet = new Set(rawCodes.map((item) => item.code));
  return rawCodes.map((item) => {
    if (item.parent_code) return item;
    const compact = item.code.replaceAll(".", "");
    for (let length = compact.length - 1; length >= 3; length -= 1) {
      const parent = normalizeIcd10Code(compact.slice(0, length));
      if (codeSet.has(parent)) return { ...item, parent_code: parent };
    }
    return item;
  });
}

export function PlatformClinicalTerminologyPage() {
  const { hasPermission } = usePlatformAuth();
  const [versions, setVersions] = useState<TerminologyVersion[]>([]);
  const [concepts, setConcepts] = useState<ClinicalConcept[]>([]);
  const [codes, setCodes] = useState<Icd10Code[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [versionOpen, setVersionOpen] = useState(false);
  const [conceptOpen, setConceptOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [versionForm, setVersionForm] = useState({ system: "ICD10_VN", version_key: "", title: "", publisher: "", source_url: "", source_file_name: "", source_sha256: "" });
  const [conceptForm, setConceptForm] = useState({ code: "", legacy_condition: "", kind: "diagnosis", category: "tooth_hard_tissue", default_scope: "tooth", display_vi: "", description_vi: "" });
  const [importVersionId, setImportVersionId] = useState("");
  const [importJson, setImportJson] = useState("ICD-10\tSự miêu tả\nK029\tSâu răng, không xác định");
  const [mappingForm, setMappingForm] = useState({ concept_id: "", icd10_code_id: "", mapping_role: "primary" });

  const load = () => void Promise.all([
    platformGet<Items<TerminologyVersion>>("/api/platform/clinical-terminology/versions"),
    platformGet<Items<ClinicalConcept>>("/api/platform/clinical-terminology/concepts"),
    platformGet<Items<Icd10Code>>("/api/platform/clinical-terminology/icd10"),
  ]).then(([versionResult, conceptResult, codeResult]) => {
    setVersions(versionResult.items); setConcepts(conceptResult.items); setCodes(codeResult.items);
  }).catch((cause) => setError(cause instanceof PlatformApiError ? cause.message : "Không thể tải danh mục thuật ngữ"));

  useEffect(load, []);
  const canWrite = hasPermission("platform_clinical_terminology.write");
  const icdDrafts = versions.filter((version) => version.system === "ICD10_VN" && version.status === "draft");

  async function createVersion(event: FormEvent) {
    event.preventDefault();
    try { await platformPost("/api/platform/clinical-terminology/versions", versionForm); setVersionOpen(false); load(); }
    catch (cause) { setError(cause instanceof PlatformApiError ? cause.message : "Không thể tạo phiên bản"); }
  }
  async function createConcept(event: FormEvent) {
    event.preventDefault();
    try { await platformPost("/api/platform/clinical-terminology/concepts", conceptForm); setConceptOpen(false); load(); }
    catch (cause) { setError(cause instanceof PlatformApiError ? cause.message : "Không thể tạo khái niệm"); }
  }
  async function importCodes(event: FormEvent) {
    event.preventDefault();
    try {
      const codesInput = parseIcd10Import(importJson);
      await platformPost("/api/platform/clinical-terminology/icd10/import", { terminology_version_id: importVersionId, codes: codesInput });
      setImportOpen(false); load();
    } catch (cause) { setError(cause instanceof PlatformApiError ? cause.message : cause instanceof Error ? cause.message : "Không thể import ICD-10"); }
  }
  async function createMapping(event: FormEvent) {
    event.preventDefault();
    try { await platformPost("/api/platform/clinical-terminology/mappings", mappingForm); setMappingOpen(false); load(); }
    catch (cause) { setError(cause instanceof PlatformApiError ? cause.message : "Không thể lưu mapping"); }
  }
  async function approve(version: TerminologyVersion) {
    try { await platformPatch(`/api/platform/clinical-terminology/versions/${version.id}/status`, { status: "approved" }); load(); }
    catch (cause) { setError(cause instanceof PlatformApiError ? cause.message : "Không thể duyệt phiên bản"); }
  }

  return <div className="mx-auto w-full max-w-[90rem] space-y-6 p-4 sm:p-7 lg:px-8 lg:py-8 2xl:px-10">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#67e8f9]">Platform Control</p><h1 className="mt-1 text-2xl font-semibold">Thuật ngữ lâm sàng</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Danh mục khái niệm nội bộ, mapping và phiên bản ICD-10 Việt Nam có provenance.</p></div>{canWrite && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setMappingOpen(true)}>Tạo mapping</Button><Button variant="outline" onClick={() => { setImportVersionId(icdDrafts[0]?.id ?? ""); setImportOpen(true); }}>Import ICD-10</Button><Button variant="outline" onClick={() => setConceptOpen(true)}>Thêm khái niệm</Button><Button onClick={() => setVersionOpen(true)}>Tạo phiên bản</Button></div>}</div>
    {error && <div role="alert" className="rounded-lg border border-[#7f3448] bg-[#401e29] px-3 py-2 text-sm text-[#fda4af]">{error}</div>}
    <Card><CardHeader><CardTitle>Phiên bản và nguồn</CardTitle><CardDescription>ICD-10 chỉ được approve sau khi nhập từ artifact chính thức có publisher, file nguồn và SHA-256.</CardDescription></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[760px] text-sm"><thead className="border-y text-left text-muted-foreground"><tr><th className="p-3">Hệ mã</th><th className="p-3">Phiên bản</th><th className="p-3">Nguồn</th><th className="p-3">Trạng thái</th><th className="p-3" /></tr></thead><tbody>{versions.map((version) => <tr className="border-b" key={version.id}><td className="p-3 font-mono text-xs">{version.system}</td><td className="p-3"><p className="font-medium">{version.title}</p><p className="text-xs text-muted-foreground">{version.version_key}</p></td><td className="p-3 text-xs">{version.publisher ?? "--"}<br />{version.source_file_name ?? "--"}</td><td className="p-3"><span className="rounded-full bg-muted px-2 py-1 text-xs">{version.status}</span></td><td className="p-3 text-right">{canWrite && version.status === "draft" && <Button size="sm" variant="outline" onClick={() => void approve(version)}>Duyệt</Button>}</td></tr>)}{versions.length === 0 && <tr><td className="p-8 text-center text-muted-foreground" colSpan={5}>Chưa có phiên bản.</td></tr>}</tbody></table></CardContent></Card>
    <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Khái niệm lâm sàng</CardTitle></CardHeader><CardContent className="max-h-[32rem] space-y-2 overflow-auto">{concepts.map((concept) => <div className="rounded-lg border p-3 text-sm" key={concept.id}><div className="flex items-center justify-between gap-3"><p className="font-medium">{concept.display_vi}</p><span className="font-mono text-xs text-muted-foreground">{concept.kind}</span></div><p className="mt-1 font-mono text-xs text-muted-foreground">{concept.code} · {concept.legacy_condition}</p></div>)}{concepts.length === 0 && <p className="text-sm text-muted-foreground">Chưa có khái niệm.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Mã ICD-10 đã duyệt</CardTitle></CardHeader><CardContent className="max-h-[32rem] space-y-2 overflow-auto">{codes.map((code) => <div className="rounded-lg border p-3 text-sm" key={code.id}><p className="font-mono text-xs font-semibold">{code.code}</p><p className="mt-1">{code.display_vi}</p></div>)}{codes.length === 0 && <p className="text-sm text-muted-foreground">Chưa có mã ICD-10 approved. Tạo version, import artifact và duyệt trước.</p>}</CardContent></Card></div>
    <Dialog open={versionOpen} onOpenChange={setVersionOpen}><form onSubmit={createVersion}><DialogHeader><DialogTitle>Tạo phiên bản thuật ngữ</DialogTitle></DialogHeader><DialogBody className="space-y-3"><Select value={versionForm.system} onChange={(event) => setVersionForm({ ...versionForm, system: event.target.value })}><option value="ICD10_VN">ICD-10 Việt Nam</option><option value="LOCAL">Danh mục nội bộ</option></Select><Input placeholder="Version key" value={versionForm.version_key} onChange={(event) => setVersionForm({ ...versionForm, version_key: event.target.value })} required /><Input placeholder="Tên phiên bản" value={versionForm.title} onChange={(event) => setVersionForm({ ...versionForm, title: event.target.value })} required /><Input placeholder="Cơ quan ban hành" value={versionForm.publisher} onChange={(event) => setVersionForm({ ...versionForm, publisher: event.target.value })} required={versionForm.system === "ICD10_VN"} /><Input placeholder="URL nguồn (tùy chọn)" value={versionForm.source_url} onChange={(event) => setVersionForm({ ...versionForm, source_url: event.target.value })} /><Input placeholder="Tên tệp nguồn" value={versionForm.source_file_name} onChange={(event) => setVersionForm({ ...versionForm, source_file_name: event.target.value })} required={versionForm.system === "ICD10_VN"} /><Input placeholder="SHA-256 (64 hex)" value={versionForm.source_sha256} onChange={(event) => setVersionForm({ ...versionForm, source_sha256: event.target.value })} required={versionForm.system === "ICD10_VN"} /></DialogBody><DialogFooter><Button type="button" variant="outline" onClick={() => setVersionOpen(false)}>Hủy</Button><Button type="submit">Tạo</Button></DialogFooter></form></Dialog>
    <Dialog open={conceptOpen} onOpenChange={setConceptOpen}><form onSubmit={createConcept}><DialogHeader><DialogTitle>Thêm khái niệm</DialogTitle></DialogHeader><DialogBody className="space-y-3"><Input placeholder="Mã: dental.caries" value={conceptForm.code} onChange={(event) => setConceptForm({ ...conceptForm, code: event.target.value })} required /><Input placeholder="Legacy condition: caries" value={conceptForm.legacy_condition} onChange={(event) => setConceptForm({ ...conceptForm, legacy_condition: event.target.value })} required /><Input placeholder="Tên tiếng Việt" value={conceptForm.display_vi} onChange={(event) => setConceptForm({ ...conceptForm, display_vi: event.target.value })} required /><div className="grid grid-cols-3 gap-2"><Select value={conceptForm.kind} onChange={(event) => setConceptForm({ ...conceptForm, kind: event.target.value })}><option value="diagnosis">Diagnosis</option><option value="observation">Observation</option><option value="symptom">Symptom</option><option value="risk">Risk</option><option value="preventive">Preventive</option></Select><Select value={conceptForm.category} onChange={(event) => setConceptForm({ ...conceptForm, category: event.target.value })}><option value="tooth_hard_tissue">Mô cứng</option><option value="periodontal">Nha chu</option><option value="oral_soft_tissue">Mô mềm</option><option value="occlusion_orthodontics">Khớp cắn</option><option value="tmj_function">TMJ</option><option value="preventive_general">Dự phòng</option></Select><Select value={conceptForm.default_scope} onChange={(event) => setConceptForm({ ...conceptForm, default_scope: event.target.value })}><option value="tooth">Theo răng</option><option value="region">Theo vùng</option><option value="full_mouth">Toàn miệng</option></Select></div><Textarea placeholder="Mô tả (tùy chọn)" value={conceptForm.description_vi} onChange={(event) => setConceptForm({ ...conceptForm, description_vi: event.target.value })} /></DialogBody><DialogFooter><Button type="button" variant="outline" onClick={() => setConceptOpen(false)}>Hủy</Button><Button type="submit">Tạo</Button></DialogFooter></form></Dialog>
    <Dialog open={importOpen} onOpenChange={setImportOpen}><form onSubmit={importCodes}><DialogHeader><DialogTitle>Import ICD-10 Việt Nam</DialogTitle></DialogHeader><DialogBody className="space-y-3"><Label htmlFor="import-version">Phiên bản nháp</Label><Select id="import-version" value={importVersionId} onChange={(event) => setImportVersionId(event.target.value)} required><option value="">Chọn phiên bản</option>{icdDrafts.map((version) => <option key={version.id} value={version.id}>{version.title}</option>)}</Select><Label htmlFor="import-json">Bảng mã từ artifact đã xác minh</Label><p className="text-xs text-muted-foreground">Dán bảng hai cột (mã và mô tả), có hoặc không có dấu chấm trong mã. JSON vẫn được hỗ trợ.</p><Textarea id="import-json" className="min-h-60 font-mono text-xs" value={importJson} onChange={(event) => setImportJson(event.target.value)} required /></DialogBody><DialogFooter><Button type="button" variant="outline" onClick={() => setImportOpen(false)}>Hủy</Button><Button type="submit">Import</Button></DialogFooter></form></Dialog>
    <Dialog open={mappingOpen} onOpenChange={setMappingOpen}><form onSubmit={createMapping}><DialogHeader><DialogTitle>Tạo mapping concept - ICD-10</DialogTitle></DialogHeader><DialogBody className="space-y-3"><Select value={mappingForm.concept_id} onChange={(event) => setMappingForm({ ...mappingForm, concept_id: event.target.value })} required><option value="">Chọn concept</option>{concepts.filter((concept) => concept.kind === "diagnosis").map((concept) => <option key={concept.id} value={concept.id}>{concept.display_vi}</option>)}</Select><Select value={mappingForm.icd10_code_id} onChange={(event) => setMappingForm({ ...mappingForm, icd10_code_id: event.target.value })} required><option value="">Chọn ICD-10</option>{codes.map((code) => <option key={code.id} value={code.id}>{code.code} · {code.display_vi}</option>)}</Select><Select value={mappingForm.mapping_role} onChange={(event) => setMappingForm({ ...mappingForm, mapping_role: event.target.value })}><option value="primary">Primary</option><option value="alternative">Alternative</option></Select></DialogBody><DialogFooter><Button type="button" variant="outline" onClick={() => setMappingOpen(false)}>Hủy</Button><Button type="submit">Lưu mapping</Button></DialogFooter></form></Dialog>
  </div>;
}
