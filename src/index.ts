import express from "express";
import cors from 'cors';
import fileSystemRoutes from "./route/fileSystemRoute.js";

const app = express();
app.use(cors());
const PORT = 5000;

app.use(express.json());
app.use("/files", fileSystemRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
