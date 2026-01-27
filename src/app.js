import "dotenv/config";
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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

app.set("trust proxy", 1);

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable must be set");
}

const nunjucksEnv = nunjucks.configure(path.join(__dirname, "views"), {
  autoescape: true,
  express: app,
  watch: true
});

nunjucksEnv.addFilter("date", (value) => {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
});

app.set("view engine", "njk");

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.static(path.join(__dirname, "public")));

const limiter = rateLimit({
  windowMs: 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/files/thumb/') || req.path.startsWith('/files/view/')
});
app.use(limiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.use(async (req, res, next) => {
  res.locals.user = req.session.userId
    ? { id: req.session.userId, username: req.session.username, isAdmin: req.session.isAdmin }
    : null;

  res.locals.baseUrl = `${req.protocol}://${req.get("host")}`;

  try {
    const siteTitleSetting = await db("settings").where({ key: "site_title" }).first();
    res.locals.siteTitle = siteTitleSetting?.value || "YAFS";

    const footerSetting = await db("settings").where({ key: "footer_enabled" }).first();
    res.locals.footerEnabled = footerSetting?.value !== "false";
  } catch {
    res.locals.siteTitle = "YAFS";
    res.locals.footerEnabled = true;
  }

  next();
});

app.use("/", indexRoutes);
app.use("/auth", authRoutes);
app.use("/api", apiRoutes);
app.use("/settings", settingsRoutes);
app.use("/files", filesRoutes);

app.use((req, res) => {
  res.status(404).render("errors/404");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
