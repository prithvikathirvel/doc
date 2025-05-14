

class Dao {
}

export interface WorkflowRepository {
    createWorkflow(data: any): Promise<any>;
    getAllWorkflows(): Promise<any>;
    getWorkflowById(workflowId: string): Promise<any>;
}

export default Dao;