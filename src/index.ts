import express from "express";
import fileSystemRoutes from "./route/fileSystemRoute.js";

const app = express();
const PORT = 3000;

app.use(express.json());
app.use("/files", fileSystemRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
