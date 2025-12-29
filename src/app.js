import "dotenv/config";
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cookieParser from "cookie-parser";
import { doubleCsrf } from "csrf-csrf";
import helmet from "helmet";
import nunjucks from "nunjucks";
import path from "path";
import { fileURLToPath } from "url";

import db from "./db/index.js";
import indexRoutes from "./routes/index.js";
import apiRoutes from "./routes/api.js";
import authRoutes from "./routes/auth.js";
import settingsRoutes from "./routes/settings.js";
import filesRoutes from "./routes/files.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PgSession = connectPgSimple(session);

const app = express();
const PORT = process.env.PORT || 3000;

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable must be set");
}

nunjucks.configure(path.join(__dirname, "views"), {
  autoescape: true,
  express: app,
  watch: true
});

app.set("view engine", "njk");

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    store: new PgSession({
      conObject: {
        connectionString: process.env.DATABASE_URL
      },
      tableName: "session"
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    }
  })
);

const { doubleCsrfProtection, generateToken } = doubleCsrf({
  getSecret: () => SESSION_SECRET,
  cookieName: "__csrf",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  },
  getTokenFromRequest: (req) => req.body._csrf || req.headers["x-csrf-token"]
});

app.use(doubleCsrfProtection);

app.use((req, res, next) => {
  res.locals.csrfToken = generateToken(req, res);
  next();
});

app.use(async (req, res, next) => {
  res.locals.user = req.session.userId
    ? { id: req.session.userId, username: req.session.username }
    : null;

  res.locals.baseUrl = `${req.protocol}://${req.get("host")}`;

  try {
    const siteTitleSetting = await db("settings").where({ key: "site_title" }).first();
    res.locals.siteTitle = siteTitleSetting?.value || "YAFS";
  } catch {
    res.locals.siteTitle = "YAFS";
  }

  next();
});

app.use("/", indexRoutes);
app.use("/auth", authRoutes);
app.use("/api", apiRoutes);
app.use("/settings", settingsRoutes);
app.use("/files", filesRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
