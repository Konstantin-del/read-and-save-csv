import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getPool } from "../../../lib/db";
import { parse } from "fast-csv";
import { Readable } from "stream";
import { ReadableStream as WebReadableStream } from "stream/web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await ensureSchema();
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const readable = file.stream();
  const parser = parse({ headers: true, ignoreEmpty: true, trim: true });

  const batch: string[] = [];
  const BATCH_SIZE = 5000;
  let rows = 0;

  const pool = getPool();

  async function flush(): Promise<void> {
    if (batch.length === 0) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO csv_rows(data, ts)
				 SELECT elem::jsonb, to_tsvector('simple', elem)
				 FROM unnest($1::text[]) AS elem`,
        [batch]
      );
      await client.query("COMMIT");
      rows += batch.length;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e as Error;
    } finally {
      batch.length = 0;
      client.release();
    }
  }

  return new Promise<NextResponse>((resolve, reject) => {
    parser.on("error", (err: Error) => reject(err));
    parser.on("data", (row: Record<string, unknown>) => {
      batch.push(JSON.stringify(row));
      if (batch.length >= BATCH_SIZE) {
        parser.pause();
        flush()
          .then(() => parser.resume())
          .catch((e) => reject(e));
      }
    });
    parser.on("end", async () => {
      try {
        await flush();
        resolve(NextResponse.json({ ok: true, rows }));
      } catch (e) {
        reject(e as Error);
      }
    });

    Readable.fromWeb(readable as unknown as WebReadableStream).pipe(
      parser as unknown as NodeJS.WritableStream
    );
  }).catch((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  });
}
