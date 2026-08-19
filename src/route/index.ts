import { Router } from "express";
import { authMiddleware } from "../middleware/authorization";
import documentRoutes from "./documentRoutes";
import folderRoutes from "./folderRoutes";
import tenantRoutes from "./tenantRoutes";
import { resolveWorkspace } from "../controller/express/tenantController";
import { metrics } from "../utils/metrics";
import { pingDatabase } from "../dbConnection/pool";
import { storageRegistry } from "../dao/dao";

const router = Router();

router.get("/health", async (_req, res) => {
  const db = await pingDatabase();
  res.status(db ? 200 : 503).json({
    status: db ? "ok" : "degraded",
    database: db ? "up" : "down",
    providers: storageRegistry.registered(),
  });
});

router.get("/metrics", (_req, res) => {
  res.json(metrics.snapshot());
});

// Sign-in helper: resolves a workspace slug to a tenant id before a session exists.
router.post("/workspaces/resolve", resolveWorkspace);

router.use(authMiddleware);
router.use("/documents", documentRoutes);
router.use("/folders", folderRoutes);
router.use("/tenants", tenantRoutes);

export default router;
