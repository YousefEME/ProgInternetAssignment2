//script for the frontend of the flashcard application. It manages user authentication, flashcard CRUD operations, study mode with progress tracking, and deck management. The code interacts with a backend API to persist data and update the UI accordingly. 
// It also includes a custom modal for delete confirmation and handles different views for students and admins.

const API_URL = 'http://localhost:3000';

// App state management
let currentUser = JSON.parse(localStorage.getItem('cardflashUser') || 'null');
let token = localStorage.getItem('cardflashToken');
let cards = [];
let currentFlashcardIndex = 0;
let searchTerm = '';

// Auth & layout DOM elements
const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showLoginButton = document.getElementById('show-login-button');
const showRegisterButton = document.getElementById('show-register-button');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const registerUsernameInput = document.getElementById('register-username');
const registerPasswordInput = document.getElementById('register-password');
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
const studyActions = document.getElementById('study-actions');
const studyNoteInput = document.getElementById('study-note');
const historyList = document.getElementById('history-list');
const historyTitle = document.getElementById('history-title');
const summaryTitle = document.getElementById('summary-title');
const summaryList = document.getElementById('summary-list');

// Custom delete confirmation modal DOM elements
const deleteModal = document.getElementById('delete-modal');
const confirmDeleteButton = document.getElementById('confirm-delete-button');
const cancelDeleteButton = document.getElementById('cancel-delete-button');
let cardIdToDelete = null;

// Decks Configuration
let decks = [];
let selectedDeckId = 'all';
let isUpdatingStatus = false;

const deckFilter = document.getElementById('deck-filter');
const deckForm = document.getElementById('deck-form');
const newDeckNameInput = document.getElementById('new-deck-name');
const cardDeckSelect = document.getElementById('card-deck-select');

async function loadDecks() {
    try {
        decks = await apiRequest('/decks');
        renderDeckSelects();
    } catch (err) {
        console.error('Failed to load decks:', err);
    }
}

function renderDeckSelects() {
    const currentFilterValue = deckFilter.value;
    deckFilter.innerHTML = `
        <option value="all">All Decks</option>
        <option value="none">Unassigned Cards</option>
        ${decks.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('')}
    `;
    deckFilter.value = currentFilterValue || 'all';

    const currentSelectValue = cardDeckSelect.value;
    cardDeckSelect.innerHTML = `
        <option value="">No Deck (Unassigned)</option>
        ${decks.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('')}
    `;
    cardDeckSelect.value = currentSelectValue || '';
}

async function createDeck(event) {
    event.preventDefault();
    const name = newDeckNameInput.value.trim();
    if (!name) return;

    try {
        const newDeck = await apiRequest('/decks', {
            method: 'POST',
            body: JSON.stringify({ name })
        });
        decks.push(newDeck);
        newDeckNameInput.value = '';
        renderDeckSelects();
        deckFilter.value = newDeck.id;
        selectedDeckId = String(newDeck.id);
        loadCards();
    } catch (err) {
        showMessage(cardMessage, err.message, true);
    }
}

function openDeleteModal(id) {
    cardIdToDelete = id;
    deleteModal.classList.remove('hidden');
}

function closeDeleteModal() {
    cardIdToDelete = null;
    deleteModal.classList.add('hidden');
}

// Base utility function to make backend API requests with authorisation headers
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

// Utility to display temporary error or success messages on the page
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

// Switches between the login form and registration form views
function switchAuthMode(mode) {
    const isRegistering = mode === 'register';
    loginForm.classList.toggle('hidden', isRegistering);
    registerForm.classList.toggle('hidden', !isRegistering);
    showLoginButton.classList.toggle('active', !isRegistering);
    showRegisterButton.classList.toggle('active', isRegistering);
    authMessage.textContent = '';
}

// Sets up the main application panel layout based on the user's logged-in session state
function showApp() {
    const isLoggedIn = Boolean(token && currentUser);
    authView.classList.toggle('hidden', isLoggedIn);
    appView.classList.toggle('hidden', !isLoggedIn);
    logoutButton.classList.toggle('hidden', !isLoggedIn);

    if (isLoggedIn) {
        welcome.textContent = `Logged in as ${currentUser.username} (${currentUser.role})`;
        historyTitle.textContent = currentUser.role === 'admin' ? 'All Students Learning History' : 'My Learning History';
        summaryTitle.textContent = currentUser.role === 'admin' ? 'Student Progress Summary' : 'My Progress Summary';
        loadDecks();
        loadCards();
        loadHistory();
    }
}

