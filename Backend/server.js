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

async function logActivity(userId, action, flashcardId = null) {
    await db.query(
        'INSERT INTO view_history (user_id, flashcard_id, action) VALUES (?, ?, ?)',
        [userId, flashcardId, action]
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
        const user = { id: result.insertId, username, role: 'student' };
        await logActivity(user.id, 'register');
        res.status(201).json({ token: createToken(user), user });
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

app.get('/cards', requireAuth, async (req, res) => {
    const search = `%${req.query.search || ''}%`;
    const [cards] = await db.query(
        `SELECT f.id, f.question, f.answer, f.user_id, u.username AS created_by
         FROM flashcards f
         JOIN users u ON u.id = f.user_id
         WHERE f.question LIKE ? OR f.answer LIKE ?
         ORDER BY f.created_at DESC`,
        [search, search]
    );
    res.json(cards);
});

app.post('/cards', requireAuth, async (req, res) => {
    const { question, answer } = req.body;

    if (!question || !answer) {
        return res.status(400).json({ message: 'Question and answer are required.' });
    }

    const [result] = await db.query(
        'INSERT INTO flashcards (question, answer, user_id) VALUES (?, ?, ?)',
        [question, answer, req.user.id]
    );
    await logActivity(req.user.id, 'create', result.insertId);

    res.status(201).json({
        id: result.insertId,
        question,
        answer,
        user_id: req.user.id,
        created_by: req.user.username
    });
});

app.put('/cards/:id', requireAuth, async (req, res) => {
    const { question, answer } = req.body;
    const { id } = req.params;

    if (!question || !answer) {
        return res.status(400).json({ message: 'Question and answer are required.' });
    }

    const [result] = await db.query(
        'UPDATE flashcards SET question = ?, answer = ? WHERE id = ?',
        [question, answer, id]
    );

    if (!result.affectedRows) {
        return res.status(404).json({ message: 'Flashcard not found.' });
    }

    await logActivity(req.user.id, 'update', id);
    res.json({ id: Number(id), question, answer });
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
    await logActivity(req.user.id, 'view', req.params.id);
    res.json({ message: 'View recorded' });
});

app.get('/history', requireAuth, async (req, res) => {
    const [history] = await db.query(
        `SELECT h.id, h.action, h.created_at, u.username, f.question
         FROM view_history h
         JOIN users u ON u.id = h.user_id
         LEFT JOIN flashcards f ON f.id = h.flashcard_id
         WHERE h.user_id = ?
         ORDER BY h.created_at DESC
         LIMIT 15`,
        [req.user.id]
    );
    res.json(history);
});

app.get('/admin/history', requireAuth, requireAdmin, async (req, res) => {
    const [history] = await db.query(
        `SELECT h.id, h.action, h.created_at, u.username, f.question
         FROM view_history h
         JOIN users u ON u.id = h.user_id
         LEFT JOIN flashcards f ON f.id = h.flashcard_id
         ORDER BY h.created_at DESC
         LIMIT 50`
    );
    res.json(history);
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong on the server.' });
});

app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    try {
        await db.query('SELECT 1');
        console.log('Connected to MySQL');
    } catch (err) {
        console.error('Database connection failed:', err.message || err.code || err);
    }
});
