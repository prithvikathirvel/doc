import { dbConnection } from '../../dbConnection/mysql';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import logger from '../../utils/logger';
import { AuditLogger } from '../../utils/audit';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { WorkflowRepository as MYSQLWorkflowRepository } from '../dao';

export class WorkflowRepository implements MYSQLWorkflowRepository{
    
    async createWorkflow(workflowData: any, userDetails: any): Promise<void> {

        logger.info('WorkflowRepository --> createWorkflow' , workflowData);
        AuditLogger.logAction('createWorkflow', { workflowData });
        const id = uuidv4();
        const user_id = userDetails.userId;
        const createdAt = moment().format('YYYY-MM-DD HH:mm:ss');
        const updatedAt = createdAt;
        const createdBy = userDetails.userName;
        const updatedBy = createdBy;

        await dbConnection.execute<ResultSetHeader[]>(
            `INSERT INTO workflow (id, isActive, name, description, user_id, stages, createdAt, createdBy, updatedAt, updatedBy ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, workflowData.isActive, workflowData.name, workflowData.description, user_id, workflowData.stages, createdAt, createdBy, updatedAt, updatedBy, ]
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
        if(rows.length === 1) {
            return rows[0];
        } else {
            return null
        }
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

    async updateWorkflowById(workflowId: string, updatedData: any, userDetails: any): Promise<any> {
        logger.info('WorkflowRepository --> updateWorkflowById --> id', workflowId);
        AuditLogger.logAction('updateWorkflowById', { workflowId,...updatedData});
        const updatedAt = moment().format('YYYY-MM-DD HH:mm:ss');
        let setClause = Object.keys(updatedData).map(key => `${key} = ?`).join(', ');

        setClause = setClause.concat(', updatedAt = ?, updatedBy = ?')
        const values = Object.values(updatedData);  
        values.push(updatedAt);
        values.push(userDetails.userName);
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

    async createStage(stageData: any, userDetails: any): Promise<void> {
        logger.info('WorkflowRepository --> createStage --> stageData', stageData);
        AuditLogger.logAction('createStage', { stageData });
        const id = uuidv4();
        const user_id = userDetails.userId;
        const createdAt = moment().format('YYYY-MM-DD HH:mm:ss');
        const createdBy = userDetails.userName;
        const updatedAt = createdAt;
        const updatedBy = createdBy;
        console.log('stageData',stageData);
        await dbConnection.execute<ResultSetHeader[]>(
            `INSERT INTO stages (id, name, isActive, user_id, createdAt, createdBy, updatedAt, updatedBy, displayName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, stageData.name, stageData.isActive, user_id, createdAt, createdBy, updatedAt, updatedBy, stageData?.displayName,]
        );
    }

    async getAllStages(): Promise<any> {
        logger.info('WorkflowRepository --> getAllStages');
        const [rows]  = await dbConnection.execute<any[]>('SELECT * FROM stages');
        if (rows.length > 0) {
            const modifiedRows = rows.map((row) => {
                return { ...row, isActive: Boolean(row.isActive) };
            });
            return modifiedRows;
        } else {
            return [];
        }
    }
    
    async getStageById(stageId: string): Promise<any> {
        logger.info('WorkflowRepository --> getStageById --> stageId', stageId);
        AuditLogger.logAction('getStageById', { stageId });
        const [rows] =  await dbConnection.execute<any[]>(`SELECT * FROM stages WHERE id = ?`, [stageId])
        if (rows.length > 0) {
            const modifiedRows = rows.map((row) => {
                return { ...row, isActive: Boolean(row.isActive) };
            });
            return modifiedRows;
        } else {
            return null;
        }
    }

    async findStageDuplicatName(stageId: string, stageName: any): Promise<boolean> {
        logger.info('WorkflowRepository --> findStageDuplicatName --> stageData', stageName);
        AuditLogger.logAction('findStageDuplicatName', { stageId, stageName });
        const [rows] = await dbConnection.execute<RowDataPacket[]>(
            `SELECT * FROM stages WHERE name = ? AND id != ?`,
            [stageName, stageId]
        );
        if(rows.length === 0 ) {
            return false;
        }
        return true;
    }

