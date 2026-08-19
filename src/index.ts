import express from "express";
import cors from "cors";
import { settings } from "./config/settings";
import router from "./api/routes";
import { setupSwagger } from "./api/swagger";
import { errorHandler } from "./api/middleware/errorHandler";
import { registerStorageProviders } from "./infrastructure/storage/bootstrap";
import logger from "./infrastructure/observability/logger";

registerStorageProviders();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/api", router);
setupSwagger(app);
app.use(errorHandler);

if (require.main === module) {
  app.listen(settings.port, settings.host, () => {
    logger.info("dms_started", {
      port: settings.port,
      host: settings.host,
    });
  });
}

export default app;
