"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Row = {
  id: number;
  data: Record<string, string | number | boolean | null>;
};

type SearchResponse = {
  page: number;
  pageSize: number;
  total: number;
  rows: Row[];
};

function parseCsvPreview(
  text: string,
  maxRows: number
): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let i = 0;
  let field = "";
  let current: string[] = [];
  let inQuotes = false;
  const pushField = () => {
    current.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(current);
    current = [];
  };
  while (i < text.length && rows.length < maxRows + 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\n") {
      pushField();
      pushRow();
      i++;
      continue;
    }
    if (ch === "\r") {
      pushField();
      pushRow();
      i += text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += ch;
    i++;
  }

  if (field.length > 0 || current.length > 0) {
    pushField();
    pushRow();
  }
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0];
  const dataRows = rows.slice(1, Math.min(rows.length, maxRows + 1));
  return { headers, rows: dataRows };
}

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);

  const columns = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      Object.keys(r.data || {}).forEach((k) => set.add(k));
    }
    return Array.from(set);
  }, [rows]);

  async function handleFileSelected(f: File | null) {
    setFile(f);
    setPreviewHeaders([]);
    setPreviewRows([]);
    if (!f) return;
    try {
      const blob = f.slice(0, 1_000_000); // read first ~1MB for preview
      const text = await blob.text();
      const parsed = parseCsvPreview(text, 100);
      setPreviewHeaders(parsed.headers);
      setPreviewRows(parsed.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setUploadedCount(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { ok: boolean; rows: number };
      setUploadedCount(json.rows);
      await load(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function load(pageArg = page) {
    setError(null);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(pageArg));
    params.set("pageSize", String(pageSize));
    const res = await fetch(`/api/search?${params.toString()}`);
    if (!res.ok) {
      setRows([]);
      setTotal(0);
      setError(await res.text());
      return;
    }
    const json: SearchResponse = await res.json();
    setRows(json.rows);
    setTotal(json.total);
    setPage(json.page);
    setPageSize(json.pageSize);
  }

  useEffect(() => {
    load(1).catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="min-h-screen p-6 space-y-6">
      <h1 className="text-2xl font-semibold">CSV Viewer</h1>

      <div className="flex items-center gap-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => handleFileSelected(e.target.files?.[0] || null)}
        />
        <button
          className="px-4 py-2 rounded border"
          onClick={() => fileInputRef.current?.click()}
        >
          Choose file
        </button>
        {file && <span className="text-sm text-gray-700">{file.name}</span>}
        <button
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          disabled={!file || uploading}
          onClick={handleUpload}
        >
          {uploading ? "Uploading…" : "Upload CSV"}
        </button>
        {uploadedCount !== null && (
          <span className="text-sm text-gray-600">
            Inserted {uploadedCount} rows
          </span>
        )}
      </div>

      {previewHeaders.length > 0 && (
        <div className="space-y-2">
          <div className="font-medium">
            Preview (first {previewRows.length} rows)
          </div>
          <div className="overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  {previewHeaders.map((h) => (
                    <th key={h} className="p-2 border-b text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, idx) => (
                  <tr key={idx} className="odd:bg-gray-50">
                    {previewHeaders.map((_, colIdx) => (
                      <td key={colIdx} className="p-2 border-b">
                        {String(r[colIdx] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          className="border rounded px-3 py-2 w-80"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="px-3 py-2 rounded bg-gray-800 text-white"
          onClick={() => load(1)}
        >
          Search
        </button>
      </div>

      {error && <div className="text-red-600">{error}</div>}

      <div className="overflow-auto border rounded">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="p-2 border-b text-left">id</th>
              {columns.map((c) => (
                <th key={c} className="p-2 border-b text-left">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="p-2 border-b">{r.id}</td>
                {columns.map((c) => (
                  <td key={c} className="p-2 border-b">
                    {String(r.data?.[c] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <span>
          Page {page} of {Math.max(1, Math.ceil(total / pageSize))} (total{" "}
          {total})
        </span>
        <button
          className="px-3 py-1 border rounded"
          disabled={page <= 1}
          onClick={() => {
            const p = Math.max(1, page - 1);
            setPage(p);
            load(p);
          }}
        >
          Prev
        </button>
        <button
          className="px-3 py-1 border rounded"
          onClick={() => {
            const maxPage = Math.max(1, Math.ceil(total / pageSize));
            const p = Math.min(maxPage, page + 1);
            setPage(p);
            load(p);
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
