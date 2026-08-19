import { Router } from "express";
import {
  createTenant,
  getCurrentTenant,
  getTenant,
  listTenants,
  upsertStorageConfig,
} from "../controller/express/tenantController";

const router = Router();

router.post("/", createTenant);
router.get("/", listTenants);
router.get("/me", getCurrentTenant);
router.get("/:id", getTenant);
router.put("/:id/storage", upsertStorageConfig);

export default router;
