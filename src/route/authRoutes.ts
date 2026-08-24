import { Router } from "express";
import { login, logout, refresh, session, signup } from "../controller/express/authController";

/**
 * Authentication endpoints. Everything here is public: they authenticate with
 * credentials or with the session cookies themselves, never with the API's
 * identity headers.
 */
const router = Router();

router.post("/login", login);
router.post("/signup", signup);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.get("/session", session);

export default router;
