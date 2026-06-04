import express from "express";
import authRouter from "./routes/auth";
import devicesRouter from "./routes/devices";
import usersRouter from "./routes/users";
import areaAssignmentsRouter from "./routes/area-assignments";
import mastersRouter from "./routes/masters";
import householdsRouter from "./routes/households";
import tasksRouter from "./routes/tasks";
import dataQualityRouter from "./routes/data-quality";
import syncLogsRouter from "./routes/sync-logs";
import eligibleWomenRouter from "./routes/eligible-women";
import pregnantWomenRouter from "./routes/pregnant-women";
import childrenRouter from "./routes/children";
import syncRouter from "./routes/sync";
import protocolRouter from "./routes/protocol";
import correctionsRouter from "./routes/corrections";
import formResponsesRouter from "./routes/form-responses";
import { requireAuth } from "./middleware/auth";

export function createApp() {
  const app = express();

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = new Set([
      "http://localhost:8088",
      "http://127.0.0.1:8088",
      "http://localhost:5317",
      "http://127.0.0.1:5317",
      "http://localhost:58080",
      "http://127.0.0.1:58080",
    ]);

    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    }

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "dynamic-api" });
  });

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/devices", requireAuth, devicesRouter);
  app.use("/api/v1/users", requireAuth, usersRouter);
  app.use("/api/v1", requireAuth, areaAssignmentsRouter);
  app.use("/api/v1/masters", requireAuth, mastersRouter);
  app.use("/api/v1/households", requireAuth, householdsRouter);
  app.use("/api/v1/tasks", requireAuth, tasksRouter);
  app.use("/api/v1/data-quality-flags", requireAuth, dataQualityRouter);
  app.use("/api/v1/sync-logs", requireAuth, syncLogsRouter);
  app.use("/api/v1/eligible-women", requireAuth, eligibleWomenRouter);
  app.use("/api/v1/pregnant-women", requireAuth, pregnantWomenRouter);
  app.use("/api/v1/children", requireAuth, childrenRouter);
  app.use("/api/v1/sync", requireAuth, syncRouter);
  app.use("/api/v1/protocol", requireAuth, protocolRouter);
  app.use("/api/v1", requireAuth, correctionsRouter);
  app.use("/api/v1/form-responses", requireAuth, formResponsesRouter);

  return app;
}
