import { Router } from "express";
import {
  createTenant,
  getCurrentTenant,
  getTenant,
  getTenantAnalytics,
  listStorageProviders,
  listTenantUsers,
  listTenants,
  updateTenant,
  upsertStorageConfig,
} from "../controller/express/tenantController";

const router = Router();

router.get("/storage-providers", listStorageProviders);
router.post("/", createTenant);
router.get("/", listTenants);
router.get("/me", getCurrentTenant);
router.get("/:id", getTenant);
router.patch("/:id", updateTenant);
router.get("/:id/analytics", getTenantAnalytics);
router.get("/:id/users", listTenantUsers);
router.put("/:id/storage", upsertStorageConfig);

export default router;
