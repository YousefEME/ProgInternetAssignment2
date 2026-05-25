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

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'flashcard_app',
    waitForConnections: true,
    connectionLimit: 10
});

function base64Url(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(input) {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf8');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
    const [salt, originalHash] = storedPassword.split(':');
    const attemptedHash = hashPassword(password, salt).split(':')[1];
    if (!originalHash || originalHash.length !== attemptedHash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(originalHash), Buffer.from(attemptedHash));
}

function createToken(user) {
    const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64Url(JSON.stringify({
        id: user.id,
        username: user.username,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4
    }));
    const signature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${header}.${payload}`)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
    try {
        const [header, payload, signature] = token.split('.');
        if (!header || !payload || !signature) return null;

        const expectedSignature = crypto
            .createHmac('sha256', JWT_SECRET)
            .update(`${header}.${payload}`)
            .digest('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');

        if (signature !== expectedSignature) return null;

        const user = JSON.parse(base64UrlDecode(payload));
        if (user.exp < Math.floor(Date.now() / 1000)) return null;
        return user;
    } catch (err) {
        return null;
    }
}

function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = token ? verifyToken(token) : null;

    if (!user) {
        return res.status(401).json({ message: 'Please login first.' });
    }

    req.user = user;
    next();
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required.' });
    }
    next();
}

function requireStudent(req, res, next) {
    if (req.user.role !== 'student') {
        return res.status(403).json({ message: 'Only students can record learning progress.' });
    }
    next();
}

async function logActivity(userId, action, flashcardId = null, status = null, note = null) {
    await db.query(
        'INSERT INTO view_history (user_id, flashcard_id, action, status, note) VALUES (?, ?, ?, ?, ?)',
        [userId, flashcardId, action, status, note]
    );
}

async function usersTableHasEmail() {
    const [columns] = await db.query("SHOW COLUMNS FROM users LIKE 'email'");
    return columns.length > 0;
}

app.get('/health', async (req, res) => {
    await db.query('SELECT 1');
    res.json({ message: 'CardFlash API is running' });
});

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

// Fetch all flashcard decks. Maps the database column "title" to "name" to keep the frontend happy.
app.get('/decks', requireAuth, async (req, res) => {
    try {
        const [decks] = await db.query('SELECT id, title AS name FROM decks ORDER BY title');
        res.json(decks);
    } catch (err) {
        console.error('Error fetching decks:', err);
        res.status(500).json({ message: 'Failed to fetch decks.' });
    }
});

// Create a new deck. Inserts into the pre-existing "title" column to retain database compatibility.
app.post('/decks', requireAuth, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Deck name is required.' });
    }
    try {
        const [result] = await db.query('INSERT INTO decks (title, user_id) VALUES (?, ?)', [name.trim(), req.user.id]);
        res.status(201).json({ id: result.insertId, name: name.trim() });
    } catch (err) {
        console.error('Error creating deck:', err);
        res.status(500).json({ message: 'Failed to create deck.' });
    }
});

// Fetch flashcards filtered by search query and/or deck selection.
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

    // Filter by deck: handles unassigned deck state ('none') vs specific deck ID numbers.
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

app.post('/cards/:id/view', requireAuth, async (req, res) => {
    // Disabled view logging to history per user request. Pure UI flip only.
    res.json({ message: 'View logging disabled' });
});

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

        // Check if there is an existing practice record for this user and flashcard
        const [existing] = await db.query(
            "SELECT id FROM view_history WHERE user_id = ? AND flashcard_id = ? AND action = 'practice' ORDER BY id ASC",
            [req.user.id, req.params.id]
        );

        if (existing.length) {
            // Update the primary record
            await db.query(
                "UPDATE view_history SET status = ?, note = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
                [status, note.trim() || null, existing[0].id]
            );
            // Clean up any extra duplicate practice rows if they exist to keep the history clean
            if (existing.length > 1) {
                const extraIds = existing.slice(1).map(r => r.id);
                await db.query("DELETE FROM view_history WHERE id IN (?)", [extraIds]);
            }
        } else {
            // Insert a new practice record
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

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong on the server.' });
});

// Database Auto-Migration: Sets up the tables at startup if they don't already exist.
async function runMigrations() {
    // Recreates the decks table with title/description parameters matching existing tables.
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

    // Checks and alters the flashcards schema dynamically to add deck association.
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
