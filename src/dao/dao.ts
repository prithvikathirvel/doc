

class Dao {
}

export interface WorkflowRepository {
    createWorkflow(workflowData: any, userDetails: any): Promise<any>;
    getAllWorkflows(): Promise<any>;
    getWorkflowById(workflowId: string): Promise<any>;
}

export default Dao;