    async updateStageById(stageId: string, updatedData: any, userDetails: any): Promise<any> {
        logger.info('WorkflowRepository --> updateStageById --> stageId', stageId);
        AuditLogger.logAction('updateStageById', { stageId,...updatedData});
        const updatedBy = userDetails?.userName
        const updatedAt = moment().format('YYYY-MM-DD HH:mm:ss');
        let setClause = Object.keys(updatedData).map(key => `${key} = ?`).join(', ');
        setClause = setClause.concat(', updatedBy = ?, updatedAt = ?')
        const values = Object.values(updatedData); 
        values.push(updatedBy);
        values.push(updatedAt);
        values.push(stageId);
        await dbConnection.execute<RowDataPacket[]>(`UPDATE stages SET ${setClause} WHERE id = ?`, values)
    }

    async activateStage(stageId: string, status: boolean): Promise<any> {
        logger.info('WorkflowRepository --> activateStage --> stageId', stageId);
        AuditLogger.logAction('activateStage', { stageId});
        await dbConnection.execute<ResultSetHeader[]>(`UPDATE stages SET isActive = ? WHERE id = ?`, [status, stageId])
    }

    async deleteStage(stageId: string): Promise<any> {
        logger.info('WorkflowRepository --> activateStage --> stageId', stageId);
        AuditLogger.logAction('activateStage', {stageId});
        await dbConnection.execute<ResultSetHeader[]>(`DELETE from stages WHERE id = ?`, [stageId])
    }
    //
    async getAssetDataByTypeAndId(id: string, type: string): Promise<any> {
        logger.info('WorkflowRepository --> getAssetDataByTypeAndId --> id', id);
        AuditLogger.logAction('getAssetDataByTypeAndId', { id});
        const [rows] = await dbConnection.execute<RowDataPacket[]>(
            `SELECT * FROM ${type} WHERE id = ?`,
            [id]
        );
        if(rows.length === 0 ) {
            return false;
        }
        return rows;
    }

