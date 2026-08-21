import { Router } from "express";
import { authMiddleware } from "../middleware/authorization";
import documentRoutes from "./documentRoutes";
import folderRoutes from "./folderRoutes";
import tenantRoutes from "./tenantRoutes";
import { resolveWorkspace } from "../controller/express/tenantController";
import { metrics } from "../utils/metrics";
import { pingDatabase } from "../dbConnection/pool";
import { storageRegistry } from "../dao/dao";
import { login, logout, refresh, signup } from "../controller/express/authController";

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

// Authentication proxies keep the User Service client secret on the DMS server.
router.post("/auth/login", login);
router.post("/auth/refresh", refresh);
router.post("/auth/logout", logout);
router.post("/auth/signup", signup);

// Header-mode sign-in helper retained only for local/dev compatibility.
router.post("/workspaces/resolve", resolveWorkspace);

router.use(authMiddleware);
router.use("/documents", documentRoutes);
router.use("/folders", folderRoutes);
router.use("/tenants", tenantRoutes);

export default router;
