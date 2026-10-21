import { Router } from "express";
import { expToNext, totalExp } from "../calc/exp";
import { EXP_TABLE_DATE, EXP_TABLE_PATCH, MAX_LEVEL } from "../gameFigures/expTable";

export interface ExpTableRow {
  level: number;
  expToNext: number; // EXP to go from this level to the next
  total: number; // total EXP from level 1 on reaching the next level
}

export interface ExpTableView {
  patch: string; // the GMS patch the table is current as of
  date: string; // "YYYY-MM"
  rows: ExpTableRow[]; // levels 1–299
}

export function expTableView(): ExpTableView {
  const rows: ExpTableRow[] = [];
  for (let level = 1; level < MAX_LEVEL; level++) rows.push({ level, expToNext: expToNext(level), total: totalExp(level + 1, 0) });
  return { patch: EXP_TABLE_PATCH, date: EXP_TABLE_DATE, rows };
}

export const expTableRouter = Router();

// Stryker disable next-line StringLiteral: Express treats "" the same as "/" for a router's root
expTableRouter.get("/", (_req, res) => {
  res.json(expTableView());
});
