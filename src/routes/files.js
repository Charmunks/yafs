import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { marked } from "marked";
import db from "../db/index.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/auth/login");
  }
  next();
}

async function getStoragePath() {
  const setting = await db("settings").where({ key: "storage_path" }).first();
  return setting?.value || path.join(os.homedir(), "files");
}

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const storagePath = await getStoragePath();
    const userFolder = path.join(storagePath, String(req.session.userId));
    
    fs.mkdirSync(userFolder, { recursive: true });
    cb(null, userFolder);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const customFilename = req.body.customFilename?.trim();
    const name = customFilename || path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ storage });

router.get("/upload", (req, res) => {
  res.render("files/upload", {
    title: "Upload File"
  });
});

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.render("files/upload", {
        title: "Upload File",
        error: "No file selected"
      });
    }

    const folder = req.body.folder || null;
    const isPublic = req.body.isPublic === "true";
    const description = req.body.description?.trim() || null;
    const customFilename = req.body.customFilename?.trim();
    const ext = path.extname(req.file.originalname);
    const displayFilename = customFilename ? `${customFilename}${ext}` : req.file.originalname;

    await db("files").insert({
      filename: displayFilename,
      folder,
      path: req.file.path,
      ownerId: req.session.userId,
      isPublic,
      description
    });

    res.redirect("/");
  } catch (err) {
    console.error("Upload error:", err);
    res.render("files/upload", {
      title: "Upload File",
      error: "Failed to upload file"
    });
  }
});

router.get("/view/:id", async (req, res) => {
  try {
    const file = await db("files").where({ id: req.params.id }).first();

    if (!file) {
      return res.status(404).send("File not found");
    }

    const isOwner = req.session.userId && file.ownerId === req.session.userId;
    if (!file.isPublic && !isOwner) {
      return res.status(403).send("Access denied");
    }

    res.sendFile(file.path);
  } catch (err) {
    console.error("View error:", err);
    res.status(500).send("Failed to view file");
  }
});

router.get("/download/:id", async (req, res) => {
  try {
    const file = await db("files").where({ id: req.params.id }).first();

    if (!file) {
      return res.status(404).send("File not found");
    }

    const isOwner = req.session.userId && file.ownerId === req.session.userId;
    if (!file.isPublic && !isOwner) {
      return res.status(403).send("Access denied");
    }

    res.download(file.path, file.filename);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).send("Failed to download file");
  }
});

router.get("/edit/:id", requireAuth, async (req, res) => {
  try {
    const file = await db("files")
      .where({ id: req.params.id, ownerId: req.session.userId })
      .first();

    if (!file) {
      return res.status(404).send("File not found");
    }

    res.render("files/edit", {
      title: "Edit File",
      file
    });
  } catch (err) {
    console.error("Edit page error:", err);
    res.status(500).send("Failed to load edit page");
  }
});

router.post("/edit/:id", requireAuth, async (req, res) => {
  try {
    const file = await db("files")
      .where({ id: req.params.id, ownerId: req.session.userId })
      .first();

    if (!file) {
      return res.status(404).send("File not found");
    }

    const filename = req.body.filename?.trim();
    if (!filename) {
      return res.render("files/edit", {
        title: "Edit File",
        file,
        error: "Filename is required"
      });
    }

    await db("files").where({ id: req.params.id }).update({
      filename,
      description: req.body.description?.trim() || null,
      folder: req.body.folder?.trim() || null,
      isPublic: req.body.isPublic === "true",
      updated_at: db.fn.now()
    });

    const updatedFile = await db("files").where({ id: req.params.id }).first();
    const ext = path.extname(updatedFile.filename).slice(1).toLowerCase();
    const viewableExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];
    
    if (viewableExtensions.includes(ext)) {
      res.redirect(`/files/${req.params.id}`);
    } else {
      res.redirect("/");
    }
  } catch (err) {
    console.error("Edit error:", err);
    res.render("files/edit", {
      title: "Edit File",
      file: { ...req.body, id: req.params.id },
      error: "Failed to save changes"
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const file = await db("files").where({ id: req.params.id }).first();

    if (!file) {
      return res.status(404).send("File not found");
    }

    const isOwner = req.session.userId && file.ownerId === req.session.userId;
    if (!file.isPublic && !isOwner) {
      return res.status(403).send("Access denied");
    }

    const ext = path.extname(file.filename).slice(1).toLowerCase();
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
    const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];
    
    if (imageExtensions.includes(ext)) {
      return res.render("files/image", {
        title: file.filename,
        file
      });
    }

    if (videoExtensions.includes(ext)) {
      return res.render("files/video", {
        title: file.filename,
        file,
        ext: ext === 'mov' ? 'mp4' : ext
      });
    }

    if (ext === 'md') {
      const markdown = fs.readFileSync(file.path, 'utf-8');
      const content = marked(markdown);
      return res.render("files/markdown", {
        title: file.filename,
        file,
        content
      });
    }

    res.redirect(`/files/download/${file.id}`);
  } catch (err) {
    console.error("File detail error:", err);
    res.status(500).send("Failed to load file");
  }
});

router.use(requireAuth);

router.post("/delete/:id", async (req, res) => {
  try {
    const file = await db("files")
      .where({ id: req.params.id, ownerId: req.session.userId })
      .first();

    if (!file) {
      return res.status(404).send("File not found");
    }

    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    await db("files").where({ id: req.params.id }).del();

    res.redirect("/");
  } catch (err) {
    console.error("Delete error:", err);
    res.redirect("/");
  }
});

export default router;
