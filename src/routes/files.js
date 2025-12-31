import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import sharp from "sharp";
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

function isValidId(id) {
  return /^\d+$/.test(id);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    getStoragePath()
      .then((storagePath) => {
        const userFolder = path.join(storagePath, String(req.session.userId));
        fs.mkdirSync(userFolder, { recursive: true });
        cb(null, userFolder);
      })
      .catch((err) => cb(err));
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

router.get("/upload", requireAuth, (req, res) => {
  res.render("files/upload", {
    title: "Upload File"
  });
});

router.post("/upload", requireAuth, upload.array("files"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.render("files/upload", {
        title: "Upload File",
        error: "No file selected"
      });
    }

    const folder = req.body.folder || null;
    const isPublic = req.body.isPublic === "true";
    const isUnlisted = req.body.isUnlisted === "true";
    const isBulk = req.files.length > 1;

    for (const file of req.files) {
      const ext = path.extname(file.originalname);
      let displayFilename;
      let description = null;

      if (isBulk) {
        displayFilename = file.originalname;
      } else {
        const customFilename = req.body.customFilename?.trim();
        displayFilename = customFilename ? `${customFilename}${ext}` : file.originalname;
        description = req.body.description?.trim() || null;
      }

      await db("files").insert({
        filename: displayFilename,
        folder,
        path: file.path,
        ownerId: req.session.userId,
        isPublic,
        isUnlisted,
        description
      });

      console.log(`[UPLOAD] User ${req.session.userId} uploaded "${displayFilename}" (${file.size} bytes) to ${folder || "root"}`);
    }

    res.redirect("/");
  } catch (err) {
    console.error("Upload error:", err);
    res.render("files/upload", {
      title: "Upload File",
      error: "Failed to upload file"
    });
  }
});

router.post("/upload/url", requireAuth, express.json(), async (req, res) => {
  try {
    const { url, folder, isPublic, isUnlisted, customFilename, description } = req.body;

    if (!url) {
      return res.status(400).json({ error: "No URL provided" });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: "Only HTTP(S) URLs are supported" });
    }

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(400).json({ error: `Failed to fetch URL: ${response.status}` });
    }

    const contentType = response.headers.get("content-type") || "";
    const urlPath = parsedUrl.pathname;
    let ext = path.extname(urlPath);
    
    if (!ext) {
      if (contentType.includes("image/png")) ext = ".png";
      else if (contentType.includes("image/jpeg")) ext = ".jpg";
      else if (contentType.includes("image/gif")) ext = ".gif";
      else if (contentType.includes("image/webp")) ext = ".webp";
      else if (contentType.includes("video/mp4")) ext = ".mp4";
      else if (contentType.includes("application/pdf")) ext = ".pdf";
      else ext = "";
    }

    const urlFilename = path.basename(urlPath) || "downloaded-file";
    const baseName = customFilename?.trim() || path.basename(urlFilename, ext) || "downloaded-file";
    const displayFilename = `${baseName}${ext}`;

    const storagePath = await getStoragePath();
    const userFolder = path.join(storagePath, String(req.session.userId));
    fs.mkdirSync(userFolder, { recursive: true });

    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const diskFilename = `${baseName}-${uniqueSuffix}${ext}`;
    const filePath = path.join(userFolder, diskFilename);

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    const [inserted] = await db("files").insert({
      filename: displayFilename,
      folder: folder || null,
      path: filePath,
      ownerId: req.session.userId,
      isPublic: isPublic === true,
      isUnlisted: isUnlisted === true,
      description: description?.trim() || null
    }).returning("id");

    console.log(`[UPLOAD] User ${req.session.userId} uploaded "${displayFilename}" from URL (${buffer.length} bytes) to ${folder || "root"}`);

    res.json({ success: true, id: inserted.id || inserted, filename: displayFilename });
  } catch (err) {
    console.error("URL upload error:", err);
    res.status(500).json({ error: "Failed to upload from URL" });
  }
});

router.post("/upload/single", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const folder = req.body.folder || null;
    const isPublic = req.body.isPublic === "true";
    const isUnlisted = req.body.isUnlisted === "true";
    const displayFilename = req.file.originalname;

    const [inserted] = await db("files").insert({
      filename: displayFilename,
      folder,
      path: req.file.path,
      ownerId: req.session.userId,
      isPublic,
      isUnlisted,
      description: null
    }).returning("id");

    console.log(`[UPLOAD] User ${req.session.userId} uploaded "${displayFilename}" (${req.file.size} bytes) to ${folder || "root"}`);

    res.json({ success: true, id: inserted.id || inserted, filename: displayFilename });
  } catch (err) {
    console.error("Single upload error:", err);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

router.get("/view/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).render("errors/404");
    }

    const file = await db("files").where({ id: req.params.id }).first();

    if (!file) {
      return res.status(404).render("errors/404");
    }

    const isOwner = req.session.userId && file.ownerId === req.session.userId;
    const isAccessible = file.isPublic || file.isUnlisted || isOwner;
    if (!isAccessible) {
      return res.status(403).render("errors/403");
    }

    res.sendFile(file.path);
  } catch (err) {
    console.error("View error:", err);
    res.status(500).send("Failed to view file");
  }
});

