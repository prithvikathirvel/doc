import express from 'express';
import fileSystemRoute from './fileSystemRoute'
import workflowRoute from './workflowRoute';
import stageRoute from './stageRoute'

const router = express.Router();

router.use('/files', fileSystemRoute);
router.use('/workflow', workflowRoute);
router.use('/stages', stageRoute);

export default router;