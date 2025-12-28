import express from "express";
import db from "../db/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.render("index", {
      title: "YAFS",
      folders: [],
      files: [],
    });
  }

  const folders = await db("files")
    .where({ ownerId: userId })
    .whereNotNull("folder")
    .distinct("folder")
    .pluck("folder");

  const files = await db("files")
    .where({ ownerId: userId })
    .whereNull("folder")
    .orderBy("created_at", "desc");

  res.render("index", {
    title: "YAFS",
    folders,
    files,
  });
});

router.get("/folder/:name", async (req, res) => {
  const userId = req.session.userId;
  const folderName = req.params.name;

  if (!userId) {
    return res.redirect("/");
  }

  const files = await db("files")
    .where({ ownerId: userId, folder: folderName })
    .orderBy("created_at", "desc");

  res.render("folder", {
    title: folderName,
    folderName,
    files,
  });
});

export default router;
