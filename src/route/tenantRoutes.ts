import { Router } from "express";
import {
  addTenantUser,
  createTenant,
  getCurrentTenant,
  getTenant,
  getTenantAnalytics,
  listStorageProviders,
  listMine,
  listTenantUsers,
  listTenants,
  updateTenantUserRole,
  updateTenant,
  upsertStorageConfig,
} from "../controller/express/tenantController";

const router = Router();

router.get("/storage-providers", listStorageProviders);
router.post("/", createTenant);
router.get("/", listTenants);
router.get("/mine", listMine);
router.get("/me", getCurrentTenant);
router.get("/:id", getTenant);
router.patch("/:id", updateTenant);
router.get("/:id/analytics", getTenantAnalytics);
router.get("/:id/users", listTenantUsers);
router.post("/:id/users", addTenantUser);
router.put("/:id/users/:userId/role", updateTenantUserRole);
router.put("/:id/storage", upsertStorageConfig);

export default router;
