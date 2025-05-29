import express from 'express';
import fileSystemRoute from './fileSystemRoute'
import workflowRoute from './workflowRoute';
import stageRoute from './stageRoute'
import workflowInstanceRoute from './workflowInstanceRoute';

const router = express.Router();

router.use('/files', fileSystemRoute);
router.use('/workflow', workflowRoute);
router.use('/stages', stageRoute);
router.use('/instances', workflowInstanceRoute)

export default router;