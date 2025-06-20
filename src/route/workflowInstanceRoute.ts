import express from 'express';
import { createWorkflowInstance, getAllWorkflowInstances, updateWorkflowInstanceById } from '../controller/express/workflowController';

const router = express.Router();

//Workflow Instance API's
router.post('/', (req,res)=> createWorkflowInstance(req, res)); 
router.get('/:userId', (req, res)=> getAllWorkflowInstances(req,res));
router.put('/:workflowInstanceId', (req, res)=> updateWorkflowInstanceById(req,res));

export default router;