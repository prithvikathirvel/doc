import logger from './logger';

export class AuditLogger {
    static logAction(action: string, details: any) {
        logger.info({ action, details, timestamp: new Date().toISOString() });
    }
}
