CREATE DATABASE IF NOT EXISTS flashcard_app;
USE flashcard_app;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS view_history;
DROP TABLE IF EXISTS flashcards;
DROP TABLE IF EXISTS decks;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('student', 'admin') NOT NULL DEFAULT 'student',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE decks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(120) NOT NULL,
    description TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE flashcards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    user_id INT NOT NULL,
    deck_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE SET NULL
);

CREATE TABLE view_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    flashcard_id INT NULL,
    action VARCHAR(30) NOT NULL,
    status VARCHAR(30) NULL,
    note TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (flashcard_id) REFERENCES flashcards(id) ON DELETE SET NULL
);

INSERT INTO users (username, password_hash, role) VALUES
(
'admin',
'8f6f9d6e1f8f4fdc2d58e41f4ec3fd1a:9b2a9d61b28f5dc4e5e6a0f1d5d96a4e0dd3f0f45c8e20e4c0df61c1bc6d4e1df4b84c87eae77d1cbd52f58d8b2043614d6f6f4f0f0f5d0fd4c65e3cb4c6f112',
'admin'
),
(
'student',
'8f6f9d6e1f8f4fdc2d58e41f4ec3fd1a:9b2a9d61b28f5dc4e5e6a0f1d5d96a4e0dd3f0f45c8e20e4c0df61c1bc6d4e1df4b84c87eae77d1cbd52f58d8b2043614d6f6f4f0f0f5d0fd4c65e3cb4c6f112',
'student'
);

SET FOREIGN_KEY_CHECKS = 1;

UPDATE users
SET role = 'admin'
WHERE username = 'admin';