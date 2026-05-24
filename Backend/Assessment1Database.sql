CREATE DATABASE IF NOT EXISTS flashcard_app;
USE flashcard_app;

DROP TABLE IF EXISTS view_history;
DROP TABLE IF EXISTS flashcards;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('student', 'admin') NOT NULL DEFAULT 'student',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE flashcards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE view_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    flashcard_id INT NULL,
    action VARCHAR(30) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (flashcard_id) REFERENCES flashcards(id) ON DELETE SET NULL
);

-- Password for both starter accounts is: password123
INSERT INTO users (username, password_hash, role) VALUES
('admin', 'b5c0015320e6cad03ed422655b18071d:c57bd68a206133e44fd3cf114b0ee3f97080e5f66bd9197e0abd3d43c51020497d58347761446072453392c2f24e1da16b0f3244a52206e439cb560d6a4f7152', 'admin'),
('student', 'b5c0015320e6cad03ed422655b18071d:c57bd68a206133e44fd3cf114b0ee3f97080e5f66bd9197e0abd3d43c51020497d58347761446072453392c2f24e1da16b0f3244a52206e439cb560d6a4f7152', 'student');

INSERT INTO flashcards (question, answer, user_id) VALUES
('What does CRUD stand for?', 'Create, Read, Update, Delete', 1),
('What is JWT used for?', 'It proves the user is logged in when calling protected API routes.', 1),
('What does live search do?', 'It filters results immediately while the user types.', 2);

INSERT INTO view_history (user_id, flashcard_id, action) VALUES
(1, 1, 'create'),
(1, 2, 'create'),
(2, 3, 'create');