// Form submit handler for logging into student or admin accounts
async function login(event) {
    event.preventDefault();

    try {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                username: loginUsernameInput.value.trim(),
                password: loginPasswordInput.value
            })
        });
        saveSession(data);
        loginForm.reset();
        showApp();
    } catch (err) {
        showMessage(authMessage, err.message, true);
    }
}

// Form submit handler for creating a new student registration
async function register(event) {
    event.preventDefault();
    const newUsername = registerUsernameInput.value.trim();

    try {
        const data = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                username: newUsername,
                password: registerPasswordInput.value
            })
        });
        registerForm.reset();
        switchAuthMode('login');
        loginUsernameInput.value = newUsername;
        showMessage(authMessage, data.message || 'Account created. Please login.');
    } catch (err) {
        showMessage(authMessage, err.message, true);
    }
}

// Persists credentials to local storage upon successful login
function saveSession(data) {
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('cardflashToken', token);
    localStorage.setItem('cardflashUser', JSON.stringify(currentUser));
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
        let url = `/cards?search=${encodeURIComponent(searchTerm)}`;
        if (selectedDeckId !== 'all') {
            url += `&deck_id=${selectedDeckId}`;
        }
        cards = await apiRequest(url);
        currentFlashcardIndex = 0;
        renderCards();
    } catch (err) {
        showMessage(cardMessage, err.message, true);
    }
}

