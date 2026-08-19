import express from "express";
import cors from 'cors';
import router from './route/index'
import dotenv from 'dotenv';
import { setupSwagger } from './swagger';


dotenv.config();

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use("/api", router);

setupSwagger(app);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);
});
