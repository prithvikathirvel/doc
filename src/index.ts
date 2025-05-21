import express from "express";
import cors from 'cors';
import router from './route/index'
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
const PORT = process.env.PORT;

app.use(express.json());
app.use("/api", router);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
