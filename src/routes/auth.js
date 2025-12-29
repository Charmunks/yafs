import express from "express";
import bcrypt from "bcrypt";
import db from "../db/index.js";

const router = express.Router();
const SALT_ROUNDS = 12;

router.get("/login", (req, res) => {
  if (req.session.userId) {
    return res.redirect("/");
  }
  res.render("auth/login", { title: "Login" });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render("auth/login", {
      title: "Login",
      error: "Username and password are required"
    });
  }

  if (username.length > 50 || password.length > 128) {
    return res.render("auth/login", {
      title: "Login",
      error: "Invalid username or password"
    });
  }

  try {
    const user = await db("users").where({ username }).first();

    if (!user) {
      return res.render("auth/login", {
        title: "Login",
        error: "Invalid username or password"
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.render("auth/login", {
        title: "Login",
        error: "Invalid username or password"
      });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error("Session regeneration error:", err);
        return res.render("auth/login", {
          title: "Login",
          error: "An error occurred. Please try again."
        });
      }
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.isAdmin = user.is_admin;
      res.redirect("/");
    });
  } catch (err) {
    console.error("Login error:", err);
    res.render("auth/login", {
      title: "Login",
      error: "An error occurred. Please try again."
    });
  }
});

router.get("/register", async (req, res) => {
  if (req.session.userId) {
    return res.redirect("/");
  }

  const registrationModeSetting = await db("settings")
    .where({ key: "registration_mode" })
    .first();

  const registrationMode = registrationModeSetting?.value || "disabled";

  if (registrationMode === "disabled") {
    const disabledMessageSetting = await db("settings")
      .where({ key: "registration_disabled_message" })
      .first();

    return res.render("auth/register", {
      title: "Register",
      registrationDisabled: true,
      disabledMessage: disabledMessageSetting?.value || ""
    });
  }

  res.render("auth/register", {
    title: "Register",
    requiresKey: registrationMode === "key"
  });
});

router.post("/register", async (req, res) => {
  const registrationModeSetting = await db("settings")
    .where({ key: "registration_mode" })
    .first();

  const registrationMode = registrationModeSetting?.value || "disabled";

  if (registrationMode === "disabled") {
    const disabledMessageSetting = await db("settings")
      .where({ key: "registration_disabled_message" })
      .first();

    return res.render("auth/register", {
      title: "Register",
      registrationDisabled: true,
      disabledMessage: disabledMessageSetting?.value || ""
    });
  }

  const { username, password, confirmPassword, registrationKey } = req.body;

  if (registrationMode === "key") {
    const registrationKeySetting = await db("settings")
      .where({ key: "registration_key" })
      .first();

    const expectedKey = registrationKeySetting?.value || "";

    if (!registrationKey || registrationKey !== expectedKey) {
      return res.render("auth/register", {
        title: "Register",
        error: "Invalid registration key",
        requiresKey: true
      });
    }
  }

  if (!username || !password || !confirmPassword) {
    return res.render("auth/register", {
      title: "Register",
      error: "All fields are required"
    });
  }

  if (username.length > 50) {
    return res.render("auth/register", {
      title: "Register",
      error: "Username must be 50 characters or less"
    });
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return res.render("auth/register", {
      title: "Register",
      error: "Username can only contain letters, numbers, underscores, and hyphens"
    });
  }

  if (password !== confirmPassword) {
    return res.render("auth/register", {
      title: "Register",
      error: "Passwords do not match"
    });
  }

  if (password.length < 8 || password.length > 128) {
    return res.render("auth/register", {
      title: "Register",
      error: "Password must be between 8 and 128 characters"
    });
  }

  try {
    const existingUser = await db("users").where({ username }).first();

    if (existingUser) {
      return res.render("auth/register", {
        title: "Register",
        error: "Username already taken"
      });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const userCount = await db("users").count("id as count").first();
    const isFirstUser = parseInt(userCount.count) === 0;

    const [user] = await db("users")
      .insert({
        username,
        password: hashedPassword,
        is_admin: isFirstUser
      })
      .returning(["id", "username", "is_admin"]);

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = user.is_admin;
    res.redirect("/");
  } catch (err) {
    console.error("Registration error:", err);
    res.render("auth/register", {
      title: "Register",
      error: "An error occurred. Please try again."
    });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
    }
    res.redirect("/");
  });
});

export default router;
