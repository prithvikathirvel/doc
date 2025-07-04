import express from 'express';
import { createWorkflowInstance, getAllWorkflowInstances, updateWorkflowInstanceById } from '../controller/express/workflowController';

const router = express.Router();
import multer from 'multer';

const upload = multer(); 

//Workflow Instance API's
router.post('/', (req,res)=> createWorkflowInstance(req, res)); 
router.get('/:userId', (req, res)=> getAllWorkflowInstances(req,res));
router.put('/:workflowInstanceId', upload.single('document'), (req, res) => updateWorkflowInstanceById(req, res));

export default router;