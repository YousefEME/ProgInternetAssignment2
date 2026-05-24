const API_URL = 'http://localhost:3000';

let currentUser = JSON.parse(localStorage.getItem('cardflashUser') || 'null');
let token = localStorage.getItem('cardflashToken');
let cards = [];
let currentFlashcardIndex = 0;
let searchTerm = '';

const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const authForm = document.getElementById('auth-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const registerButton = document.getElementById('register-button');
const logoutButton = document.getElementById('logout-button');
const authMessage = document.getElementById('auth-message');
const cardMessage = document.getElementById('card-message');
const welcome = document.getElementById('welcome');
const searchInput = document.getElementById('search-input');
const cardForm = document.getElementById('card-form');
const editingIdInput = document.getElementById('editing-id');
const questionInput = document.getElementById('new-question');
const answerInput = document.getElementById('new-answer');
const saveCardButton = document.getElementById('save-card-button');
const cancelEditButton = document.getElementById('cancel-edit-button');
const container = document.getElementById('container');
const cardList = document.getElementById('card-list');
const historyList = document.getElementById('history-list');
const historyTitle = document.getElementById('history-title');

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
    };
}

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers
        }
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || 'Request failed.');
    }

    return data;
}

function showMessage(element, text, isError = false) {
    element.textContent = text;
    element.classList.toggle('error', isError);
    if (text) {
        setTimeout(() => {
            element.textContent = '';
            element.classList.remove('error');
        }, 3000);
    }
}

function showApp() {
    const isLoggedIn = Boolean(token && currentUser);
    authView.classList.toggle('hidden', isLoggedIn);
    appView.classList.toggle('hidden', !isLoggedIn);
    logoutButton.classList.toggle('hidden', !isLoggedIn);

    if (isLoggedIn) {
        welcome.textContent = `Logged in as ${currentUser.username} (${currentUser.role})`;
        historyTitle.textContent = currentUser.role === 'admin' ? 'All User Activity' : 'My Activity';
        loadCards();
        loadHistory();
    }
}

async function login(event) {
    event.preventDefault();

    try {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                username: usernameInput.value.trim(),
                password: passwordInput.value
            })
        });
        saveSession(data);
        showApp();
    } catch (err) {
        showMessage(authMessage, err.message, true);
    }
}

async function register() {
    try {
        const data = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                username: usernameInput.value.trim(),
                password: passwordInput.value
            })
        });
        saveSession(data);
        showApp();
    } catch (err) {
        showMessage(authMessage, err.message, true);
    }
}

function saveSession(data) {
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('cardflashToken', token);
    localStorage.setItem('cardflashUser', JSON.stringify(currentUser));
    authForm.reset();
}

function logout() {
    token = null;
    currentUser = null;
    cards = [];
    localStorage.removeItem('cardflashToken');
    localStorage.removeItem('cardflashUser');
    showApp();
}

async function loadCards() {
    try {
        cards = await apiRequest(`/cards?search=${encodeURIComponent(searchTerm)}`);
        currentFlashcardIndex = 0;
        renderCards();
    } catch (err) {
        showMessage(cardMessage, err.message, true);
    }
}

function renderCards() {
    container.innerHTML = '';
    cardList.innerHTML = '';

    if (!cards.length) {
        container.innerHTML = '<div class="empty-state">No flashcards found.</div>';
        cardList.innerHTML = '<p class="muted">Try adding a card or changing your search.</p>';
        updateCounter(0);
        return;
    }

    cards.forEach((card, index) => {
        const flashcard = document.createElement('button');
        flashcard.className = `flashcard ${index === currentFlashcardIndex ? 'active' : ''}`;
        flashcard.type = 'button';
        flashcard.dataset.id = card.id;
        flashcard.innerHTML = `
            <span class="content question">${escapeHtml(card.question)}</span>
            <span class="content answer hidden">${escapeHtml(card.answer)}</span>
        `;
        flashcard.addEventListener('click', () => flipCard(flashcard, card.id));
        container.appendChild(flashcard);

        const item = document.createElement('article');
        item.className = 'list-card';
        item.innerHTML = `
            <div>
                <strong>${escapeHtml(card.question)}</strong>
                <p>${escapeHtml(card.answer)}</p>
                <small>Created by ${escapeHtml(card.created_by || 'unknown')}</small>
            </div>
            <div class="list-actions">
                <button type="button" data-action="edit">Edit</button>
                <button type="button" data-action="delete" class="danger-button">Delete</button>
            </div>
        `;
        item.querySelector('[data-action="edit"]').addEventListener('click', () => startEdit(card));
        item.querySelector('[data-action="delete"]').addEventListener('click', () => deleteFlashcard(card.id));
        cardList.appendChild(item);
    });

    updateCounter(cards.length);
}

