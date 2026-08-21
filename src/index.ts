import express from "express";
import cors, { CorsOptions } from "cors";
import { settings } from "./config/settings";
import router from "./route";
import { setupSwagger } from "./swagger";
import { errorHandler, requestContext } from "./middleware/errorHandler";
import { registerStorageProviders } from "./dao/bootstrap";
import logger from "./utils/logger";

registerStorageProviders();

const app = express();

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Non-browser requests such as curl and Swagger's server-side page load do
    // not send Origin and should continue to work. Browser origins are explicit
    // in production instead of using a wildcard with credentials.
    if (!origin || settings.corsAllowedOrigins.includes("*") || settings.corsAllowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "x-app-id",
    "x-tenant-id",
    "x-user-id",
    "x-user-name",
    "x-roles",
    "idtoken",
    "x-request-id",
  ],
  exposedHeaders: ["x-request-id"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
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
