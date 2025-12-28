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

    req.session.userId = user.id;
    req.session.username = user.username;
    res.redirect("/");
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

  const registrationSetting = await db("settings")
    .where({ key: "registration_enabled" })
    .first();

  if (registrationSetting?.value !== "true") {
    return res.render("auth/register", {
      title: "Register",
      error: "Registration is currently disabled"
    });
  }

  res.render("auth/register", { title: "Register" });
});

router.post("/register", async (req, res) => {
  const registrationSetting = await db("settings")
    .where({ key: "registration_enabled" })
    .first();

  if (registrationSetting?.value !== "true") {
    return res.render("auth/register", {
      title: "Register",
      error: "Registration is currently disabled"
    });
  }

  const { username, password, confirmPassword } = req.body;

  if (!username || !password || !confirmPassword) {
    return res.render("auth/register", {
      title: "Register",
      error: "All fields are required"
    });
  }

  if (password !== confirmPassword) {
    return res.render("auth/register", {
      title: "Register",
      error: "Passwords do not match"
    });
  }

  if (password.length < 8) {
    return res.render("auth/register", {
      title: "Register",
      error: "Password must be at least 8 characters"
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

    const [user] = await db("users")
      .insert({
        username,
        password: hashedPassword
      })
      .returning(["id", "username"]);

    req.session.userId = user.id;
    req.session.username = user.username;
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
