import express from "express";
import cors from 'cors';
import router from './route/index'

const app = express();
app.use(cors());
const PORT = 5000;

app.use(express.json());
app.use("/", router);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
