require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();
app.use(cors());
app.use(express.json());

// Use ONE variable name (db)
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'flashcard_app'
});

// Connect to MySQL
db.connect(err => {
    if (err) {
        console.error("Database connection failed:", err.message);
        return;
    }
    console.log("Connected to MySQL");
});

// GET
app.get('/cards', (req, res) => {
    db.query('SELECT * FROM flashcards', (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});

// POST
app.post('/cards', (req, res) => {
    const { question, answer } = req.body;

    db.query(
        'INSERT INTO flashcards (question, answer) VALUES (?, ?)',
        [question, answer],
        (err) => {
            if (err) throw err;
            res.json({ message: "Card added" });
        }
    );

});

// DELETE
app.delete('/cards/:id', (req, res) => {
    const id = req.params.id;

    db.query(
        'DELETE FROM flashcards WHERE id = ?',
        [id],
        (err) => {
            if (err) throw err;
            res.json({ message: "Deleted" });
        }
    );
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});