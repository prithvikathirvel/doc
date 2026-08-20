import express from "express";
import cors from "cors";
import { settings } from "./config/settings";
import router from "./route";
import { setupSwagger } from "./swagger";
import { errorHandler, requestContext } from "./middleware/errorHandler";
import { registerStorageProviders } from "./dao/bootstrap";
import logger from "./utils/logger";

registerStorageProviders();

const app = express();
app.use(cors({ exposedHeaders: ["x-request-id"] }));
app.use(requestContext);
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
