const Handlers = [
    {
        name:"updateStatus",
        systemInputParams: {
            id: "string",
            entityType: "string"
        }
    },
    {
        name:"sendEmail",
        systemInputParams: {
            id: "string",
            entityType: "string"
        }
    },
    {
        name:"spellCheck",
        systemInputParams: {
            id: "string",
            entityType: "string"
        }
    }
]

export default Handlers;