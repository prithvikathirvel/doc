export const handlerFunctionSpecifications = {
  leaveBalanceReducer: {
    name: "leaveBalanceReducer",
    inputParams: {
      leaveDays: {
        label: "Leave Days",
        type: "number",
        required: true,
         source: 'initiator'
      },
    leaveReason: {
        label: "Reason",
        type: "text",
        required: true,
        source: "initiator"
      }}
  },
  amountBalanceReducer: {
    name: "amountBalanceReducer",
    inputParams: {
      amount: {
        label: "Amount to Deduct",
        type: "number",
        required: true,
        source: 'user'
      }
    }
  },
  documentRejectionHandler: {
    name: "documentRejectionHandler",
    inputParams: {
      rejectionReason: {
        label: "Reason for Rejection",
        type: "string",
        required: true,
        source: 'user'
      }
    }
  },
  documentUploadHandler: {
    name:"documentUploadHandler",
    inputParams: {
      document: {
        type: "file",
        label: "Upload Revised Document",
        required: true,
        source: "user"
      }
    }
  }
} as const;
