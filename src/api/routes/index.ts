import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import documentRoutes from "./documentRoutes";
import folderRoutes from "./folderRoutes";
import tenantRoutes from "./tenantRoutes";
import { metrics } from "../../infrastructure/observability/metrics";
import { pingDatabase } from "../../infrastructure/database/mysql/pool";
import { storageRegistry } from "../../infrastructure/storage/StorageProviderRegistry";

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

router.use(authMiddleware);
router.use("/documents", documentRoutes);
router.use("/folders", folderRoutes);
router.use("/tenants", tenantRoutes);

export default router;
