import { checklistPlanInput, checklistQuery, checklistTickInput, customTaskInput } from "@miku/shared";
import { Router } from "express";
import { z } from "zod";
import { currentOwner } from "../owner";
import { checklistBoard, createCustomTask, deleteCustomTask, saveChecklistPlan, setTaskDone, updateCustomTask } from "../services/checklist";

const idParam = z.coerce.number().int().positive();

export const checklistRouter = Router();

// Stryker disable next-line StringLiteral: Express treats "" the same as "/" for a router's root
checklistRouter.get("/", async (req, res) => {
  res.json(await checklistBoard(currentOwner(res), checklistQuery.parse(req.query).world));
});

// The owner's own tasks.
checklistRouter.post("/tasks", async (req, res) => {
  res.status(201).json(await createCustomTask(currentOwner(res), customTaskInput.parse(req.body)));
});

checklistRouter.put("/tasks/:id", async (req, res) => {
  res.json(await updateCustomTask(currentOwner(res), idParam.parse(req.params.id), customTaskInput.parse(req.body)));
});

checklistRouter.delete("/tasks/:id", async (req, res) => {
  await deleteCustomTask(currentOwner(res), idParam.parse(req.params.id));
  res.status(204).end();
});

// A character's plan, replaced as a whole.
checklistRouter.put("/:characterId/plan", async (req, res) => {
  await saveChecklistPlan(currentOwner(res), idParam.parse(req.params.characterId), checklistPlanInput.parse(req.body).tasks);
  res.status(204).end();
});

// Ticking or unticking one of its planned tasks.
checklistRouter.put("/:characterId/ticks/:task", async (req, res) => {
  await setTaskDone(currentOwner(res), idParam.parse(req.params.characterId), req.params.task, checklistTickInput.parse(req.body).done);
  res.status(204).end();
});
