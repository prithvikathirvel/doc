import { dbConnection } from '../../dbConnection/mysql';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import logger from '../../utils/logger';
import { AuditLogger } from '../../utils/audit';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { WorkflowRepository as MYSQLWorkflowRepository } from '../dao';

export class WorkflowRepository implements MYSQLWorkflowRepository{
    
    async createWorkflow(workflowData: any): Promise<void> {
        logger.info('WorkflowRepository --> createWorkflow' , workflowData);
        AuditLogger.logAction('createWorkflow', { workflowData });
        const id = uuidv4();
        const createdAt = moment().format('YYYY-MM-DD HH:mm:ss');
        const updatedAt = createdAt;
        const createdBy = workflowData.user;
        const updatedBy = createdBy;
        await dbConnection.execute<ResultSetHeader[]>(
            `INSERT INTO workflow (id, isActive, name, user_id, stages, createdAt, createdBy, updatedAt, updatedBy ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, true, workflowData.name, workflowData.user_id, workflowData.stages, createdAt, createdBy, updatedAt, updatedBy, ]
        );
    }

    async findWorkflowByName(workflowName: string): Promise<boolean> {
        logger.info('WorkflowRepository --> findWorkflowByName --> workflowName', workflowName);
        const [rows] = await dbConnection.execute<RowDataPacket[]>(
            'SELECT * FROM workflow WHERE NAME = ?',
            [workflowName]
        );
        if(rows.length === 0 ) {
            return false;
        }
        return true;
    }

    async getAllWorkflows(): Promise<any> {
        logger.info('WorkflowRepository --> getAllWorkflows');
        const [rows] = await dbConnection.execute<RowDataPacket[]>('SELECT * FROM workflow ORDER BY createdAt desc', []);
        return rows;
    }

    async getWorkflowById(workflowId: string): Promise<any> {
        logger.info('WorkflowRepository --> getAllWorkflows');
        const [rows] = await dbConnection.execute<RowDataPacket[]>('SELECT * FROM workflow where id = ?', [workflowId]);
        return rows;
    }

    async findWorkflowDuplicateName(workflowId: string, workflowName: string): Promise<boolean> {
        logger.info('WorkflowRepository --> findWorkflowByName --> workflowName', workflowName);
        const [rows] = await dbConnection.execute<RowDataPacket[]>(
            `SELECT * FROM workflow WHERE name = ? AND id != ?`,
            [workflowName, workflowId]
        );
        if(rows.length === 0 ) {
            return false;
        }
        return true;
    }

    async updateWorkflowById(workflowId: string, updatedData: any): Promise<any> {
        logger.info('WorkflowRepository --> updateWorkflowById --> id', workflowId);
        AuditLogger.logAction('updateWorkflowById', { workflowId,...updatedData});
        const [rows] = await dbConnection.execute('SELECT createdAt FROM workflow WHERE id = ?', [workflowId]);
        const workflow = (rows as any[])[0];
        updatedData.createdAt = moment(workflow.createdAt).format('YYYY-MM-DD HH:mm:ss');
        if (updatedData.updatedAt) {
            updatedData.updatedAt = moment().format('YYYY-MM-DD HH:mm:ss');
        }
        const setClause = Object.keys(updatedData).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updatedData);  
        values.push(workflowId);
        await dbConnection.execute<RowDataPacket[]>(`UPDATE workflow SET ${setClause} WHERE id = ?`, values)
    }

    async activateWorkflow(workflowId: string, status: boolean): Promise<any> {
        logger.info('WorkflowRepository --> activateWorkflow --> workflowId', workflowId);
        AuditLogger.logAction('activateWorkflow', { workflowId});
        await dbConnection.execute<ResultSetHeader[]>(`UPDATE workflow SET isActive = ? WHERE id = ?`, [status, workflowId])
    }

    //Stage DAO
    async findStageByName(stageName: string): Promise<boolean> {
        logger.info('WorkflowRepository --> findStageByName --> stageName', stageName);
        AuditLogger.logAction('findStageByName', { stageName });
        const [rows] = await dbConnection.execute<RowDataPacket[]>(`SELECT * FROM stages WHERE name = ?`, [stageName]);
        if(rows.length === 0) {
            return false;
        }
        return true;
    }

    async createStage(stageData: any): Promise<void> {
        logger.info('WorkflowRepository --> createStage --> stageData', stageData);
        AuditLogger.logAction('createStage', { stageData });
        const createdAt = moment().format('YYYY-MM-DD HH:mm:ss');
        await dbConnection.execute<ResultSetHeader[]>(
            `INSERT INTO stages (user_id, isActive, name, createdAt, createdBy) VALUES (?, ?, ?, ?, ?)`,
            [stageData.id, true, stageData.name, createdAt, stageData.user]
        );
    }

    async getAllStages(): Promise<any> {
        logger.info('WorkflowRepository --> getAllStages');
        const [rows]  = await dbConnection.execute<ResultSetHeader[]>('SELECT * FROM stages');
        return rows;
    }
    async getStageById(stageId: string): Promise<any> {
        logger.info('WorkflowRepository --> getStageById --> stageId', stageId);
        AuditLogger.logAction('getStageById', { stageId });
        const [rows] =  await dbConnection.execute<ResultSetHeader[]>(`SELECT * FROM stages WHERE id = ?`, [stageId])
        return rows.length !==0 ? rows : null;
    }

    async findStageDuplicatName(stageId: string, updatedData: any): Promise<boolean> {
        logger.info('WorkflowRepository --> findStageDuplicatName --> stageData', updatedData);
        AuditLogger.logAction('findStageDuplicatName', { stageId, updatedData });
        const [rows] = await dbConnection.execute<RowDataPacket[]>(
            `SELECT * FROM workflow WHERE name = ? AND id != ?`,
            [updatedData.name, stageId]
        );
        if(rows.length === 0 ) {
            return false;
        }
        return true;
    }

    async updateStageById(stageId: string, updatedData: any): Promise<any> {
        logger.info('WorkflowRepository --> updateStageById --> stageId', stageId);
        AuditLogger.logAction('updateStageById', { stageId,...updatedData});
        const [rows] = await dbConnection.execute('SELECT createdAt FROM stages WHERE id = ?', [stageId]);
        const stage = (rows as any[])[0];
        updatedData.createdAt = moment(stage.createdAt).format('YYYY-MM-DD HH:mm:ss');
        if (updatedData.updatedAt) {
            updatedData.updatedAt = moment().format('YYYY-MM-DD HH:mm:ss');
        }
        const setClause = Object.keys(updatedData).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updatedData);  
        values.push(stageId);
        await dbConnection.execute<RowDataPacket[]>(`UPDATE workflow SET ${setClause} WHERE id = ?`, values)
    }

    async activateStage(stageId: string, status: boolean): Promise<any> {
        logger.info('WorkflowRepository --> activateStage --> stageId', stageId);
        AuditLogger.logAction('activateStage', { stageId});
        await dbConnection.execute<ResultSetHeader[]>(`UPDATE stage SET isActive = ? WHERE id = ?`, [status, stageId])
    }
}