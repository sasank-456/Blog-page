import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import session from "express-session";

// -------------------- APP SETUP --------------------
const app = express();
const PORT = 3000;

// Directory helpers
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------- MIDDLEWARE --------------------
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Session configuration - MUST be before routes
app.use(
  session({
    secret: "your-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true if using HTTPS
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  })
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// -------------------- MONGODB CONNECTION --------------------
mongoose
  .connect("mongodb://127.0.0.1:27017/blogApp")
  .then(() => {
    console.log("✅ MongoDB Connected");
    console.log(`📊 Database: ${mongoose.connection.name}`);
  })
  .catch(err => {
    console.log("❌ Mongo Error:", err);
    process.exit(1);
  });

// -------------------- SCHEMAS & MODELS --------------------

// USER SCHEMA
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

// POST SCHEMA
const postSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Post = mongoose.model("Post", postSchema);

// -------------------- AUTH MIDDLEWARE --------------------
function isAuthenticated(req, res, next) {
  console.log('Session check:', {
    sessionID: req.sessionID,
    userId: req.session.userId
  });
  
  if (req.session.userId) {
    next();
  } else {
    console.log('Not authenticated, redirecting to login');
    res.redirect("/");
  }
}

// -------------------- ROUTES --------------------

// LOGIN PAGE
app.get("/", (req, res) => {
  // If already logged in, redirect to index
  if (req.session.userId) {
    console.log('User already logged in, redirecting to /index');
    return res.redirect("/index");
  }
  res.render("login");
});

// -------------------- AUTH ROUTES --------------------

// SIGNUP
app.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Signup attempt:', email);

    if (!email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('User already exists:', email);
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    await User.create({
      email,
      password: hashedPassword
    });

    console.log('✅ New user registered:', email);
    res.status(200).json({ message: "Signup successful" });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Login attempt:', email);

    if (!email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Invalid password for:', email);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Set session
    req.session.userId = user._id;
    
    // Save session explicitly
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ message: "Session error" });
      }
      
      console.log('✅ User logged in successfully:', email);
      console.log('Session ID:', req.sessionID);
      console.log('User ID in session:', req.session.userId);
      
      res.status(200).json({ message: "Login successful" });
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// LOGOUT
app.get("/logout", (req, res) => {
  const email = req.session.email;
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    } else {
      console.log('✅ User logged out:', email);
    }
    res.redirect("/");
  });
});

// -------------------- BLOG ROUTES --------------------

// HOME – ALL POSTS
app.get("/index", isAuthenticated, async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    console.log(`Found ${posts.length} posts`);
    res.render("index", { posts });
  } catch (err) {
    console.error("Error fetching posts:", err);
    res.status(500).send("Error loading posts");
  }
});

// WISHLIST
app.get("/wishlist", isAuthenticated, async (req, res) => {
  try {
    const posts = await Post.find();
    res.render("wishlist", { posts });
  } catch (err) {
    console.error("Error fetching wishlist:", err);
    res.status(500).send("Error loading wishlist");
  }
});

// NEW POST FORM
app.get("/new", isAuthenticated, (req, res) => {
  res.render("new");
});

// CREATE POST
app.post("/new", isAuthenticated, async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title || !content) {
      return res.redirect("/new");
    }

    const newPost = await Post.create({ title, content });
    console.log(`✅ New post created: "${title}" (ID: ${newPost._id})`);
    res.redirect("/index");
  } catch (err) {
    console.error("Error creating post:", err);
    res.redirect("/new");
  }
});

// VIEW SINGLE POST
app.get("/posts/:id", isAuthenticated, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      console.log('Post not found:', req.params.id);
      return res.status(404).send("Post not found");
    }
    res.render("post", { post });
  } catch (err) {
    console.error("Error fetching post:", err);
    res.status(500).send("Error loading post");
  }
});

// DELETE POST
app.post("/delete/:id", isAuthenticated, async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    console.log(`✅ Post deleted: ${req.params.id}`);
    res.redirect("/index");
  } catch (err) {
    console.error("Error deleting post:", err);
    res.redirect("/index");
  }
});

// -------------------- ERROR HANDLING --------------------
app.use((req, res) => {
  res.status(404).send("Page not found");
});

// -------------------- START SERVER --------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📝 Environment: development`);
  console.log(`⏰ Server started at: ${new Date().toLocaleString()}`);
});