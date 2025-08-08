import express from 'express';
import { createWorkflow, getAllWorkflows, getWorkflowById, updateWorkflowById, activateWorkflow } from '../controller/express/workflowController';

const router = express.Router();

//Workflow Templates API's
router.post('', (req,res)=> createWorkflow(req, res));
router.get('', (req,res)=> getAllWorkflows(req, res));
router.get('/:workflowId', (req,res)=> getWorkflowById(req, res));
router.put('/:workflowId', (req,res)=> updateWorkflowById(req, res));
router.patch('/:workflowId', (req,res)=> activateWorkflow(req, res));


export default router;