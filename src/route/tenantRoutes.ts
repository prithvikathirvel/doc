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
import { addMember, listMembers, removeMember, updateMember } from "../controller/express/directoryController";
import {
  getTenantDocsConfig,
  patchTenantDocsConfig,
  upsertTenantDocsConfig,
} from "../controller/express/tenantDocController";

const router = Router();

router.get("/storage-providers", listStorageProviders);
router.post("/", createTenant);
router.get("/", listTenants);
router.get("/me", getCurrentTenant);
router.get("/:id", getTenant);
router.patch("/:id", updateTenant);
router.get("/:id/analytics", getTenantAnalytics);
router.get("/:id/users", listTenantUsers);
router.get("/:id/members", listMembers);
router.post("/:id/members", addMember);
router.patch("/:id/members/:userId", updateMember);
router.delete("/:id/members/:userId", removeMember);
router.put("/:id/storage", upsertStorageConfig);

// Shareable developer documentation. Reads are open to workspace members;
// writes (generate / edit / toggle) are platform-administrator only.
router.get("/:id/docs", getTenantDocsConfig);
router.put("/:id/docs", upsertTenantDocsConfig);
router.patch("/:id/docs", patchTenantDocsConfig);

export default router;
