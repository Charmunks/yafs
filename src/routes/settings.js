import express from "express";
import os from "os";
import path from "path";
import fs from "fs/promises";
import db from "../db/index.js";

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/auth/login");
  }
  if (!req.session.isAdmin) {
    return res.status(403).render("errors/403");
  }
  next();
}

router.use(requireAdmin);

router.get("/", async (req, res) => {
  try {
    const registrationModeSetting = await db("settings")
      .where({ key: "registration_mode" })
      .first();

    const registrationKeySetting = await db("settings")
      .where({ key: "registration_key" })
      .first();

    const registrationDisabledMessageSetting = await db("settings")
      .where({ key: "registration_disabled_message" })
      .first();

    const storagePathSetting = await db("settings")
      .where({ key: "storage_path" })
      .first();

    const markdownSanitizationSetting = await db("settings")
      .where({ key: "markdown_sanitization_enabled" })
      .first();

    const siteTitleSetting = await db("settings")
      .where({ key: "site_title" })
      .first();

    const footerSetting = await db("settings")
      .where({ key: "footer_enabled" })
      .first();

    const defaultStoragePath = path.join(os.homedir(), "files");

    res.render("settings/index", {
      title: "Settings",
      registrationMode: registrationModeSetting?.value || "disabled",
      registrationKey: registrationKeySetting?.value || "",
      registrationDisabledMessage: registrationDisabledMessageSetting?.value || "",
      storagePath: storagePathSetting?.value || defaultStoragePath,
      markdownSanitizationEnabled: markdownSanitizationSetting?.value !== "false",
      pageTitleSetting: siteTitleSetting?.value || "",
      footerEnabled: footerSetting?.value !== "false"
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
  const { registrationMode, registrationKey, registrationDisabledMessage } = req.body;
  const validModes = ["open", "key", "disabled"];
  const mode = validModes.includes(registrationMode) ? registrationMode : "disabled";

  try {
    const settingsToUpdate = [
      { key: "registration_mode", value: mode },
      { key: "registration_key", value: (registrationKey || "").slice(0, 100) },
      { key: "registration_disabled_message", value: (registrationDisabledMessage || "").slice(0, 500) }
    ];

    for (const setting of settingsToUpdate) {
      const existing = await db("settings").where({ key: setting.key }).first();
      if (existing) {
        await db("settings")
          .where({ key: setting.key })
          .update({ value: setting.value, updated_at: db.fn.now() });
      } else {
        await db("settings").insert({ key: setting.key, value: setting.value });
      }
    }

    res.redirect("/settings");
  } catch (err) {
    console.error("Update registration setting error:", err);
    res.redirect("/settings");
  }
});

router.post("/storage", async (req, res) => {
  const storagePath = req.body.storagePath?.trim();

  if (!storagePath || storagePath.length > 500) {
    return res.redirect("/settings");
  }

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

router.post("/markdown-sanitization", async (req, res) => {
  const { enabled } = req.body;
  const newValue = enabled === "on" ? "true" : "false";

  try {
    const existing = await db("settings").where({ key: "markdown_sanitization_enabled" }).first();

    if (existing) {
      await db("settings")
        .where({ key: "markdown_sanitization_enabled" })
        .update({ value: newValue, updated_at: db.fn.now() });
    } else {
      await db("settings").insert({ key: "markdown_sanitization_enabled", value: newValue });
    }

    res.redirect("/settings");
  } catch (err) {
    console.error("Update markdown sanitization setting error:", err);
    res.redirect("/settings");
  }
});

router.post("/site-title", async (req, res) => {
  const siteTitle = (req.body.siteTitle || "").slice(0, 100);

  try {
    const existing = await db("settings").where({ key: "site_title" }).first();

    if (existing) {
      await db("settings")
        .where({ key: "site_title" })
        .update({ value: siteTitle, updated_at: db.fn.now() });
    } else {
      await db("settings").insert({ key: "site_title", value: siteTitle });
    }

    res.redirect("/settings");
  } catch (err) {
    console.error("Update site title error:", err);
    res.redirect("/settings");
  }
});

router.post("/footer", async (req, res) => {
  const { enabled } = req.body;
  const newValue = enabled === "on" ? "true" : "false";

  try {
    const existing = await db("settings").where({ key: "footer_enabled" }).first();

    if (existing) {
      await db("settings")
        .where({ key: "footer_enabled" })
        .update({ value: newValue, updated_at: db.fn.now() });
    } else {
      await db("settings").insert({ key: "footer_enabled", value: newValue });
    }

    res.redirect("/settings");
  } catch (err) {
    console.error("Update footer setting error:", err);
    res.redirect("/settings");
  }
});

router.get("/users", async (req, res) => {
  try {
    const users = await db("users")
      .select("id", "username", "is_admin", "created_at")
      .orderBy("created_at", "desc");

    res.render("settings/users", {
      title: "User Management",
      users
    });
  } catch (err) {
    console.error("User management error:", err);
    res.render("settings/users", {
      title: "User Management",
      error: "Failed to load users",
      users: []
    });
  }
});

router.post("/users/:id/toggle-admin", async (req, res) => {
  const userId = parseInt(req.params.id);

  if (userId === req.session.userId) {
    return res.redirect("/settings/users");
  }

  try {
    const user = await db("users").where({ id: userId }).first();
    if (user) {
      await db("users")
        .where({ id: userId })
        .update({ is_admin: !user.is_admin, updated_at: db.fn.now() });
    }
    res.redirect("/settings/users");
  } catch (err) {
    console.error("Toggle admin error:", err);
    res.redirect("/settings/users");
  }
});

router.post("/users/:id/delete", async (req, res) => {
  const userId = parseInt(req.params.id);

  if (userId === req.session.userId) {
    return res.redirect("/settings/users");
  }

  try {
    await db("files").where({ ownerId: userId }).del();
    await db("users").where({ id: userId }).del();
    res.redirect("/settings/users");
  } catch (err) {
    console.error("Delete user error:", err);
    res.redirect("/settings/users");
  }
});

router.get("/files", async (req, res) => {
  try {
    const files = await db("files")
      .select("files.*", "users.username as ownerUsername")
      .leftJoin("users", "files.ownerId", "users.id")
      .orderBy("files.created_at", "desc");

    res.render("settings/files", {
      title: "File Management",
      files
    });
  } catch (err) {
    console.error("File management error:", err);
    res.render("settings/files", {
      title: "File Management",
      error: "Failed to load files",
      files: []
    });
  }
});

router.post("/files/:id/toggle-public", async (req, res) => {
  const fileId = parseInt(req.params.id);

  try {
    const file = await db("files").where({ id: fileId }).first();
    if (file) {
      await db("files")
        .where({ id: fileId })
        .update({ is_public: !file.is_public, updated_at: db.fn.now() });
    }
    res.redirect("/settings/files");
  } catch (err) {
    console.error("Toggle public error:", err);
    res.redirect("/settings/files");
  }
});

router.post("/files/:id/delete", async (req, res) => {
  const fileId = parseInt(req.params.id);

  try {
    const file = await db("files").where({ id: fileId }).first();
    if (file) {
      const storagePathSetting = await db("settings").where({ key: "storage_path" }).first();
      const storagePath = storagePathSetting?.value || path.join(os.homedir(), "files");
      const filePath = path.join(storagePath, file.path);

      try {
        await fs.unlink(filePath);
      } catch (unlinkErr) {
        console.error("Failed to delete file from disk:", unlinkErr);
      }

      await db("files").where({ id: fileId }).del();
    }
    res.redirect("/settings/files");
  } catch (err) {
    console.error("Delete file error:", err);
    res.redirect("/settings/files");
  }
});

export default router;
