import express  from "express"
import { executeHandler, getAllHandlers } from "../controller/express/handlerController";
const router = express.Router();

router.post('/', (req, res)=> executeHandler(req, res));
router.get('/', (req, res)=> getAllHandlers(req, res));

export default router;