import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true }));

const hasClerkCredentials = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY,
);

if (hasClerkCredentials) {
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
    })),
  );
} else if (process.env.NODE_ENV !== "production") {
  // Development previews remain usable without Clerk credentials. This identity
  // is never installed in production and keeps protected local routes testable.
  app.use((req, _res, next) => {
    const requestWithAuth = req as typeof req & {
      auth: () => { userId: string; sessionClaims: { userId: string } };
    };
    requestWithAuth.auth = () =>
      ({
        userId: "mock-student",
        sessionClaims: { userId: "mock-student" },
      });
    next();
  });
}

app.use("/api", router);

export default app;
