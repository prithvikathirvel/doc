import express from 'express';
import { createStage, getAllStages, getStageById, updateStageById, activateStage, deleteStage } from '../controller/express/workflowController';

const router = express.Router();

//Stage API's
router.post('/', (req,res)=> createStage(req, res)); 
router.get('/', (req, res)=> getAllStages(req,res));
router.get('/:stageId', (req, res)=> getStageById(req,res));
router.put('/:stageId', (req, res)=> updateStageById(req,res));
router.patch('/:stageId', (req,res)=> activateStage(req, res));
router.delete('/:stageId', (req, res)=>deleteStage(req,res));

export default router;