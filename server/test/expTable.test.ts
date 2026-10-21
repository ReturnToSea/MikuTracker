import { describe, expect, it } from "vitest";
import type { ExpTableRow } from "../src/routes/expTable";
import { api } from "./api";

describe("/api/exp-table", () => {
  it("has a row for every level from 1 to 299, with the totals adding up", async () => {
    const res = await api().get("/api/exp-table");
    expect(res.status).toBe(200);
    const rows: ExpTableRow[] = res.body.rows;
    expect(rows.map((r) => r.level)).toEqual(Array.from({ length: 299 }, (_, i) => i + 1));
    let total = 0;
    for (const row of rows) {
      total += row.expToNext;
      expect(row.total).toBe(total);
    }
  });

  it("sends the big numbers exactly", async () => {
    const res = await api().get("/api/exp-table");
    expect(res.body.rows[199]).toEqual({ level: 200, expToNext: 2_207_026_470, total: 13_669_361_700 });
    expect(res.text).toContain('{"level":299,"expToNext":1737759854037637,"total":8509498537428819}');
  });

  it("says which patch it's current as of", async () => {
    const res = await api().get("/api/exp-table");
    expect([res.body.patch, res.body.date]).toEqual(["v.271", "2026-09"]);
  });
});
