import express from 'express';
import { createWorkflow, getAllWorkflows, getWorkflowById, updateWorkflowById, activateWorkflow, createStage, getAllStages, getStageById, updateStageById, activateStage } from '../controller/express/workflowController';

const router = express.Router();

//Workflow Templates API's
router.post('', (req,res)=> createWorkflow(req, res));
router.get('', (req,res)=> getAllWorkflows(req, res));
router.get('/:workflowId', (req,res)=> getWorkflowById(req, res));
router.put('/:workflowId', (req,res)=> updateWorkflowById(req, res));
router.patch('/:workflowId', (req,res)=> activateWorkflow(req, res));

//Stage API's
router.post('/stage', (req,res)=> createStage(req, res)); 
router.get('/stage', (req, res)=> getAllStages(req,res));
router.get('/stage/:stageId', (req, res)=> getStageById(req,res));
router.put('/stage', (req, res)=> updateStageById(req,res));
router.patch('/stage/:stageId', (req,res)=> activateStage(req, res));
export default router;