router.get("/thumb/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).render("errors/404");
    }

    const file = await db("files").where({ id: req.params.id }).first();

    if (!file) {
      return res.status(404).render("errors/404");
    }

    const isOwner = req.session.userId && file.ownerId === req.session.userId;
    const isAccessible = file.isPublic || file.isUnlisted || isOwner;
    if (!isAccessible) {
      return res.status(403).render("errors/403");
    }

    const ext = path.extname(file.filename).slice(1).toLowerCase();
    const supportedFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

    if (!supportedFormats.includes(ext)) {
      return res.sendFile(file.path);
    }

    const widthParam = parseInt(req.query.w, 10);
    const qualityParam = parseInt(req.query.q, 10);
    const width = Number.isFinite(widthParam) ? Math.min(Math.max(widthParam, 50), 2000) : 300;
    const quality = Number.isFinite(qualityParam) ? Math.min(Math.max(qualityParam, 10), 90) : 70;

    res.type('webp');
    sharp(file.path)
      .rotate()
      .resize(width, null, { withoutEnlargement: true })
      .webp({ quality })
      .pipe(res);
  } catch (err) {
    console.error("Thumbnail error:", err);
    res.status(500).send("Failed to generate thumbnail");
  }
});

router.get("/download/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).render("errors/404");
    }

    const file = await db("files").where({ id: req.params.id }).first();

    if (!file) {
      return res.status(404).render("errors/404");
    }

    const isOwner = req.session.userId && file.ownerId === req.session.userId;
    const isAccessible = file.isPublic || file.isUnlisted || isOwner;
    if (!isAccessible) {
      return res.status(403).render("errors/403");
    }

    res.download(file.path, file.filename);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).send("Failed to download file");
  }
});

router.get("/edit/:id", requireAuth, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).render("errors/404");
    }

    const file = await db("files")
      .where({ id: req.params.id, ownerId: req.session.userId })
      .first();

    if (!file) {
      return res.status(404).render("errors/404");
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
    if (!isValidId(req.params.id)) {
      return res.status(404).render("errors/404");
    }

    const file = await db("files")
      .where({ id: req.params.id, ownerId: req.session.userId })
      .first();

    if (!file) {
      return res.status(404).render("errors/404");
    }

    const filename = req.body.filename?.trim();
    if (!filename) {
      return res.render("files/edit", {
        title: "Edit File",
        file,
        error: "Filename is required"
      });
    }

    if (filename.length > 255) {
      return res.render("files/edit", {
        title: "Edit File",
        file,
        error: "Filename must be 255 characters or less"
      });
    }

    const description = req.body.description?.trim() || null;
    if (description && description.length > 1000) {
      return res.render("files/edit", {
        title: "Edit File",
        file,
        error: "Description must be 1000 characters or less"
      });
    }

    const folder = req.body.folder?.trim() || null;
    if (folder && folder.length > 255) {
      return res.render("files/edit", {
        title: "Edit File",
        file,
        error: "Folder path must be 255 characters or less"
      });
    }

    await db("files").where({ id: req.params.id }).update({
      filename,
      description,
      folder,
      isPublic: req.body.isPublic === "true",
      isUnlisted: req.body.isUnlisted === "true",
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
    if (!isValidId(req.params.id)) {
      return res.status(404).render("errors/404");
    }

    const file = await db("files").where({ id: req.params.id }).first();

    if (!file) {
      return res.status(404).render("errors/404");
    }

    const isOwner = req.session.userId && file.ownerId === req.session.userId;
    const isAccessible = file.isPublic || file.isUnlisted || isOwner;
    if (!isAccessible) {
      return res.status(403).render("errors/403");
    }

    const ext = path.extname(file.filename).slice(1).toLowerCase();
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
    const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];
    
    if (imageExtensions.includes(ext)) {
      return res.render("files/image", {
        title: file.filename,
        file,
        isOwner
      });
    }

    if (videoExtensions.includes(ext)) {
      return res.render("files/video", {
        title: file.filename,
        file,
        ext: ext === 'mov' ? 'mp4' : ext,
        isOwner
      });
    }

    if (ext === 'md') {
      const markdown = fs.readFileSync(file.path, 'utf-8');
      let content = marked(markdown);
      
      const sanitizationSetting = await db("settings")
        .where({ key: "markdown_sanitization_enabled" })
        .first();
      const shouldSanitize = sanitizationSetting?.value !== "false";
      
      if (shouldSanitize) {
        content = DOMPurify.sanitize(content);
      }
      
      return res.render("files/markdown", {
        title: file.filename,
        file,
        content,
        isOwner
      });
    }

    return res.render("files/other", {
      title: file.filename,
      file,
      isOwner
    })

  } catch (err) {
    console.error("File detail error:", err);
    res.status(500).send("Failed to load file");
  }
});

router.use(requireAuth);

router.post("/delete/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).render("errors/404");
    }

    const file = await db("files")
      .where({ id: req.params.id, ownerId: req.session.userId })
      .first();

    if (!file) {
      return res.status(404).render("errors/404");
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
