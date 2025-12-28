import express from "express";
import db from "../db/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    const publicFolders = await db("files")
      .where({ isPublic: true })
      .whereNotNull("folder")
      .distinct("folder")
      .pluck("folder");

    const publicFiles = await db("files")
      .where({ isPublic: true })
      .whereNull("folder")
      .orderBy("created_at", "desc");

    return res.render("index", {
      title: "YAFS",
      folders: publicFolders,
      files: publicFiles,
    });
  }

  const folders = await db("files")
    .where(function() {
      this.where({ ownerId: userId }).orWhere({ isPublic: true });
    })
    .whereNotNull("folder")
    .distinct("folder")
    .pluck("folder");

  const files = await db("files")
    .where(function() {
      this.where({ ownerId: userId }).orWhere({ isPublic: true });
    })
    .whereNull("folder")
    .orderBy("created_at", "desc");

  res.render("index", {
    folders,
    files,
  });
});

router.get("/folder/:name", async (req, res) => {
  const userId = req.session.userId;
  const folderName = req.params.name;

  if (!userId) {
    const hasPublicFiles = await db("files")
      .where({ folder: folderName, isPublic: true })
      .first();

    if (!hasPublicFiles) {
      return res.redirect("/");
    }

    const publicFiles = await db("files")
      .where({ folder: folderName, isPublic: true })
      .orderBy("created_at", "desc");

    return res.render("folder", {
      title: folderName,
      folderName,
      files: publicFiles,
    });
  }

  const files = await db("files")
    .where({ folder: folderName })
    .where(function() {
      this.where({ ownerId: userId }).orWhere({ isPublic: true });
    })
    .orderBy("created_at", "desc");

  res.render("folder", {
    title: folderName,
    folderName,
    files,
  });
});

export default router;
