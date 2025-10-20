import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getPool } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSchema();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(
    500,
    Math.max(1, Number(searchParams.get("pageSize") || "50"))
  );
  const offset = (page - 1) * pageSize;

  const pool = getPool();
  const client = await pool.connect();
  try {
    let where = "";
    let params: string[] = [];
    if (q) {
      where = "WHERE ts @@ plainto_tsquery('simple', $1)";
      params = [q];
    }
    const totalSql = `SELECT COUNT(*)::bigint AS count FROM csv_rows ${where}`;
    const totalRes = await client.query(totalSql, params);
    const total = Number(totalRes.rows[0]?.count || 0);
    const dataSql = `SELECT id, data FROM csv_rows ${where} ORDER BY id LIMIT $${
      params.length + 1
    } OFFSET $${params.length + 2}`;
    const dataRes = await client.query(dataSql, [
      ...params,
      String(pageSize),
      String(offset),
    ]);
    return NextResponse.json({
      page,
      pageSize,
      total,
      rows: dataRes.rows,
    });
  } finally {
    client.release();
  }
}
