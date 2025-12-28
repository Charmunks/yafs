import "dotenv/config";
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
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

nunjucks.configure(path.join(__dirname, "views"), {
  autoescape: true,
  express: app,
  watch: true
});

app.set("view engine", "njk");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    store: new PgSession({
      conObject: {
        connectionString: process.env.DATABASE_URL
      },
      tableName: "session"
    }),
    secret: process.env.SESSION_SECRET || "change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production"
    }
  })
);

app.use(async (req, res, next) => {
  res.locals.user = req.session.userId
    ? { id: req.session.userId, username: req.session.username }
    : null;

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
