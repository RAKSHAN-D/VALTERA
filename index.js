//INDEX.JS
import express from "express";
import session from "express-session";
import path from "path";
import bcrypt from "bcryptjs";
import multer from "multer";
import fs from "fs";
import { fileURLToPath } from "url";
import pool from "./db.js";
import { generateGeminiContent } from "./geminiClient.js";
import pdf from "pdf-parse";
import dayjs from 'dayjs';
//import fs from "fs/promises";
//import * as pdfjsLib from 'pdfjs-dist/es5/build/pdf';

//const response = await generateGeminiContent("Explain AI to a 10-year-old.");
//console.log(response);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
//new
//const app = express();
//app.use(express.urlencoded({ extended: true }));
//app.use(express.json());

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');  // Ensure this directory exists


app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, "uploads")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use(session({
  secret: "secret123",
  resave: false,
  saveUninitialized: true,
}));

// Multer config
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);  // Use original filename
  }
});

const upload = multer({ storage });

// Render pages
app.get("/", (req, res) => res.render("index.ejs"));
app.get("/home", (req, res) => res.render("index.ejs"));
app.get("/about", (req, res) => res.render("about.ejs"));
app.get("/services/Basic", (req, res) => res.render("basic.ejs"));
app.get("/services/Intermediate", (req, res) => res.render("Intermediate.ejs"));
app.get("/services/Advance", (req, res) => res.render("Advance.ejs"));
app.get("/register", (req, res) => res.render("REGISTER"));
app.get("/login", (req, res) => res.render("login"));

