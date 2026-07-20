import { useEffect, useState, useRef, type ChangeEvent, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/api";
import type { Patient } from "@shared/types";

interface PatientComboboxProps {
  value: string; // patient_id
  onChange: (patientId: string) => void;
  required?: boolean;
}

interface PatientsResponse {
  items: Patient[];
  total: number;
}

export function PatientCombobox({ value, onChange, required }: PatientComboboxProps) {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedPatientIdRef = useRef("");

  // Load patients when query changes (debounced via useEffect cleanup)
  useEffect(() => {
    if (!query.trim()) {
      setPatients([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      apiGet<PatientsResponse>(`/api/patients?limit=10&search=${encodeURIComponent(query)}`)
        .then((res) => {
          setPatients(res.items);
          setShowDropdown(res.items.length > 0);
          setHighlightIndex(0);
        })
        .catch(() => setPatients([]))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Keep the display in sync when the parent clears the selected patient.
  // Do not clear while a user is typing a search query with no selection.
  useEffect(() => {
    if (!value) {
      if (selectedPatientIdRef.current) {
        selectedPatientIdRef.current = "";
        setQuery("");
      }
    }
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        inputRef.current &&
        dropdownRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    selectedPatientIdRef.current = "";
    setQuery(e.target.value);
    onChange(""); // Clear selection when user types
  }

  function selectPatient(patient: Patient) {
    selectedPatientIdRef.current = patient.id;
    setQuery(`${patient.name} · ${patient.phone}`);
    onChange(patient.id);
    setShowDropdown(false);
    inputRef.current?.blur();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || patients.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((prev) => (prev + 1) % patients.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((prev) => (prev - 1 + patients.length) % patients.length);
        break;
      case "Enter":
        e.preventDefault();
        if (patients[highlightIndex]) {
          selectPatient(patients[highlightIndex]);
        }
        break;
      case "Escape":
        setShowDropdown(false);
        inputRef.current?.blur();
        break;
    }
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        placeholder="Tìm theo tên / SĐT…"
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => query.trim() && patients.length > 0 && setShowDropdown(true)}
        required={required}
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
          Đang tìm…
        </div>
      )}
      {showDropdown && patients.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-60 overflow-auto"
        >
          {patients.map((patient, idx) => (
            <button
              key={patient.id}
              type="button"
              onClick={() => selectPatient(patient)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                idx === highlightIndex ? "bg-gray-50" : ""
              }`}
            >
              <div className="font-medium">{patient.name}</div>
              <div className="text-gray-500">{patient.phone}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