async function flipCard(cardElement, id) {
    cardElement.querySelector('.question').classList.toggle('hidden');
    cardElement.querySelector('.answer').classList.toggle('hidden');

    try {
        await apiRequest(`/cards/${id}/view`, { method: 'POST' });
        loadHistory();
    } catch (err) {
        console.error(err);
    }
}

function showFlashcard(index) {
    const flashcards = document.querySelectorAll('.flashcard');
    flashcards.forEach((card, i) => {
        card.classList.toggle('active', i === index);
    });
}

function nextFlashcard() {
    if (!cards.length) return;
    currentFlashcardIndex = (currentFlashcardIndex + 1) % cards.length;
    showFlashcard(currentFlashcardIndex);
}

function prevFlashcard() {
    if (!cards.length) return;
    currentFlashcardIndex = (currentFlashcardIndex - 1 + cards.length) % cards.length;
    showFlashcard(currentFlashcardIndex);
}

async function saveFlashcard(event) {
    event.preventDefault();

    const question = questionInput.value.trim();
    const answer = answerInput.value.trim();
    const editingId = editingIdInput.value;

    if (!question || !answer) {
        showMessage(cardMessage, 'Please enter both a question and an answer.', true);
        return;
    }

    try {
        if (editingId) {
            const updatedCard = await apiRequest(`/cards/${editingId}`, {
                method: 'PUT',
                body: JSON.stringify({ question, answer })
            });
            cards = cards.map(card => card.id === updatedCard.id ? { ...card, ...updatedCard } : card);
            showMessage(cardMessage, 'Flashcard updated.');
        } else {
            const createdCard = await apiRequest('/cards', {
                method: 'POST',
                body: JSON.stringify({ question, answer })
            });
            if (matchesSearch(createdCard)) {
                cards.unshift(createdCard);
            }
            showMessage(cardMessage, 'Flashcard added.');
        }

        resetCardForm();
        renderCards();
        loadHistory();
    } catch (err) {
        showMessage(cardMessage, err.message, true);
    }
}

function startEdit(card) {
    editingIdInput.value = card.id;
    questionInput.value = card.question;
    answerInput.value = card.answer;
    saveCardButton.textContent = 'Save Changes';
    cancelEditButton.classList.remove('hidden');
    questionInput.focus();
}

function resetCardForm() {
    cardForm.reset();
    editingIdInput.value = '';
    saveCardButton.textContent = 'Add Flashcard';
    cancelEditButton.classList.add('hidden');
}

async function deleteFlashcard(id) {
    const isConfirmed = confirm('Are you sure you want to delete this flashcard?');
    if (!isConfirmed) {
        return; // Exit the function if the user cancels
    }

    try {
        await apiRequest(`/cards/${id}`, { method: 'DELETE' });
        cards = cards.filter(card => card.id !== id);
        currentFlashcardIndex = Math.min(currentFlashcardIndex, Math.max(cards.length - 1, 0));
        renderCards();
        loadHistory();
        showMessage(cardMessage, 'Flashcard deleted.');
    } catch (err) {
        showMessage(cardMessage, err.message, true);
    }
}
async function loadHistory() {
    const endpoint = currentUser?.role === 'admin' ? '/admin/history' : '/history';

    try {
        const history = await apiRequest(endpoint);
        historyList.innerHTML = history.length
            ? history.map(item => `
                <div class="history-item">
                    <strong>${escapeHtml(item.username)}</strong>
                    <span>${escapeHtml(item.action)}</span>
                    <small>${escapeHtml(item.question || 'account activity')} - ${new Date(item.created_at).toLocaleString()}</small>
                </div>
            `).join('')
            : '<p class="muted">No activity recorded yet.</p>';
    } catch (err) {
        historyList.innerHTML = `<p class="message error">${escapeHtml(err.message)}</p>`;
    }
}

function updateCounter(count) {
    document.getElementById('counter').textContent = `Total cards: ${count}`;
}

function matchesSearch(card) {
    const value = searchTerm.toLowerCase();
    return card.question.toLowerCase().includes(value) || card.answer.toLowerCase().includes(value);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

authForm.addEventListener('submit', login);
registerButton.addEventListener('click', register);
logoutButton.addEventListener('click', logout);
cardForm.addEventListener('submit', saveFlashcard);
cancelEditButton.addEventListener('click', resetCardForm);
document.getElementById('next-button').addEventListener('click', nextFlashcard);
document.getElementById('prev-button').addEventListener('click', prevFlashcard);
searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value.trim();
    loadCards();
});

showApp();
