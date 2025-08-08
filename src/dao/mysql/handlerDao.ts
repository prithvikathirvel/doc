import logger from "../../utils/logger";
import { AuditLogger } from "../../utils/audit";
import { dbConnection } from "../../dbConnection/mysql";
import { ResultSetHeader, RowDataPacket } from "mysql2";

export class HandlerRepository {
  async updateStatus(inputParams: any): Promise<any> {
    const { entityType, id, status } = inputParams;
    logger.info(
      "HandlerRepository --> spellCheck --> inputParams", inputParams
    );
    try {
      const [rows] = await dbConnection.query<RowDataPacket[]>(
        `SELECT * from ${entityType} WHERE id = ?`,
        [id]
      );
      const fileName = rows[0]?.fileName;
      const workflowRequest = rows[0]?.workflowRequests;
      const newWorkflowRequest = JSON.stringify({ ...workflowRequest, status });
      const query = `
        UPDATE ${entityType}
        SET workflowRequests = ?
        WHERE id = ?;
      `;
      await dbConnection.query(query, [newWorkflowRequest, id]);
      return {
        message: `Status updated for the ${entityType} - ${fileName}`,
      };
    } catch (error) {
      logger.error("HandlerRepository.updateStatus error:", error);
      throw error;
    }
  }

  async sendEmail(params: any): Promise<any> {
    const { entityType, id, to, cc, subject, body } = params;
    try {
      logger.info(
      "HandlerRepository --> spellCheck --> inputParams", params
    );
      const [rows] = await dbConnection.query<RowDataPacket[]>(
        `SELECT * from ${entityType} WHERE id = ?`,
        [id]
      );
      const fileName = rows[0]?.fileName;
      return {
        message: `Email Successfully sent for the ${entityType} ${fileName} to ${to} with subject ${subject}`,
      };
    } catch (error) {
      logger.error("HandlerRepository.sendEmail error:", error);
      throw error;
    }
  }

  async spellCheck(params: any): Promise<any> {
    const { entityType, id, text } = params;
    try {
      logger.info(
      "HandlerRepository --> spellCheck"
    );
      const mistakes: string[] = [];
      return {
        message: `Spell Check executed ${text}`
      };
    } catch (error) {
      logger.error("HandlerRepository.spellCheck error:", error);
      throw error;
    }
  }

  async getAllHandlers(): Promise<any> {
    try {
      logger.info(
      "HandlerRepository --> getAllHandlers"
    );
    
    } catch (error) {
      logger.error("HandlerRepository.spellCheck error:", error);
      throw error;
    }
  }
}