    async addWorkflowInstance(data: any, userDetails: any): Promise<any> {
        logger.info('WorkflowRepository --> addWorkflowInstance --> data', data);
        AuditLogger.logAction('addWorkflowInstance', { data});
        const id = uuidv4();
        const query = `INSERT INTO workflow_instances (id, workflow_id, workflow_name, current_stage, status, possible_actions,current_allowed_roles, current_allowed_users, asset_id, asset_type,
        requested_by, user_id, history, created_at, requestedData) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const params = [id,data.workflowId,data.workflowName,data.currentStage,data.status,JSON.stringify(data.possibleActions),JSON.stringify(data.currentAllowedRoles),
        JSON.stringify(data.currentAllowedUsers),data.assetId,data.assetType, data.requestedBy, userDetails.userId,JSON.stringify(data.history),data.createdAt, data.requestedData];
        await dbConnection.execute<RowDataPacket[]>(query, params);
        return { id, ...data };
    }

    async updateSuggestedAssetData(type: string, id: string, updatedData: any): Promise<void> {
        logger.info('WorkflowRepository --> updateSuggestedAssetData --> updatedData', updatedData);
        updatedData[0].requestedBy = 'admin'
        AuditLogger.logAction('updateSuggestedAssetData', { updatedData});
        const data = JSON.stringify(updatedData[0]);
        const values = [data, id];
        await dbConnection.execute<RowDataPacket[]>(`UPDATE ${type} SET workflowRequests  = ? WHERE id = ?`, values);
    }

    async getWorkflowInstanceById(workflowInstanceId: string): Promise<any> {
        logger.info('WorkflowRepository --> getWorkflowInstanceById --> workflowInstanceId', workflowInstanceId);
        const [rows] = await dbConnection.execute<RowDataPacket[]>('SELECT * FROM workflow_instances WHERE id = ?', [workflowInstanceId]);
        if(rows.length === 0) {
            return null;
        } 
        return rows;
    }

    async getUserDetails(userId: string): Promise<any> {  
        logger.info('WorkflowRepository --> getRoleByUserId --> userId', userId);
        AuditLogger.logAction('getRoleByUserId', { userId});
        const [result] = await dbConnection.execute<RowDataPacket[]>(`SELECT * FROM users WHERE id = ?`, [userId])
        if(result.length === 0) {
            return null;
        }
        return result[0];
    }   

    async updateUserLeaveBalance(userId: string, newBalance: any): Promise<any> {
        logger.info('WorkflowRepository --> updateUserLeaveBalance --> userId', userId);
        AuditLogger.logAction('updateUserLeaveBalance', { userId});
        const [result] = await dbConnection.execute(`UPDATE users SET leaveBalance = ? WHERE id = ?`,[newBalance, userId]);
        if ((result as any).affectedRows === 0) {
            throw new Error(`Failed to update leave balance for user ${userId}`);
        }
        return true;
    }

    async getAllWorkflowInstanceByUser(role: string, userId:any): Promise<any> {
        logger.info('WorkflowRepository --> getAllWorkflowInstanceByUser --> userId', userId);
        AuditLogger.logAction('getAllWorkflowInstanceByUser', { role, userId});
        const sql = `SELECT *, id AS id FROM workflow_instances WHERE JSON_CONTAINS(current_allowed_roles, JSON_QUOTE(?)) OR JSON_CONTAINS(current_allowed_users, JSON_QUOTE(?));`;
        const [rows] =  await dbConnection.execute<RowDataPacket[]>(sql, [role, userId]);
        return rows;
    }

    async updateWorkflowInstanceById(id: string, updatedData: any): Promise<any> {
        logger.info('WorkflowRepository --> updateWorkflowInstanceById --> id', id);
        AuditLogger.logAction('updateWorkflowInstanceById', { id, updatedData});
        let setClause = Object.keys(updatedData[0]).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updatedData[0]); 
        values.push(id);
        const [rows] = await dbConnection.execute<RowDataPacket[]>(`UPDATE workflow_instances SET ${setClause} WHERE id = ?`, values);
    }

    async updateAssetData(type: string, id: string, updatedData: any): Promise<void> {
        logger.info('WorkflowRepository --> updateAssetData --> id', id);
        AuditLogger.logAction('updateAssetData', { id, updatedData});
        let setClause = Object.keys(updatedData).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updatedData); 
        values.push(id);
        await dbConnection.execute<RowDataPacket[]>(`UPDATE ${type} SET ${setClause} WHERE id = ?`, values);
    }

    // async getWorkflowInstanceByDocId(id: any) {
    //     logger.info('WorkflowRepository --> updateAssetData --> id', id);
    //     AuditLogger.logAction('updateAssetData', { id});
    //     const sql = `SELECT * FROM workflow_instances WHERE asset_id = ?`;
    //     const [rows] =  await dbConnection.execute<RowDataPacket[]>(sql, [id]);
    //     return (rows.length > 0) ? rows[0] : {} 
    // }

    async updateFieldHandlerWorkflow(userId: string, entity: any, field: any, data: any) {
        logger.info('WorkflowRepository --> updateFieldHandlerWorkflow --> entity',entity);
        AuditLogger.logAction('updateFieldHandlerWorkflow', {entity, field});
        const [rows] = await dbConnection.execute<RowDataPacket[]>('SELECT * FROM users WHERE id = ?', [userId]);
        data = Number(data);
        data = rows[0]?.leaveBalance - data
        await dbConnection.execute<RowDataPacket[]>(`UPDATE ${entity} SET ${field} = ? WHERE id = ?`, [data, userId]);
    }
}