app.post("/register", async (req, res) => {
  const { name, email, password, role, secretCode } = req.body;

  // Ensure it's a HOD trying to register
  if (role !== "hod") {
    return res.status(400).send("Only HODs can register.");
  }

  // Secret code parsing logic
  // Find the part that is not username (you can tweak it if usernames have variable length)
  const possibleBranches = ["CSE", "ECE", "EEE", "MEC", "CHE", "ROB", "AI", "ISE"];
  const possibleColleges = ["BVB", "SDM"];

  let foundCollege = null;
  let foundBranch = null;

  for (const college of possibleColleges) {
    if (secretCode.includes(college)) {
      foundCollege = college;

      for (const branch of possibleBranches) {
        if (secretCode.includes(branch)) {
          foundBranch = branch;
          break;
        }
      }
      break;
    }
  }

  if (!foundCollege || !foundBranch) {
    return res.status(400).send("Invalid secret code");
  }

  const username = secretCode.split(foundCollege)[0];

  try {
    await pool.query(
      `INSERT INTO users (name, email, password, role, college, branch)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, email, password, role, foundCollege, foundBranch]
    );
     //usernameCOLLEGEBRANCH this is the sceret code format
    // Auto login the HOD by setting session
    req.session.user = {
      name,
      email,
      role,
      college: foundCollege,
      branch: foundBranch
    };
  
res.render("hodDashboard", {
  name,
  college: foundCollege,
  branch: foundBranch
});

  } catch (err) {
    console.error(err);
    res.status(500).send("Error registering user");
  }
  
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  //req.session.userId = user.id; // This must be set after successful login
  //req.session.role = user.role; // Optional, if role is used elsewhere


  try {
    const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
    const user = result.rows[0];

    if (!user) return res.send("No user found");

    if (password !== user.password) return res.send("Incorrect password");

    // 🛑 Make sure teacher was added by HOD (i.e., has college/branch)
    if ((user.role === "teacher" || user.role === "student") && (!user.college || !user.branch)) {
      return res.send(`<script>alert('You are not added yet by HOD.'); window.location.href='/login';</script>`);
    }

    req.session.user = user;

    if (user.role === "hod") {
      return res.redirect("/dashboard");
    } else if (user.role === "student") {
      return res.redirect("/student-dashboard");
    } else if (user.role === "teacher") {
      return res.redirect("/teacher-dashboard");
    } else {
      return res.send("Invalid role");
    }
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Login failed");
  }
});

app.get("/dashboard", async (req, res) => {
  const user = req.session.user;
  if (!user || user.role !== "hod") return res.redirect("/login");

  const students = await pool.query(
    `SELECT * FROM users WHERE role = 'student' AND college = $1 AND branch = $2`,
    [user.college, user.branch]
  );
  const teachers = await pool.query(
    `SELECT * FROM users WHERE role = 'teacher' AND college = $1 AND branch = $2`,
    [user.college, user.branch]
  );
  const documents = await pool.query(
    `SELECT * FROM documents WHERE college = $1 AND branch = $2`,
    [user.college, user.branch]
  );

  /*res.render("hodDashboard", {
    user,
    students: students.rows,
    teachers: teachers.rows,
    notes: documents.rows.filter(doc => doc.type === "notes"),
    circulars: documents.rows.filter(doc => doc.type === "circular"),
    uploadStatus: req.query.upload, // Pass the message
  });*/
  res.render("hodDashboard", {
    user,
    students: students.rows,
    teachers: teachers.rows,
    notes: documents.rows.filter(doc => doc.type === "notes"),
    circulars: documents.rows.filter(doc => doc.type === "circular"),
    uploadStatus: req.query.upload,   // For document upload messages
    success: req.query.success,       // ✅ For user add success
    error: req.query.error,          // ✅ For user add error
    deleted : req.query.deleted,
  });
});

// Add users
/*app.post("/add-user", async (req, res) => {
  const { name, email, password, role } = req.body;
  const user = req.session.user;
  const hashedPassword = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (name, email, password, role, college, branch) VALUES ($1, $2, $3, $4, $5, $6)`,
    [name, email, hashedPassword, role, user.college, user.branch]
  );
  res.redirect("/dashboard");
});*/
app.post("/add-user", async (req, res) => {
  const { name, email, password, role } = req.body;
  const user = req.session.user;

  try {
    await pool.query(
      `INSERT INTO users (name, email, password, role, college, branch) VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, email, password, role, req.session.user.college, req.session.user.branch]
    );

    res.redirect("/dashboard?success=User added successfully");
  } catch (err) {
    console.error("Error adding user:", err);
    res.redirect("/dashboard?error=Failed to add user");
  }
});

// Upload document
/*app.post("/upload", upload.single("document"), async (req, res) => {
  try {
    console.log("Session User:", req.session.user);

    const user = req.session.user;
    if (!user) return res.status(401).send("Unauthorized: Please log in");

    const { title, type } = req.body;
    const file = req.file;

    if (!file) {
      return res.redirect("/dashboard?upload=failure");
    }

    await pool.query(
      `INSERT INTO documents (title, type, filename, college, branch)
       VALUES ($1, $2, $3, $4, $5)`,
      [title, type, file.filename, user.college, user.branch]
    );

    return res.redirect("/dashboard?upload=success");
  } catch (err) {
    console.error("Upload error:", err.message);
    return res.redirect("/dashboard?upload=failure");
  }
});*/
app.post("/upload", upload.single("document"), async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).send("Unauthorized: Please log in");

    const { title, type } = req.body;
    const file = req.file;

    if (!file) {
      if (user.role === "hod") return res.redirect("/dashboard?upload=failure");
      else if (user.role === "teacher") return res.redirect("/teacher-dashboard?upload=failure");
    }

    await pool.query(
      `INSERT INTO documents (title, type, filename, college, branch)
       VALUES ($1, $2, $3, $4, $5)`,
      [title, type, file.filename, user.college, user.branch]
    );

    if (user.role === "hod") {
      return res.redirect("/dashboard?upload=success");
    } else if (user.role === "teacher") {
      return res.redirect("/teacher-dashboard?upload=success");
    }

  } catch (err) {
    console.error("Upload error:", err.message);
    return res.redirect("/dashboard?upload=failure");
  }
});




// Delete document
/*app.post("/delete-document/:id", async (req, res) => {
  const doc = await pool.query(`SELECT * FROM documents WHERE id = $1`, [req.params.id]);
  if (doc.rows.length) {
    const filepath = path.join(uploadDir, doc.rows[0].filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }
  await pool.query(`DELETE FROM documents WHERE id = $1`, [req.params.id]);
  res.redirect("/dashboard");
});*/
app.post("/delete-document/:id", async (req, res) => {
  const user = req.session.user;
  if (!user || (user.role !== "hod" && user.role !== "teacher")) {
    return res.status(403).send("Forbidden");
  }

  try {
    const doc = await pool.query(`SELECT * FROM documents WHERE id = $1`, [req.params.id]);
    if (doc.rows.length) {
      const filepath = path.join(uploadDir, doc.rows[0].filename);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }

    await pool.query(`DELETE FROM documents WHERE id = $1`, [req.params.id]);

    const redirectUrl =
      user.role === "hod"
        ? "/dashboard?delete=success"
        : "/teacher-dashboard?delete=success";

    return res.redirect(redirectUrl);
  } catch (err) {
    console.error("Document delete error:", err.message);
    const redirectUrl =
      user.role === "hod"
        ? "/dashboard?delete=failure"
        : "/teacher-dashboard?delete=failure";

    return res.redirect(redirectUrl);
  }
});

// Remove user
app.post("/delete-user/:id", async (req, res) => {
  const userId = req.params.id;

  try {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    res.redirect("back"); // redirects to the same page
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).send("Failed to delete user");
  }
});
app.get("/view-students", async (req, res) => {
  const user = req.session.user;
  const result = await pool.query(
    `SELECT * FROM users WHERE role = 'student' AND college = $1 AND branch = $2`,
    [user.college, user.branch]
  );
  res.render("students", { students: result.rows });
});

app.get("/view-teachers", async (req, res) => {
  const user = req.session.user;
  const result = await pool.query(
    `SELECT * FROM users WHERE role = 'teacher' AND college = $1 AND branch = $2`,
    [user.college, user.branch]
  );
  res.render("teachers", { teachers: result.rows });
});

app.get("/view-documents", async (req, res) => {
  const user = req.session.user;

  try {
    const result = await pool.query(
      `SELECT * FROM documents WHERE college = $1 AND branch = $2`,
      [user.college, user.branch]
    );

    const documents = result.rows;

    const notes = documents.filter(doc => doc.type === "note");
    const circulars = documents.filter(doc => doc.type === "circular");

    res.render("documents", { notes, circulars });

  } catch (err) {
    console.error("Error fetching documents:", err);
    res.status(500).send("Failed to fetch documents");
  }
});

// GET THE TEACHER DASHBOARD
app.get("/teacher-dashboard", async (req, res) => {
  const user = req.session.user;
  if (!user || user.role !== "teacher") return res.redirect("/login");

  try {
    const students = await pool.query(
      `SELECT * FROM users WHERE role = 'student' AND college = $1 AND branch = $2`,
      [user.college, user.branch]
    );

    const teachers = await pool.query(
      `SELECT * FROM users WHERE role = 'teacher' AND college = $1 AND branch = $2`,
      [user.college, user.branch]
    );

    const documents = await pool.query(
      `SELECT * FROM documents WHERE college = $1 AND branch = $2`,
      [user.college, user.branch]
    );

    res.render("teacherDashboard", {
      user,
      students: students.rows,
      teachers: teachers.rows,
      notes: documents.rows.filter(doc => doc.type === "notes"),
      circulars: documents.rows.filter(doc => doc.type === "circular"),
      uploadStatus: req.query.upload,
      deleted : req.query.deleted,
    });

  } catch (err) {
    console.error("Error loading teacher dashboard:", err);
    res.status(500).send("Failed to load teacher dashboard");
  }
});
  

// STUDENT DASHBOARD
app.get("/student-dashboard", async (req, res) => {
  const user = req.session.user;

  if (!user || user.role !== "student") {
    return res.redirect("/login");
  }

  try {
    const documents = await pool.query(
      `SELECT * FROM documents WHERE college = $1 AND branch = $2`,
      [user.college, user.branch]
    );

    res.render("studentDashboard", {
      user,
      notes: documents.rows.filter(doc => doc.type === "notes"),
      circulars: documents.rows.filter(doc => doc.type === "circular"),
    });
  } catch (err) {
    console.error("Student dashboard error:", err);
    res.status(500).send("Failed to load student dashboard");
  }
});
 
/*app.post("/student-login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND role = 'student'",
      [email]
    );

    if (result.rows.length === 0) {
      return res.redirect("/login?login=fail");
    }

    const user = result.rows[0];

    // Compare plain text passwords
    if (password !== user.password) {
      return res.redirect("/login?login=fail");
    }

    req.session.user = user;
    return res.redirect("/student-dashboard");
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).send("Internal Server Error");
  }
});*/
app.get("/student-dashboard", async (req, res) => {
  const user = req.session.user;

  if (!user || user.role !== "student") {
    return res.redirect("/login");
  }

  try {
    const documents = await pool.query(
      `SELECT * FROM documents WHERE college = $1 AND branch = $2`,
      [user.college, user.branch]
    );

    const assignments = await pool.query(
      `SELECT * FROM assignments WHERE submitted_by = $1`,
      [user.email]  // or username if you're using that field
    );

    const uploadSuccess = req.query.uploadSuccess || null;

    res.render("studentDashboard", {
      user,
      notes: documents.rows.filter(doc => doc.type === "notes"),
      circulars: documents.rows.filter(doc => doc.type === "circular"),
      assignments: assignments.rows,
      uploadSuccess
    });
  } catch (err) {
    console.error("Student dashboard error:", err);
    res.status(500).send("Failed to load student dashboard");
  }
});

// Dummy middleware for testing only
app.use((req, res, next) => {
  req.user = {
    college: 'SDM',  // put your college name here
    branch: 'CSE'    // put your branch name here
  };
  next();
});

// Show students of same college and branch
app.get('/teacher/view-students', async (req, res) => {
  const { college, branch } = req.user;
  try {
    const students = await pool.query(
      'SELECT name, email FROM users WHERE role = $1 AND college = $2 AND branch = $3',
      ['student', college, branch]
    );
    res.render('teacherViewStudents.ejs', { students: students.rows });
  } catch (error) {
    console.error(error);
    res.send('Error loading students.');
  }
});

// Show teachers of same college and branch
app.get('/teacher/view-teachers', async (req, res) => {
  const { college, branch } = req.user;
  try {
    const teachers = await pool.query(
      'SELECT name, email FROM users WHERE role = $1 AND college = $2 AND branch = $3',
      ['teacher', college, branch]
    );
    res.render('teacherViewTeachers.ejs', { teachers: teachers.rows });
  } catch (error) {
    console.error(error);
    res.send('Error loading teachers.');
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.log("Logout error:", err);
      return res.redirect("/dashboard"); // or wherever the user came from
    }
    res.redirect("/"); // Home page
  });
});

//LOGOUT
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
    }
    res.redirect("/"); // Redirect to homepage
  });
});


app.get("/ai-upload", (req, res) => {
  res.render("ai-upload.ejs"); // or whatever your EJS file name is
});

// Route to handle AI upload
/*app.post('/ai-upload', async (req, res) => {
  try {
    const { title, topicName, action } = req.body;

    // Get the filename from the database using the title
    const result = await pool.query(
      'SELECT filename FROM documents WHERE title = $1 LIMIT 1',
      [title]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('❌ No file found for the given title.');
    }

    const filename = result.rows[0].filename;
    const filePath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('❌ File not found on server.');
    }

    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdf(dataBuffer);
    const fileText = pdfData.text;

    let prompt;

    if (action === "summary") {
      prompt = `Summarize this entire PDF content:\n\n${fileText}`;
    } else if (action === "topic-explanation") {
      prompt = `From the following PDF text, give a detailed explanation about "${topicName}":\n\n${fileText}`;
    } else if (action === "important-questions") {
      prompt = `From the following PDF text, generate important questions for the topic "${topicName}":\n\n${fileText}`;
    } else {
      prompt = `Summarize the content:\n\n${fileText}`;
    }

    const aiResponse = await generateGeminiContent(prompt);

    res.send(`
      <h2>🧠 AI Response for ${title}</h2>
      <div style="text-align: left; padding: 20px; background: #f9f9f9; border-radius: 10px;">
        ${aiResponse.replace(/\n/g, '<br>')}
      </div>
    `);

  } catch (error) {
    console.error("Error during PDF AI handling:", error);
    res.status(500).send("⚠️ Something went wrong with the AI processing.");
  }
});*/


app.post('/ai-upload', async (req, res) => {
  try {
    const { title, topicName, action } = req.body;

    const result = await pool.query('SELECT filename FROM documents WHERE title = $1', [title]);

    if (result.rows.length === 0) {
      return res.redirect('/ai-form?fileNotFound=true');
    }

    const filename = result.rows[0].filename;
    const filePath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.redirect('/ai-form?fileNotFound=true');
    }

    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdf(dataBuffer);
    const trimmedText = pdfData.text.slice(0, 12000); // Gemini context size

    let prompt = '';
    if (action === 'summary') {
      prompt = `Summarize the following PDF content:\n\n${trimmedText}`;
    } else if (action === 'topic-explanation') {
      prompt = `Explain and summarize the topic "${topicName}" based on this content:\n\n${trimmedText}`;
    } else if (action === 'important-questions') {
      prompt = `List important questions for the topic "${topicName}" based on the content below:\n\n${trimmedText}`;
    } else {
      return res.status(400).send("Invalid action.");
    }

    const aiOutput = await generateGeminiContent(prompt);

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>AI Output</title>
        <style>
          body {
            font-family: 'Segoe UI', sans-serif;
            background-color:rgb(206, 238, 219);
            padding: 30px;
            color: #333;
          }
    
          .container {
            max-width: 800px;
            margin: auto;
            background: #ffffff;
            padding: 25px 35px;
            border-radius: 10px;
            box-shadow: 0 8px 20px rgba(0,0,0,0.08);
          }
    
          h2 {
            color: #1e88e5;
            margin-bottom: 10px;
          }
    
          h3 {
            color: #1565c0;
            margin-top: 0;
          }
    
          .output {
            text-align: left;
            background:rgb(183, 242, 188);
            padding: 20px;
            border-radius: 10px;
            line-height: 1.6;
            font-size: 16px;
            margin-top: 20px;
            white-space: pre-wrap;
          }
    
          .back-link {
            display: inline-block;
            margin-top: 25px;
            text-decoration: none;
            background: #1976d2;
            color: white;
            padding: 10px 18px;
            border-radius: 6px;
            transition: background 0.2s ease;
          }
    
          .back-link:hover {
            background: #1565c0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>🧠 AI Output for "${title}"</h2>
          ${topicName ? `<h3>Topic: ${topicName}</h3>` : ''}
          <div class="output">
            ${aiOutput.replace(/\n/g, '<br>')}
          </div>
          <a class="back-link" href="/ai-upload">🔙 Back</a>
        </div>
      </body>
      </html>
    `);
    

  } catch (error) {
    console.error("Error during AI processing:", error);
    res.status(500).send("⚠️ Error processing the file.");
  }
  
});

// Helper function to get file by title from the database (example)
async function getFileByTitle(title) {
  // Replace this with the actual database query to fetch the file associated with the title
  return pool.query('SELECT * FROM documents WHERE title = $1', [title]).then(result => result.rows[0]);
}
app.post('/upload-assignment', upload.single('assignment'), async (req, res) => {
  const user = req.session.user;
  if (!user || user.role !== 'student') return res.send('Unauthorized.');

  const { title, teacher_username } = req.body;   // renamed for clarity
  const file = req.file;

  if (!file) return res.send('No file uploaded.');

  try {
    // 1️⃣  Look‑up the teacher by their username (or email, if that’s what you store)
    const teacherRes = await pool.query(
      `SELECT email 
         FROM users 
        WHERE name = $1          -- or "email" if that’s your unique field
          AND role      = 'teacher'
          AND branch    = $2
          AND college   = $3`,
      [teacher_username, user.branch, user.college]
    );
if (teacherRes.rows.length === 0)
      return res.send('❌ Teacher not found in your branch/college.');

    const teacherEmail = teacherRes.rows[0].email;

    // 2️⃣  Insert the assignment row
   await pool.query(
  `INSERT INTO assignments 
     (title, file_path, submitted_by, teacher_username, branch, college, submitted_at)
   VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
  [title, file.filename, user.email, teacherEmail, user.branch, user.college]
);
 res.send('✅ Assignment uploaded successfully.');
  } catch (err) {
    console.error('Error uploading assignment:', err);
    res.send('Error uploading assignment.');
  }
});
app.get('/upload-assignment', (req, res) => {
  const user = req.session.user;
  if (!user || user.role !== 'student') return res.send('Unauthorized.');
  
  res.render('upload-assignment'); // Make sure upload-assignment.ejs exists in /views
});
app.get("/my-assignments", async (req, res) => {
  const user = req.session.user;
  if (!user || user.role !== "student") return res.send("Unauthorized.");

  try {
    const { rows } = await pool.query(
      "SELECT * FROM assignments WHERE submitted_by = $1 ORDER BY submitted_at DESC",
      [user.email]
    );

    console.log("Assignments fetched:", rows);  // Check the fetched assignments

    res.render("student-assignments", { assignments: rows });
  } catch (err) {
    console.error("Error loading assignments:", err);
    res.send("Error loading assignments.");
  }
});

// Route to render received assignments with student names
app.get("/received-assignments", async (req, res) => {
  const user = req.session.user;

  if (!user || user.role !== "teacher") {
    return res.redirect("/login");
  }

  try {
    // Fetch assignments where the teacher is the recipient
    const assignments = await pool.query(
      "SELECT a.id, a.title, a.file_path, a.submitted_by, a.teacher_username, a.branch, a.college, a.submitted_at, u.name AS student_name FROM assignments a LEFT JOIN users u ON a.submitted_by = u.email WHERE a.teacher_username = $1 AND a.branch = $2 AND a.college = $3",
      [user.email, user.branch, user.college]
    );

    res.render("teacher-assignments", {
      assignments: assignments.rows,
    });
  } catch (err) {
    console.error("Error fetching assignments:", err);
    res.status(500).send("Failed to fetch assignments.");
  }
});
app.post("/delete-assignment/:id", async (req, res) => {
  const user = req.session.user;
  if (!user || user.role !== "teacher") {
    return res.status(403).send("Unauthorized.");
  }

  const assignmentId = req.params.id;

  try {
    const result = await pool.query(
      "DELETE FROM assignments WHERE id = $1 AND teacher_username = $2",
      [assignmentId, user.email]
    );

    if (result.rowCount === 0) {
      return res.send("❌ Could not delete assignment (not found or not authorized).");
    }

    res.redirect("/received-assignments");
  } catch (err) {
    console.error("Error deleting assignment:", err);
    res.status(500).send("Server error while deleting.");
  }
});

app.get('/dashboard', (req, res) => {
  const role = req.session.role;

  if (role === 'student') {
    res.redirect('/student-dashboard');
  } else if (role === 'teacher') {
    res.redirect('/teacher-dashboard');
  } else if (role === 'hod') {
    res.redirect('/hod-dashboard');
  } else {
    res.redirect('/login'); // fallback if no valid role
  }
});

/*app.get('/timetable', async (req, res) => {
  try {
    // Assuming each user (student or teacher) has a unique ID to save and retrieve their timetable.
    const userId = req.session.userId; // assuming you store the user's ID in the session
    const result = await pool.query('SELECT * FROM timetable WHERE user_id = $1', [userId]);
    const timetable = result.rows[0];

    res.render('timetable.ejs', { timetable: timetable || {} }); // send timetable data to the template
  } catch (error) {
    console.error('Error retrieving timetable:', error);
    res.status(500).send('Error retrieving timetable');
  }
});*/ 

app.get('/timetable', async (req, res) => {
  
try {
    const userId = req.session.userId;
    const result = await pool.query('SELECT * FROM timetable WHERE user_id = $1', [userId]);
    const timetable = result.rows[0] || {}; // default to empty object if no record

    res.render('timetable.ejs', { timetable });
  } catch (error) {
    console.error('Error retrieving timetable:', error);
    res.status(500).send('Error retrieving timetable');
  }
});

app.post('/submit-timetable', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const fields = req.body;
  const columns = Object.keys(fields);
  const values = Object.values(fields);
  const placeholders = columns.map((_, i) => `$${i + 2}`);

  const query = `
    INSERT INTO timetable (user_id, ${columns.join(', ')})
    VALUES ($1, ${placeholders.join(', ')})
    ON CONFLICT (user_id) DO UPDATE SET
    ${columns.map(col => `${col} = EXCLUDED.${col}`).join(', ')}
  `;

  try {
    await pool.query(query, [userId, ...values]);
    res.json({ message: 'Timetable saved successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error saving timetable' });
  }
});

/*app.get('/upload-question', isTeacherLoggedIn, (req, res) => {
  res.render('upload-question'); // upload-question.ejs
});
app.get('/question-of-the-day', isStudentLoggedIn, async (req, res) => {
  // logic to fetch today's question and render it
  res.render('question-of-the-day', { questionData });
});
app.post('/upload-question', isTeacherLoggedIn, async (req, res) => {
  const { questionText, optionA, optionB, optionC, optionD, correctOption, teacherId } = req.body;

  try {
    // Check if teacher uploaded 4 questions today
    const countQuestions = await db.query(`
      SELECT COUNT(*) FROM questions
      WHERE teacher_id = $1 AND DATE(upload_time) = CURRENT_DATE
    `, [teacherId]);

    if (parseInt(countQuestions.rows[0].count) >= 4) {
      return res.status(400).send('You have already uploaded 4 questions today.');
    }

    // Generate the explanation using Gemini API
    const explanation = await generateGeminiContent(questionText);

    // Insert the question into the database
    const newQuestion = await db.query(`
      INSERT INTO questions (teacher_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, upload_time)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *
    `, [teacherId, questionText, optionA, optionB, optionC, optionD, correctOption, explanation]);

    res.status(200).send('Question uploaded successfully.');
  } catch (error) {
    res.status(500).send('Error uploading question.');
  }
});*/
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
