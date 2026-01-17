import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import db from "../db/index.js";

const router = express.Router();

async function getStoragePath() {
  const setting = await db("settings").where({ key: "storage_path" }).first();
  return setting?.value || path.join(os.homedir(), "files");
}

function getEffectiveUserId(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (process.env.API_TOKEN && token === process.env.API_TOKEN) {
      return process.env.API_USER_ID ? parseInt(process.env.API_USER_ID, 10) : null;
    }
    return null;
  }
  return req.session.userId;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = getEffectiveUserId(req);
    if (!userId) {
      return cb(new Error("Authentication required"));
    }
    getStoragePath()
      .then((storagePath) => {
        const userFolder = path.join(storagePath, String(userId));
        fs.mkdirSync(userFolder, { recursive: true });
        cb(null, userFolder);
      })
      .catch((err) => cb(err));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ storage });

router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

router.get("/folders", async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.json({ folders: [], tree: [] });
  }

  const folders = await db("files")
    .where({ ownerId: userId })
    .whereNotNull("folder")
    .distinct("folder")
    .pluck("folder");

  const sortedFolders = folders.sort();

  const tree = buildFolderTree(sortedFolders);

  res.json({ folders: sortedFolders, tree });
});

function buildFolderTree(folderPaths) {
  const tree = [];
  const nodeMap = new Map();

  for (const path of folderPaths) {
    const parts = path.split("/");
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!nodeMap.has(currentPath)) {
        const node = {
          name: part,
          path: currentPath,
          children: []
        };
        nodeMap.set(currentPath, node);

        if (parentPath) {
          const parent = nodeMap.get(parentPath);
          if (parent) {
            parent.children.push(node);
          }
        } else {
          tree.push(node);
        }
      }
    }
  }

  return tree;
}

router.get("/search", async (req, res) => {
  const userId = req.session.userId;
  const query = (req.query.q || "").slice(0, 100);

  if (!query.trim()) {
    return res.json({ files: [] });
  }

  const searchPattern = `%${query}%`;

  let files;
  if (!userId) {
    files = await db("files")
      .where({ isPublic: true })
      .andWhere((builder) => {
        builder
          .whereILike("filename", searchPattern)
          .orWhereILike("description", searchPattern)
          .orWhereILike("folder", searchPattern);
      })
      .orderBy("created_at", "desc")
      .limit(50);
  } else {
    files = await db("files")
      .where({ ownerId: userId })
      .andWhere((builder) => {
        builder
          .whereILike("filename", searchPattern)
          .orWhereILike("description", searchPattern)
          .orWhereILike("folder", searchPattern);
      })
      .orderBy("created_at", "desc")
      .limit(50);
  }

  res.json({ files });
});

router.post("/upload", upload.array("files"), async (req, res) => {
  const userId = getEffectiveUserId(req);

  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (!process.env.API_TOKEN || token !== process.env.API_TOKEN) {
      return res.status(401).json({ error: "Invalid API token" });
    }
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files provided" });
  }

  const folder = req.body.folder || null;
  const isPublic = req.body.isPublic === "true" || req.body.isPublic === true;
  const description = req.body.description || null;

  const uploadedFiles = [];

  for (const file of req.files) {
    const [inserted] = await db("files")
      .insert({
        filename: file.originalname,
        folder: folder,
        path: file.path,
        ownerId: userId,
        isPublic: isPublic,
        description: description
      })
      .returning("*");

    uploadedFiles.push(inserted);
  }

  res.json({ success: true, files: uploadedFiles });
});

export default router;
