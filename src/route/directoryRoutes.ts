import { Router } from "express";
import {
  createApiKey,
  createUser,
  deleteApiKey,
  listApiKeys,
  updateApiKey,
} from "../controller/express/directoryController";

const router = Router();

// Account creation (identity provider + optional workspace attach).
router.post("/users", createUser);

// API keys for machine clients. Platform administrators only.
router.get("/api-keys", listApiKeys);
router.post("/api-keys", createApiKey);
router.patch("/api-keys/:id", updateApiKey);
router.delete("/api-keys/:id", deleteApiKey);

export default router;
