import { Router } from "express";
import { authMiddleware } from "../middleware/authorization";
import authRoutes from "./authRoutes";
import directoryRoutes from "./directoryRoutes";
import documentRoutes from "./documentRoutes";
import folderRoutes from "./folderRoutes";
import tenantRoutes from "./tenantRoutes";
import { resolveWorkspace } from "../controller/express/tenantController";
import { metrics } from "../utils/metrics";
import { pingDatabase } from "../dbConnection/pool";
import { storageRegistry } from "../dao/dao";
import { settings } from "../config/settings";

const router = Router();

router.get("/health", async (_req, res) => {
  const db = await pingDatabase();
  res.status(db ? 200 : 503).json({
    status: db ? "ok" : "degraded",
    database: db ? "up" : "down",
    providers: storageRegistry.registered(),
    authentication: {
      // Which of the resolver's strategies can succeed on this deployment.
      identityProvider: Boolean(settings.auth.userMgtBaseUrl) || settings.authDisabled,
      tokenVerification: Boolean(settings.auth.keycloakBaseUrl || settings.jwtSecret),
      apiKeys: true,
      trustedHeaders: settings.authDisabled,
    },
  });
});

router.get("/metrics", (_req, res) => {
  res.json(metrics.snapshot());
});

// Cookie-session endpoints. Public: they authenticate with credentials or the
// session cookies themselves.
router.use("/auth", authRoutes);

// Legacy sign-in helper kept for old clients: resolves a workspace slug to ids.
// It no longer grants or hints at any role.
router.post("/workspaces/resolve", resolveWorkspace);

router.use(authMiddleware);
router.use(directoryRoutes);
router.use("/documents", documentRoutes);
router.use("/folders", folderRoutes);
router.use("/tenants", tenantRoutes);

export default router;
