import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiPost, apiPut, apiGet, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import type { Patient } from "@shared/types";
import type { UserWithDetails } from "@shared/types";
import type { PatientCreateInput } from "@shared/validation";
import { getRoleLabel, MARKETING_SOURCES, MARKETING_SOURCE_LABELS } from "@shared/constants";

const COUNTRY_OPTIONS = [
  { code: "VN", name: "Việt Nam" },
  { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" },
  { code: "DE", name: "Đức" },
  { code: "FR", name: "Pháp" },
  { code: "GB", name: "Vương quốc Anh" },
  { code: "JP", name: "Nhật Bản" },
  { code: "KR", name: "Hàn Quốc" },
  { code: "US", name: "Hoa Kỳ" },
] as const;

interface PatientFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: Patient | null;
  onSaved?: () => void;
}

export function PatientForm({ open, onOpenChange, patient, onSaved }: PatientFormProps) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const isEdit = !!patient;
  const branchId = session?.branch.id ?? "";

  const [name, setName] = useState(patient?.name ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(patient?.date_of_birth ?? "");
  const [gender, setGender] = useState<"M" | "F" | "O">(patient?.gender ?? "M");
  const [phone, setPhone] = useState(patient?.phone ?? "");
  const [email, setEmail] = useState(patient?.email ?? "");
  const [addressLine, setAddressLine] = useState(patient?.address_line ?? patient?.address ?? "");
  const [wardName, setWardName] = useState(patient?.ward_name ?? "");
  const [wardCode, setWardCode] = useState(patient?.ward_code ?? "");
  const [districtName, setDistrictName] = useState(patient?.district_name ?? "");
  const [districtCode, setDistrictCode] = useState(patient?.district_code ?? "");
  const [provinceName, setProvinceName] = useState(patient?.province_name ?? "");
  const [countryCode, setCountryCode] = useState(patient?.country_code ?? "VN");
  const [initialNote, setInitialNote] = useState("");
  const [cccd, setCccd] = useState(patient?.cccd ?? "");
  const [saving, setSaving] = useState(false);

  // Family
  const [familyName, setFamilyName] = useState(patient?.family_name ?? "");
  const [familyPhone, setFamilyPhone] = useState(patient?.family_phone ?? "");
  const [familyRelation, setFamilyRelation] = useState(patient?.family_relation ?? "");

  // Marketing & body
  const [marketingSource, setMarketingSource] = useState(patient?.marketing_source ?? "");
  const [heightCm, setHeightCm] = useState(patient?.height_cm ?? "");
  const [weightKg, setWeightKg] = useState(patient?.weight_kg ?? "");

  // Referral
  const [referralType, setReferralType] = useState(patient?.referral_type ?? "");
  const [referralUserId, setReferralUserId] = useState(patient?.referral_user_id ?? "");
  const [referralNotes, setReferralNotes] = useState(patient?.referral_notes ?? "");
  const [users, setUsers] = useState<UserWithDetails[]>([]);

  useEffect(() => {
    if (!open || !branchId) return;
    apiGet<{ items: UserWithDetails[] }>(`/api/users/branch/${branchId}`)
      .then((res) => setUsers(Array.isArray(res?.items) ? res.items : []))
      .catch(() => setUsers([]));
  }, [open, branchId]);

  useEffect(() => {
    if (open) {
      setName(patient?.name ?? "");
      setDateOfBirth(patient?.date_of_birth ?? "");
      setGender(patient?.gender ?? "M");
      setPhone(patient?.phone ?? "");
      setEmail(patient?.email ?? "");
      setAddressLine(patient?.address_line ?? patient?.address ?? "");
      setWardName(patient?.ward_name ?? "");
      setWardCode(patient?.ward_code ?? "");
      setDistrictName(patient?.district_name ?? "");
      setDistrictCode(patient?.district_code ?? "");
      setProvinceName(patient?.province_name ?? "");
      setCountryCode(patient?.country_code ?? "VN");
      setInitialNote("");
      setCccd(patient?.cccd ?? "");
      setFamilyName(patient?.family_name ?? "");
      setFamilyPhone(patient?.family_phone ?? "");
      setFamilyRelation(patient?.family_relation ?? "");
      setMarketingSource(patient?.marketing_source ?? "");
      setHeightCm(patient?.height_cm ?? "");
      setWeightKg(patient?.weight_kg ?? "");
      setReferralType(patient?.referral_type ?? "");
      setReferralUserId(patient?.referral_user_id ?? "");
      setReferralNotes(patient?.referral_notes ?? "");
    }
  }, [open, patient]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSaving(true);
    try {
      const payload: PatientCreateInput = {
        branch_id: branchId,
        name,
        date_of_birth: dateOfBirth,
        gender,
        phone,
        email: email || undefined,
        address_line: addressLine || undefined,
        ward_name: wardName || undefined,
        ward_code: wardCode || undefined,
        district_name: districtName || undefined,
        district_code: districtCode || undefined,
        province_name: provinceName || undefined,
        country_name: COUNTRY_OPTIONS.find((country) => country.code === countryCode)?.name ?? "Việt Nam",
        country_code: countryCode,
        family_name: familyName || undefined,
        family_phone: familyPhone || undefined,
        family_relation: familyRelation || undefined,
        marketing_source: marketingSource || undefined,
        height_cm: heightCm ? Number(heightCm) || undefined : undefined,
        weight_kg: weightKg ? Number(weightKg) || undefined : undefined,
        referral_type: referralType || undefined,
        referral_user_id: referralUserId || undefined,
        referral_notes: referralNotes || undefined,
        cccd: cccd || undefined,
      };
      if (isEdit && patient) {
        await apiPut(`/api/patients/${patient.id}`, payload);
        toast.success("Đã cập nhật bệnh nhân");
        onOpenChange(false);
        onSaved?.();
      } else {
        const created = await apiPost<Patient>("/api/patients", payload);
        if (initialNote.trim()) {
          await apiPost(`/api/patients/${created.id}/notes`, { content: initialNote });
        }
        toast.success("Đã tạo bệnh nhân");
        onOpenChange(false);
        navigate(`/patients/${created.id}`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi");
    } finally {
      setSaving(false);
    }
  }

  const bmi = (() => {
    const h = Number(heightCm);
    const w = Number(weightKg);
    if (h > 0 && w > 0) {
      const b = (w / ((h / 100) ** 2));
      return parseFloat(b.toFixed(1));
    }
    return null;
  })();

  const bmiLabel = bmi !== null
    ? bmi < 18.5 ? "Gầy" : bmi < 23 ? "Bình thường" : bmi < 25 ? "Thừa cân" : "Béo phì"
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="sm:max-w-2xl">
      <form onSubmit={onSubmit}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa bệnh nhân" : "Tạo bệnh nhân mới"}</DialogTitle>
        </DialogHeader>

        <DialogBody className="grid gap-3 max-h-[70vh] overflow-y-auto pr-1">

          {/* ─── 1. Thông tin cơ bản ─── */}
          <SectionDivider icon={<UserIcon />}>Thông tin cơ bản</SectionDivider>

          <div className="grid gap-1.5">
            <Label htmlFor="pf-name">
              Họ tên <span className="text-red-500">*</span>
            </Label>
            <Input
              id="pf-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Nguyễn Văn A"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pf-dob">
                Ngày sinh <span className="text-red-500">*</span>
              </Label>
              <DateInput
                id="pf-dob"
                required
                value={dateOfBirth}
                onChange={setDateOfBirth}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-gender">
                Giới tính <span className="text-red-500">*</span>
              </Label>
              <Select id="pf-gender" value={gender} onChange={(e) => setGender(e.target.value as "M" | "F" | "O")}>
                <option value="M">Nam</option>
                <option value="F">Nữ</option>
                <option value="O">Khác</option>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pf-phone">
              Số điện thoại <span className="text-red-500">*</span>
            </Label>
            <Input
              id="pf-phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="VD: 0901234567"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pf-email">Email</Label>
            <Input
              id="pf-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="VD: nguyenvana@email.com"
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="mb-3">
              <Label className="text-sm font-semibold">Địa chỉ thường trú</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Lưu theo từng cấp hành chính để thống kê khu vực bệnh nhân chính xác.
              </p>
            </div>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pf-address-line">Số nhà, đường, thôn/ấp, tòa nhà</Label>
                <Textarea
                  id="pf-address-line"
                  rows={2}
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  placeholder="VD: 123 Nguyễn Trãi, Chung cư A"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="pf-ward">Phường/Xã</Label>
                  <Input
                    id="pf-ward"
                    value={wardName}
                    onChange={(e) => setWardName(e.target.value)}
                    placeholder="VD: Phường Bến Thành"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pf-ward-code">Mã phường/xã</Label>
                  <Input
                    id="pf-ward-code"
                    value={wardCode}
                    onChange={(e) => setWardCode(e.target.value)}
                    placeholder="Tùy chọn"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="pf-district">Quận/Huyện</Label>
                  <Input
                    id="pf-district"
                    value={districtName}
                    onChange={(e) => setDistrictName(e.target.value)}
                    placeholder="VD: Quận 1"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pf-district-code">Mã quận/huyện</Label>
                  <Input
                    id="pf-district-code"
                    value={districtCode}
                    onChange={(e) => setDistrictCode(e.target.value)}
                    placeholder="Tùy chọn"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pf-country">Quốc gia</Label>
                <Select
                  id="pf-country"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                >
                  {COUNTRY_OPTIONS.map((country) => (
                    <option key={country.code} value={country.code}>{country.name}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pf-province">Tỉnh/Thành phố</Label>
                <Input
                  id="pf-province"
                  value={provinceName}
                  onChange={(e) => setProvinceName(e.target.value)}
                  placeholder="VD: TP. Hồ Chí Minh"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pf-cccd">Số CCCD</Label>
            <Input
              id="pf-cccd"
              type="text"
              inputMode="numeric"
              maxLength={12}
              pattern="[0-9]*"
              value={cccd}
              onChange={(e) => setCccd(e.target.value.replace(/\D/g, "").slice(0, 12))}
              placeholder="VD: 012345678912"
            />
          </div>

          {/* ─── 2. Người nhà ─── */}
          <SectionDivider icon={<FamilyIcon />}>Thông tin người nhà</SectionDivider>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pf-fam-name">Họ tên người nhà</Label>
              <Input
                id="pf-fam-name"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="VD: Trần Thị B"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-fam-rel">Mối quan hệ</Label>
              <Input
                id="pf-fam-rel"
                value={familyRelation}
                onChange={(e) => setFamilyRelation(e.target.value)}
                placeholder="VD: Vợ, Chồng, Con…"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pf-fam-phone">Số điện thoại người nhà</Label>
            <Input
              id="pf-fam-phone"
              type="tel"
              value={familyPhone}
              onChange={(e) => setFamilyPhone(e.target.value)}
              placeholder="VD: 0907654321"
            />
          </div>

          {/* ─── 3. Nguồn bệnh nhân & Chiều cao/Cân nặng ─── */}
          <SectionDivider icon={<MetricsIcon />}>Thông tin bổ sung</SectionDivider>

          <div className="grid gap-1.5">
            <Label htmlFor="pf-mkt">Biết phòng khám qua kênh nào?</Label>
            <Select
              id="pf-mkt"
              value={marketingSource}
              onChange={(e) => setMarketingSource(e.target.value)}
            >
              <option value="">— Chưa chọn —</option>
              {MARKETING_SOURCES.map((src) => (
                <option key={src} value={src}>{MARKETING_SOURCE_LABELS[src]}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pf-height">Chiều cao (cm)</Label>
              <Input
                id="pf-height"
                type="number"
                min={50}
                max={250}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="VD: 165"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-weight">Cân nặng (kg)</Label>
              <Input
                id="pf-weight"
                type="number"
                min={10}
                max={300}
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="VD: 60"
              />
            </div>
          </div>

          {bmi !== null && bmiLabel && (
            <p className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
              BMI: <strong className="text-foreground">{bmi}</strong> — {bmiLabel}
            </p>
          )}

          {/* ─── 4. Giới thiệu ─── */}
          <SectionDivider icon={<ReferralIcon />}>Giới thiệu</SectionDivider>

          <div className="grid gap-1.5">
            <Label htmlFor="pf-ref-type">Nguồn giới thiệu</Label>
            <Select id="pf-ref-type" value={referralType} onChange={(e) => setReferralType(e.target.value)}>
              <option value="">— Chưa chọn —</option>
              <option value="none">Không</option>
              <option value="doctor">Bác sĩ giới thiệu</option>
              <option value="staff">Nhân viên</option>
              <option value="ad">Quảng cáo</option>
              <option value="other">Khác</option>
            </Select>
          </div>

          {referralType && referralType !== "none" && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="pf-ref-user">Người giới thiệu</Label>
                <Select id="pf-ref-user" value={referralUserId} onChange={(e) => setReferralUserId(e.target.value)}>
                  <option value="">— Chọn người giới thiệu —</option>
                  {(users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({getRoleLabel(u.role_name)})</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pf-ref-notes">Ghi chú giới thiệu</Label>
                <Textarea
                  id="pf-ref-notes"
                  rows={2}
                  value={referralNotes}
                  onChange={(e) => setReferralNotes(e.target.value)}
                  placeholder="VD: Bs. Nguyễn Văn A giới thiệu"
                />
              </div>
            </>
          )}

          {!isEdit && (
            <>
              <SectionDivider icon={<NotesIcon />}>Ghi chú ban đầu</SectionDivider>
              <div className="grid gap-1.5">
                <Textarea
                  rows={3}
                  value={initialNote}
                  onChange={(e) => setInitialNote(e.target.value)}
                  placeholder="Ghi chú thêm về bệnh nhân…"
                />
              </div>
            </>
          )}
        </DialogBody>

        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Đang lưu…" : isEdit ? "Lưu" : "Tạo bệnh nhân"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function SectionDivider({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {children}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function FamilyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function MetricsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

function ReferralIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
