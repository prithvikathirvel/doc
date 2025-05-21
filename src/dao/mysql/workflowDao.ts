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
        const user_id = uuidv4();
        const createdAt = moment().format('YYYY-MM-DD HH:mm:ss');
        const updatedAt = createdAt;
        const createdBy = 'admin';
        const updatedBy = createdBy;
        await dbConnection.execute<ResultSetHeader[]>(
            `INSERT INTO workflow (id, isActive, name, user_id, stages, createdAt, createdBy, updatedAt, updatedBy ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, true, workflowData.name, user_id, workflowData.stages, createdAt, createdBy, updatedAt, updatedBy, ]
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
        const [rows] = await dbConnection.execute<RowDataPacket[]>('SELECT * FROM workflow WHERE id = ?', [workflowId]);
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
        const updatedAt = moment().format('YYYY-MM-DD HH:mm:ss');
        console.log('updatedAt',updatedAt)
        let setClause = Object.keys(updatedData).map(key => `${key} = ?`).join(', ');
        setClause = setClause.concat(', updatedAt = ?')
        console.log('setCaluse is',setClause)
        const values = Object.values(updatedData);  
        values.push(updatedAt)
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
        const id = uuidv4();
        const user_id = uuidv4();
        const createdAt = moment().format('YYYY-MM-DD HH:mm:ss');
        const createdBy = 'admin';
        const updatedAt = createdAt;
        const updatedBy = createdBy;
        await dbConnection.execute<ResultSetHeader[]>(
            `INSERT INTO stages (id, name, isActive, user_id, createdAt, createdBy, updatedAt, updatedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, stageData.name, stageData.isActive, user_id, createdAt, createdBy, updatedAt, updatedBy]
        );
    }

    async getAllStages(): Promise<any> {
        logger.info('WorkflowRepository --> getAllStages');
        const [rows]  = await dbConnection.execute<ResultSetHeader[]>('SELECT * FROM stages');
        console.log('rows are what',rows)
        return rows;
    }
    async getStageById(stageId: string): Promise<any> {
        logger.info('WorkflowRepository --> getStageById --> stageId', stageId);
        AuditLogger.logAction('getStageById', { stageId });
        const [rows] =  await dbConnection.execute<ResultSetHeader[]>(`SELECT * FROM stages WHERE id = ?`, [stageId])
        console.log('rows of stages are',rows)
        return rows.length !==0 ? rows : null;
    }

    async findStageDuplicatName(stageId: string, stageName: any): Promise<boolean> {
        logger.info('WorkflowRepository --> findStageDuplicatName --> stageData', stageName);
        AuditLogger.logAction('findStageDuplicatName', { stageId, stageName });
        console.log('stage is passed is',stageId)
        console.log('updated data is',stageName)
        const [rows] = await dbConnection.execute<RowDataPacket[]>(
            `SELECT * FROM stages WHERE name = ? AND id != ?`,
            [stageName, stageId]
        );
        console.log('rowwwwssss ',rows)
        if(rows.length === 0 ) {
            return false;
        }
        return true;
    }

    async updateStageById(stageId: string, updatedData: any): Promise<any> {
        logger.info('WorkflowRepository --> updateStageById --> stageId', stageId);
        AuditLogger.logAction('updateStageById', { stageId,...updatedData});
        const updatedAt = moment().format('YYYY-MM-DD HH:mm:ss');
        let setClause = Object.keys(updatedData).map(key => `${key} = ?`).join(', ');
        setClause = setClause.concat(', updatedAt = ?')
        const values = Object.values(updatedData); 
        console.log('setCalus eis',setClause)
        values.push(updatedAt)
        values.push(stageId);
        console.log('values are',values) 
        console.log('stageId:', `"${stageId}"`);
        const result = await dbConnection.execute<RowDataPacket[]>(`UPDATE stages SET ${setClause} WHERE id = ?`, values)
        console.log('affeced rows are',result)
    }

    async activateStage(stageId: string, status: boolean): Promise<any> {
        logger.info('WorkflowRepository --> activateStage --> stageId', stageId);
        AuditLogger.logAction('activateStage', { stageId});
        await dbConnection.execute<ResultSetHeader[]>(`UPDATE stages SET isActive = ? WHERE id = ?`, [status, stageId])
    }
}