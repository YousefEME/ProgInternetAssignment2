# CardFlash

CardFlash is a simple flashcard learning app for creating, searching, editing, deleting, and studying flashcards in the browser. It extends the Assignment 1 idea into a dynamic single-page app with a Node.js backend and MySQL database.

## Features

- Registration and login with hashed passwords and signed JWT-style tokens.
- Live search that filters flashcards immediately while the user types.
- Full CRUD operations for flashcards: create, read, update, and delete.
- Activity/history tracking for user actions such as login, create, update, delete, and card views.
- Admin account can view all user activity; student accounts can view their own activity.
- Interface updates immediately after adding, editing, or deleting without refreshing the page.

## Technical Stack

- Frontend: HTML, CSS, and vanilla JavaScript.
- Backend: Node.js, Express, CORS, dotenv, and mysql2.
- Database: MySQL.
- Authentication: PBKDF2 password hashing using Node crypto and signed tokens.

## How To Run

1. Import the database:

```sql
SOURCE Backend/Assessment1Database.sql;
```

2. Create or update `Backend/.env`:

```env
DB_HOST=localhost
DB_USER=root
DB_PASS=your_mysql_password
DB_NAME=flashcard_app
JWT_SECRET=choose-a-secret-value
```

3. Start the backend:

```bash
cd Backend
npm install
npm run dev
```

4. In a second terminal, start the frontend:

```bash
cd Frontend
npm run dev
```

5. Open the app:

```text
http://localhost:8080
```

The backend runs on `http://localhost:3000`.

## Demo Accounts

- Admin: `admin` / `password123`
- Student: `student` / `password123`

## Folder Structure

- `Backend/server.js`: Express API, authentication, flashcard CRUD routes, and activity routes.
- `Backend/Assessment1Database.sql`: MySQL database export with tables and seed data.
- `Backend/package.json`: Backend dependencies and start script.
- `Frontend/index.html`: Single HTML page for login and the app interface.
- `Frontend/script.js`: Frontend state, API requests, live search, and immediate UI updates.
- `Frontend/style.css`: Styling and responsive layout.

## Entity Summary

- `users`: stores registered users, password hashes, roles, and creation time.
- `flashcards`: stores flashcard questions and answers.
- `view_history`: stores login, registration, CRUD, and study activity.

## Workload Allocation

Update this section with your group member names before submission.

- Member 1: frontend interface, `Frontend/index.html`, `Frontend/style.css`, `Frontend/script.js`.
- Member 2: backend API and database, `Backend/server.js`, `Backend/Assessment1Database.sql`.
- Member 3: README, testing, demo preparation.
