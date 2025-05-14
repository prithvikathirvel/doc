import express from 'express';
import fileSystemRoute from './fileSystemRoute'
import workflowRoute from './workflowRoute';

const router = express.Router();

router.use('/files', fileSystemRoute);
router.use('/workflow', workflowRoute);

export default router;