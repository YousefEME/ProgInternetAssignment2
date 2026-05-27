# CardFlash

CardFlash is a flashcard learning web application that allows students to create, organise, search, edit, delete, and study flashcards in a responsive single-page interface.

The application was designed to solve the problem of inefficient flashcard study systems by providing:
- fast flashcard management,
- live search,
- deck organisation,
- learning progress tracking,
- and role-based admin monitoring.

The project extends the Assignment 1 concept into a complete full-stack web application using a Node.js backend and MySQL database.

---

# Features

## Authentication and Security
- User registration and login system
- Password hashing using PBKDF2 with Node.js crypto
- Signed JWT-style authentication tokens
- Role-based access control for admin and student accounts
- Protected backend API routes

## Flashcard Management
- Create flashcards
- Read/view flashcards
- Edit flashcards
- Delete flashcards
- Organise flashcards into decks
- Real-time live search filtering

## Learning Features
- Mark cards as Known or Need Practice
- Store optional learning notes
- Track learning history and progress
- Student progress summaries
- Admin dashboard for monitoring all students

## User Experience
- Single Page Application design
- Immediate UI updates without page refresh
- Responsive layout and consistent styling
- Fast API interactions using asynchronous requests

---

# Business Logic and Entities

The application contains CRUD operations across multiple conceptual entities:

## Users
Stores:
- usernames
- hashed passwords
- account roles
- account creation timestamps

## Flashcards
Stores:
- questions
- answers
- associated user
- deck assignment

## Decks
Stores:
- deck titles
- descriptions
- ownership relationships

## View History
Stores:
- study activity
- learning progress
- notes
- CRUD activity history

---

# Technical Stack

## Frontend
- HTML5
- CSS3
- Vanilla JavaScript

## Backend
- Node.js
- Express.js
- mysql2
- dotenv
- cors

## Database
- MySQL

## Authentication
- PBKDF2 password hashing
- Token-based authentication
- Role-based authorisation

---

# How To Run The Application

## 1. Import the database

Open MySQL Workbench and run:

```sql
SOURCE Backend/Assessment2Database.sql;
```

---

## 2. Configure environment variables

Create or update:

```text
Backend/.env
```

Add:

```env
DB_HOST=localhost
DB_USER=root
DB_PASS=your_mysql_password
DB_NAME=flashcard_app
```

---

## 3. Install backend dependencies

```bash
cd Backend
npm install
```

---

## 4. Start backend server

```bash
npm run dev
```

Backend runs on:

```text
http://localhost:3000
```

---

## 5. Start frontend

Open a second terminal:

```bash
cd Frontend
npm install
npm run dev
```

Frontend runs on:

```text
http://localhost:8080
```

---

# Demo Account Setup

## Admin Account
1. Register:
   - Username: `admin`
   - Password: `password123`

2. Promote account to admin in MySQL:

```sql
USE flashcard_app;

UPDATE users
SET role = 'admin'
WHERE username = 'admin';
```

---

## Student Account

Register:
- Username: `student`
- Password: `password123`

---

# Folder Structure

## Backend

### `server.js`
Contains:
- Express API routes
- authentication logic
- token handling
- flashcard CRUD operations
- admin routes
- database migrations

### `Assessment1Database.sql`
Contains:
- database schema
- table definitions
- relationships
- foreign keys

### `package.json`
Backend dependencies and scripts.

---

## Frontend

### `index.html`
Main SPA structure and interface.

### `script.js`
Handles:
- API requests
- authentication
- UI rendering
- flashcard logic
- live search
- state management

### `style.css`
Application styling and responsive layout.

---

# Security Features

- Passwords are never stored in plain text
- PBKDF2 hashing with salt is used
- Protected API endpoints require valid tokens
- Admin-only routes are protected with role checks
- Input validation is implemented on backend routes

---

# Error Handling

The application includes:
- login validation
- registration validation
- protected route handling
- API error responses
- invalid input handling
- database error handling

---

# Professional Practices

- Git version control used throughout development
- Meaningful commits used during implementation
- Environment variables used for database configuration
- No sensitive credentials hardcoded into source files

---

# Workload Allocation

This assignment was completed individually.

All frontend, backend, database, authentication, and UI functionality was designed and implemented by:
- Yousef El-Omar

Files created and maintained individually:
- Backend/server.js
- Backend/Assessment2Database.sql
- Frontend/index.html
- Frontend/script.js
- Frontend/style.css
- README.md

---

# Future Improvements

Potential future improvements include:
- spaced repetition algorithms
- flashcard sharing
- image-based flashcards
- password reset functionality
- email verification
- analytics dashboard
- mobile optimisation