function renderCards() {
    container.innerHTML = '';
    cardList.innerHTML = '';
    const canStudy = cards.length > 0 && currentUser?.role === 'student';
    studyActions.classList.toggle('hidden', !canStudy);

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
            <div class="flashcard-inner">
                <div class="flashcard-front">
                    <span class="card-label">Question</span>
                    <span class="content">${escapeHtml(card.question)}</span>
                    <span class="tap-hint">Click to flip</span>
                </div>
                <div class="flashcard-back">
                    <span class="card-label">Answer</span>
                    <span class="content">${escapeHtml(card.answer)}</span>
                    <span class="tap-hint">Click to flip back</span>
                </div>
            </div>
        `;
        flashcard.addEventListener('click', () => {
            flashcard.classList.toggle('flipped');
        });
        container.appendChild(flashcard);

        const deck = decks.find(d => d.id === card.deck_id);
        const deckBadge = deck ? `<span class="card-deck-badge">${escapeHtml(deck.name)}</span>` : '';

        const item = document.createElement('article');
        item.className = 'list-card';
        item.innerHTML = `
            <div>
                <strong>${escapeHtml(card.question)}</strong>
                <p>${escapeHtml(card.answer)}</p>
                <div class="card-metadata">
                    <small>Created by ${escapeHtml(card.created_by || 'unknown')}</small>
                    ${deckBadge}
                </div>
                ${currentUser?.role === 'student' ? renderStatusBadge(card.learning_status) : ''}
            </div>
            <div class="list-actions">
                <button type="button" data-action="edit">Edit</button>
                <button type="button" data-action="delete" class="danger-button">Delete</button>
            </div>
        `;
        item.querySelector('[data-action="edit"]').addEventListener('click', () => startEdit(card));
        item.querySelector('[data-action="delete"]').addEventListener('click', () => openDeleteModal(card.id));
        cardList.appendChild(item);
    });

    updateCounter(cards.length);
    updateStudyButtonsState();
}

function updateStudyButtonsState() {
    const knownBtn = document.getElementById('known-button');
    const notKnownBtn = document.getElementById('not-known-button');

    if (!knownBtn || !notKnownBtn) return;

    if (isUpdatingStatus) {
        knownBtn.disabled = true;
        notKnownBtn.disabled = true;
        return;
    }

    const card = cards[currentFlashcardIndex];
    if (!card) {
        knownBtn.disabled = true;
        notKnownBtn.disabled = true;
        return;
    }

    if (card.learning_status === 'known') {
        knownBtn.disabled = true;
        knownBtn.classList.add('selected');
        notKnownBtn.disabled = false;
        notKnownBtn.classList.remove('selected');
    } else if (card.learning_status === 'not_known') {
        knownBtn.disabled = false;
        knownBtn.classList.remove('selected');
        notKnownBtn.disabled = true;
        notKnownBtn.classList.add('selected');
    } else {
        knownBtn.disabled = false;
        knownBtn.classList.remove('selected');
        notKnownBtn.disabled = false;
        notKnownBtn.classList.remove('selected');
    }
}

async function recordProgress(status) {
    const card = cards[currentFlashcardIndex];
    if (!card || currentUser?.role !== 'student' || isUpdatingStatus) return;

    isUpdatingStatus = true;
    updateStudyButtonsState();

    try {
        const progress = await apiRequest(`/cards/${card.id}/progress`, {
            method: 'POST',
            body: JSON.stringify({
                status,
                note: studyNoteInput.value.trim()
            })
        });

        // Update the card locally so the screen changes immediately after the student clicks.
        cards = cards.map(item => item.id === card.id ? { ...item, ...progress } : item);
        studyNoteInput.value = '';
        renderCards();
        showFlashcard(currentFlashcardIndex);
        loadHistory();
        showMessage(cardMessage, status === 'known' ? 'Marked as known.' : 'Saved for more practice.');
    } catch (err) {
        showMessage(cardMessage, err.message, true);
    } finally {
        isUpdatingStatus = false;
        updateStudyButtonsState();
    }
}
//show flashcard based on the index and reset the flip state when navigating between cards. Also updates the state of the study buttons based on the learning status of the currently displayed card.
function showFlashcard(index) {
    const flashcards = document.querySelectorAll('.flashcard');
    flashcards.forEach((card, i) => {
        card.classList.toggle('active', i === index);
        card.classList.remove('flipped');
    });
    updateStudyButtonsState();
}
//next flashcard function increments the current flashcard index and wraps around to the beginning of the list when reaching the end. It also resets the study note input and calls showFlashcard to update the display.
function nextFlashcard() {
    if (!cards.length) return;
    currentFlashcardIndex = (currentFlashcardIndex + 1) % cards.length;
    studyNoteInput.value = '';
    showFlashcard(currentFlashcardIndex);
}
//function for previous flashcard
function prevFlashcard() {
    if (!cards.length) return;
    currentFlashcardIndex = (currentFlashcardIndex - 1 + cards.length) % cards.length;
    studyNoteInput.value = '';
    showFlashcard(currentFlashcardIndex);
}
//handles creating new flashcards and ediitng existing ones
async function saveFlashcard(event) {
    event.preventDefault();

    const question = questionInput.value.trim();
    const answer = answerInput.value.trim();
    const deck_id = cardDeckSelect.value ? Number(cardDeckSelect.value) : null;
    const editingId = editingIdInput.value;

    if (!question || !answer) {
        showMessage(cardMessage, 'Please enter both a question and an answer.', true);
        return;
    }

    try {
        if (editingId) {
            const updatedCard = await apiRequest(`/cards/${editingId}`, {
                method: 'PUT',
                body: JSON.stringify({ question, answer, deck_id })
            });
            cards = cards.map(card => card.id === updatedCard.id ? { ...card, ...updatedCard } : card);
            showMessage(cardMessage, 'Flashcard updated.');
        } else {
            const createdCard = await apiRequest('/cards', {
                method: 'POST',
                body: JSON.stringify({ question, answer, deck_id })
            });
            const matchesDeck = selectedDeckId === 'all' || 
                                (selectedDeckId === 'none' && !createdCard.deck_id) || 
                                selectedDeckId === String(createdCard.deck_id);
            if (matchesSearch(createdCard) && matchesDeck) {
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
    cardDeckSelect.value = card.deck_id || '';
    saveCardButton.textContent = 'Save Changes';
    cancelEditButton.classList.remove('hidden');
    questionInput.focus();
}

function resetCardForm() {
    cardForm.reset();
    editingIdInput.value = '';
    cardDeckSelect.value = '';
    saveCardButton.textContent = 'Add Flashcard';
    cancelEditButton.classList.add('hidden');
}
// Deletes a flashcard after confirming the action in the custom modal. It also ensures that the current flashcard index is adjusted if necessary to prevent out-of-bounds errors when navigating through the remaining cards.
async function deleteFlashcard(id) {
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
//loads learning history for current user or all students if admin. It also renders a summary of progress based on the history data, showing counts of known and not known cards, and updates the history list with details of each action taken by the student(s).
async function loadHistory() {
    const endpoint = currentUser?.role === 'admin' ? '/admin/history' : '/history';

    try {
        const history = await apiRequest(endpoint);
        await renderSummary(history);
        historyList.innerHTML = history.length
            ? history.map(item => `
                <div class="history-item">
                    <strong>${escapeHtml(item.username)}</strong>
                    <span>${formatAction(item.action)}</span>
                    <small>${escapeHtml(item.question || 'account activity')} - ${new Date(item.created_at).toLocaleString()}</small>
                    ${renderStatusBadge(item.status)}
                    ${item.note ? `<p class="history-note">${escapeHtml(item.note)}</p>` : ''}
                </div>
            `).join('')
            : '<p class="muted">No activity recorded yet.</p>';
    } catch (err) {
        historyList.innerHTML = `<p class="message error">${escapeHtml(err.message)}</p>`;
    }
}
// Renders a summary of student progress based on the learning history data. For admins, it shows a summary for each student, while for regular students it shows their overall progress with counts of known and not known cards, along with tips based on their performance.
async function renderSummary(history) {
    if (currentUser?.role === 'admin') {
        const summary = await apiRequest('/admin/progress-summary');
        summaryList.innerHTML = summary.length
            ? summary.map(item => `
                <div class="summary-card">
                    <strong>${escapeHtml(item.username)}</strong>
                    <span>${Number(item.known_count || 0)} known</span>
                    <span>${Number(item.not_known_count || 0)} need practice</span>
                    <small>${item.last_practised ? `Last practised ${new Date(item.last_practised).toLocaleString()}` : 'No cards marked yet'}</small>
                </div>
            `).join('')
            : '<p class="muted">No student progress yet.</p>';
        return;
    }

    const latestByCard = new Map();
    history
        .filter(item => item.action === 'practice' && item.question)
        .forEach(item => {
            const cardKey = item.flashcard_id || item.question;
            if (!latestByCard.has(cardKey)) {
                latestByCard.set(cardKey, item.status);
            }
        });
    const statuses = [...latestByCard.values()];
    const known = statuses.filter(status => status === 'known').length;
    const notKnown = statuses.filter(status => status === 'not_known').length;
    const totalMarked = known + notKnown;
    summaryList.innerHTML = `
        <div class="summary-card">
            <strong>${totalMarked} cards marked</strong>
            <span>${known} known</span>
            <span>${notKnown} need practice</span>
            <small>${notKnown ? 'Focus on the cards marked Need practice.' : 'Nice work. No weak cards recorded yet.'}</small>
        </div>
    `;
}

function renderStatusBadge(status) {
    if (status === 'known') return '<span class="status-badge known">Known</span>';
    if (status === 'not_known') return '<span class="status-badge not-known">Need practice</span>';
    return '<span class="status-badge neutral">Not marked</span>';
}

function formatAction(action) {
    if (action === 'practice') return 'studied';
    return action;
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

showLoginButton.addEventListener('click', () => switchAuthMode('login'));
showRegisterButton.addEventListener('click', () => switchAuthMode('register'));
loginForm.addEventListener('submit', login);
registerForm.addEventListener('submit', register);
logoutButton.addEventListener('click', logout);
cardForm.addEventListener('submit', saveFlashcard);
cancelEditButton.addEventListener('click', resetCardForm);
document.getElementById('next-button').addEventListener('click', nextFlashcard);
document.getElementById('prev-button').addEventListener('click', prevFlashcard);
document.getElementById('known-button').addEventListener('click', () => recordProgress('known'));
document.getElementById('not-known-button').addEventListener('click', () => recordProgress('not_known'));
searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value.trim();
    loadCards();
});

cancelDeleteButton.addEventListener('click', closeDeleteModal);
confirmDeleteButton.addEventListener('click', async () => {
    if (cardIdToDelete !== null) {
        const id = cardIdToDelete;
        closeDeleteModal();
        await deleteFlashcard(id);
    }
});
// Deck-related event listeners for creating new decks and filtering cards by selected deck
deckForm.addEventListener('submit', createDeck);
deckFilter.addEventListener('change', () => {
    selectedDeckId = deckFilter.value;
    loadCards();
});

showApp();
