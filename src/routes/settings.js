import express from "express";
import os from "os";
import path from "path";
import db from "../db/index.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/auth/login");
  }
  next();
}

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const registrationSetting = await db("settings")
      .where({ key: "registration_enabled" })
      .first();

    const storagePathSetting = await db("settings")
      .where({ key: "storage_path" })
      .first();

    const defaultStoragePath = path.join(os.homedir(), "files");

    res.render("settings/index", {
      title: "Settings",
      registrationEnabled: registrationSetting?.value === "true",
      storagePath: storagePathSetting?.value || defaultStoragePath
    });
  } catch (err) {
    console.error("Settings error:", err);
    res.render("settings/index", {
      title: "Settings",
      error: "Failed to load settings"
    });
  }
});

router.post("/registration", async (req, res) => {
  const { enabled } = req.body;
  const newValue = enabled === "on" ? "true" : "false";

  try {
    await db("settings")
      .where({ key: "registration_enabled" })
      .update({ value: newValue, updated_at: db.fn.now() });

    res.redirect("/settings");
  } catch (err) {
    console.error("Update registration setting error:", err);
    res.redirect("/settings");
  }
});

router.post("/storage", async (req, res) => {
  const { storagePath } = req.body;

  try {
    const existing = await db("settings").where({ key: "storage_path" }).first();

    if (existing) {
      await db("settings")
        .where({ key: "storage_path" })
        .update({ value: storagePath, updated_at: db.fn.now() });
    } else {
      await db("settings").insert({ key: "storage_path", value: storagePath });
    }

    res.redirect("/settings");
  } catch (err) {
    console.error("Update storage path error:", err);
    res.redirect("/settings");
  }
});

export default router;
