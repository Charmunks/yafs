import express from "express";
import db from "../db/index.js";

const router = express.Router();

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
      .where({ isPublic: true })
      .whereNotNull("folder")
      .distinct("folder")
      .pluck("folder");

    const topLevelFolders = getTopLevelFolders(allFolders);

    const publicFiles = await db("files")
      .where({ isPublic: true })
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
      this.where({ ownerId: userId }).orWhere({ isPublic: true });
    })
    .whereNotNull("folder")
    .distinct("folder")
    .pluck("folder");

  const topLevelFolders = getTopLevelFolders(allFolders);

  const files = await db("files")
    .where(function() {
      this.where({ ownerId: userId }).orWhere({ isPublic: true });
    })
    .whereNull("folder")
    .orderBy("created_at", "desc");

  res.render("index", {
    folders: topLevelFolders,
    files,
  });
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
          this.where({ ownerId: userId }).orWhere({ isPublic: true });
        })
        .whereNotNull("folder")
        .distinct("folder")
        .pluck("folder")
    : await db("files")
        .where({ isPublic: true })
        .whereNotNull("folder")
        .distinct("folder")
        .pluck("folder");

  const subfolders = getSubfolders(allFolders, folderPath);

  const filesQuery = db("files")
    .where({ folder: folderPath })
    .orderBy("created_at", "desc");

  if (!userId) {
    filesQuery.where({ isPublic: true });
  } else {
    filesQuery.where(function() {
      this.where({ ownerId: userId }).orWhere({ isPublic: true });
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
