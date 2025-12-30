import express from "express";
import fs from "fs";
import db from "../db/index.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/auth/login");
  }
  next();
}

function getTopLevelFolders(folderPaths) {
  const topLevel = new Set();
  for (const folder of folderPaths) {
    const parts = folder.split("/");
    topLevel.add(parts[0]);
  }
  return Array.from(topLevel).sort();
}

function getSubfolders(folderPaths, currentPath) {
  const prefix = currentPath + "/";
  const subfolders = new Set();
  for (const folder of folderPaths) {
    if (folder.startsWith(prefix)) {
      const remainder = folder.slice(prefix.length);
      const parts = remainder.split("/");
      if (parts[0]) {
        subfolders.add(parts[0]);
      }
    }
  }
  return Array.from(subfolders).sort();
}

router.get("/", async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    const allFolders = await db("files")
      .where({ isPublic: true, isUnlisted: false })
      .whereNotNull("folder")
      .distinct("folder")
      .pluck("folder");

    const topLevelFolders = getTopLevelFolders(allFolders);

    const publicFiles = await db("files")
      .where({ isPublic: true, isUnlisted: false })
      .whereNull("folder")
      .orderBy("created_at", "desc");

    return res.render("index", {
      title: "YAFS",
      folders: topLevelFolders,
      files: publicFiles,
    });
  }

  const allFolders = await db("files")
    .where(function() {
      this.where({ ownerId: userId }).orWhere({ isPublic: true, isUnlisted: false });
    })
    .whereNotNull("folder")
    .distinct("folder")
    .pluck("folder");

  const topLevelFolders = getTopLevelFolders(allFolders);

  const files = await db("files")
    .where(function() {
      this.where({ ownerId: userId }).orWhere({ isPublic: true, isUnlisted: false });
    })
    .whereNull("folder")
    .orderBy("created_at", "desc");

  res.render("index", {
    folders: topLevelFolders,
    files,
  });
});

router.get("/folder/edit/*", requireAuth, async (req, res) => {
  const folderPath = req.params[0];
  
  if (!folderPath) {
    return res.redirect("/");
  }

  const filesInFolder = await db("files")
    .where({ ownerId: req.session.userId })
    .where(function() {
      this.where({ folder: folderPath })
        .orWhere("folder", "like", `${folderPath}/%`);
    })
    .first();

  if (!filesInFolder) {
    return res.redirect("/");
  }

  const pathParts = folderPath.split("/");
  const folderName = pathParts[pathParts.length - 1];

  res.render("folder/edit", {
    title: "Rename Folder",
    folderPath,
    folderName
  });
});

router.post("/folder/edit/*", requireAuth, async (req, res) => {
  const folderPath = req.params[0];
  
  if (!folderPath) {
    return res.redirect("/");
  }

  const newName = req.body.folderName?.trim();
  if (!newName) {
    const pathParts = folderPath.split("/");
    return res.render("folder/edit", {
      title: "Rename Folder",
      folderPath,
      folderName: pathParts[pathParts.length - 1],
      error: "Folder name is required"
    });
  }

  if (newName.includes("/")) {
    const pathParts = folderPath.split("/");
    return res.render("folder/edit", {
      title: "Rename Folder",
      folderPath,
      folderName: pathParts[pathParts.length - 1],
      error: "Folder name cannot contain /"
    });
  }

  const pathParts = folderPath.split("/");
  pathParts[pathParts.length - 1] = newName;
  const newFolderPath = pathParts.join("/");

  const filesInFolder = await db("files")
    .where({ ownerId: req.session.userId })
    .where({ folder: folderPath });

  for (const file of filesInFolder) {
    await db("files")
      .where({ id: file.id })
      .update({ folder: newFolderPath, updated_at: db.fn.now() });
  }

  const filesInSubfolders = await db("files")
    .where({ ownerId: req.session.userId })
    .where("folder", "like", `${folderPath}/%`);

  for (const file of filesInSubfolders) {
    const newSubfolderPath = file.folder.replace(folderPath, newFolderPath);
    await db("files")
      .where({ id: file.id })
      .update({ folder: newSubfolderPath, updated_at: db.fn.now() });
  }

  res.redirect("/");
});

router.post("/folder/delete/*", requireAuth, async (req, res) => {
  const folderPath = req.params[0];
  
  if (!folderPath) {
    return res.redirect("/");
  }

  const filesToDelete = await db("files")
    .where({ ownerId: req.session.userId })
    .where(function() {
      this.where({ folder: folderPath })
        .orWhere("folder", "like", `${folderPath}/%`);
    });

  for (const file of filesToDelete) {
    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (err) {
      console.error(`Failed to delete file ${file.path}:`, err.message);
    }
    await db("files").where({ id: file.id }).del();
  }

  res.redirect("/");
});

router.get("/folder/*", async (req, res) => {
  const userId = req.session.userId;
  const folderPath = req.params[0];

  if (!folderPath) {
    return res.redirect("/");
  }

  const allFolders = userId
    ? await db("files")
        .where(function() {
          this.where({ ownerId: userId }).orWhere({ isPublic: true, isUnlisted: false });
        })
        .whereNotNull("folder")
        .distinct("folder")
        .pluck("folder")
    : await db("files")
        .where({ isPublic: true, isUnlisted: false })
        .whereNotNull("folder")
        .distinct("folder")
        .pluck("folder");

  const subfolders = getSubfolders(allFolders, folderPath);

  const filesQuery = db("files")
    .where({ folder: folderPath })
    .orderBy("created_at", "desc");

  if (!userId) {
    filesQuery.where({ isPublic: true, isUnlisted: false });
  } else {
    filesQuery.where(function() {
      this.where({ ownerId: userId }).orWhere({ isPublic: true, isUnlisted: false });
    });
  }

  const files = await filesQuery;

  if (files.length === 0 && subfolders.length === 0) {
    return res.redirect("/");
  }

  const pathParts = folderPath.split("/");
  const breadcrumbs = pathParts.map((part, index) => ({
    name: part,
    path: pathParts.slice(0, index + 1).join("/")
  }));

  res.render("folder", {
    title: folderPath,
    folderName: pathParts[pathParts.length - 1],
    folderPath,
    breadcrumbs,
    subfolders,
    files,
  });
});

export default router;
