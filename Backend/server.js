require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-for-submission';

// Create a connection pool so multiple requests can query the database concurrently
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'flashcard_app',
    waitForConnections: true,
    connectionLimit: 10
});

// Encode a string to base64url format (URL-safe base64 with no padding)
// Used when building JWT header and payload
function base64Url(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

// Decode a base64url string back to a UTF-8 string
// Used when verifying and reading a JWT payload
function base64UrlDecode(input) {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf8');
}

// Hash a password using PBKDF2 with a random salt
// If a salt is provided (e.g. when verifying), it uses that instead of generating a new one
// Returns a string in the format "salt:hash"
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

// Compare a plaintext password against a stored "salt:hash" string
// Uses timing-safe comparison to prevent timing attacks
function verifyPassword(password, storedPassword) {
    const [salt, originalHash] = storedPassword.split(':');
    const attemptedHash = hashPassword(password, salt).split(':')[1];
    if (!originalHash || originalHash.length !== attemptedHash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(originalHash), Buffer.from(attemptedHash));
}

// Create a signed JWT token for a user containing their id, username, role, and expiry
// Token expires after 4 hours
function createToken(user) {
    const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64Url(JSON.stringify({
        id: user.id,
        username: user.username,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4
    }));

    // Sign the header and payload together using HMAC-SHA256
    const signature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${header}.${payload}`)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    return `${header}.${payload}.${signature}`;
}

// Verify a JWT token and return the decoded user payload if valid
// Returns null if the token is missing, tampered with, or expired
function verifyToken(token) {
    try {
        const [header, payload, signature] = token.split('.');
        if (!header || !payload || !signature) return null;

        // Recompute the expected signature and compare against the provided one
        const expectedSignature = crypto
            .createHmac('sha256', JWT_SECRET)
            .update(`${header}.${payload}`)
            .digest('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');

        if (signature !== expectedSignature) return null;

        const user = JSON.parse(base64UrlDecode(payload));

        // Reject the token if it has passed its expiry timestamp
        if (user.exp < Math.floor(Date.now() / 1000)) return null;
        return user;
    } catch (err) {
        return null;
    }
}

// Middleware: blocks requests that don't have a valid JWT in the Authorization header
// Attaches the decoded user to req.user so route handlers can access it
function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = token ? verifyToken(token) : null;

    if (!user) {
        return res.status(401).json({ message: 'Please login first.' });
    }

    req.user = user;
    next();
}

// Middleware: blocks non-admin users from accessing admin-only routes
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required.' });
    }
    next();
}

// Middleware: blocks non-student users from recording learning progress
function requireStudent(req, res, next) {
    if (req.user.role !== 'student') {
        return res.status(403).json({ message: 'Only students can record learning progress.' });
    }
    next();
}

// Insert a record into view_history to log user activity
// flashcardId, status and note are optional depending on the action type
async function logActivity(userId, action, flashcardId = null, status = null, note = null) {
    await db.query(
        'INSERT INTO view_history (user_id, flashcard_id, action, status, note) VALUES (?, ?, ?, ?, ?)',
        [userId, flashcardId, action, status, note]
    );
}

// Check whether the users table has an email column
// Used during registration to handle databases with and without the email column
async function usersTableHasEmail() {
    const [columns] = await db.query("SHOW COLUMNS FROM users LIKE 'email'");
    return columns.length > 0;
}

// Health check endpoint to confirm the API and database connection are working
app.get('/health', async (req, res) => {
    await db.query('SELECT 1');
    res.json({ message: 'CardFlash API is running' });
});

// Register a new student account with a username and password
// Rejects duplicate usernames and passwords shorter than 6 characters
app.post('/auth/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password || password.length < 6) {
        return res.status(400).json({ message: 'Username and a 6+ character password are required.' });
    }

    try {
        const [existingUsers] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
        if (existingUsers.length) {
            return res.status(409).json({ message: 'That username is already taken.' });
        }

        // Insert with or without email column depending on the database schema
        const hasEmail = await usersTableHasEmail();
        const [result] = hasEmail
            ? await db.query(
                'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
                [username, `${username}@cardflash.local`, hashPassword(password), 'student']
            )
            : await db.query(
                'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                [username, hashPassword(password), 'student']
            );

        await logActivity(result.insertId, 'register');
        res.status(201).json({ message: 'Account created. Please login with your new student account.' });
    } catch (err) {
        res.status(500).json({ message: 'Registration failed.' });
    }
});

// Log in with a username and password
// Returns a JWT token and basic user info on success
app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    try {
        const [users] = await db.query(
            'SELECT id, username, password_hash, role FROM users WHERE username = ?',
            [username]
        );
        const user = users[0];

        // Return the same error message whether the username or password is wrong
        // to avoid leaking which one is incorrect
        if (!user || !verifyPassword(password, user.password_hash)) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        await logActivity(user.id, 'login');
        res.json({
            token: createToken(user),
            user: { id: user.id, username: user.username, role: user.role }
        });
    } catch (err) {
        res.status(500).json({ message: 'Login failed.' });
    }
});

// Fetch all flashcard decks, mapping "title" to "name" to match the frontend
app.get('/decks', requireAuth, async (req, res) => {
    try {
        const [decks] = await db.query('SELECT id, title AS name FROM decks ORDER BY title');
        res.json(decks);
    } catch (err) {
        console.error('Error fetching decks:', err);
        res.status(500).json({ message: 'Failed to fetch decks.' });
    }
});

// Create a new deck owned by the logged-in user
app.post('/decks', requireAuth, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Deck name is required.' });
    }
    try {
        const [result] = await db.query(
            'INSERT INTO decks (title, user_id) VALUES (?, ?)',
            [name.trim(), req.user.id]
        );
        res.status(201).json({ id: result.insertId, name: name.trim() });
    } catch (err) {
        console.error('Error creating deck:', err);
        res.status(500).json({ message: 'Failed to create deck.' });
    }
});

// Fetch flashcards with optional search and deck filter
// Also joins in the most recent practice status for the logged-in user
app.get('/cards', requireAuth, async (req, res) => {
    const search = `%${req.query.search || ''}%`;
    const deckId = req.query.deck_id;

    let query = `
        SELECT f.id, f.question, f.answer, f.user_id, f.deck_id, u.username AS created_by,
               latest.status AS learning_status, latest.note AS latest_note
        FROM flashcards f
        JOIN users u ON u.id = f.user_id
        LEFT JOIN view_history latest ON latest.id = (
            SELECT h.id
            FROM view_history h
            WHERE h.user_id = ? AND h.flashcard_id = f.id AND h.action = 'practice'
            ORDER BY h.created_at DESC, h.id DESC
            LIMIT 1
        )
        WHERE (f.question LIKE ? OR f.answer LIKE ?)
    `;
    const params = [req.user.id, search, search];

    // 'none' filters for cards with no deck assigned, a specific ID filters by that deck
    if (deckId === 'none') {
        query += ` AND f.deck_id IS NULL`;
    } else if (deckId && deckId !== 'all') {
        query += ` AND f.deck_id = ?`;
        params.push(Number(deckId));
    }

    query += ` ORDER BY f.created_at DESC`;

    try {
        const [cards] = await db.query(query, params);
        res.json(cards);
    } catch (err) {
        console.error('Error retrieving flashcards:', err);
        res.status(500).json({ message: 'Failed to retrieve flashcards.' });
    }
});

// Create a new flashcard, optionally assigning it to a deck
app.post('/cards', requireAuth, async (req, res) => {
    const { question, answer, deck_id } = req.body;

    if (!question || !answer) {
        return res.status(400).json({ message: 'Question and answer are required.' });
    }

    try {
        const [result] = await db.query(
            'INSERT INTO flashcards (question, answer, user_id, deck_id) VALUES (?, ?, ?, ?)',
            [question, answer, req.user.id, deck_id ? Number(deck_id) : null]
        );
        await logActivity(req.user.id, 'create', result.insertId);

        res.status(201).json({
            id: result.insertId,
            question,
            answer,
            user_id: req.user.id,
            deck_id: deck_id ? Number(deck_id) : null,
            created_by: req.user.username
        });
    } catch (err) {
        res.status(500).json({ message: 'Failed to create flashcard.' });
    }
});

// Update an existing flashcard's question, answer, and deck assignment
app.put('/cards/:id', requireAuth, async (req, res) => {
    const { question, answer, deck_id } = req.body;
    const { id } = req.params;

    if (!question || !answer) {
        return res.status(400).json({ message: 'Question and answer are required.' });
    }

    try {
        const [result] = await db.query(
            'UPDATE flashcards SET question = ?, answer = ?, deck_id = ? WHERE id = ?',
            [question, answer, deck_id ? Number(deck_id) : null, id]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ message: 'Flashcard not found.' });
        }

        await logActivity(req.user.id, 'update', id);
        res.json({ id: Number(id), question, answer, deck_id: deck_id ? Number(deck_id) : null });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update flashcard.' });
    }
});

// Delete a flashcard by ID, logging the action before removing it
app.delete('/cards/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const [cards] = await db.query('SELECT id FROM flashcards WHERE id = ?', [id]);

    if (!cards.length) {
        return res.status(404).json({ message: 'Flashcard not found.' });
    }

    await logActivity(req.user.id, 'delete', id);
    await db.query('DELETE FROM flashcards WHERE id = ?', [id]);
    res.json({ message: 'Deleted' });
});

// View logging is disabled, card flipping is handled purely on the frontend
app.post('/cards/:id/view', requireAuth, async (req, res) => {
    res.json({ message: 'View logging disabled' });
});

// Record a student's practice result (known or not_known) for a flashcard
// Updates the existing record if one exists, otherwise inserts a new one
app.post('/cards/:id/progress', requireAuth, requireStudent, async (req, res) => {
    const { status, note = '' } = req.body;
    const allowedStatuses = ['known', 'not_known'];

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ message: 'Choose Known or Need Practice.' });
    }

    try {
        const [cards] = await db.query('SELECT id, question FROM flashcards WHERE id = ?', [req.params.id]);
        if (!cards.length) {
            return res.status(404).json({ message: 'Flashcard not found.' });
        }

        const [existing] = await db.query(
            "SELECT id FROM view_history WHERE user_id = ? AND flashcard_id = ? AND action = 'practice' ORDER BY id ASC",
            [req.user.id, req.params.id]
        );

        if (existing.length) {
            // Update the earliest practice record and delete any duplicates
            await db.query(
                "UPDATE view_history SET status = ?, note = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
                [status, note.trim() || null, existing[0].id]
            );
            if (existing.length > 1) {
                const extraIds = existing.slice(1).map(r => r.id);
                await db.query("DELETE FROM view_history WHERE id IN (?)", [extraIds]);
            }
        } else {
            await logActivity(req.user.id, 'practice', req.params.id, status, note.trim() || null);
        }

        res.json({
            id: Number(req.params.id),
            question: cards[0].question,
            learning_status: status,
            latest_note: note.trim() || null
        });
    } catch (err) {
        res.status(500).json({ message: 'Failed to record progress.' });
    }
});

// Return the last 15 activity records for the logged-in user, excluding view events
app.get('/history', requireAuth, async (req, res) => {
    const [history] = await db.query(
        `SELECT h.id, h.flashcard_id, h.action, h.status, h.note, h.created_at, u.username, f.question
         FROM view_history h
         JOIN users u ON u.id = h.user_id
         LEFT JOIN flashcards f ON f.id = h.flashcard_id
         WHERE h.user_id = ? AND h.action != 'view'
         ORDER BY h.created_at DESC
         LIMIT 15`,
        [req.user.id]
    );
    res.json(history);
});

// Admin only: return the last 50 activity records across all students
app.get('/admin/history', requireAuth, requireAdmin, async (req, res) => {
    const [history] = await db.query(
        `SELECT h.id, h.flashcard_id, h.action, h.status, h.note, h.created_at, u.username, f.question
         FROM view_history h
         JOIN users u ON u.id = h.user_id
         LEFT JOIN flashcards f ON f.id = h.flashcard_id
         WHERE u.role = 'student' AND h.action != 'view'
         ORDER BY h.created_at DESC
         LIMIT 50`
    );
    res.json(history);
});

// Admin only: return a summary of each student's known vs not_known card counts
// and when they last practised
app.get('/admin/progress-summary', requireAuth, requireAdmin, async (req, res) => {
    const [summary] = await db.query(
        `SELECT u.username,
                COALESCE(SUM(latest.status = 'known'), 0) AS known_count,
                COALESCE(SUM(latest.status = 'not_known'), 0) AS not_known_count,
                COUNT(latest.id) AS marked_cards,
                MAX(latest.created_at) AS last_practised
         FROM users u
         LEFT JOIN view_history latest ON latest.user_id = u.id
             AND latest.action = 'practice'
             AND latest.id = (
                 SELECT h.id
                 FROM view_history h
                 WHERE h.user_id = u.id
                   AND h.flashcard_id = latest.flashcard_id
                   AND h.action = 'practice'
                 ORDER BY h.created_at DESC, h.id DESC
                 LIMIT 1
             )
         WHERE u.role = 'student'
         GROUP BY u.id, u.username
         ORDER BY u.username`
    );
    res.json(summary);
});

// Global error handler for any unhandled errors thrown in route handlers
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong on the server.' });
});

// Run database migrations on startup to create any missing tables or columns
async function runMigrations() {
    // Create the decks table if it does not already exist
    await db.query(`
        CREATE TABLE IF NOT EXISTS decks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title VARCHAR(120) NOT NULL,
            description TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Add deck_id to flashcards if it is missing, linking cards to decks
    const [columns] = await db.query("SHOW COLUMNS FROM flashcards LIKE 'deck_id'");
    if (columns.length === 0) {
        await db.query("ALTER TABLE flashcards ADD COLUMN deck_id INT NULL");
        await db.query("ALTER TABLE flashcards ADD FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE SET NULL");
        console.log("Migration: Added deck_id column to flashcards");
    }
}

app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    try {
        await db.query('SELECT 1');
        console.log('Connected to MySQL');
        await runMigrations();
        console.log('Database migrations completed successfully');
    } catch (err) {
        console.error('Database connection or migration failed:', err.message || err.code || err);
    }
});